/**
 * Expense Approval API
 * Handles manager approval/rejection of expense claims
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'
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
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create or retrieve employee profile' },
        { status: 500 }
      )
    }

    // SECURITY: Validate business context matches
    if (userProfile.business_id !== userData.business_id) {
      return NextResponse.json(
        { success: false, error: 'Business context mismatch' },
        { status: 403 }
      )
    }

    // Check if user has manager permissions
    if (userProfile.role !== 'manager' && userProfile.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager access required.' },
        { status: 403 }
      )
    }

    // SECURITY: Use authenticated client with business context validation
    console.log('[Approvals API] Querying business claims for business_id:', userProfile.business_id)

    // First, get all user_ids in this business using authenticated client
    const { data: businessEmployees } = await supabase
      .from('business_memberships')
      .select('user_id')
      .eq('business_id', userProfile.business_id)

    const employeeIds = businessEmployees?.map(emp => emp.user_id) || []
    console.log('[Approvals API] Found employee IDs (dashboard API approach):', employeeIds)
    console.log('[Approvals API] Employee count:', businessEmployees?.length)

    // Get submitted expense claims for these employees
    console.log('[Approvals API] Querying claims for user_ids:', employeeIds)
    console.log('[Approvals API] Employee IDs type and values:', employeeIds.map(id => ({ id, type: typeof id })))

    // Debug: Check what claims exist in the database first
    console.log('[Approvals API] DEBUG: Checking ALL claims in database...')
    const { data: allClaims, error: allClaimsError } = await supabase
      .from('expense_claims')
      .select('id, user_id, status, deleted_at')
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
        user_id: claim.user_id,
        status: claim.status,
        user_id_type: typeof claim.user_id
      }))
    })

    // Debug: Check claims for our specific employee IDs
    console.log('[Approvals API] DEBUG: Checking claims for our employee IDs...')
    const { data: employeeSpecificClaims } = await supabase
      .from('expense_claims')
      .select('id, user_id, status, deleted_at')
      .in('user_id', employeeIds)
      .is('deleted_at', null)

    console.log('[Approvals API] DEBUG: Claims for our employee IDs:', {
      claimsCount: employeeSpecificClaims?.length || 0,
      claims: employeeSpecificClaims?.map(claim => ({
        id: claim.id,
        user_id: claim.user_id,
        status: claim.status
      }))
    })

    // Use exact same approach as dashboard API - simple query first
    console.log('[Approvals API] Dashboard API approach - Authenticated client query...')
    const { data: simpleClaims, error: simpleError } = await supabase
      .from('expense_claims')
      .select('*')
      .in('user_id', employeeIds)

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
        transaction:accounting_entries!expense_claims_accounting_entry_id_fkey(*),
        employee:users!inner(id,full_name,email)
      `)
      .in('user_id', employeeIds)
      .in('status', ['submitted', 'under_review', 'pending_approval']) // Include all pending statuses
      .is('deleted_at', null)
      .order('submitted_at', { ascending: true }) // Oldest submissions first

    console.log('[Approvals API] Query result:', {
      claimsCount: claims?.length || 0,
      error: claimsError,
      firstClaim: claims?.[0] ? {
        id: claims[0].id,
        status: claims[0].status,
        user_id: claims[0].user_id
      } : null
    })

    // Debug: Check if filtering by status is the issue
    console.log('[Approvals API] DEBUG: Testing query without status filter...')
    const { data: claimsWithoutStatusFilter } = await supabase
      .from('expense_claims')
      .select('id, user_id, status, deleted_at')
      .in('user_id', employeeIds)
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
      .eq('id', userProfile.business_id)
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

      // Extract document/receipt information from processing_metadata
      const processingMetadata = claim.processing_metadata || {}
      const hasReceipt = !!(claim.storage_path || processingMetadata.storage_path)

      // Construct document object similar to expense-claim-details-modal
      const document = hasReceipt ? {
        id: processingMetadata.document_id || claim.id,
        original_filename: processingMetadata.original_filename || 'Receipt',
        file_type: processingMetadata.file_type || 'image/jpeg',
        file_size: processingMetadata.file_size || 0,
        processing_status: processingMetadata.processing_status || 'completed',
        processing_progress: processingMetadata.processing_progress || 100,
        annotated_image_url: processingMetadata.annotated_image_url || null,
        storage_path: claim.storage_path || processingMetadata.storage_path,
        extracted_data: processingMetadata.raw_extraction || processingMetadata.financial_data || null
      } : null

      return {
        id: claim.id,
        employee_name: claim.employee?.full_name || claim.employee?.email || `User ID: ${claim.user_id}`,
        user_id: claim.user_id,
        employee_department: null, // Department info no longer available
        employee_job_title: null, // Job title info no longer available
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
        document_url: null, // Legacy field - use document.storage_path instead
        receipt_confidence: processingMetadata.confidence_score || null,
        notes: claim.transaction?.notes,
        requires_receipt: category?.requires_receipt || false,
        policy_limit: category?.policy_limit,
        is_over_limit: !!isOverLimit,
        accounting_entry_id: claim.accounting_entry_id,
        current_approver_id: claim.current_approver_id,
        // NEW: Add document/receipt data for approval workflow
        document: document,
        storage_path: claim.storage_path,
        has_receipt: hasReceipt
      }
    })

    // PERFORMANCE: Use optimized RPC function for team expense summary
    console.log('[Approvals API] Using get_team_expense_summary RPC for business:', userProfile.business_id)

    // AUDIT: Log RPC call start for approvals stats
    const approvalsRpcStartTime = Date.now()
    const approvalsRpcParameters = {
      business_id_param: userProfile.business_id,
      user_id_param: userProfile.user_id  // ✅ Pass Supabase UUID to RPC
    }

    const { data: rpcStats, error: rpcError } = await supabase
      .rpc('get_team_expense_summary', approvalsRpcParameters)

    // AUDIT: Log RPC call completion for approvals stats
    const approvalsExecutionTime = Date.now() - approvalsRpcStartTime
    auditLogger.logRPCCall(
      userProfile.user_id,  // ✅ Use Supabase UUID instead of Clerk ID
      userProfile.business_id,
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
        .in('user_id', employeeIds)
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
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      console.log('[Approvals API POST] Step 2 FAILED: No userProfile')
      return NextResponse.json(
        { success: false, error: 'Failed to create or retrieve employee profile' },
        { status: 500 }
      )
    }
    console.log('[Approvals API POST] Step 2 SUCCESS: Got userProfile:', userProfile.id)

    console.log('[Approvals API POST] Step 3: Checking manager permissions')
    // Check if user has manager permissions
    if (userProfile.role !== 'manager' && userProfile.role !== 'admin') {
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
        user_id
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
      // Separately get the business membership to check business_id
      const { data: employeeData, error: employeeError } = await supabase
        .from('business_memberships')
        .select('business_id')
        .eq('user_id', claimData.user_id)
        .single()

      console.log('[Approvals API POST] Step 7.2: Business membership result:', {
        membershipFound: !!employeeData,
        error: employeeError?.message || 'none',
        businessId: employeeData?.business_id || 'N/A'
      })

      if (employeeData && !employeeError) {
        claim = {
          ...claimData,
          business_membership: { business_id: employeeData.business_id }
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
    if ((claim.business_membership as any)?.business_id !== userProfile.business_id) {
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
      updateData.approved_by = userProfile.user_id
      updateData.approved_at = new Date().toISOString()
      if (notes) {
        updateData.internal_notes = notes
      }
    } else {
      // For rejection
      updateData.reviewed_by = userProfile.user_id
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

    // Step 10.5: If approved, create accounting_entry from processing_metadata
    if (action === 'approve') {
      console.log('[Approvals API POST] Step 10.5: Creating accounting_entry from processing_metadata')

      try {
        const { data: accountingEntryId, error: rpcError } = await supabase
          .rpc('create_accounting_entry_from_approved_claim', {
            p_claim_id: claim_id,
            p_approver_id: userProfile.user_id
          })

        if (rpcError) {
          console.error('[Approvals API POST] Step 10.5 ERROR: Failed to create accounting_entry:', rpcError)
          // Rollback the approval status since accounting entry creation failed
          await supabase
            .from('expense_claims')
            .update({ status: 'submitted' })
            .eq('id', claim_id)

          return NextResponse.json(
            {
              success: false,
              error: `Approval succeeded but failed to create accounting entry: ${rpcError.message}. Please contact support.`
            },
            { status: 500 }
          )
        }

        console.log('[Approvals API POST] Step 10.5 SUCCESS: Created accounting_entry:', accountingEntryId)
      } catch (rpcException) {
        console.error('[Approvals API POST] Step 10.5 EXCEPTION: Error calling RPC:', rpcException)
        // Rollback the approval status
        await supabase
          .from('expense_claims')
          .update({ status: 'submitted' })
          .eq('id', claim_id)

        return NextResponse.json(
          {
            success: false,
            error: 'Failed to create accounting entry from approved claim. Approval rolled back.'
          },
          { status: 500 }
        )
      }
    }

    console.log('[Approvals API POST] Step 11: Logging approval action to history')
    // Log the approval action
    await supabase
      .from('approval_history')
      .insert({
        expense_claim_id: claim_id,
        approved_by: userProfile.user_id,
        action: newStatus,
        notes: notes || null,
        created_at: new Date().toISOString()
      })

    console.log('[Approvals API POST] Step 11 SUCCESS: Approval history logged')
    console.log(`[Approvals API] Claim ${claim_id} ${action}ed by user ${userProfile.user_id}`)

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