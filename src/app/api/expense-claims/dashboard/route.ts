/**
 * Expense Claims Dashboard Data API
 * Returns role-based dashboard metrics and recent claims
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'

// Helper function to get user-friendly status display information
function getStatusDisplayInfo(status: string) {
  const statusMap: Record<string, { label: string; color: string; description: string }> = {
    'draft': {
      label: 'Draft',
      color: 'gray',
      description: 'Expense claim is being prepared'
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

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get or create employee profile using the fixed utility function
    const employeeProfile = await ensureEmployeeProfile(userId)

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
      // Admin users see company-wide data - use service client to bypass RLS
      console.log(`[Expense Dashboard API] Admin mode - querying business claims for business_id: ${employeeProfile.business_id}`)
      
      // Use service client for admin operations to bypass RLS
      const adminSupabase = createServiceSupabaseClient()
      
      // First, get all employee_ids in this business
      const { data: businessEmployees } = await adminSupabase
        .from('employee_profiles')
        .select('id')
        .eq('business_id', employeeProfile.business_id)
      
      const employeeIds = businessEmployees?.map(emp => emp.id) || []
      console.log(`[Expense Dashboard API] Found ${employeeIds.length} employees in business`)
      console.log(`[Expense Dashboard API] Employee IDs:`, employeeIds)
      console.log(`[Expense Dashboard API] Current user's employee_id: ${employeeProfile.id}`)
    console.log(`[Expense Dashboard API] Full employee profile:`, {
      id: employeeProfile.id,
      user_id: employeeProfile.user_id,
      employee_id: employeeProfile.employee_id,
      role_permissions: employeeProfile.role_permissions
    })
      
      // Now get all claims for these employees - using service client to bypass RLS
      const { data: simpleClaims, error: simpleError } = await adminSupabase
        .from('expense_claims')
        .select('*')
        .in('employee_id', employeeIds)
      
      console.log(`[Expense Dashboard API] Admin service client query result:`, {
        claimsCount: simpleClaims?.length || 0,
        error: simpleError,
        sampleClaim: simpleClaims?.[0]?.id || 'none'
      })

      // Now get all claims for these employees with full joins - using service client
      const { data: allBusinessClaims, error: businessClaimsError } = await adminSupabase
        .from('expense_claims')
        .select(`
          *,
          employee:employee_profiles!expense_claims_employee_id_fkey(
            department, 
            business_id,
            user:users!employee_profiles_user_id_fkey(full_name)
          )
        `)
        .in('employee_id', employeeIds)
        .is('deleted_at', null)
      
      console.log(`[Expense Dashboard API] Admin business claims result:`, {
        claimsCount: allBusinessClaims?.length || 0,
        error: businessClaimsError,
        sampleClaim: allBusinessClaims?.[0] ? {
          id: allBusinessClaims[0].id,
          status: allBusinessClaims[0].status,
          employee_id: allBusinessClaims[0].employee_id
        } : null
      })

      if (allBusinessClaims) {
        const totalClaims = allBusinessClaims.length
        const pendingReimbursement = allBusinessClaims.filter(claim => 
          ['submitted', 'under_review', 'pending_approval'].includes(claim.status)
        ).length
        
        // Get approved claims with their transaction data for amount calculation - using service client
        const { data: approvedClaimsWithTransactions } = await adminSupabase
          .from('expense_claims')
          .select(`
            *,
            transaction:transactions(home_currency_amount, home_currency),
            employee:employee_profiles!expense_claims_employee_id_fkey(business_id)
          `)
          .in('employee_id', employeeIds)
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

      // Get recent claims (all statuses) for admin view - using service client
      const { data: recentClaims } = await adminSupabase
        .from('expense_claims')
        .select(`
          *,
          transaction:transactions(*),
          employee:employee_profiles!expense_claims_employee_id_fkey(
            department, 
            business_id,
            user:users!employee_profiles_user_id_fkey(full_name)
          )
        `)
        .in('employee_id', employeeIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      dashboardData.recent_claims = recentClaims || []

      // Admin users also need to see their own personal expense claims (including drafts) - using service client
      const { data: adminPersonalClaims } = await adminSupabase
        .from('expense_claims')
        .select(`
          *,
          transaction:transactions(*),
          current_approver:employee_profiles!expense_claims_current_approver_id_fkey(
            role_permissions,
            user:users!employee_profiles_user_id_fkey(full_name)
          )
        `)
        .eq('employee_id', employeeProfile.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      // Add personal claims to the dashboard data
      if (adminPersonalClaims && adminPersonalClaims.length > 0) {
        console.log(`[Expense Dashboard API] Admin personal claims found: ${adminPersonalClaims.length}`)
        
        // Update summary to include personal claims
        const personalTotalClaims = adminPersonalClaims.length
        const personalPendingApproval = adminPersonalClaims.filter(claim => 
          ['submitted', 'under_review', 'pending_approval'].includes(claim.status)
        ).length
        const personalApprovedAmount = adminPersonalClaims
          .filter(claim => ['approved', 'reimbursed', 'paid'].includes(claim.status))
          .reduce((sum, claim) => sum + parseFloat(claim.transaction?.home_currency_amount || '0'), 0)
        const personalRejectedCount = adminPersonalClaims.filter(claim => claim.status === 'rejected').length

        // Add personal claims to totals (not replace, add to existing company totals)
        dashboardData.summary.total_claims += personalTotalClaims
        dashboardData.summary.pending_approval += personalPendingApproval
        dashboardData.summary.approved_amount += personalApprovedAmount
        dashboardData.summary.rejected_count += personalRejectedCount

        // For recent_claims in admin view, prioritize approved claims for reimbursement, but also include personal drafts
        const personalClaimsForDisplay = adminPersonalClaims.map(claim => ({
          ...claim,
          // Add status display information for personal claims
          status_display: getStatusDisplayInfo(claim.status),
          workflow_progress: getWorkflowProgress(claim.status),
          current_approver_name: claim.current_approver?.user?.full_name || null,
          _is_personal: true // Flag to identify personal claims in UI
        }))

        // Combine with existing recent claims but put personal claims first
        dashboardData.recent_claims = [...personalClaimsForDisplay, ...(dashboardData.recent_claims || [])].slice(0, 10)
      }

    } else if (isManager) {
      // Managers see their team's data - get claims from their business
      // First, get all employee_ids in this business
      const { data: businessEmployees } = await supabase
        .from('employee_profiles')
        .select('id')
        .eq('business_id', employeeProfile.business_id)
      
      const employeeIds = businessEmployees?.map(emp => emp.id) || []
      
      const { data: allBusinessClaims } = await supabase
        .from('expense_claims')
        .select(`
          *,
          employee:employee_profiles!expense_claims_employee_id_fkey(
            department, 
            business_id,
            user:users!employee_profiles_user_id_fkey(full_name)
          )
        `)
        .in('employee_id', employeeIds)
        .is('deleted_at', null)

      if (allBusinessClaims) {
        const totalClaims = allBusinessClaims.length
        const pendingApproval = allBusinessClaims.filter(claim => claim.status === 'pending_approval').length
        
        // Get approved claims with their transaction data for amount calculation - using employeeIds filter
        const { data: managerApprovedClaims } = await supabase
          .from('expense_claims')
          .select(`
            *,
            transaction:transactions(home_currency_amount, home_currency),
            employee:employee_profiles!expense_claims_employee_id_fkey(business_id)
          `)
          .in('employee_id', employeeIds)
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

      // Get team claims pending manager approval - using employeeIds filter
      const { data: pendingClaims } = await supabase
        .from('expense_claims')
        .select(`
          *,
          transaction:transactions(*),
          employee:employee_profiles!expense_claims_employee_id_fkey(
            department, 
            business_id,
            user:users!employee_profiles_user_id_fkey(full_name)
          )
        `)
        .in('employee_id', employeeIds)
        .eq('status', 'pending_approval')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10)

      dashboardData.recent_claims = pendingClaims || []

    } else {
      // Employees see only their own data with full workflow status
      console.log(`[Expense Dashboard API] Querying expense claims for employee_id: ${employeeProfile.id}`)
      
      const { data: userClaims, error: claimsError } = await supabase
        .from('expense_claims')
        .select(`
          *,
          transaction:transactions(*),
          current_approver:employee_profiles!expense_claims_current_approver_id_fkey(
            role_permissions,
            user:users!employee_profiles_user_id_fkey(full_name)
          )
        `)
        .eq('employee_id', employeeProfile.id)
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
          .map(claim => ({
            ...claim,
            // Add status display information
            status_display: getStatusDisplayInfo(claim.status),
            // Add workflow progress information
            workflow_progress: getWorkflowProgress(claim.status),
            // Add approver information
            current_approver_name: claim.current_approver?.user?.full_name || null
          }))
      }
    }

    console.log(`[Expense Dashboard API] Fetched dashboard data for user ${userId}, role: ${JSON.stringify(dashboardData.role)}`)

    return NextResponse.json({
      success: true,
      data: dashboardData
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