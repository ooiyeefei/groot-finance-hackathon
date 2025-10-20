/**
 * Enhanced Expense Claims Formatted Report API
 *
 * GET /api/v1/expense-claims/reports/formatted?month=YYYY-MM&employeeId=uuid
 *
 * Purpose:
 * - Generate structured expense reports matching claim form layout
 * - Professional formatting with category sections and line items
 * - Designed for PDF generation and preview display
 * - Enhanced business context with employee details and business info
 * - Same RBAC and filtering logic as main reports API
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { createBusinessContextSupabaseClient, createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { startOfMonth, addMonths, parse, format } from 'date-fns'
import { mapExpenseCategoryToAccounting } from '@/domains/expense-claims/lib/expense-category-mapper'

// Enhanced report interfaces
interface CategoryLineItem {
  date: string                // Formatted date range
  description: string         // Expense description
  amount: number             // Amount in home currency
  referenceNumber?: string   // Receipt/invoice number
  claimId: string           // For internal tracking
  vendor: string            // Vendor name
}

interface CategorySection {
  categoryName: string          // "TRAVELLING & ACCOMMODATION"
  categoryCode: string          // "TRAVEL"
  accountingCategory: string    // "travel_transport"
  lineItems: CategoryLineItem[]
  subtotal: number             // Category total
  currency: string             // Home currency
}

interface EnhancedReportHeader {
  businessName: string
  reportTitle: string
  employeeName: string
  employeeDesignation: string
  reportMonth: string
  approvedBy?: string
  generatedDate: string
}

interface FormattedExpenseReport {
  header: EnhancedReportHeader
  categorySections: CategorySection[]
  summary: {
    totalAmount: number
    totalClaims: number
    currency: string
    statusBreakdown: {
      approved: number
      submitted: number
      rejected: number
      reimbursed: number
    }
  }
  metadata: {
    reportScope: string
    generatedAt: string
    dataAsOf: string
  }
}

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

    console.log(`[Formatted Report API] Generating formatted report for month: ${month}, user: ${userId}, requestedEmployee: ${employeeId}`)

    // Role-based access control
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

    console.log(`[Formatted Report API] Filtering by transaction_date: ${startDate.toISOString()} to ${nextMonthDate.toISOString()}`)

    // Get business information for header
    const { data: businessData, error: businessError } = await supabase
      .from('businesses')
      .select('name, custom_expense_categories')
      .eq('id', userProfile.business_id)
      .single()

    if (businessError) {
      console.error('[Formatted Report API] Failed to fetch business data:', businessError)
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch business information'
      }, { status: 500 })
    }

    // Convert categories array to a keyed object for fast lookup
    const categoriesArray = businessData?.custom_expense_categories || []
    const customCategories = categoriesArray.reduce((acc: any, cat: any) => {
      acc[cat.category_code] = {
        business_category_name: cat.category_name,
        accounting_category: cat.accounting_category || mapExpenseCategoryToAccounting(cat.category_code)
      }
      return acc
    }, {})

    // Build query with role-based access control
    let query = supabase
      .from('expense_claims')
      .select(`
        *,
        employee:users!expense_claims_user_id_fkey(id, full_name, email, business_id, businesses!users_business_id_fkey(home_currency)),
        approver:users!expense_claims_current_approver_id_fkey(id, full_name, email)
      `)
      .eq('business_id', userProfile.business_id)
      .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
      .lt('transaction_date', format(nextMonthDate, 'yyyy-MM-dd'))
      .not('transaction_date', 'is', null)
      .in('status', ['submitted', 'approved', 'rejected', 'reimbursed']) // Only include processed claims

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
        query = query.or(`user_id.eq.${userProfile.user_id},current_approver_id.eq.${userProfile.user_id}`)
      } else {
        // Employees see only their own claims
        query = query.eq('user_id', userProfile.user_id)
      }
    }

    // Execute query
    const { data: expenseClaims, error } = await query.order('transaction_date', { ascending: true })

    if (error) {
      console.error('[Formatted Report API] Database query error:', error)
      return NextResponse.json({
        success: false,
        error: `Failed to fetch expense claims: ${error.message}`
      }, { status: 500 })
    }

    // If no claims found, return empty report
    if (!expenseClaims || expenseClaims.length === 0) {
      const reportHeader: EnhancedReportHeader = {
        businessName: businessData.name || 'Business Name',
        reportTitle: `EXPENSE REPORT - ${format(parsedMonth, 'MMM yyyy').toUpperCase()}`,
        employeeName: employeeId ? 'No Employee Found' : (userData.full_name || userData.email),
        employeeDesignation: 'Employee',
        reportMonth: format(parsedMonth, 'MMM yyyy').toUpperCase(),
        generatedDate: format(new Date(), 'dd/MM/yyyy, HH:mm:ss a')
      }

      return NextResponse.json({
        success: true,
        data: {
          header: reportHeader,
          categorySections: [],
          summary: {
            totalAmount: 0,
            totalClaims: 0,
            currency: userData.home_currency,
            statusBreakdown: {
              approved: 0,
              submitted: 0,
              rejected: 0,
              reimbursed: 0
            }
          },
          metadata: {
            reportScope: employeeId ? 'employee' : isAdmin ? 'company' : isManager ? 'team' : 'personal',
            generatedAt: new Date().toISOString(),
            dataAsOf: format(new Date(), 'dd/MM/yyyy')
          }
        }
      })
    }

    // Helper function to calculate home currency amount
    const calculateHomeAmount = (claim: any): number => {
      if (claim.home_currency_amount) {
        return parseFloat(claim.home_currency_amount)
      } else if (claim.total_amount) {
        const amount = parseFloat(claim.total_amount)
        if (claim.currency === userData.home_currency) {
          return amount
        } else {
          // Simple conversion rates (should use real exchange rates in production)
          const conversionRates: { [key: string]: { [key: string]: number } } = {
            'SGD': { 'MYR': 3.3, 'USD': 0.74 },
            'MYR': { 'SGD': 0.30, 'USD': 0.22 },
            'USD': { 'SGD': 1.35, 'MYR': 4.5 }
          }
          const rate = conversionRates[claim.currency]?.[userData.home_currency] || 1
          return amount * rate
        }
      }
      return 0
    }

    // Group claims by category and format as line items
    const categoryGroups: { [categoryCode: string]: CategoryLineItem[] } = {}
    let totalAmount = 0
    const statusCount = {
      submitted: 0,
      approved: 0,
      rejected: 0,
      reimbursed: 0
    }

    // Process each expense claim
    expenseClaims.forEach((claim: any) => {
      const categoryCode = claim.expense_category || 'UNCATEGORIZED'

      // Initialize category array if not exists
      if (!categoryGroups[categoryCode]) {
        categoryGroups[categoryCode] = []
      }

      const claimAmount = calculateHomeAmount(claim)
      totalAmount += claimAmount

      // Count by status
      if (statusCount.hasOwnProperty(claim.status)) {
        statusCount[claim.status as keyof typeof statusCount]++
      }

      // Format date for line item (handle date ranges if needed)
      const transactionDate = claim.transaction_date ? format(new Date(claim.transaction_date), 'dd.MM.yy') : ''

      // Create line item
      const lineItem: CategoryLineItem = {
        date: transactionDate,
        description: claim.description || claim.business_purpose || 'Expense',
        amount: claimAmount,
        referenceNumber: claim.reference_number,
        claimId: claim.id,
        vendor: claim.vendor_name || ''
      }

      categoryGroups[categoryCode].push(lineItem)
    })

    // Transform category groups into category sections
    const categorySections: CategorySection[] = Object.keys(categoryGroups).map(categoryCode => {
      const categoryInfo = customCategories[categoryCode] || {
        business_category_name: 'Uncategorized',
        accounting_category: mapExpenseCategoryToAccounting(categoryCode)
      }

      const lineItems = categoryGroups[categoryCode].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0)

      return {
        categoryName: categoryInfo.business_category_name,
        categoryCode: categoryCode,
        accountingCategory: categoryInfo.accounting_category,
        lineItems: lineItems,
        subtotal: subtotal,
        currency: userData.home_currency
      }
    })

    // Sort categories by subtotal (descending)
    categorySections.sort((a, b) => b.subtotal - a.subtotal)

    // Determine employee information for header
    let employeeName = 'Multiple Employees'
    let employeeDesignation = 'Various'
    let approvedBy = undefined

    if (employeeId) {
      // Single employee report
      const firstClaim = expenseClaims[0]
      employeeName = firstClaim?.employee?.full_name || 'Unknown Employee'
      employeeDesignation = 'Employee' // Could be enhanced with actual job title from user profile
      approvedBy = firstClaim?.approver?.full_name
    } else if (!isAdmin && !isManager) {
      // Personal report
      employeeName = userData.full_name || userData.email
      employeeDesignation = 'Employee'
    } else if (expenseClaims.length > 0) {
      // Check if all claims are from same employee
      const uniqueEmployees = [...new Set(expenseClaims.map((c: any) => c.employee?.id))]
      if (uniqueEmployees.length === 1) {
        employeeName = expenseClaims[0]?.employee?.full_name || 'Unknown Employee'
        employeeDesignation = 'Employee'
        approvedBy = expenseClaims[0]?.approver?.full_name
      }
    }

    // Create report header
    const reportHeader: EnhancedReportHeader = {
      businessName: businessData.name || 'Business Name',
      reportTitle: `EXPENSE REPORT - ${format(parsedMonth, 'MMM yyyy').toUpperCase()}`,
      employeeName: employeeName,
      employeeDesignation: employeeDesignation,
      reportMonth: format(parsedMonth, 'MMM yyyy').toUpperCase(),
      approvedBy: approvedBy,
      generatedDate: format(new Date(), 'dd/MM/yyyy, HH:mm:ss a')
    }

    // Structure final response
    const formattedReport: FormattedExpenseReport = {
      header: reportHeader,
      categorySections: categorySections,
      summary: {
        totalAmount: totalAmount,
        totalClaims: expenseClaims.length,
        currency: userData.home_currency,
        statusBreakdown: statusCount
      },
      metadata: {
        reportScope: employeeId ? 'employee' : isAdmin ? 'company' : isManager ? 'team' : 'personal',
        generatedAt: new Date().toISOString(),
        dataAsOf: format(new Date(), 'dd/MM/yyyy')
      }
    }

    return NextResponse.json({
      success: true,
      data: formattedReport
    })

  } catch (error) {
    console.error('[Formatted Report API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}