/**
 * Expense Claim Status Management API
 * Implements Otto's 7-stage workflow with Kevin's state machine validation
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { 
  ExpenseStatus,
  ExpenseClaimApprovalRequest,
  EXPENSE_WORKFLOW_TRANSITIONS,
  WorkflowTransition
} from '@/types/expense-claims'

// Update expense claim status (Kevin's state machine pattern)
export async function PATCH(
  request: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: claimId } = await params
    const body = await request.json()
    const { action, comment, partial_approval } = body as ExpenseClaimApprovalRequest

    if (!action || !['approve', 'reject', 'request_changes', 'submit', 'recall'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be approve, reject, request_changes, submit, or recall' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get current expense claim with related data
    const { data: expenseClaim, error: claimError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(*),
        employee:employee_profiles!expense_claims_employee_id_fkey(*)
      `)
      .eq('id', claimId)
      .single()

    if (claimError || !expenseClaim) {
      console.error('[Expense Claims Status API] Claim not found:', claimError)
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

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

    // Determine target status based on action and current status
    let targetStatus: ExpenseStatus
    let requiredRole: 'employee' | 'manager' | 'admin'

    switch (action) {
      case 'submit':
        targetStatus = 'submitted'
        requiredRole = 'employee'
        break
      case 'recall':
        targetStatus = 'draft'
        requiredRole = 'employee'
        break
      case 'approve':
        // Manager approval moves to 'approved', Admin approval moves to 'reimbursed'
        if (expenseClaim.status === 'under_review') {
          targetStatus = 'approved'
          requiredRole = 'manager'
        } else if (expenseClaim.status === 'approved') {
          targetStatus = 'reimbursed'
          requiredRole = 'admin'
        } else {
          return NextResponse.json(
            { success: false, error: `Cannot approve claim with status: ${expenseClaim.status}` },
            { status: 400 }
          )
        }
        break
      case 'reject':
        targetStatus = 'rejected'
        requiredRole = userProfile.role_permissions.admin ? 'admin' : 'manager'
        break
      case 'request_changes':
        targetStatus = 'rejected' // Will require employee to revise
        requiredRole = userProfile.role_permissions.admin ? 'admin' : 'manager'
        break
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }

    // Validate workflow transition (Kevin's state machine)
    const validTransition = EXPENSE_WORKFLOW_TRANSITIONS.find(
      (transition: WorkflowTransition) => 
        transition.from === expenseClaim.status && 
        transition.to === targetStatus &&
        transition.requiredRole === requiredRole
    )

    if (!validTransition) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid transition from ${expenseClaim.status} to ${targetStatus} for role ${requiredRole}` 
        },
        { status: 400 }
      )
    }

    // Validate user permissions for this transition
    const hasPermission = await validateUserPermission(
      userProfile,
      expenseClaim,
      requiredRole,
      action
    )

    if (!hasPermission) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions for this action' },
        { status: 403 }
      )
    }

    // Prepare update data
    const now = new Date().toISOString()
    const updateData: any = {
      status: targetStatus,
      updated_at: now
    }

    // Handle status-specific updates (Otto's timestamp tracking)
    switch (targetStatus as ExpenseStatus) {
      case 'submitted':
        updateData.submission_date = now
        updateData.current_approver_id = expenseClaim.employee.manager_id
        break
        
      case 'under_review':
        // Manager has started reviewing
        break
        
      case 'approved':
        updateData.approval_date = now
        updateData.approved_by_ids = [...(expenseClaim.approved_by_ids || []), userProfile.id]
        // Set finance team as next approver for reimbursement
        updateData.current_approver_id = await getAdminTeamId(supabase)
        break
        
      case 'rejected':
        updateData.rejected_by_id = userProfile.id
        updateData.rejection_reason = comment || 'No reason provided'
        updateData.current_approver_id = null
        break
        
      case 'reimbursed':
        updateData.reimbursement_date = now
        updateData.approved_by_ids = [...(expenseClaim.approved_by_ids || []), userProfile.id]
        break
        
      case 'draft':
        // Reset workflow timestamps when recalling
        updateData.submission_date = null
        updateData.approval_date = null
        updateData.reimbursement_date = null
        updateData.current_approver_id = expenseClaim.employee.manager_id
        updateData.rejected_by_id = null
        updateData.rejection_reason = null
        break
    }

    // Update expense claim
    const { data: updatedClaim, error: updateError } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', claimId)
      .select(`
        *,
        transaction:transactions(*),
        employee:employee_profiles!expense_claims_employee_id_fkey(*)
      `)
      .single()

    if (updateError) {
      console.error('[Expense Claims Status API] Failed to update claim:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update expense claim status' },
        { status: 500 }
      )
    }

    // Create approval audit record (Otto's compliance requirement)
    if (['approve', 'reject', 'request_changes'].includes(action)) {
      const auditAction = action === 'request_changes' ? 'requested_changes' : action === 'approve' ? 'approved' : 'rejected'
      
      const { error: auditError } = await supabase
        .from('expense_approvals')
        .insert({
          expense_claim_id: claimId,
          approver_id: userProfile.id,
          action: auditAction,
          comment: comment || null,
          timestamp: now
        })

      if (auditError) {
        console.error('[Expense Claims Status API] Failed to create audit record:', auditError)
      }
    }

    // Log status change in consolidated audit trail (Otto's enhanced compliance)
    await supabase
      .from('audit_events')
      .insert({
        business_id: expenseClaim.business_id,
        actor_user_id: userId,
        event_type: `expense_claim.${action}`,
        target_entity_type: 'expense_claim',
        target_entity_id: claimId,
        details: {
          previous_status: expenseClaim.status,
          new_status: targetStatus,
          action_comment: comment,
          expense_amount: expenseClaim.transaction?.original_amount,
          currency: expenseClaim.transaction?.original_currency,
          approver_role: requiredRole,
          risk_score: expenseClaim.risk_score
        }
      })

    // TODO: Send real-time notifications (Kevin's WebSocket system)
    // await notificationService.broadcastStatusUpdate(claimId, targetStatus)

    // TODO: Update transaction status if needed
    if (targetStatus === 'reimbursed') {
      await supabase
        .from('transactions')
        .update({ status: 'paid', payment_date: now })
        .eq('id', expenseClaim.transaction_id)
    }

    console.log(`[Expense Claims Status API] Updated claim ${claimId} from ${expenseClaim.status} to ${targetStatus}`)

    return NextResponse.json({
      success: true,
      data: {
        expense_claim: updatedClaim,
        previous_status: expenseClaim.status,
        new_status: targetStatus,
        action_by: userProfile.full_name
      }
    })

  } catch (error) {
    console.error('[Expense Claims Status API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update expense claim status'
      },
      { status: 500 }
    )
  }
}

// Validate user permissions for expense claim actions
async function validateUserPermission(
  userProfile: any,
  expenseClaim: any,
  requiredRole: 'employee' | 'manager' | 'admin',
  action: string
): Promise<boolean> {
  // Check if user has the required role
  switch (requiredRole) {
    case 'employee':
      // Employee can only act on their own claims
      return expenseClaim.employee_id === userProfile.id
      
    case 'manager':
      // Manager can act on their team's claims or be the assigned approver
      return userProfile.role_permissions.manager && 
             (expenseClaim.current_approver_id === userProfile.id ||
              expenseClaim.employee.manager_id === userProfile.id)
      
    case 'admin':
      // Admin can act on approved claims
      return userProfile.role_permissions.admin
      
    default:
      return false
  }
}

// Get a finance team member ID for setting as approver
async function getAdminTeamId(supabase: any): Promise<string | null> {
  const { data: financeUsers } = await supabase
    .from('employee_profiles')
    .select('id')
    .eq('role_permissions->finance', true)
    .eq('is_active', true)
    .limit(1)
    .single()
    
  return financeUsers?.id || null
}