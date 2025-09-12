/**
 * Expense Claims Analytics API
 * Provides real-time analytics data for expense claims
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
    const employeeProfile = await ensureEmployeeProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope') || 'personal'

    // Build query based on scope
    let query = supabase.from('expense_claims').select('*')

    if (scope === 'personal') {
      query = query.eq('employee_id', employeeProfile.id)
    } else if (scope === 'department' || scope === 'company') {
      // For managers/admins, show business-wide data
      const { data: businessClaims } = await supabase
        .from('expense_claims')
        .select(`
          *,
          transaction:transactions(home_currency_amount, original_amount, home_currency),
          employee:employee_profiles!expense_claims_employee_id_fkey(business_id)
        `)
        .eq('employee.business_id', employeeProfile.business_id)
        .is('deleted_at', null)

      if (!businessClaims) {
        return NextResponse.json({
          success: true,
          data: getEmptyAnalyticsData()
        })
      }

      const analytics = calculateAnalytics(businessClaims)
      return NextResponse.json({
        success: true,
        data: analytics
      })
    }

    const { data: claims } = await query.is('deleted_at', null)

    if (!claims || claims.length === 0) {
      return NextResponse.json({
        success: true,
        data: getEmptyAnalyticsData()
      })
    }

    const analytics = calculateAnalytics(claims)
    return NextResponse.json({
      success: true,
      data: analytics
    })

  } catch (error) {
    console.error('[Analytics API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function calculateAnalytics(claims: any[]) {
  // Calculate monthly trends
  const monthlyData = new Map()
  const categoryData = new Map()

  claims.forEach(claim => {
    const month = new Date(claim.created_at).toISOString().substring(0, 7)
    const amount = parseFloat(claim.transaction?.home_currency_amount || claim.transaction?.original_amount || '0')
    const category = claim.expense_category

    // Monthly trends
    if (!monthlyData.has(month)) {
      monthlyData.set(month, { total_amount: 0, claim_count: 0, month })
    }
    const monthData = monthlyData.get(month)
    monthData.total_amount += amount
    monthData.claim_count += 1

    // Category breakdown
    if (!categoryData.has(category)) {
      categoryData.set(category, { category, amount: 0, count: 0 })
    }
    const catData = categoryData.get(category)
    catData.amount += amount
    catData.count += 1
  })

  // Convert to arrays and calculate percentages
  const monthly_trends = Array.from(monthlyData.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item, index, arr) => {
      const prevMonth = index > 0 ? arr[index - 1] : null
      const change_percent = prevMonth ? 
        ((item.total_amount - prevMonth.total_amount) / prevMonth.total_amount) * 100 : 0
      return { ...item, change_percent: Math.round(change_percent * 10) / 10 }
    })

  const totalAmount = claims.reduce((sum, claim) => sum + parseFloat(claim.transaction?.home_currency_amount || claim.transaction?.original_amount || '0'), 0)
  
  const category_breakdown = Array.from(categoryData.values())
    .map(item => ({
      ...item,
      percentage: Math.round((item.amount / totalAmount) * 1000) / 10
    }))
    .sort((a, b) => b.amount - a.amount)

  const summary = {
    total_amount: Math.round(totalAmount * 100) / 100,
    total_claims: claims.length,
    avg_claim_amount: claims.length > 0 ? Math.round((totalAmount / claims.length) * 100) / 100 : 0,
    month_over_month_change: monthly_trends.length > 0 ? 
      monthly_trends[monthly_trends.length - 1].change_percent : 0
  }

  return {
    monthly_trends,
    category_breakdown,
    summary
  }
}

function getEmptyAnalyticsData() {
  return {
    monthly_trends: [],
    category_breakdown: [],
    summary: {
      total_amount: 0,
      total_claims: 0,
      avg_claim_amount: 0,
      month_over_month_change: 0
    }
  }
}