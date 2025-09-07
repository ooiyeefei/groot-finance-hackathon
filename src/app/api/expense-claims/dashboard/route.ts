/**
 * Expense Claims Dashboard Data API
 * Returns role-based dashboard metrics and recent claims
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'

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
      // Admin users see company-wide data
      const { data: companySummary } = await supabase
        .rpc('get_company_expense_summary', {
          business_id_param: employeeProfile.business_id
        })

      if (companySummary && companySummary.length > 0) {
        const summary = companySummary[0]
        dashboardData.summary = {
          total_claims: summary.total_claims || 0,
          pending_approval: summary.pending_reimbursement || 0,
          approved_amount: parseFloat(summary.total_approved || '0'),
          rejected_count: summary.total_rejected || 0
        }
      }

      // Get recent approved claims awaiting reimbursement
      const { data: recentClaims } = await supabase
        .from('expense_claims')
        .select(`
          *,
          employee:employee_profiles!expense_claims_employee_id_fkey(full_name, department),
          transaction:transactions(*)
        `)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(10)

      dashboardData.recent_claims = recentClaims || []

    } else if (isManager) {
      // Managers see their team's data
      const { data: teamSummary } = await supabase
        .rpc('get_team_expense_summary', {
          manager_id_param: employeeProfile.id
        })

      if (teamSummary && teamSummary.length > 0) {
        const summary = teamSummary[0]
        dashboardData.summary = {
          total_claims: summary.total_claims || 0,
          pending_approval: summary.pending_approval || 0,
          approved_amount: parseFloat(summary.total_approved || '0'),
          rejected_count: summary.total_rejected || 0
        }
      }

      // Get team claims pending manager approval
      const { data: pendingClaims } = await supabase
        .from('expense_claims')
        .select(`
          *,
          employee:employee_profiles!expense_claims_employee_id_fkey(full_name, department),
          transaction:transactions(*)
        `)
        .or(`current_approver_id.eq.${employeeProfile.id},employee.manager_id.eq.${employeeProfile.id}`)
        .in('status', ['submitted', 'under_review'])
        .order('created_at', { ascending: false })
        .limit(10)

      dashboardData.recent_claims = pendingClaims || []

    } else {
      // Employees see only their own data
      const { data: userClaims, error: claimsError } = await supabase
        .from('expense_claims')
        .select(`
          *,
          transaction:transactions(*)
        `)
        .eq('employee_id', employeeProfile.id)

      if (!claimsError && userClaims) {
        const totalClaims = userClaims.length
        const pendingApproval = userClaims.filter(claim => 
          ['submitted', 'under_review'].includes(claim.status)
        ).length
        const approvedAmount = userClaims
          .filter(claim => ['approved', 'reimbursed', 'paid'].includes(claim.status))
          .reduce((sum, claim) => sum + parseFloat(claim.transaction?.home_amount || '0'), 0)
        const rejectedCount = userClaims.filter(claim => claim.status === 'rejected').length

        dashboardData.summary = {
          total_claims: totalClaims,
          pending_approval: pendingApproval,
          approved_amount: approvedAmount,
          rejected_count: rejectedCount
        }

        // Get recent claims for employee
        dashboardData.recent_claims = userClaims
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)
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