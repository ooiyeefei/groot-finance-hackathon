/**
 * Expense Claims CSV Export API - Production Streaming Version
 *
 * GET /api/v1/expense-claims/reports/export?month=YYYY-MM&employeeId=uuid
 *
 * Purpose:
 * - Enterprise-grade streaming CSV generation for unlimited scalability
 * - Memory-efficient processing using ReadableStream and batch queries
 * - Fixed date logic using exclusive end date for accurate month boundaries
 * - Same RBAC and filtering logic as main reports API
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

    console.log(`[CSV Stream Export] Starting stream for month: ${month}, user: ${userId}, requestedEmployee: ${employeeId}, directReportsOnly: ${directReportsOnly}`)

    // ✅ MIGRATED: Get current user's business context from Convex
    const businessContext = await convex.query(
      api.functions.businesses.getBusinessContext,
      {}
    )

    if (!businessContext) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // Helper function to escape CSV values
    const escapeCSV = (value: unknown): string => {
      if (value === null || value === undefined) return ''
      const str = String(value)
      // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Create streaming CSV response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 1. Send CSV headers
          const csvHeaders = [
            'Category',
            'Category Code',
            'Claim ID',
            'Description',
            'Vendor',
            'Amount',
            'Currency',
            'Transaction Date',
            'Status',
            'Submitted At',
            'Approved At',
            'Reimbursed At',
            'Employee Name',
            'Employee Email',
            'Business Purpose',
            'Reference Number',
            'Accounting Category'
          ]

          const headerRow = csvHeaders.join(',') + '\n'
          controller.enqueue(new TextEncoder().encode(headerRow))

          // 2. Query Convex in batches for memory efficiency
          const BATCH_SIZE = 500
          let offset = 0
          let hasMore = true
          let totalProcessed = 0
          let homeCurrency = 'SGD'
          let categoryLookup: Record<string, { name: string; accountingCategory?: string }> = {}

          while (hasMore) {
            // ✅ MIGRATED: Fetch batch from Convex
            const batchData = await convex.query(
              api.functions.expenseClaims.getExportClaims,
              {
                businessId: businessContext.businessId,
                month,
                employeeId: employeeId || undefined,
                offset,
                limit: BATCH_SIZE,
                directReportsOnly: directReportsOnly || undefined,
              }
            )

            if (!batchData) {
              controller.error(new Error('Failed to fetch export data'))
              return
            }

            // Check for permission errors
            if ('error' in batchData) {
              controller.error(new Error(batchData.error))
              return
            }

            // Store metadata from first batch
            if (offset === 0) {
              homeCurrency = batchData.homeCurrency
              categoryLookup = batchData.categoryLookup
            }

            const { claims } = batchData

            if (claims && claims.length > 0) {
              // 3. Convert batch to CSV rows and stream them
              const csvRows = claims.map((claim: {
                _id: string
                expenseCategory?: string
                description?: string
                businessPurpose?: string
                vendorName?: string
                homeCurrencyAmount?: number
                totalAmount?: number
                homeCurrency?: string
                transactionDate?: string
                status?: string
                submittedAt?: number
                approvedAt?: number
                paidAt?: number
                referenceNumber?: string
                employee?: {
                  fullName?: string
                  email?: string
                } | null
              }) => {
                const categoryCode = claim.expenseCategory || 'UNCATEGORIZED'
                const categoryInfo = categoryLookup[categoryCode] || {
                  name: 'Uncategorized',
                  accountingCategory: mapExpenseCategoryToAccounting(categoryCode)
                }

                const claimAmount = claim.homeCurrencyAmount ?? claim.totalAmount ?? 0

                const row = [
                  escapeCSV(categoryInfo.name),
                  escapeCSV(categoryCode),
                  escapeCSV(claim._id),
                  escapeCSV(claim.description || claim.businessPurpose),
                  escapeCSV(claim.vendorName),
                  claimAmount.toFixed(2),
                  escapeCSV(claim.homeCurrency || homeCurrency),
                  escapeCSV(claim.transactionDate),
                  escapeCSV(claim.status),
                  escapeCSV(claim.submittedAt ? new Date(claim.submittedAt).toISOString() : ''),
                  escapeCSV(claim.approvedAt ? new Date(claim.approvedAt).toISOString() : ''),
                  escapeCSV(claim.paidAt ? new Date(claim.paidAt).toISOString() : ''),
                  escapeCSV(claim.employee?.fullName),
                  escapeCSV(claim.employee?.email),
                  escapeCSV(claim.businessPurpose),
                  escapeCSV(claim.referenceNumber),
                  escapeCSV(categoryInfo.accountingCategory || mapExpenseCategoryToAccounting(categoryCode))
                ]

                return row.join(',') + '\n'
              }).join('')

              controller.enqueue(new TextEncoder().encode(csvRows))

              totalProcessed += claims.length
              offset += claims.length

              console.log(`[CSV Stream Export] Processed batch: ${claims.length} claims (total: ${totalProcessed})`)
            }

            // Check if we have more data to fetch
            hasMore = batchData.hasMore
          }

          console.log(`[CSV Stream Export] Completed. Total claims processed: ${totalProcessed}`)

          // 4. Close the stream
          controller.close()

        } catch (streamError) {
          console.error('[CSV Stream Export] Stream error:', streamError)
          controller.error(streamError)
        }
      },
    })

    // ✅ MIGRATED: Get role for filename determination
    const initialData = await convex.query(
      api.functions.expenseClaims.getExportClaims,
      {
        businessId: businessContext.businessId,
        month,
        employeeId: employeeId || undefined,
        offset: 0,
        limit: 1,
        directReportsOnly: directReportsOnly || undefined,
      }
    )

    const role = initialData && !('error' in initialData) ? initialData.role : 'employee'
    const isAdmin = role === 'owner' || role === 'finance_admin'
    const isManager = role === 'manager'

    // 5. Determine filename based on scope
    let filename = `expense_report_${month}`
    if (employeeId) {
      filename = `expense_report_${month}_employee`
    } else if (isAdmin) {
      filename = `expense_report_${month}_company`
    } else if (isManager) {
      filename = `expense_report_${month}_team`
    } else {
      filename = `expense_report_${month}_personal`
    }
    filename += '.csv'

    console.log(`[CSV Stream Export] Streaming CSV with filename: ${filename}`)

    // 6. Return streaming response with proper headers
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff'
      },
    })

  } catch (error) {
    console.error('[CSV Stream Export] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
