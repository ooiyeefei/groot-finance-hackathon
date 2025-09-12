/**
 * Expense Approval API
 * Handles manager approval/rejection of expense claims
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { requirePermission } from '@/lib/rbac'

// GET - Fetch pending expense claims for approval
export async function GET(request: NextRequest) {
  try {
    // Require manager permission
    const userContext = await requirePermission('manager')
    const supabase = await createAuthenticatedSupabaseClient(userContext.userId)

    // Get submitted expense claims for this business (Otto's workflow: submitted → under_review → approved)
    const { data: claims, error: claimsError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(*),
        employee:employee_profiles!expense_claims_employee_id_fkey(
          id,
          department,
          job_title,
          user_id,
          business_id,
          user:users!employee_profiles_user_id_fkey(
            full_name,
            email
          )
        )
      `)
      .eq('employee.business_id', userContext.profile.business_id)
      .in('status', ['submitted', 'under_review']) // Show both submitted and under review
      .is('deleted_at', null)
      .order('submitted_at', { ascending: true }) // Oldest submissions first

    if (claimsError) {
      console.error('[Approvals API] Error fetching claims:', claimsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pending claims' },
        { status: 500 }
      )
    }

    // Employee details are already included in the query above via join

    // Get business categories from JSONB column
    const { data: businessData, error: businessError } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', userContext.profile.business_id)
      .single()

    if (businessError) {
      console.error('[Approvals API] Error fetching business categories:', businessError)
    }

    const businessCategories = businessData?.custom_expense_categories || []

    // Enrich claims with employee information and category data
    const enrichedClaims = claims.map(claim => {
      // Find the matching category from business categories
      const category = businessCategories.find((cat: any) => 
        cat.category_code === claim.expense_category || 
        cat.category_name === claim.expense_category
      )
      
      // Get amount from transaction (converted to home currency)
      const amount = claim.transaction?.home_currency_amount || claim.transaction?.original_amount || 0
      
      // Check if over policy limit
      const isOverLimit = category?.policy_limit && amount > category.policy_limit

      return {
        id: claim.id,
        employee_name: claim.employee?.user?.full_name || claim.employee?.user?.email || 'Unknown Employee',
        employee_id: claim.employee.id,
        employee_department: claim.employee.department,
        employee_job_title: claim.employee.job_title,
        description: claim.transaction?.description || 'Expense Claim',
        business_purpose: claim.business_purpose,
        original_amount: claim.transaction?.original_amount || 0,
        original_currency: claim.transaction?.original_currency || 'SGD',
        converted_amount: amount,
        home_currency: claim.transaction?.home_currency || 'SGD',
        transaction_date: claim.transaction?.transaction_date,
        vendor_name: claim.transaction?.vendor_name,
        expense_category: claim.expense_category,
        category_name: category?.category_name || claim.expense_category,
        status: claim.status,
        submission_date: claim.submitted_at || claim.created_at,
        document_url: null, // Documents will be handled separately if needed
        receipt_confidence: null, // Will be extracted from transaction metadata if needed
        notes: claim.transaction?.notes,
        requires_receipt: category?.requires_receipt || false,
        policy_limit: category?.policy_limit,
        is_over_limit: !!isOverLimit,
        transaction_id: claim.transaction_id,
        current_approver_id: claim.current_approver_id
      }
    })

    // Calculate stats
    const stats = {
      pending: enrichedClaims.length,
      approved_today: 0, // Will implement separate query for this
      total_pending_amount: enrichedClaims.reduce((sum, claim) => sum + claim.converted_amount, 0)
    }

    // Get approved count for today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { count: approvedToday } = await supabase
      .from('expense_claims')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('updated_at', today.toISOString())

    stats.approved_today = approvedToday || 0

    return NextResponse.json({
      success: true,
      data: {
        claims: enrichedClaims,
        stats
      }
    })

  } catch (error) {
    console.error('[Approvals API] Unexpected error:', error)
    
    if (error instanceof Error && error.message.includes('Permission required')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager access required.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Approve or reject expense claim
export async function POST(request: NextRequest) {
  try {
    // Require manager permission
    const userContext = await requirePermission('manager')
    const supabase = await createAuthenticatedSupabaseClient(userContext.userId)

    const body = await request.json()
    const { claim_id, action, notes } = body

    if (!claim_id || !action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request. claim_id and action (approve/reject) required.' },
        { status: 400 }
      )
    }

    // Verify the claim exists and belongs to the manager's business
    const { data: claim, error: claimError } = await supabase
      .from('expense_claims')
      .select(`
        id,
        status,
        employee_id,
        employee_profiles!expense_claims_employee_id_fkey(business_id)
      `)
      .eq('id', claim_id)
      .single()

    if (claimError || !claim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    if ((claim.employee_profiles as any)?.business_id !== userContext.profile.business_id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to approve this claim' },
        { status: 403 }
      )
    }

    if (!['submitted', 'under_review', 'pending_approval'].includes(claim.status)) {
      return NextResponse.json(
        { success: false, error: 'Claim is not in a state that can be approved or rejected' },
        { status: 400 }
      )
    }

    // Update the claim status
    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const { error: updateError } = await supabase
      .from('expense_claims')
      .update({
        status: newStatus,
        approved_by: userContext.profile.id,
        approved_at: new Date().toISOString(),
        approval_notes: notes || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', claim_id)

    if (updateError) {
      console.error('[Approvals API] Error updating claim:', updateError)
      return NextResponse.json(
        { success: false, error: `Failed to ${action} expense claim` },
        { status: 500 }
      )
    }

    // Log the approval action
    await supabase
      .from('approval_history')
      .insert({
        expense_claim_id: claim_id,
        approved_by: userContext.profile.id,
        action: newStatus,
        notes: notes || null,
        created_at: new Date().toISOString()
      })

    console.log(`[Approvals API] Claim ${claim_id} ${action}ed by ${userContext.profile.employee_id}`)

    return NextResponse.json({
      success: true,
      data: {
        claim_id,
        action,
        status: newStatus
      }
    })

  } catch (error) {
    console.error('[Approvals API] Unexpected error:', error)
    
    if (error instanceof Error && error.message.includes('Permission required')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager access required.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}