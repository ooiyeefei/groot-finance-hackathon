/**
 * Expense Claims Analytics API
 * Provides real-time analytics data for expense claims
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'

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
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to create employee profile' },
        { status: 500 }
      )
    }

    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope') || 'personal'

    console.log(`[Analytics API] Fetching analytics for scope: ${scope}, user: ${userId}, employee: ${employeeProfile.id}`)

    let claims: any[] = []

    if (scope === 'personal') {
      // Personal analytics - use authenticated client
      const { data: personalClaims, error: personalError } = await supabase
        .from('expense_claims')
        .select(`
          *,
          transaction:accounting_entries(home_currency_amount, original_amount, home_currency, original_currency)
        `)
        .eq('user_id', employeeProfile.user_id)  // CRITICAL: Use user UUID, not membership ID
        .is('deleted_at', null)

      if (personalError) {
        console.error('[Analytics API] Error fetching personal claims:', personalError)
        return NextResponse.json({
          success: true,
          data: getEmptyAnalyticsData()
        })
      }

      claims = personalClaims || []
      console.log(`[Analytics API] Personal claims found: ${claims.length}`)

    } else if (scope === 'department' || scope === 'company') {
      // Business-wide analytics - use service client for admin/manager access
      const serviceSupabase = createServiceSupabaseClient()
      
      // First get all employees in this business
      const { data: businessEmployees } = await serviceSupabase
        .from('employee_profiles')
        .select('id')
        .eq('business_id', employeeProfile.business_id)
      
      const employeeIds = businessEmployees?.map(emp => emp.id) || []
      console.log(`[Analytics API] Business employees found: ${employeeIds.length}`)

      if (employeeIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: getEmptyAnalyticsData()
        })
      }

      // Get business-wide claims with transaction data
      const { data: businessClaims, error: businessError } = await serviceSupabase
        .from('expense_claims')
        .select(`
          *,
          transaction:accounting_entries(home_currency_amount, original_amount, home_currency, original_currency)
        `)
        .in('user_id', employeeIds)
        .is('deleted_at', null)

      if (businessError) {
        console.error('[Analytics API] Error fetching business claims:', businessError)
        return NextResponse.json({
          success: true,
          data: getEmptyAnalyticsData()
        })
      }

      claims = businessClaims || []
      console.log(`[Analytics API] Business claims found: ${claims.length}`)
    }

    if (!claims || claims.length === 0) {
      console.log(`[Analytics API] No claims found, returning empty data`)
      return NextResponse.json({
        success: true,
        data: getEmptyAnalyticsData()
      })
    }

    console.log(`[Analytics API] Processing ${claims.length} claims for analytics`)
    
    // Get business categories for proper category mapping
    const businessCategories = await getBusinessCategories(employeeProfile.business_id)
    
    const analytics = await calculateAnalytics(claims, businessCategories)
    
    console.log(`[Analytics API] Analytics calculated:`, {
      totalAmount: analytics.summary.total_amount,
      totalClaims: analytics.summary.total_claims,
      categories: analytics.category_breakdown.length
    })
    
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

// Helper function to get business categories 
async function getBusinessCategories(businessId: string) {
  try {
    const serviceSupabase = createServiceSupabaseClient()
    const { data: businessData } = await serviceSupabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', businessId)
      .single()

    const categories = businessData?.custom_expense_categories || []
    const enabledCategories = categories
      .filter((category: any) => category.is_active !== false)
      .map((category: any) => ({
        category_code: category.category_code,
        category_name: category.category_name,
        description: category.description
      }))

    return enabledCategories
  } catch (error) {
    console.error('Error fetching business categories:', error)
    return []
  }
}

function calculateAnalytics(claims: any[], businessCategories: any[]) {
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
    .map(item => {
      // Find matching business category for proper display
      const businessCategory = businessCategories.find(bc => bc.category_code === item.category)
      
      return {
        ...item,
        category_name: businessCategory?.category_name || item.category,
        percentage: totalAmount > 0 ? Math.round((item.amount / totalAmount) * 1000) / 10 : 0
      }
    })
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