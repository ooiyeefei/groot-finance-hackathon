/**
 * Expense Approval API
 * Handles manager approval/rejection of expense claims
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'
import { dashboardRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/rate-limiter'
import { auditLogger } from '@/lib/audit-logger'

// GET - Fetch pending expense claims for approval
export async function GET(request: NextRequest) {
  try {
    console.log('[Approvals API] Starting GET request')
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // SECURITY: Apply rate limiting for expensive approvals queries
    const clientId = getClientIdentifier(request, userId)
    const rateLimitResult = applyRateLimit(dashboardRateLimiter, clientId)

    if (!rateLimitResult.allowed) {
      console.log(`[Approvals API] Rate limit exceeded for user: ${userId}`)
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please wait before making another request.',
          rateLimitExceeded: true
        },
        {
          status: 429,
          headers: rateLimitResult.headers
        }
      )
    }

    // SECURITY: Get user data with business context for proper tenant isolation
    const userData = await getUserData(userId)
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get employee profile for permission validation
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create or retrieve employee profile' },
        { status: 500 }
      )
    }

    // SECURITY: Validate business context matches
    if (employeeProfile.business_id !== userData.business_id) {
      return NextResponse.json(
        { success: false, error: 'Business context mismatch' },
        { status: 403 }
      )
    }

    // Check if user has manager permissions
    if (!employeeProfile.role_permissions.manager) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager access required.' },
        { status: 403 }
      )
    }

    // SECURITY: Use authenticated client with business context validation
    console.log('[Approvals API] Querying business claims for business_id:', employeeProfile.business_id)

    // First, get all employee_ids in this business using authenticated client
    const { data: businessEmployees } = await supabase
      .from('employee_profiles')
      .select('id')
      .eq('business_id', employeeProfile.business_id)

    const employeeIds = businessEmployees?.map(emp => emp.id) || []
    console.log('[Approvals API] Found employee IDs (dashboard API approach):', employeeIds)
    console.log('[Approvals API] Employee count:', businessEmployees?.length)

    // Get submitted expense claims for these employees
    console.log('[Approvals API] Querying claims for employee_ids:', employeeIds)
    console.log('[Approvals API] Employee IDs type and values:', employeeIds.map(id => ({ id, type: typeof id })))

    // Debug: Check what claims exist in the database first
    console.log('[Approvals API] DEBUG: Checking ALL claims in database...')
    const { data: allClaims, error: allClaimsError } = await supabase
      .from('expense_claims')
      .select('id, employee_id, status, deleted_at')
      .is('deleted_at', null)

    console.log('[Approvals API] DEBUG: All claims in database:', {
      totalClaims: allClaims?.length || 0,
      error: allClaimsError,
      claimsByStatus: allClaims?.reduce((acc: any, claim: any) => {
        acc[claim.status] = (acc[claim.status] || 0) + 1
        return acc
      }, {}),
      sampleClaims: allClaims?.slice(0, 3).map(claim => ({
        id: claim.id,
        employee_id: claim.employee_id,
        status: claim.status,
        employee_id_type: typeof claim.employee_id
      }))
    })

    // Debug: Check claims for our specific employee IDs
    console.log('[Approvals API] DEBUG: Checking claims for our employee IDs...')
    const { data: employeeSpecificClaims } = await supabase
      .from('expense_claims')
      .select('id, employee_id, status, deleted_at')
      .in('employee_id', employeeIds)
      .is('deleted_at', null)

    console.log('[Approvals API] DEBUG: Claims for our employee IDs:', {
      claimsCount: employeeSpecificClaims?.length || 0,
      claims: employeeSpecificClaims?.map(claim => ({
        id: claim.id,
        employee_id: claim.employee_id,
        status: claim.status
      }))
    })

    // Use exact same approach as dashboard API - simple query first
    console.log('[Approvals API] Dashboard API approach - Authenticated client query...')
    const { data: simpleClaims, error: simpleError } = await supabase
      .from('expense_claims')
      .select('*')
      .in('employee_id', employeeIds)

    console.log('[Approvals API] Authenticated client query result:', {
      claimsCount: simpleClaims?.length || 0,
      error: simpleError,
      sampleClaim: simpleClaims?.[0]?.id || 'none'
    })

    // Now use the exact same query pattern as dashboard API that works
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
      .in('employee_id', employeeIds)
      .in('status', ['submitted', 'under_review', 'pending_approval']) // Include all pending statuses
      .is('deleted_at', null)
      .order('submitted_at', { ascending: true }) // Oldest submissions first

    console.log('[Approvals API] Query result:', {
      claimsCount: claims?.length || 0,
      error: claimsError,
      firstClaim: claims?.[0] ? {
        id: claims[0].id,
        status: claims[0].status,
        employee_id: claims[0].employee_id
      } : null
    })

    // Debug: Check if filtering by status is the issue
    console.log('[Approvals API] DEBUG: Testing query without status filter...')
    const { data: claimsWithoutStatusFilter } = await supabase
      .from('expense_claims')
      .select('id, employee_id, status, deleted_at')
      .in('employee_id', employeeIds)
      .is('deleted_at', null)

    console.log('[Approvals API] DEBUG: Claims without status filter:', {
      claimsCount: claimsWithoutStatusFilter?.length || 0,
      statusBreakdown: claimsWithoutStatusFilter?.reduce((acc: any, claim: any) => {
        acc[claim.status] = (acc[claim.status] || 0) + 1
        return acc
      }, {}),
      allStatuses: [...new Set(claimsWithoutStatusFilter?.map(claim => claim.status) || [])]
    })

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
      .eq('id', employeeProfile.business_id)
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
        employee_name: claim.employee?.user?.full_name || claim.employee?.user?.email || `Employee ID: ${claim.employee_id}`,
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

    // PERFORMANCE: Use optimized RPC function for team expense summary
    console.log('[Approvals API] Using get_team_expense_summary RPC for business:', employeeProfile.business_id)

    // AUDIT: Log RPC call start for approvals stats
    const approvalsRpcStartTime = Date.now()
    const approvalsRpcParameters = { business_id_param: employeeProfile.business_id }

    const { data: rpcStats, error: rpcError } = await supabase
      .rpc('get_team_expense_summary', approvalsRpcParameters)

    // AUDIT: Log RPC call completion for approvals stats
    const approvalsExecutionTime = Date.now() - approvalsRpcStartTime
    auditLogger.logRPCCall(
      userId,
      employeeProfile.business_id,
      'get_team_expense_summary',
      approvalsRpcParameters,
      !rpcError,
      request,
      approvalsExecutionTime,
      rpcStats ? 1 : 0,
      rpcError?.message
    )

    // Initialize stats with fallback to manual calculation if RPC fails
    let stats = {
      pending: enrichedClaims.length,
      approved_today: 0,
      total_pending_amount: enrichedClaims.reduce((sum, claim) => sum + claim.converted_amount, 0)
    }

    if (rpcError) {
      console.error('[Approvals API] RPC function failed, using manual calculation fallback:', rpcError)
      // Fallback: Get approved count for today manually
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count: approvedToday } = await supabase
        .from('expense_claims')
        .select('*', { count: 'exact', head: true })
        .in('employee_id', employeeIds)
        .eq('status', 'approved')
        .gte('updated_at', today.toISOString())

      stats.approved_today = approvedToday || 0
    } else {
      // Use optimized RPC results with proper type conversion
      console.log('[Approvals API] RPC function completed successfully:', rpcStats)

      stats = {
        pending: Number(rpcStats.pending_count) || enrichedClaims.length,
        approved_today: Number(rpcStats.approved_today) || 0,
        total_pending_amount: Number(rpcStats.pending_amount) || enrichedClaims.reduce((sum, claim) => sum + claim.converted_amount, 0)
      }

      console.log('[Approvals API] Using RPC-optimized stats:', stats)
    }

    return NextResponse.json({
      success: true,
      data: {
        claims: enrichedClaims,
        stats
      }
    }, {
      headers: rateLimitResult.headers
    })

  } catch (error) {
    console.error('[Approvals API GET] Unexpected error:', error)
    console.error('[Approvals API GET] Error stack:', error instanceof Error ? error.stack : 'No stack available')

    if (error instanceof Error && error.message.includes('Permission required')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager access required.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { success: false, error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

// POST - Approve or reject expense claim
export async function POST(request: NextRequest) {
  console.log('[Approvals API POST] Starting POST request')
  try {
    console.log('[Approvals API POST] Step 1: Getting authentication')
    // Get employee profile using the same method as GET endpoint
    const { userId } = await auth()
    if (!userId) {
      console.log('[Approvals API POST] Step 1 FAILED: No userId')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }
    console.log('[Approvals API POST] Step 1 SUCCESS: Got userId:', userId)

    // SECURITY: Apply rate limiting for approval actions
    const clientId = getClientIdentifier(request, userId)
    const rateLimitResult = applyRateLimit(dashboardRateLimiter, clientId)

    if (!rateLimitResult.allowed) {
      console.log(`[Approvals API POST] Rate limit exceeded for user: ${userId}`)
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please wait before making another request.',
          rateLimitExceeded: true
        },
        {
          status: 429,
          headers: rateLimitResult.headers
        }
      )
    }

    console.log('[Approvals API POST] Step 2: Getting employee profile')
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      console.log('[Approvals API POST] Step 2 FAILED: No employeeProfile')
      return NextResponse.json(
        { success: false, error: 'Failed to create or retrieve employee profile' },
        { status: 500 }
      )
    }
    console.log('[Approvals API POST] Step 2 SUCCESS: Got employeeProfile:', employeeProfile.id)

    console.log('[Approvals API POST] Step 3: Checking manager permissions')
    // Check if user has manager permissions
    if (!employeeProfile.role_permissions.manager) {
      console.log('[Approvals API POST] Step 3 FAILED: No manager permissions')
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager access required.' },
        { status: 403 }
      )
    }
    console.log('[Approvals API POST] Step 3 SUCCESS: Manager permissions confirmed')

    console.log('[Approvals API POST] Step 4: Creating authenticated Supabase client')
    const supabase = await createAuthenticatedSupabaseClient(userId)
    console.log('[Approvals API POST] Step 4 SUCCESS: Authenticated client created with business context')

    console.log('[Approvals API POST] Step 5: Parsing request body')
    const body = await request.json()
    const { claim_id, action, notes } = body
    console.log('[Approvals API POST] Step 5 SUCCESS: Got request data:', { claim_id, action, hasNotes: !!notes })

    console.log('[Approvals API POST] Step 6: Validating request data')
    if (!claim_id || !action || !['approve', 'reject'].includes(action)) {
      console.log('[Approvals API POST] Step 6 FAILED: Invalid request data')
      return NextResponse.json(
        { success: false, error: 'Invalid request. claim_id and action (approve/reject) required.' },
        { status: 400 }
      )
    }
    console.log('[Approvals API POST] Step 6 SUCCESS: Request data validated')

    console.log('[Approvals API POST] Step 7: Querying claim for verification')
    // Verify the claim exists and belongs to the manager's business
    const { data: claimData, error: claimError } = await supabase
      .from('expense_claims')
      .select(`
        id,
        status,
        employee_id
      `)
      .eq('id', claim_id)
      .single()

    console.log('[Approvals API POST] Step 7.1: Claim basic data result:', {
      claimFound: !!claimData,
      error: claimError?.message || 'none',
      claimStatus: claimData?.status || 'N/A'
    })

    let claim = null
    if (claimData && !claimError) {
      // Separately get the employee profile to check business_id
      const { data: employeeData, error: employeeError } = await supabase
        .from('employee_profiles')
        .select('business_id')
        .eq('id', claimData.employee_id)
        .single()

      console.log('[Approvals API POST] Step 7.2: Employee profile result:', {
        employeeFound: !!employeeData,
        error: employeeError?.message || 'none',
        businessId: employeeData?.business_id || 'N/A'
      })

      if (employeeData && !employeeError) {
        claim = {
          ...claimData,
          employee_profiles: { business_id: employeeData.business_id }
        }
      }
    }

    console.log('[Approvals API POST] Step 7 RESULT: Claim query completed:', {
      claimFound: !!claim,
      error: claimError?.message || 'none',
      claimStatus: claim?.status || 'N/A'
    })

    if (claimError || !claim) {
      console.log('[Approvals API POST] Step 7 FAILED: Claim not found or error occurred')
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }
    console.log('[Approvals API POST] Step 7 SUCCESS: Claim found')

    console.log('[Approvals API POST] Step 8: Validating business authorization')
    if ((claim.employee_profiles as any)?.business_id !== employeeProfile.business_id) {
      console.log('[Approvals API POST] Step 8 FAILED: Business ID mismatch')
      return NextResponse.json(
        { success: false, error: 'Unauthorized to approve this claim' },
        { status: 403 }
      )
    }
    console.log('[Approvals API POST] Step 8 SUCCESS: Business authorization validated')

    console.log('[Approvals API POST] Step 9: Validating claim status')
    if (!['submitted', 'under_review', 'pending_approval'].includes(claim.status)) {
      console.log('[Approvals API POST] Step 9 FAILED: Invalid claim status:', claim.status)
      return NextResponse.json(
        { success: false, error: 'Claim is not in a state that can be approved or rejected' },
        { status: 400 }
      )
    }
    console.log('[Approvals API POST] Step 9 SUCCESS: Claim status is valid for approval')

    console.log('[Approvals API POST] Step 10: Updating claim status')
    // Update the claim status
    const newStatus = action === 'approve' ? 'approved' : 'rejected'

    // Prepare update data based on action
    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString()
    }

    if (action === 'approve') {
      updateData.approved_by = employeeProfile.id
      updateData.approved_at = new Date().toISOString()
      if (notes) {
        updateData.internal_notes = notes
      }
    } else {
      // For rejection
      updateData.reviewed_by = employeeProfile.id
      updateData.rejected_at = new Date().toISOString()
      if (notes) {
        updateData.rejection_reason = notes
      }
    }

    const { error: updateError } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', claim_id)

    if (updateError) {
      console.error('[Approvals API POST] Step 10 FAILED: Error updating claim:', updateError)
      return NextResponse.json(
        { success: false, error: `Failed to ${action} expense claim` },
        { status: 500 }
      )
    }
    console.log('[Approvals API POST] Step 10 SUCCESS: Claim status updated to:', newStatus)

    console.log('[Approvals API POST] Step 11: Logging approval action to history')
    // Log the approval action
    await supabase
      .from('approval_history')
      .insert({
        expense_claim_id: claim_id,
        approved_by: employeeProfile.id,
        action: newStatus,
        notes: notes || null,
        created_at: new Date().toISOString()
      })

    console.log('[Approvals API POST] Step 11 SUCCESS: Approval history logged')
    console.log(`[Approvals API] Claim ${claim_id} ${action}ed by ${employeeProfile.employee_id}`)

    console.log('[Approvals API POST] Step 12: Returning success response')
    return NextResponse.json({
      success: true,
      data: {
        claim_id,
        action,
        status: newStatus
      }
    }, {
      headers: rateLimitResult.headers
    })

  } catch (error) {
    console.error('[Approvals API POST] EXCEPTION CAUGHT: Unexpected error in try block:', error)
    console.error('[Approvals API POST] Error stack:', error instanceof Error ? error.stack : 'No stack available')

    if (error instanceof Error && error.message.includes('Permission required')) {
      console.log('[Approvals API POST] EXCEPTION: Permission error detected')
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager access required.' },
        { status: 403 }
      )
    }

    console.log('[Approvals API POST] EXCEPTION: Returning 500 error')
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}