/**
 * Expense Claim Submission API Endpoint
 * Handles workflow transition: draft → submitted → pending_approval
 * Implements Otto's 7-stage workflow with Kevin's state machine validation
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createBusinessContextSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'
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

    const supabase = await createBusinessContextSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient()

    // Get employee profile to validate permissions
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      console.error(`[Expense Submission API] Employee profile not found for user ${userId}`)
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    console.log(`[Expense Submission API] Found employee profile: ${userProfile.id} for user ${userId}`)
    console.log(`[Expense Submission API] User profile debug:`, {
      id: userProfile.id,
      user_id: userProfile.user_id,
      business_id: userProfile.business_id,
      role: userProfile.role
    })

    // Fetch expense claim with related data (use service client to bypass RLS issues)
    console.log(`[Expense Submission API] Looking for expense claim ${expenseClaimId}`)

    const { data: expenseClaim, error: fetchError } = await serviceSupabase
      .from('expense_claims')
      .select(`
        *,
        accounting_entry:accounting_entries(*)
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
    if (expenseClaim.user_id !== userProfile.user_id) {
      console.error('[Expense Submission API] Access denied - claim belongs to different user:', {
        claimUserId: expenseClaim.user_id,
        currentUserId: userProfile.user_id,
        userId
      })
      
      return NextResponse.json(
        { success: false, error: 'Access denied - you can only submit your own expense claims' },
        { status: 403 }
      )
    }

    console.log(`[Expense Submission API] Successfully found and authorized expense claim ${expenseClaimId} for employee ${userProfile.id}`)

    // Validate workflow transition using Kevin's state machine
    const validTransition = EXPENSE_WORKFLOW_TRANSITIONS.find(
      t => t.from === expenseClaim.status && t.to === 'submitted' && t.requiredRole === 'employee' // ✅ Unified status field
    )

    if (!validTransition) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot submit expense claim from ${expenseClaim.status} status. Only draft claims can be submitted.` // ✅ Unified status field
        },
        { status: 400 }
      )
    }

    // Basic validation - ensure status allows submission
    if (expenseClaim.status !== 'draft') { // ✅ Unified status field
      return NextResponse.json(
        {
          success: false,
          error: `Cannot submit expense claim from ${expenseClaim.status} status. Only draft claims can be submitted.` // ✅ Unified status field
        },
        { status: 400 }
      )
    }

    // Find the appropriate approver (manager or admin)
    let reviewerId: string | null = null

    // Find any manager or admin in the same business to serve as reviewer
    const { data: reviewers, error: reviewerError } = await serviceSupabase
      .from('business_memberships')
      .select('id, user_id')
      .eq('business_id', userProfile.business_id)
      .in('role', ['manager', 'admin'])
      .neq('user_id', userProfile.user_id) // Don't assign self as reviewer
      .limit(1)

    if (reviewerError) {
      console.error('[Expense Submission API] Failed to find reviewer:', reviewerError)
    } else if (reviewers && reviewers.length > 0) {
      reviewerId = reviewers[0].user_id // Use user_id since that's what expense_claims table expects
    } else {
      // If no other managers/admins exist, allow self-review for admin users
      if (userProfile.role === 'admin') {
        reviewerId = userProfile.user_id
        console.log(`[Expense Submission API] Self-review assigned for admin ${userProfile.user_id}. No other admins/managers exist.`)
      }
    }

    // Update expense claim status to submitted
    const updateData: any = {
      status: 'submitted', // ✅ Unified status field
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
        accounting_entry:accounting_entries(*)
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

    const supabase = await createBusinessContextSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient()

    // Get employee profile
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
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
      .eq('user_id', userProfile.user_id)
      .single()

    if (fetchError || !expenseClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    // Validate workflow transition
    const validTransition = EXPENSE_WORKFLOW_TRANSITIONS.find(
      t => t.from === expenseClaim.status && t.to === 'draft' && t.requiredRole === 'employee' // ✅ Unified status field
    )

    if (!validTransition) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot recall expense claim from ${expenseClaim.status} status. Only submitted claims can be recalled.` // ✅ Unified status field
        },
        { status: 400 }
      )
    }

    // Update expense claim back to draft
    const { data: updatedClaim, error: updateError } = await serviceSupabase
      .from('expense_claims')
      .update({
        status: 'draft', // ✅ Unified status field
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