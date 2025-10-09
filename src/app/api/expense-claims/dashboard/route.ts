/**
 * Expense Claims Dashboard Data API
 * Returns role-based dashboard metrics and recent claims
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'
import { dashboardRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/rate-limiter'
import { auditLogger } from '@/lib/audit-logger'

// Helper function to get user-friendly status display information
function getStatusDisplayInfo(status: string, processingStatus?: string) {
  // If processing status is active, show processing info instead
  if (processingStatus === 'upload_pending') {
    return {
      label: 'Uploading...',
      color: 'blue',
      description: 'Receipt file is being uploaded',
      isProcessing: true
    }
  }

  if (processingStatus === 'processing') {
    return {
      label: 'Processing...',
      color: 'blue',
      description: 'Receipt is being analyzed by AI',
      isProcessing: true
    }
  }

  if (processingStatus === 'failed') {
    return {
      label: 'Processing Failed',
      color: 'red',
      description: 'Receipt processing failed - please try manual entry'
    }
  }

  const statusMap: Record<string, { label: string; color: string; description: string }> = {
    'draft': {
      label: 'Draft',
      color: 'gray',
      description: 'Ready for review - click Edit to modify or Submit to proceed'
    },
    'submitted': {
      label: 'Submitted',
      color: 'blue',
      description: 'Submitted for manager review'
    },
    'under_review': {
      label: 'Under Review',
      color: 'yellow',
      description: 'Being reviewed by manager'
    },
    'approved': {
      label: 'Approved',
      color: 'green',
      description: 'Approved - awaiting reimbursement'
    },
    'reimbursed': {
      label: 'Reimbursed',
      color: 'purple',
      description: 'Payment processed'
    },
    'paid': {
      label: 'Paid',
      color: 'green',
      description: 'Payment completed'
    },
    'rejected': {
      label: 'Rejected',
      color: 'red',
      description: 'Claim was rejected'
    },
    'pending_approval': {
      label: 'Pending Approval',
      color: 'orange',
      description: 'Awaiting manager approval (legacy status)'
    }
  }
  
  return statusMap[status] || {
    label: status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    color: 'gray',
    description: 'Unknown status'
  }
}

// Helper function to calculate workflow progress percentage
function getWorkflowProgress(status: string): number {
  const progressMap: Record<string, number> = {
    'draft': 10,
    'submitted': 25,
    'under_review': 50,
    'approved': 75,
    'reimbursed': 90,
    'paid': 100,
    'rejected': 0,
    'pending_approval': 40 // Legacy status between submitted and approved
  }

  return progressMap[status] || 0
}

// Helper function to format expense claims for display (uses expense_claims fields directly)
function transformClaimForDisplay(claim: any) {
  const statusDisplay = getStatusDisplayInfo(claim.status, claim.processing_status)

  return {
    ...claim,
    status_display: statusDisplay,
    workflow_progress: getWorkflowProgress(claim.status),
    current_approver_name: null,
    // Use expense_claims fields directly
    display_amount: claim.total_amount,
    display_currency: claim.currency,
    display_vendor: claim.vendor_name,
    display_date: claim.transaction_date,
    line_items: claim.processing_metadata?.line_items || []
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // SECURITY: Apply rate limiting for expensive dashboard analytics
    const clientId = getClientIdentifier(request, userId)
    const rateLimitResult = applyRateLimit(dashboardRateLimiter, clientId)

    if (!rateLimitResult.allowed) {
      console.log(`[Expense Dashboard API] Rate limit exceeded for user: ${userId}`)
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

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get or create employee profile using the fixed utility function
    let employeeProfile
    try {
      console.log('[Expense Dashboard API] Attempting to get employee profile for user:', userId)
      employeeProfile = await ensureUserProfile(userId)
      console.log('[Expense Dashboard API] Employee profile retrieved successfully:', {
        id: employeeProfile?.id,
        user_id: employeeProfile?.user_id,
        business_id: employeeProfile?.business_id,
        role: employeeProfile?.role
      })
    } catch (profileError) {
      console.error('[Expense Dashboard API] ERROR in ensureUserProfile:', profileError)
      console.error('[Expense Dashboard API] Profile error details:', {
        message: profileError instanceof Error ? profileError.message : String(profileError),
        stack: profileError instanceof Error ? profileError.stack : undefined
      })
      throw profileError // Re-throw to be caught by outer catch
    }

    if (!employeeProfile) {
      console.error('[Expense Dashboard API] Failed to create or retrieve employee profile - null/undefined returned')
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile. Please contact administrator.' },
        { status: 500 }
      )
    }

    // Determine data scope based on role
    const isEmployee = employeeProfile.role_permissions.employee
    const isManager = employeeProfile.role_permissions.manager
    const isAdmin = employeeProfile.role_permissions.admin

    // Build dashboard data based on role
    const dashboardData: any = {
      role: {
        employee: isEmployee,
        manager: isManager,
        admin: isAdmin
      },
      summary: {
        total_claims: 0,
        pending_approval: 0,
        approved_amount: 0,
        rejected_count: 0
      },
      recent_claims: []
    }

    if (isAdmin) {
      // PERFORMANCE: Admin users see company-wide data - use optimized RPC function
      console.log(`[Expense Dashboard API] Admin mode - using get_company_expense_summary RPC for business_id: ${employeeProfile.business_id}`)

      // AUDIT: Log RPC call start for admin dashboard
      const adminRpcStartTime = Date.now()
      const adminRpcParameters = {
        business_id_param: employeeProfile.business_id,
        user_id_param: employeeProfile.user_id  // ✅ Pass Supabase UUID to RPC
      }

      console.log('[Expense Dashboard API] Admin RPC call - Parameters:', adminRpcParameters)

      let rpcSummary, rpcError
      try {
        const result = await supabase.rpc('get_company_expense_summary', adminRpcParameters)
        rpcSummary = result.data
        rpcError = result.error
        console.log('[Expense Dashboard API] Admin RPC call completed:', {
          hasData: !!rpcSummary,
          hasError: !!rpcError,
          errorMessage: rpcError?.message
        })
      } catch (rpcException) {
        console.error('[Expense Dashboard API] Exception during admin RPC call:', rpcException)
        throw rpcException
      }

      // AUDIT: Log RPC call completion for admin dashboard
      const adminExecutionTime = Date.now() - adminRpcStartTime
      auditLogger.logRPCCall(
        employeeProfile.user_id,  // ✅ Use Supabase UUID instead of Clerk ID
        employeeProfile.business_id,
        'get_company_expense_summary',
        adminRpcParameters,
        !rpcError,
        request,
        adminExecutionTime,
        rpcSummary ? 1 : 0,
        rpcError?.message
      )

      if (rpcError) {
        console.error('[Expense Dashboard API] RPC function failed, using authenticated client fallback:', rpcError)
        // Fallback to authenticated client approach for admin dashboard
        const { data: businessEmployees } = await supabase
          .from('business_memberships')
          .select('user_id')
          .eq('business_id', employeeProfile.business_id)

        const employeeUserIds = businessEmployees?.map(emp => emp.user_id) || []
        const { data: allBusinessClaims } = await supabase
          .from('expense_claims')
          .select(`
            *
          `)
          .in('user_id', employeeUserIds)
          .is('deleted_at', null)

        if (allBusinessClaims) {
          const totalClaims = allBusinessClaims.length
          const pendingReimbursement = allBusinessClaims.filter(claim =>
            ['submitted', 'under_review', 'pending_approval'].includes(claim.status)
          ).length

          const { data: approvedClaimsWithTransactions } = await supabase
            .from('expense_claims')
            .select(`
              *,
              transaction:transactions(home_currency_amount, home_currency)
            `)
            .in('user_id', employeeUserIds)
            .eq('status', 'approved')
            .is('deleted_at', null)

          const approvedAmount = (approvedClaimsWithTransactions || [])
            .reduce((sum, claim) => sum + parseFloat(claim.transaction?.home_currency_amount || '0'), 0)
          const rejectedCount = allBusinessClaims.filter(claim => claim.status === 'rejected').length

          dashboardData.summary = {
            total_claims: totalClaims,
            pending_approval: pendingReimbursement,
            approved_amount: approvedAmount,
            rejected_count: rejectedCount
          }
        }

        // Get recent claims with authenticated client fallback
        const { data: recentClaims } = await supabase
          .from('expense_claims')
          .select('*')
          .in('user_id', employeeUserIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        dashboardData.recent_claims = (recentClaims || []).map(transformClaimForDisplay)
      } else {
        // Use optimized RPC results with proper type conversion
        // CRITICAL FIX: RPC returns an array with one object, not the object directly
        const summary = Array.isArray(rpcSummary) ? rpcSummary[0] : rpcSummary
        console.log('[Expense Dashboard API] RPC function completed successfully:', rpcSummary)
        console.log('[Expense Dashboard API] Extracted summary object:', summary)
        console.log('[Expense Dashboard API] Converting RPC summary to dashboard format:')
        console.log('  - total_claims:', summary.total_claims, '→', Number(summary.total_claims))
        console.log('  - pending_reimbursement:', summary.pending_reimbursement, '→', Number(summary.pending_reimbursement))
        console.log('  - total_approved:', summary.total_approved, '→', Number(summary.total_approved))
        console.log('  - total_rejected:', summary.total_rejected, '→', Number(summary.total_rejected))

        dashboardData.summary = {
          total_claims: Number(summary.total_claims) || 0,
          pending_approval: Number(summary.pending_reimbursement) || 0,
          approved_amount: Number(summary.total_approved) || 0,
          rejected_count: Number(summary.total_rejected) || 0
        }

        console.log('[Expense Dashboard API] Final dashboard summary:', dashboardData.summary)

        // Still need to get recent claims for the UI - use authenticated client
        const { data: businessEmployees } = await supabase
          .from('business_memberships')
          .select('user_id')
          .eq('business_id', employeeProfile.business_id)

        const employeeUserIds = businessEmployees?.map(emp => emp.user_id) || []
        const { data: recentClaims } = await supabase
          .from('expense_claims')
          .select('*')
          .in('user_id', employeeUserIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        dashboardData.recent_claims = (recentClaims || []).map(transformClaimForDisplay)
      }

      // Admin users also need to see their own personal expense claims (including drafts) - use authenticated client
      const { data: adminPersonalClaims } = await supabase
        .from('expense_claims')
        .select('*')
        .eq('user_id', employeeProfile.user_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      // Add personal claims to the dashboard data with proper status display
      if (adminPersonalClaims && adminPersonalClaims.length > 0) {
        console.log(`[Expense Dashboard API] Admin personal claims found: ${adminPersonalClaims.length}`)

        const personalClaimsForDisplay = adminPersonalClaims.map(claim => ({
          ...transformClaimForDisplay(claim),
          _is_personal: true
        }))

        // Combine with existing recent claims but put personal claims first
        const existingClaimIds = new Set((dashboardData.recent_claims || []).map((claim: any) => claim.id))
        const uniquePersonalClaims = personalClaimsForDisplay.filter((claim: any) => !existingClaimIds.has(claim.id))
        dashboardData.recent_claims = [...uniquePersonalClaims, ...(dashboardData.recent_claims || [])].slice(0, 10)
      }

    } else if (isManager) {
      // PERFORMANCE: Managers see their team's data - use optimized RPC function
      console.log(`[Expense Dashboard API] Manager mode - using get_team_expense_summary RPC for business_id: ${employeeProfile.business_id}`)

      // AUDIT: Log RPC call start for manager dashboard
      const managerRpcStartTime = Date.now()
      const managerRpcParameters = {
        business_id_param: employeeProfile.business_id,
        user_id_param: employeeProfile.user_id  // ✅ Pass Supabase UUID to RPC
      }

      const { data: rpcTeamSummary, error: rpcTeamError } = await supabase
        .rpc('get_team_expense_summary', managerRpcParameters)

      // AUDIT: Log RPC call completion for manager dashboard
      const managerExecutionTime = Date.now() - managerRpcStartTime
      auditLogger.logRPCCall(
        employeeProfile.user_id,  // ✅ Use Supabase UUID instead of Clerk ID
        employeeProfile.business_id,
        'get_team_expense_summary',
        managerRpcParameters,
        !rpcTeamError,
        request,
        managerExecutionTime,
        rpcTeamSummary ? 1 : 0,
        rpcTeamError?.message
      )

      if (rpcTeamError) {
        console.error('[Expense Dashboard API] Team RPC function failed, using authenticated client fallback:', rpcTeamError)
        // Fallback to manual calculation with authenticated client
        const { data: businessEmployees } = await supabase
          .from('business_memberships')
          .select('user_id')
          .eq('business_id', employeeProfile.business_id)

        const employeeUserIds = businessEmployees?.map(emp => emp.user_id) || []
        const { data: allBusinessClaims } = await supabase
          .from('expense_claims')
          .select(`
            *
          `)
          .in('user_id', employeeUserIds)
          .is('deleted_at', null)

        if (allBusinessClaims) {
          const totalClaims = allBusinessClaims.length
          const pendingApproval = allBusinessClaims.filter(claim => claim.status === 'pending_approval').length

          const { data: managerApprovedClaims } = await supabase
            .from('expense_claims')
            .select(`
              *,
              transaction:transactions(home_currency_amount, home_currency)
            `)
            .in('user_id', employeeUserIds)
            .eq('status', 'approved')
            .is('deleted_at', null)

          const approvedAmount = (managerApprovedClaims || [])
            .reduce((sum, claim) => sum + parseFloat(claim.transaction?.home_currency_amount || '0'), 0)
          const rejectedCount = allBusinessClaims.filter(claim => claim.status === 'rejected').length

          dashboardData.summary = {
            total_claims: totalClaims,
            pending_approval: pendingApproval,
            approved_amount: approvedAmount,
            rejected_count: rejectedCount
          }
        }

        // Get team claims pending manager approval with fallback
        const { data: pendingClaims } = await supabase
          .from('expense_claims')
          .select('*')
          .in('user_id', employeeUserIds)
          .eq('status', 'pending_approval')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        dashboardData.recent_claims = (pendingClaims || []).map(transformClaimForDisplay)
      } else {
        // Use optimized RPC results with proper type conversion
        // CRITICAL FIX: RPC returns an array with one object, not the object directly
        const teamSummary = Array.isArray(rpcTeamSummary) ? rpcTeamSummary[0] : rpcTeamSummary
        console.log('[Expense Dashboard API] Team RPC function completed successfully:', rpcTeamSummary)
        console.log('[Expense Dashboard API] Extracted team summary object:', teamSummary)

        dashboardData.summary = {
          total_claims: Number(teamSummary.total_claims) || 0,
          pending_approval: Number(teamSummary.pending_count) || 0,
          approved_amount: Number(teamSummary.approved_amount) || 0,
          rejected_count: Number(teamSummary.rejected_count) || 0
        }

        // Still need to get recent claims for the UI - use authenticated client
        const { data: businessEmployees } = await supabase
          .from('business_memberships')
          .select('user_id')
          .eq('business_id', employeeProfile.business_id)

        const employeeUserIds = businessEmployees?.map(emp => emp.user_id) || []
        const { data: pendingClaims } = await supabase
          .from('expense_claims')
          .select('*')
          .in('user_id', employeeUserIds)
          .eq('status', 'pending_approval')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        dashboardData.recent_claims = (pendingClaims || []).map(transformClaimForDisplay)
      }

    } else {
      // Employees see only their own data with full workflow status
      console.log(`[Expense Dashboard API] Querying expense claims for user_id: ${employeeProfile.user_id}`)

      const { data: userClaims, error: claimsError } = await supabase
        .from('expense_claims')
        .select('*')
        .eq('user_id', employeeProfile.user_id)
        .is('deleted_at', null)
      
      console.log(`[Expense Dashboard API] Query result - userClaims count: ${userClaims?.length || 0}`)
      if (claimsError) {
        console.log(`[Expense Dashboard API] Claims query error:`, claimsError)
      }
      if (userClaims && userClaims.length > 0) {
        console.log(`[Expense Dashboard API] First claim sample:`, JSON.stringify(userClaims[0], null, 2))
      }

      if (!claimsError && userClaims) {
        const totalClaims = userClaims.length
        // Count pending as submitted, under_review, and pending_approval (legacy)
        const pendingApproval = userClaims.filter(claim => 
          ['submitted', 'under_review', 'pending_approval'].includes(claim.status)
        ).length
        const approvedAmount = userClaims
          .filter(claim => ['approved', 'reimbursed', 'paid'].includes(claim.status))
          .reduce((sum, claim) => sum + parseFloat(claim.total_amount || '0'), 0)
        const rejectedCount = userClaims.filter(claim => claim.status === 'rejected').length

        dashboardData.summary = {
          total_claims: totalClaims,
          pending_approval: pendingApproval,
          approved_amount: approvedAmount,
          rejected_count: rejectedCount
        }

        // Get recent claims for employee with enhanced status info
        dashboardData.recent_claims = userClaims
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
          .map(claim => {
            console.log(`[Dashboard API] Claim ${claim.id}: status=${claim.status}, processing_status=${claim.processing_status}`)
            return transformClaimForDisplay(claim)
          })
      }
    }

    console.log(`[Expense Dashboard API] Fetched dashboard data for user ${userId}, role: ${JSON.stringify(dashboardData.role)}`)
    console.log('[Expense Dashboard API] Final response summary:', {
      total_claims: dashboardData.summary.total_claims,
      pending_approval: dashboardData.summary.pending_approval,
      approved_amount: dashboardData.summary.approved_amount,
      rejected_count: dashboardData.summary.rejected_count,
      recent_claims_count: dashboardData.recent_claims?.length || 0
    })

    return NextResponse.json({
      success: true,
      data: dashboardData
    }, {
      headers: rateLimitResult.headers
    })

  } catch (error) {
    // Enhanced error logging for debugging
    console.error('[Expense Dashboard API] ========== UNEXPECTED ERROR ==========')
    console.error('[Expense Dashboard API] Error type:', error instanceof Error ? error.constructor.name : typeof error)
    console.error('[Expense Dashboard API] Error message:', error instanceof Error ? error.message : String(error))
    console.error('[Expense Dashboard API] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('[Expense Dashboard API] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    console.error('[Expense Dashboard API] ==========================================')

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch dashboard data',
        debug: process.env.NODE_ENV === 'development' ? {
          message: error instanceof Error ? error.message : String(error),
          type: error instanceof Error ? error.constructor.name : typeof error
        } : undefined
      },
      { status: 500 }
    )
  }
}