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
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 */

import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { getAuthenticatedConvex } from '@/lib/convex'
import { format, parse } from 'date-fns'
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
  categoryId: string            // Convex document ID
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
    // ✅ MIGRATED: Get authenticated Convex client (handles Clerk auth)
    const { client: convex, userId } = await getAuthenticatedConvex()
    if (!convex || !userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') // YYYY-MM format
    const employeeId = searchParams.get('employeeId') // Optional, for manager/admin filtering
    const directReportsOnly = searchParams.get('directReportsOnly') === 'true' // When true, scope to direct reports only
    const status = searchParams.get('status') // Optional, filter by status

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

    console.log(`[Formatted Report API] Generating formatted report for month: ${month}, user: ${userId}, requestedEmployee: ${employeeId}, directReportsOnly: ${directReportsOnly}, status: ${status}`)

    // ✅ MIGRATED: Get current user's business context from Convex
    const businessContext = await convex.query(
      api.functions.businesses.getBusinessContext,
      {}
    )

    if (!businessContext) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // ✅ MIGRATED: Fetch formatted report data from Convex
    const reportData = await convex.query(
      api.functions.expenseClaims.getFormattedReportData,
      {
        businessId: businessContext.businessId,
        month,
        employeeId: employeeId || undefined,
        directReportsOnly: directReportsOnly || undefined,
        status: status || undefined,
      }
    )

    if (!reportData) {
      return NextResponse.json({ success: false, error: 'Failed to fetch report data' }, { status: 500 })
    }

    // Check for permission errors
    if ('error' in reportData) {
      return NextResponse.json({ success: false, error: reportData.error }, { status: 403 })
    }

    const { sections, header: convexHeader, role } = reportData
    const parsedMonth = parse(month, 'yyyy-MM', new Date())
    const isAdmin = role === 'owner' || role === 'finance_admin'
    const isManager = role === 'manager'

    // If no claims found, return empty report
    if (convexHeader.totalClaims === 0) {
      const reportHeader: EnhancedReportHeader = {
        businessName: convexHeader.businessName || 'Business Name',
        reportTitle: `EXPENSE REPORT - ${format(parsedMonth, 'MMM yyyy').toUpperCase()}`,
        employeeName: employeeId ? 'No Employee Found' : 'Personal Report',
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
            currency: convexHeader.homeCurrency,
            statusBreakdown: {
              approved: 0,
              submitted: 0,
              rejected: 0,
              reimbursed: 0
            }
          },
          metadata: {
            reportScope: employeeId ? 'employee' : directReportsOnly ? 'direct_reports' : isAdmin ? 'company' : isManager ? 'team' : 'personal',
            generatedAt: new Date().toISOString(),
            dataAsOf: format(new Date(), 'dd/MM/yyyy')
          }
        }
      })
    }

    // Transform Convex sections to API response format
    const categorySections: CategorySection[] = []
    let totalAmount = 0
    const statusCount = {
      submitted: 0,
      approved: 0,
      rejected: 0,
      reimbursed: 0
    }
    const employeeNames: Set<string> = new Set()

    for (const section of sections) {
      const lineItems: CategoryLineItem[] = []

      for (const claim of section.claims) {
        // Track employee names
        if (claim.employee?.fullName) {
          employeeNames.add(claim.employee.fullName)
        }

        // Calculate amount (use || to handle homeCurrencyAmount: 0 case)
        const claimAmount = claim.homeCurrencyAmount || claim.totalAmount || 0
        totalAmount += claimAmount

        // Count by status
        if (claim.status in statusCount) {
          statusCount[claim.status as keyof typeof statusCount]++
        }

        // Format date for line item
        const transactionDate = claim.transactionDate
          ? format(new Date(claim.transactionDate), 'dd.MM.yy')
          : ''

        lineItems.push({
          date: transactionDate,
          description: claim.description || claim.businessPurpose || 'Expense',
          amount: claimAmount,
          referenceNumber: claim.referenceNumber,
          claimId: claim._id,
          vendor: claim.vendorName || ''
        })
      }

      // Sort line items by date
      lineItems.sort((a, b) => {
        const dateA = a.date ? new Date(a.date.split('.').reverse().join('-')).getTime() : 0
        const dateB = b.date ? new Date(b.date.split('.').reverse().join('-')).getTime() : 0
        return dateA - dateB
      })

      categorySections.push({
        categoryName: section.categoryName,
        categoryId: section.categoryId,
        accountingCategory: section.accountingCategory || mapExpenseCategoryToAccounting(section.categoryId),
        lineItems,
        subtotal: section.totalAmount,
        currency: convexHeader.homeCurrency
      })
    }

    // Sort categories by subtotal (descending)
    categorySections.sort((a, b) => b.subtotal - a.subtotal)

    // Determine employee information for header
    let employeeName = 'Multiple Employees'
    let employeeDesignation = 'Various'

    if (employeeId) {
      // Single employee report
      employeeName = employeeNames.size > 0 ? Array.from(employeeNames)[0] : 'Unknown Employee'
      employeeDesignation = 'Employee'
    } else if (!isAdmin && !isManager) {
      // Personal report
      employeeName = employeeNames.size > 0 ? Array.from(employeeNames)[0] : 'Personal Report'
      employeeDesignation = 'Employee'
    } else if (employeeNames.size === 1) {
      // All claims from same employee
      employeeName = Array.from(employeeNames)[0]
      employeeDesignation = 'Employee'
    }

    // Create report header
    const reportHeader: EnhancedReportHeader = {
      businessName: convexHeader.businessName || 'Business Name',
      reportTitle: `EXPENSE REPORT - ${format(parsedMonth, 'MMM yyyy').toUpperCase()}`,
      employeeName: employeeName,
      employeeDesignation: employeeDesignation,
      reportMonth: format(parsedMonth, 'MMM yyyy').toUpperCase(),
      approvedBy: undefined,
      generatedDate: format(new Date(), 'dd/MM/yyyy, HH:mm:ss a')
    }

    // Structure final response
    const formattedReport: FormattedExpenseReport = {
      header: reportHeader,
      categorySections: categorySections,
      summary: {
        totalAmount: totalAmount,
        totalClaims: convexHeader.totalClaims,
        currency: convexHeader.homeCurrency,
        statusBreakdown: statusCount
      },
      metadata: {
        reportScope: employeeId ? 'employee' : directReportsOnly ? 'direct_reports' : isAdmin ? 'company' : isManager ? 'team' : 'personal',
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
