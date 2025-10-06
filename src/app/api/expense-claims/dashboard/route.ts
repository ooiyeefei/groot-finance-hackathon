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
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      console.error('[Expense Dashboard API] Failed to create or retrieve employee profile')
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

      const { data: rpcSummary, error: rpcError } = await supabase
        .rpc('get_company_expense_summary', adminRpcParameters)

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
          .in('employee_id', employeeUserIds)
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
            .in('employee_id', employeeUserIds)
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
          .select(`
            *,
            transaction:transactions(*)
          `)
          .in('employee_id', employeeUserIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        dashboardData.recent_claims = recentClaims || []
      } else {
        // Use optimized RPC results with proper type conversion
        console.log('[Expense Dashboard API] RPC function completed successfully:', rpcSummary)

        dashboardData.summary = {
          total_claims: Number(rpcSummary.total_claims) || 0,
          pending_approval: Number(rpcSummary.pending_reimbursement) || 0,
          approved_amount: Number(rpcSummary.total_approved) || 0,
          rejected_count: Number(rpcSummary.total_rejected) || 0
        }

        // Still need to get recent claims for the UI - use authenticated client
        const { data: businessEmployees } = await supabase
          .from('business_memberships')
          .select('user_id')
          .eq('business_id', employeeProfile.business_id)

        const employeeUserIds = businessEmployees?.map(emp => emp.user_id) || []
        const { data: recentClaims } = await supabase
          .from('expense_claims')
          .select(`
            *,
            transaction:transactions(*)
          `)
          .in('employee_id', employeeUserIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        dashboardData.recent_claims = recentClaims || []
      }

      // Admin users also need to see their own personal expense claims (including drafts) - use authenticated client
      const { data: adminPersonalClaims } = await supabase
        .from('expense_claims')
        .select(`
          *,
          transaction:transactions(*)
        `)
        .eq('employee_id', employeeProfile.user_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      // Add personal claims to the dashboard data with proper status display
      if (adminPersonalClaims && adminPersonalClaims.length > 0) {
        console.log(`[Expense Dashboard API] Admin personal claims found: ${adminPersonalClaims.length}`)

        const personalClaimsForDisplay = adminPersonalClaims.map(claim => {
          const statusDisplay = getStatusDisplayInfo(claim.status, claim.processing_status)
          return {
            ...claim,
            status_display: statusDisplay,
            workflow_progress: getWorkflowProgress(claim.status),
            current_approver_name: null,
            _is_personal: true
          }
        })

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
          .in('employee_id', employeeUserIds)
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
            .in('employee_id', employeeUserIds)
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
          .select(`
            *,
            transaction:transactions(*)
          `)
          .in('employee_id', employeeUserIds)
          .eq('status', 'pending_approval')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        dashboardData.recent_claims = pendingClaims || []
      } else {
        // Use optimized RPC results with proper type conversion
        console.log('[Expense Dashboard API] Team RPC function completed successfully:', rpcTeamSummary)

        dashboardData.summary = {
          total_claims: Number(rpcTeamSummary.total_claims) || 0,
          pending_approval: Number(rpcTeamSummary.pending_count) || 0,
          approved_amount: Number(rpcTeamSummary.approved_amount) || 0,
          rejected_count: Number(rpcTeamSummary.rejected_count) || 0
        }

        // Still need to get recent claims for the UI - use authenticated client
        const { data: businessEmployees } = await supabase
          .from('business_memberships')
          .select('user_id')
          .eq('business_id', employeeProfile.business_id)

        const employeeUserIds = businessEmployees?.map(emp => emp.user_id) || []
        const { data: pendingClaims } = await supabase
          .from('expense_claims')
          .select(`
            *,
            transaction:transactions(*)
          `)
          .in('employee_id', employeeUserIds)
          .eq('status', 'pending_approval')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        dashboardData.recent_claims = pendingClaims || []
      }

    } else {
      // Employees see only their own data with full workflow status
      console.log(`[Expense Dashboard API] Querying expense claims for employee_id: ${employeeProfile.user_id}`)

      const { data: userClaims, error: claimsError } = await supabase
        .from('expense_claims')
        .select(`
          *,
          transaction:transactions(*)
        `)
        .eq('employee_id', employeeProfile.user_id)
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
          .reduce((sum, claim) => sum + parseFloat(claim.transaction?.home_currency_amount || '0'), 0)
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
            const statusDisplay = getStatusDisplayInfo(claim.status, claim.processing_status)
            console.log(`[Dashboard API] Claim ${claim.id}: status=${claim.status}, processing_status=${claim.processing_status}, status_display=${JSON.stringify(statusDisplay)}`)
            return {
              ...claim,
              // Add status display information
              status_display: statusDisplay,
              // Add workflow progress information
              workflow_progress: getWorkflowProgress(claim.status),
              // Add approver information
              current_approver_name: null // Removed invalid foreign key relationship
            }
          })
      }
    }

    console.log(`[Expense Dashboard API] Fetched dashboard data for user ${userId}, role: ${JSON.stringify(dashboardData.role)}`)

    return NextResponse.json({
      success: true,
      data: dashboardData
    }, {
      headers: rateLimitResult.headers
    })

  } catch (error) {
    console.error('[Expense Dashboard API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch dashboard data'
      },
      { status: 500 }
    )
  }
}