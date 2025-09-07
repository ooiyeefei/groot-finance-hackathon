/**
 * Bulk Approval API for Expense Claims
 * Implements Mel's UX recommendation for manager efficiency
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { BulkApprovalRequest } from '@/types/expense-claims'

// Bulk approve/reject multiple expense claims (Mel's efficiency feature)
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: BulkApprovalRequest = await request.json()
    const { claim_ids, action, comment } = body

    if (!claim_ids || !Array.isArray(claim_ids) || claim_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'claim_ids array is required and cannot be empty' },
        { status: 400 }
      )
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be either "approve" or "reject"' },
        { status: 400 }
      )
    }

    // Limit bulk operations to prevent abuse
    if (claim_ids.length > 50) {
      return NextResponse.json(
        { success: false, error: 'Cannot process more than 50 claims at once' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get user's employee profile
    const { data: userProfile, error: profileError } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profileError || !userProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    // Validate user has manager or finance permissions
    if (!userProfile.role_permissions.manager && !userProfile.role_permissions.admin) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions for bulk operations' },
        { status: 403 }
      )
    }

    // Fetch all claims to validate permissions and status
    const { data: claims, error: claimsError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        employee:employee_profiles!expense_claims_employee_id_fkey(*)
      `)
      .in('id', claim_ids)

    if (claimsError) {
      console.error('[Bulk Approval API] Failed to fetch claims:', claimsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch expense claims' },
        { status: 500 }
      )
    }

    if (claims.length !== claim_ids.length) {
      return NextResponse.json(
        { success: false, error: 'Some expense claims not found' },
        { status: 404 }
      )
    }

    // Validate permissions and status for each claim
    const validClaims = []
    const invalidClaims = []

    for (const claim of claims) {
      let isValid = false
      let reason = ''

      // Check status is appropriate for action
      if (action === 'approve') {
        if (userProfile.role_permissions.manager && claim.status === 'under_review') {
          isValid = true
        } else if (userProfile.role_permissions.admin && claim.status === 'approved') {
          isValid = true
        } else {
          reason = `Invalid status for approval: ${claim.status}`
        }
      } else if (action === 'reject') {
        if (['under_review', 'approved'].includes(claim.status)) {
          isValid = true
        } else {
          reason = `Invalid status for rejection: ${claim.status}`
        }
      }

      // Check user has permission for this specific claim
      if (isValid && userProfile.role_permissions.manager) {
        // Managers can only bulk approve their team's claims or claims assigned to them
        if (claim.current_approver_id !== userProfile.id && claim.employee.manager_id !== userProfile.id) {
          isValid = false
          reason = 'Not authorized for this claim'
        }
      }
      // Admin users can approve any claim (already checked above)

      if (isValid) {
        validClaims.push(claim)
      } else {
        invalidClaims.push({
          claim_id: claim.id,
          reason: reason || 'Unknown validation error'
        })
      }
    }

    if (validClaims.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'No valid claims to process',
          invalid_claims: invalidClaims
        },
        { status: 400 }
      )
    }

    // Process bulk updates
    const now = new Date().toISOString()
    const results = {
      successful: [] as { claim_id: string; previous_status: string; new_status: string }[],
      failed: [] as { claim_id: string; error: string }[],
      invalid: invalidClaims
    }

    for (const claim of validClaims) {
      try {
        let targetStatus: string
        const updateData: any = {
          updated_at: now
        }

        if (action === 'approve') {
          if (claim.status === 'under_review') {
            // Manager approval
            targetStatus = 'approved'
            updateData.status = 'approved'
            updateData.approval_date = now
            updateData.approved_by_ids = [...(claim.approved_by_ids || []), userProfile.id]
            // Set admin as next approver
            const adminApprover = await getAdminTeamId(supabase)
            updateData.current_approver_id = adminApprover
          } else if (claim.status === 'approved') {
            // Admin approval
            targetStatus = 'reimbursed'
            updateData.status = 'reimbursed'
            updateData.reimbursement_date = now
            updateData.approved_by_ids = [...(claim.approved_by_ids || []), userProfile.id]
          } else {
            // This should not happen due to validation but handle it gracefully
            targetStatus = claim.status
            continue
          }
        } else if (action === 'reject') {
          targetStatus = 'rejected'
          updateData.status = 'rejected'
          updateData.rejected_by_id = userProfile.id
          updateData.rejection_reason = comment || 'Bulk rejection'
          updateData.current_approver_id = null
        } else {
          // Invalid action - this should not happen due to validation but handle it gracefully  
          targetStatus = claim.status
          continue
        }

        // Update expense claim
        const { error: updateError } = await supabase
          .from('expense_claims')
          .update(updateData)
          .eq('id', claim.id)

        if (updateError) {
          console.error(`[Bulk Approval API] Failed to update claim ${claim.id}:`, updateError)
          results.failed.push({
            claim_id: claim.id,
            error: 'Database update failed'
          })
          continue
        }

        // Create audit record
        const { error: auditError } = await supabase
          .from('expense_approvals')
          .insert({
            expense_claim_id: claim.id,
            approver_id: userProfile.id,
            action: action === 'approve' ? 'approved' : 'rejected',
            comment: comment || `Bulk ${action}`,
            timestamp: now
          })

        if (auditError) {
          console.error(`[Bulk Approval API] Failed to create audit record for claim ${claim.id}:`, auditError)
        }

        // TODO: Update related transaction if needed based on final status

        results.successful.push({
          claim_id: claim.id,
          previous_status: claim.status,
          new_status: targetStatus
        })

      } catch (error) {
        console.error(`[Bulk Approval API] Unexpected error processing claim ${claim.id}:`, error)
        results.failed.push({
          claim_id: claim.id,
          error: 'Unexpected processing error'
        })
      }
    }

    // TODO: Send bulk notifications for status updates
    // await notificationService.bulkStatusUpdate(results.successful)

    console.log(`[Bulk Approval API] Processed ${results.successful.length} successful, ${results.failed.length} failed, ${results.invalid.length} invalid claims`)

    const responseStatus = results.failed.length > 0 ? 207 : 200 // Multi-status if some failed

    return NextResponse.json({
      success: results.successful.length > 0,
      data: {
        summary: {
          total_requested: claim_ids.length,
          successful: results.successful.length,
          failed: results.failed.length,
          invalid: results.invalid.length
        },
        results: results
      },
      message: `Successfully processed ${results.successful.length} out of ${claim_ids.length} claims`
    }, { status: responseStatus })

  } catch (error) {
    console.error('[Bulk Approval API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process bulk approval'
      },
      { status: 500 }
    )
  }
}

// Helper function to get an admin team member
async function getAdminTeamId(supabase: any): Promise<string | null> {
  const { data: adminUsers } = await supabase
    .from('employee_profiles')
    .select('id')
    .eq('role_permissions->admin', true)
    .eq('is_active', true)
    .limit(1)
    .single()
    
  return adminUsers?.id || null
}