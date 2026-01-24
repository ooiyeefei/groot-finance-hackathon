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
 * ✅ MIGRATED TO CONVEX (2025-01)
 */

import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { getAuthenticatedConvex } from '@/lib/convex'
import { mapExpenseCategoryToAccounting } from '@/domains/expense-claims/lib/expense-category-mapper'

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

    console.log(`[Expense Reports V1 API] Generating report for month: ${month}, user: ${userId}, requestedEmployee: ${employeeId}, directReportsOnly: ${directReportsOnly}`)

    // ✅ MIGRATED: Get current user's business context from Convex
    const businessContext = await convex.query(
      api.functions.businesses.getBusinessContext,
      {}
    )

    if (!businessContext) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // ✅ MIGRATED: Fetch report data from Convex
    const reportData = await convex.query(
      api.functions.expenseClaims.getReportData,
      {
        businessId: businessContext.businessId,
        month,
        employeeId: employeeId || undefined,
        directReportsOnly: directReportsOnly || undefined,
      }
    )

    if (!reportData) {
      return NextResponse.json({ success: false, error: 'Failed to fetch report data' }, { status: 500 })
    }

    // Check for permission errors
    if ('error' in reportData) {
      return NextResponse.json({ success: false, error: reportData.error }, { status: 403 })
    }

    const { categoryGroups, categoryLookup, homeCurrency, totalClaims, role } = reportData

    // If no claims found, return empty report
    if (totalClaims === 0) {
      return NextResponse.json({
        success: true,
        data: {
          month,
          employeeName: employeeId ? null : userId,
          totalAmount: 0,
          currency: homeCurrency,
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

    // Transform Convex data to API response format
    const groupedClaims: Record<string, unknown> = {}
    let grandTotal = 0
    const statusCount: Record<string, number> = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      reimbursed: 0
    }

    // Collect all employee names for determining report name
    const employeeNames: Set<string> = new Set()

    for (const [categoryCode, group] of Object.entries(categoryGroups)) {
      const categoryName = categoryLookup[categoryCode] || 'Uncategorized'
      const accountingCategory = mapExpenseCategoryToAccounting(categoryCode)

      // Format claims for response
      const formattedClaims = group.claims.map((claim: any) => {
        // Track employee names
        if (claim.employee?.fullName) {
          employeeNames.add(claim.employee.fullName)
        }

        return {
          id: claim._id,
          description: claim.description || claim.businessPurpose,
          vendorName: claim.vendorName,
          amount: claim.homeCurrencyAmount ?? claim.totalAmount ?? 0,
          currency: claim.homeCurrency || homeCurrency,
          transactionDate: claim.transactionDate,
          status: claim.status,
          submittedAt: claim.submittedAt,
          approvedAt: claim.approvedAt,
          rejectedAt: claim.rejectedAt,
          reimbursedAt: claim.paidAt,
          businessPurpose: claim.businessPurpose,
          categoryName,
          accountingCategory,
          employee: {
            id: claim.employee?._id,
            name: claim.employee?.fullName,
            email: claim.employee?.email
          }
        }
      })

      // Sort claims by transaction date
      formattedClaims.sort((a: any, b: any) => {
        const dateA = a.transactionDate ? new Date(a.transactionDate).getTime() : 0
        const dateB = b.transactionDate ? new Date(b.transactionDate).getTime() : 0
        return dateA - dateB
      })

      grandTotal += group.totalAmount

      // Aggregate status counts
      for (const [status, count] of Object.entries(group.statusCounts)) {
        if (status in statusCount) {
          statusCount[status] += count as number
        }
      }

      groupedClaims[categoryCode] = {
        categoryCode,
        categoryName,
        accountingCategory,
        totalAmount: group.totalAmount,
        claimsCount: group.claims.length,
        claims: formattedClaims
      }
    }

    // Determine employee name for report header
    const isAdmin = role === 'owner' || role === 'finance_admin'
    const isManager = role === 'manager'
    let employeeName = 'Multiple Employees'

    if (employeeId) {
      employeeName = employeeNames.size > 0 ? Array.from(employeeNames)[0] : 'Unknown Employee'
    } else if (!isAdmin && !isManager) {
      employeeName = employeeNames.size > 0 ? Array.from(employeeNames)[0] : 'Personal Report'
    } else if (employeeNames.size === 1) {
      employeeName = Array.from(employeeNames)[0]
    }

    // Structure final response - matching original format
    const response = {
      month,
      employeeName,
      totalAmount: grandTotal,
      currency: homeCurrency,
      groupedClaims,
      summary: {
        totalClaims,
        totalAmount: grandTotal,
        byStatus: statusCount
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: userId,
        businessId: businessContext.businessId,
        requestedByRole: isAdmin ? 'admin' : isManager ? 'manager' : 'employee',
        scope: employeeId ? 'single_employee' : isAdmin ? 'company' : isManager ? 'team' : 'personal'
      }
    }

    return NextResponse.json({
      success: true,
      data: response
    })

  } catch (error) {
    console.error('[Expense Reports V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
