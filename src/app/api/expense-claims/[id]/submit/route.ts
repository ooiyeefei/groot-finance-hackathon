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
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    // Fetch expense claim with related data
    const { data: expenseClaim, error: fetchError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(*),
        employee:employee_profiles!expense_claims_employee_id_fkey(*)
      `)
      .eq('id', expenseClaimId)
      .eq('employee_id', employeeProfile.id) // Ensure user owns this claim
      .single()

    if (fetchError || !expenseClaim) {
      console.error('[Expense Submission API] Failed to fetch expense claim:', fetchError)
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

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

    // Run Otto's validation rules before submission
    const violations: any[] = []
    for (const rule of EXPENSE_VALIDATION_RULES) {
      const ruleViolations = rule.validator(expenseClaim as any)
      violations.push(...ruleViolations)
    }

    // Check for critical violations that block submission
    const criticalViolations = violations.filter(v => v.severity === 'critical')
    if (criticalViolations.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Cannot submit expense claim due to critical policy violations',
          violations: criticalViolations
        },
        { status: 400 }
      )
    }

    // Find the appropriate approver (manager)
    let currentApproverId: string | null = null
    
    // If employee has a manager, set them as the approver
    if (employeeProfile.manager_id) {
      currentApproverId = employeeProfile.manager_id
    } else {
      // Fallback: find any manager in the same business
      const { data: managers, error: managerError } = await serviceSupabase
        .from('employee_profiles')
        .select('id')
        .eq('business_id', employeeProfile.business_id)
        .eq('role_permissions->manager', true)
        .eq('is_active', true)
        .limit(1)

      if (managerError) {
        console.error('[Expense Submission API] Failed to find manager:', managerError)
      } else if (managers && managers.length > 0) {
        currentApproverId = managers[0].id
      }
    }

    // Update expense claim status to submitted
    const updateData: any = {
      status: 'submitted',
      submission_date: new Date().toISOString(),
      current_approver_id: currentApproverId,
      policy_violations: violations.length > 0 ? violations : null,
      updated_at: new Date().toISOString()
    }

    const { data: updatedClaim, error: updateError } = await serviceSupabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', expenseClaimId)
      .select(`
        *,
        transaction:transactions(*),
        employee:employee_profiles!expense_claims_employee_id_fkey(*),
        current_approver:employee_profiles!expense_claims_current_approver_id_fkey(*)
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
        approver: currentApproverId ? 'Manager assigned' : 'No manager found - will require admin approval',
        violations: violations.length > 0 ? violations : null
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