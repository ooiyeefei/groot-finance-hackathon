/**
 * Expense Claim Submission API Endpoint
 * Handles workflow transition: draft → submitted → pending_approval
 * Implements Otto's 7-stage workflow with Kevin's state machine validation
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'
import { 
  EXPENSE_WORKFLOW_TRANSITIONS,
  ExpenseClaimApprovalRequest,
  EXPENSE_VALIDATION_RULES
} from '@/types/expense-claims'

// Submit expense claim (draft → submitted)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: expenseClaimId } = await params
    const body: ExpenseClaimApprovalRequest = await request.json()

    // Validate action
    if (body.action !== 'submit') {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use "submit" to submit expense claim for approval.' },
        { status: 400 }
      )
    }

    console.log(`[Expense Submission API] Submitting expense claim ${expenseClaimId} by user ${userId}`)

    const supabase = await createAuthenticatedSupabaseClient(userId)
    const serviceSupabase = createServiceSupabaseClient()

    // Get employee profile to validate permissions
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      console.error(`[Expense Submission API] Employee profile not found for user ${userId}`)
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    console.log(`[Expense Submission API] Found employee profile: ${employeeProfile.id} for user ${userId}`)

    // Fetch expense claim with related data (use service client to bypass RLS issues)
    console.log(`[Expense Submission API] Looking for expense claim ${expenseClaimId}`)
    
    const { data: expenseClaim, error: fetchError } = await serviceSupabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(*),
        employee:employee_profiles!expense_claims_employee_id_fkey(*)
      `)
      .eq('id', expenseClaimId)
      .single()

    if (fetchError || !expenseClaim) {
      console.error('[Expense Submission API] Failed to fetch expense claim:', {
        error: fetchError,
        expenseClaimId,
        userId
      })
      
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    // Manual authorization check - ensure user owns this claim
    if (expenseClaim.employee_id !== employeeProfile.id) {
      console.error('[Expense Submission API] Access denied - claim belongs to different employee:', {
        claimEmployeeId: expenseClaim.employee_id,
        currentEmployeeId: employeeProfile.id,
        userId
      })
      
      return NextResponse.json(
        { success: false, error: 'Access denied - you can only submit your own expense claims' },
        { status: 403 }
      )
    }

    console.log(`[Expense Submission API] Successfully found and authorized expense claim ${expenseClaimId} for employee ${employeeProfile.id}`)

    // Validate workflow transition using Kevin's state machine
    const validTransition = EXPENSE_WORKFLOW_TRANSITIONS.find(
      t => t.from === expenseClaim.status && t.to === 'submitted' && t.requiredRole === 'employee'
    )

    if (!validTransition) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot submit expense claim from ${expenseClaim.status} status. Only draft claims can be submitted.` 
        },
        { status: 400 }
      )
    }

    // Basic validation - ensure status allows submission
    if (expenseClaim.status !== 'draft') {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot submit expense claim from ${expenseClaim.status} status. Only draft claims can be submitted.` 
        },
        { status: 400 }
      )
    }

    // Find the appropriate approver (manager)
    let reviewerId: string | null = null
    
    // If employee has a manager, set them as the reviewer
    if (employeeProfile.manager_id) {
      reviewerId = employeeProfile.manager_id
    } else {
      // Fallback: find any manager in the same business
      const { data: managers, error: managerError } = await serviceSupabase
        .from('employee_profiles')
        .select('id')
        .eq('business_id', employeeProfile.business_id)
        .eq('role_permissions->manager', true)
        .limit(1)

      if (managerError) {
        console.error('[Expense Submission API] Failed to find manager:', managerError)
      } else if (managers && managers.length > 0) {
        reviewerId = managers[0].id
        
        // Log if this results in self-review (which is allowed for single-admin scenarios)
        if (reviewerId === employeeProfile.id) {
          console.log(`[Expense Submission API] Self-review assigned for admin/manager ${employeeProfile.id}. This is allowed when no other managers exist.`)
        }
      }
    }

    // Update expense claim status to submitted
    const updateData: any = {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      reviewed_by: reviewerId,
      updated_at: new Date().toISOString()
    }

    const { data: updatedClaim, error: updateError } = await serviceSupabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', expenseClaimId)
      .select(`
        *,
        transaction:transactions(*)
      `)
      .single()

    if (updateError) {
      console.error('[Expense Submission API] Failed to update expense claim:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to submit expense claim' },
        { status: 500 }
      )
    }

    console.log(`[Expense Submission API] Successfully submitted expense claim ${expenseClaimId}`)

    return NextResponse.json({
      success: true,
      data: {
        expense_claim: updatedClaim,
        message: 'Expense claim submitted successfully for manager approval',
        reviewer: reviewerId ? 'Manager assigned for review' : 'No manager found - will require admin review'
      }
    })

  } catch (error) {
    console.error('[Expense Submission API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to submit expense claim'
      },
      { status: 500 }
    )
  }
}

// Recall expense claim (submitted → draft)  
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: expenseClaimId } = await params

    console.log(`[Expense Submission API] Recalling expense claim ${expenseClaimId} by user ${userId}`)

    const supabase = await createAuthenticatedSupabaseClient(userId)
    const serviceSupabase = createServiceSupabaseClient()

    // Get employee profile
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    // Fetch expense claim
    const { data: expenseClaim, error: fetchError } = await supabase
      .from('expense_claims')
      .select('*')
      .eq('id', expenseClaimId)
      .eq('employee_id', employeeProfile.id)
      .single()

    if (fetchError || !expenseClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    // Validate workflow transition
    const validTransition = EXPENSE_WORKFLOW_TRANSITIONS.find(
      t => t.from === expenseClaim.status && t.to === 'draft' && t.requiredRole === 'employee'
    )

    if (!validTransition) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Cannot recall expense claim from ${expenseClaim.status} status. Only submitted claims can be recalled.` 
        },
        { status: 400 }
      )
    }

    // Update expense claim back to draft
    const { data: updatedClaim, error: updateError } = await serviceSupabase
      .from('expense_claims')
      .update({
        status: 'draft',
        submission_date: null,
        current_approver_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', expenseClaimId)
      .select()
      .single()

    if (updateError) {
      console.error('[Expense Submission API] Failed to recall expense claim:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to recall expense claim' },
        { status: 500 }
      )
    }

    console.log(`[Expense Submission API] Successfully recalled expense claim ${expenseClaimId}`)

    return NextResponse.json({
      success: true,
      data: {
        expense_claim: updatedClaim,
        message: 'Expense claim recalled and returned to draft status'
      }
    })

  } catch (error) {
    console.error('[Expense Submission API] Recall error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to recall expense claim'
      },
      { status: 500 }
    )
  }
}