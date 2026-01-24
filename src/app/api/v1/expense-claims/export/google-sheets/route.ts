/**
 * Google Sheets Export API
 *
 * POST /api/v1/expense-claims/export/google-sheets
 *
 * Supports:
 * - Date range filtering (start_date, end_date)
 * - Status filtering (pending, approved, rejected, reimbursed)
 * - CSV download or Google Sheets formatted data
 *
 * Used by: src/domains/expense-claims/components/google-sheets-export.tsx
 */

import { NextRequest, NextResponse } from 'next/server'
import { api } from '@/convex/_generated/api'
import { getAuthenticatedConvex } from '@/lib/convex'
import { mapExpenseCategoryToAccounting } from '@/domains/expense-claims/lib/expense-category-mapper'

interface ExportConfig {
  format: 'csv' | 'google_sheets'
  date_range: {
    start_date: string
    end_date: string
  }
  status_filter: string[]
  department_filter: string[]
  include_line_items: boolean
}

interface ExpenseClaim {
  _id: string
  _creationTime?: number
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
  submitter?: {
    _id: string
    fullName?: string
    email?: string
  } | null
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated Convex client
    const { client: convex, userId } = await getAuthenticatedConvex()
    if (!convex || !userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const config: ExportConfig = await request.json()
    const { format, date_range, status_filter } = config
    // Note: include_line_items is accepted but not used yet (future enhancement)

    // Validate required fields
    if (!date_range?.start_date || !date_range?.end_date) {
      return NextResponse.json({
        success: false,
        error: 'Date range is required'
      }, { status: 400 })
    }

    console.log(`[Google Sheets Export] Starting export for user: ${userId}, format: ${format}, date_range: ${date_range.start_date} to ${date_range.end_date}`)

    // Get current user's business context from Convex
    const businessContext = await convex.query(
      api.functions.businesses.getBusinessContext,
      {}
    )

    if (!businessContext) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // Query expense claims without date filter (filter in API for more flexibility)
    const claimsData = await convex.query(
      api.functions.expenseClaims.list,
      {
        businessId: businessContext.businessId,
        limit: 10000, // Large limit for export
      }
    )

    if (!claimsData || !claimsData.claims) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch expense claims'
      }, { status: 500 })
    }

    // Filter by date range using multiple date fields (transactionDate, submittedAt, or creation time)
    let filteredClaims = (claimsData.claims as ExpenseClaim[]).filter((claim) => {
      // Get the most relevant date for this claim
      const claimDate = claim.transactionDate ||
        (claim.submittedAt ? new Date(claim.submittedAt).toISOString().split('T')[0] : null)

      if (!claimDate) return false // Skip claims without any date

      const startDate = date_range.start_date
      const endDate = date_range.end_date

      return claimDate >= startDate && claimDate <= endDate
    })

    // Filter by status if specified
    if (status_filter && status_filter.length > 0) {
      filteredClaims = filteredClaims.filter((claim: ExpenseClaim) =>
        status_filter.includes(claim.status || '')
      )
    }

    // Get business for category lookup
    const business = await convex.query(
      api.functions.businesses.getById,
      { id: businessContext.businessId }
    )

    const customCategories = (business?.customExpenseCategories as Array<{
      id: string
      category_name: string
      accounting_category?: string
    }>) || []

    const categoryLookup: Record<string, { name: string; accountingCategory?: string }> = {}
    for (const cat of customCategories) {
      categoryLookup[cat.id] = {
        name: cat.category_name,
        accountingCategory: cat.accounting_category,
      }
    }

    const homeCurrency = business?.homeCurrency || 'SGD'

    // Helper function to escape CSV values
    const escapeCSV = (value: unknown): string => {
      if (value === null || value === undefined) return ''
      const str = String(value)
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Define CSV headers
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

    // Build rows from claims
    const rows = filteredClaims.map((claim: ExpenseClaim) => {
      const categoryCode = claim.expenseCategory || 'UNCATEGORIZED'
      const categoryInfo = categoryLookup[categoryCode] || {
        name: 'Uncategorized',
        accountingCategory: mapExpenseCategoryToAccounting(categoryCode)
      }

      const claimAmount = claim.homeCurrencyAmount ?? claim.totalAmount ?? 0

      return [
        categoryInfo.name,
        categoryCode,
        claim._id,
        claim.description || claim.businessPurpose || '',
        claim.vendorName || '',
        claimAmount.toFixed(2),
        claim.homeCurrency || homeCurrency,
        claim.transactionDate || '',
        claim.status || '',
        claim.submittedAt ? new Date(claim.submittedAt).toISOString() : '',
        claim.approvedAt ? new Date(claim.approvedAt).toISOString() : '',
        claim.paidAt ? new Date(claim.paidAt).toISOString() : '',
        claim.submitter?.fullName || '',
        claim.submitter?.email || '',
        claim.businessPurpose || '',
        claim.referenceNumber || '',
        categoryInfo.accountingCategory || mapExpenseCategoryToAccounting(categoryCode)
      ]
    })

    if (format === 'csv') {
      // Generate CSV string
      const headerRow = csvHeaders.join(',')
      const dataRows = rows.map((row: (string | number)[]) => row.map((cell: string | number) => escapeCSV(cell)).join(','))
      const csvContent = [headerRow, ...dataRows].join('\n')

      // Generate filename
      const filename = `expense-report-${date_range.start_date}-to-${date_range.end_date}.csv`

      // Return CSV as downloadable file
      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    } else {
      // Return Google Sheets formatted data
      // Calculate summary
      const totalAmount = rows.reduce((sum: number, row: (string | number)[]) => sum + parseFloat(String(row[5]) || '0'), 0)
      const pendingCount = filteredClaims.filter((c: ExpenseClaim) => c.status === 'pending' || c.status === 'submitted').length
      const approvedCount = filteredClaims.filter((c: ExpenseClaim) => c.status === 'approved').length
      const rejectedCount = filteredClaims.filter((c: ExpenseClaim) => c.status === 'rejected').length
      const reimbursedCount = filteredClaims.filter((c: ExpenseClaim) => c.status === 'reimbursed').length

      return NextResponse.json({
        success: true,
        data: {
          export_format: 'google_sheets',
          row_count: rows.length,
          sheets_data: {
            headers: csvHeaders,
            rows: rows,
            summary: {
              total_expenses: rows.length,
              total_amount_sgd: totalAmount,
              pending_count: pendingCount,
              approved_count: approvedCount,
              rejected_count: rejectedCount,
              reimbursed_count: reimbursedCount,
            }
          },
          metadata: {
            generated_at: new Date().toISOString(),
            date_range: date_range,
            status_filter: status_filter,
            home_currency: homeCurrency,
          }
        }
      })
    }

  } catch (error) {
    console.error('[Google Sheets Export] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
