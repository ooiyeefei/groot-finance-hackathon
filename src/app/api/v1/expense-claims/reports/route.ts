/**
 * Expense Claims Reports V1 API
 *
 * GET /api/v1/expense-claims/reports?month=YYYY-MM&employeeId=uuid
 *
 * Purpose:
 * - Comprehensive expense report generation for employees, managers, and admins
 * - Role-based access control with business ID segregation
 * - Structured JSON response grouped by expense categories
 * - Server-side data processing for optimal frontend consumption
 *
 * Architecture:
 * - Follows established authentication patterns from analytics route
 * - Uses existing RBAC from business_memberships table
 * - Leverages custom expense categories from businesses.custom_expense_categories
 * - Matches response format from user's sample expense report
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { createBusinessContextSupabaseClient, createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { startOfMonth, addMonths, parse, format } from 'date-fns'
import { mapExpenseCategoryToAccounting } from '@/domains/expense-claims/lib/expense-category-mapper'

export async function GET(request: NextRequest) {
  try {
    // Authentication - following established pattern
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userData = await getUserData(userId)
    if (!userData.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // Get user profile with role permissions
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json({ success: false, error: 'Failed to get user profile' }, { status: 400 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // YYYY-MM format
    const employeeId = searchParams.get('employeeId') // Optional, for manager/admin filtering

    // Validate required month parameter
    if (!month) {
      return NextResponse.json({
        success: false,
        error: 'Month parameter is required (format: YYYY-MM)'
      }, { status: 400 })
    }

    // Validate month format
    const monthRegex = /^\d{4}-\d{2}$/
    if (!monthRegex.test(month)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid month format. Use YYYY-MM format (e.g., 2025-01)'
      }, { status: 400 })
    }

    console.log(`[Expense Reports V1 API] Generating report for month: ${month}, user: ${userId}, requestedEmployee: ${employeeId}`)

    // Role-based access control - following established patterns
    const isAdmin = userProfile.role_permissions.admin
    const isManager = userProfile.role_permissions.manager

    // Choose appropriate Supabase client based on role
    let supabase
    if (isAdmin || isManager) {
      supabase = createServiceSupabaseClient()
    } else {
      supabase = await createBusinessContextSupabaseClient()
    }

    // Calculate timezone-aware date range using date-fns
    const parsedMonth = parse(month, 'yyyy-MM', new Date())
    const startDate = startOfMonth(parsedMonth)
    const nextMonthDate = addMonths(startDate, 1)

    console.log(`[Expense Reports V1 API] Filtering by submitted_at: ${startDate.toISOString()} to ${nextMonthDate.toISOString()} (exclusive end)`)

    // Build query with role-based access control
    let query = supabase
      .from('expense_claims')
      .select(`
        *,
        employee:users!expense_claims_user_id_fkey(id, full_name, email, business_id, businesses!users_business_id_fkey(home_currency))
      `)
      .eq('business_id', userProfile.business_id)
      .gte('submitted_at', startDate.toISOString()) // Use submitted_at for actual submission month
      .lt('submitted_at', nextMonthDate.toISOString()) // Exclusive end date (start of next month)
      .not('submitted_at', 'is', null) // Only include claims that have been submitted

    // Apply role-based filtering for data access
    if (employeeId) {
      // Manager/Admin filtering by specific employee
      if (!isAdmin && !isManager) {
        return NextResponse.json({
          success: false,
          error: 'Only managers and admins can filter by employee ID'
        }, { status: 403 })
      }
      query = query.eq('user_id', employeeId)
    } else {
      // No specific employee requested - apply default role filtering
      if (isAdmin) {
        // Admin can see all claims in their business (no additional filtering)
      } else if (isManager) {
        // Managers see their team's claims + own claims
        query = query.or(`user_id.eq.${userProfile.user_id},reviewed_by.eq.${userProfile.user_id}`)
      } else {
        // Employees see only their own claims
        query = query.eq('user_id', userProfile.user_id)
      }
    }

    // Execute query
    const { data: expenseClaims, error } = await query.order('created_at', { ascending: true })

    if (error) {
      console.error('[Expense Reports V1 API] Database query error:', error)
      return NextResponse.json({
        success: false,
        error: `Failed to fetch expense claims: ${error.message}`
      }, { status: 500 })
    }

    // If no claims found, return empty report
    if (!expenseClaims || expenseClaims.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          month: month,
          employeeName: employeeId ? null : userProfile.user_id, // Will be resolved from user data
          totalAmount: 0,
          currency: userData.home_currency,
          groupedClaims: {},
          summary: {
            totalClaims: 0,
            totalAmount: 0,
            byStatus: {
              draft: 0,
              submitted: 0,
              approved: 0,
              rejected: 0,
              reimbursed: 0
            }
          }
        }
      })
    }

    // Get custom expense categories from business settings
    const { data: businessData, error: businessError } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', userProfile.business_id)
      .single()

    // Convert categories array to a keyed object for fast lookup
    const categoriesArray = businessData?.custom_expense_categories || []
    const customCategories = categoriesArray.reduce((acc: any, cat: any) => {
      acc[cat.category_code] = {
        business_category_name: cat.category_name,
        accounting_category: cat.accounting_category || mapExpenseCategoryToAccounting(cat.category_code)
      }
      return acc
    }, {})

    // Group claims by expense category - matching user's sample format
    const tempGroupedClaims: { [categoryCode: string]: any[] } = {}
    let totalAmount = 0
    const statusCount = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      reimbursed: 0
    }

    // Process each expense claim
    expenseClaims.forEach((claim: any) => {
      const categoryCode = claim.expense_category || 'UNCATEGORIZED'
      const categoryInfo = customCategories[categoryCode] || {
        business_category_name: 'Uncategorized',
        accounting_category: mapExpenseCategoryToAccounting(categoryCode)
      }

      // Initialize category array if not exists
      if (!tempGroupedClaims[categoryCode]) {
        tempGroupedClaims[categoryCode] = []
      }

      // Calculate amount in home currency with proper conversion
      let claimAmount = 0
      if (claim.home_currency_amount) {
        claimAmount = parseFloat(claim.home_currency_amount)
      } else if (claim.total_amount) {
        // Convert to home currency if needed
        const amount = parseFloat(claim.total_amount)
        if (claim.currency === userData.home_currency) {
          claimAmount = amount
        } else {
          // Simple conversion rates (should use real exchange rates in production)
          const conversionRates: { [key: string]: { [key: string]: number } } = {
            'SGD': { 'MYR': 3.3, 'USD': 0.74 },
            'MYR': { 'SGD': 0.30, 'USD': 0.22 },
            'USD': { 'SGD': 1.35, 'MYR': 4.5 }
          }

          const rate = conversionRates[claim.currency]?.[userData.home_currency] || 1
          claimAmount = amount * rate
        }
      }

      totalAmount += claimAmount

      // Count by status
      if (statusCount.hasOwnProperty(claim.status)) {
        statusCount[claim.status as keyof typeof statusCount]++
      }

      // Structure claim data for report
      const formattedClaim = {
        id: claim.id,
        description: claim.description || claim.business_purpose,
        vendorName: claim.vendor_name,
        amount: claimAmount,
        currency: claim.home_currency || userData.home_currency,
        transactionDate: claim.transaction_date,
        status: claim.status,
        submittedAt: claim.submitted_at,
        approvedAt: claim.approved_at,
        rejectedAt: claim.rejected_at,
        reimbursedAt: claim.paid_at,
        businessPurpose: claim.business_purpose,
        categoryName: categoryInfo.business_category_name,
        accountingCategory: categoryInfo.accounting_category,
        employee: {
          id: claim.employee?.id,
          name: claim.employee?.full_name,
          email: claim.employee?.email
        }
      }

      tempGroupedClaims[categoryCode].push(formattedClaim)
    })

    // Transform temporary groups into final structure with metadata
    const groupedClaims: { [categoryCode: string]: any } = {}
    Object.keys(tempGroupedClaims).forEach(categoryCode => {
      // Sort claims by transaction date within each category
      const sortedClaims = tempGroupedClaims[categoryCode].sort((a, b) =>
        new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
      )

      // Add category metadata
      const categoryInfo = customCategories[categoryCode] || {
        business_category_name: 'Uncategorized',
        accounting_category: mapExpenseCategoryToAccounting(categoryCode)
      }

      const categoryTotal = sortedClaims.reduce((sum, claim) => sum + claim.amount, 0)

      // Create structured category object
      groupedClaims[categoryCode] = {
        categoryCode: categoryCode,
        categoryName: categoryInfo.business_category_name,
        accountingCategory: categoryInfo.accounting_category,
        totalAmount: categoryTotal,
        claimsCount: sortedClaims.length,
        claims: sortedClaims
      }
    })

    // Determine employee name for report
    let employeeName = 'Multiple Employees'
    if (employeeId) {
      // Single employee report - get name from first claim
      employeeName = expenseClaims[0]?.employee?.full_name || 'Unknown Employee'
    } else if (!isAdmin && !isManager) {
      // Personal report
      employeeName = userData.full_name || userData.email
    } else if (expenseClaims.length > 0) {
      // Check if all claims are from same employee
      const uniqueEmployees = [...new Set(expenseClaims.map((c: any) => c.employee?.id))]
      if (uniqueEmployees.length === 1) {
        employeeName = expenseClaims[0]?.employee?.full_name || 'Unknown Employee'
      }
    }

    // Structure final response - matching user's sample format
    const reportData = {
      month: month,
      employeeName: employeeName,
      totalAmount: totalAmount,
      currency: userData.home_currency,
      groupedClaims: groupedClaims,
      summary: {
        totalClaims: expenseClaims.length,
        totalAmount: totalAmount,
        byStatus: statusCount
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: userData.id,
        businessId: userProfile.business_id,
        requestedByRole: isAdmin ? 'admin' : isManager ? 'manager' : 'employee',
        scope: employeeId ? 'single_employee' : isAdmin ? 'company' : isManager ? 'team' : 'personal'
      }
    }

    return NextResponse.json({
      success: true,
      data: reportData
    })

  } catch (error) {
    console.error('[Expense Reports V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}