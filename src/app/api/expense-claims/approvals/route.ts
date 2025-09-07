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

    // Get pending expense claims for this business
    const { data: claims, error: claimsError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        employee:employee_profiles!inner(
          employee_id,
          user_id
        ),
        document:documents(
          original_url,
          annotated_url
        )
      `)
      .eq('employee.business_id', userContext.profile.business_id)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })

    if (claimsError) {
      console.error('[Approvals API] Error fetching claims:', claimsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch pending claims' },
        { status: 500 }
      )
    }

    // Get employee names from users table
    const userIds = claims.map(claim => claim.employee.user_id)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, clerk_user_id, full_name, email')
      .in('id', userIds)

    if (usersError) {
      console.error('[Approvals API] Error fetching users:', usersError)
    }

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
      const user = users?.find(u => u.id === claim.employee.user_id)
      
      // Find the matching category from business categories
      const category = businessCategories.find((cat: any) => 
        cat.category_code === claim.expense_category || 
        cat.category_name === claim.expense_category
      )
      
      // Check if over policy limit
      const isOverLimit = category?.policy_limit && 
        claim.converted_amount > category.policy_limit

      return {
        id: claim.id,
        employee_name: user?.full_name || user?.email || 'Unknown Employee',
        employee_id: claim.employee.employee_id,
        description: claim.description,
        business_purpose: claim.business_purpose,
        original_amount: claim.original_amount,
        original_currency: claim.original_currency,
        converted_amount: claim.converted_amount,
        home_currency: claim.home_currency,
        transaction_date: claim.transaction_date,
        vendor_name: claim.vendor_name,
        expense_category: claim.expense_category,
        category_name: category?.category_name || claim.expense_category,
        status: claim.status,
        submission_date: claim.created_at,
        document_url: claim.document?.annotated_url || claim.document?.original_url,
        receipt_confidence: claim.receipt_confidence,
        notes: claim.notes,
        requires_receipt: category?.requires_receipt || false,
        policy_limit: category?.policy_limit,
        is_over_limit: !!isOverLimit
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
        employee_profiles!inner(business_id)
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

    if (claim.status !== 'pending_approval') {
      return NextResponse.json(
        { success: false, error: 'Claim is not in pending approval status' },
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