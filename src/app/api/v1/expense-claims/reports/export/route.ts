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
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { ensureUserProfile } from '@/lib/auth/ensure-employee-profile'
import { createBusinessContextSupabaseClient, createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { startOfMonth, addMonths, parse } from 'date-fns'
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

    console.log(`[CSV Stream Export] Starting stream for month: ${month}, user: ${userId}, requestedEmployee: ${employeeId}`)

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

    // Calculate timezone-aware date range using date-fns (FIXED: proper exclusive end date)
    const parsedMonth = parse(month, 'yyyy-MM', new Date())
    const startDate = startOfMonth(parsedMonth)
    const nextMonthDate = addMonths(startDate, 1)

    console.log(`[CSV Stream Export] Date range: ${startDate.toISOString()} to ${nextMonthDate.toISOString()} (exclusive end)`)

    // Get custom expense categories from business settings (fetch once for stream)
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

    // Currency conversion rates (same as main API)
    const conversionRates: { [key: string]: { [key: string]: number } } = {
      'SGD': { 'MYR': 3.3, 'USD': 0.74 },
      'MYR': { 'SGD': 0.30, 'USD': 0.22 },
      'USD': { 'SGD': 1.35, 'MYR': 4.5 }
    }

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return ''
      const str = String(value)
      // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
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
          const rate = conversionRates[claim.currency]?.[userData.home_currency] || 1
          return amount * rate
        }
      }
      return 0
    }

    // Helper function to convert claim to CSV row
    const claimToCSVRow = (claim: any): string => {
      const categoryCode = claim.expense_category || 'UNCATEGORIZED'
      const categoryInfo = customCategories[categoryCode] || {
        business_category_name: 'Uncategorized',
        accounting_category: mapExpenseCategoryToAccounting(categoryCode)
      }

      const claimAmount = calculateHomeAmount(claim)

      const row = [
        escapeCSV(categoryInfo.business_category_name),
        escapeCSV(categoryCode),
        escapeCSV(claim.id),
        escapeCSV(claim.description || claim.business_purpose),
        escapeCSV(claim.vendor_name),
        claimAmount.toFixed(2),
        escapeCSV(claim.home_currency || userData.home_currency),
        escapeCSV(claim.transaction_date),
        escapeCSV(claim.status),
        escapeCSV(claim.submitted_at),
        escapeCSV(claim.approved_at),
        escapeCSV(claim.paid_at),
        escapeCSV(claim.employee?.full_name),
        escapeCSV(claim.employee?.email),
        escapeCSV(claim.business_purpose),
        escapeCSV(claim.reference_number),
        escapeCSV(categoryInfo.accounting_category)
      ]

      return row.join(',') + '\n'
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

          // 2. Query database in batches for memory efficiency
          const BATCH_SIZE = 500
          let offset = 0
          let hasMore = true
          let totalProcessed = 0

          while (hasMore) {
            // Build base query with same logic as main reports API
            let batchQuery = supabase
              .from('expense_claims')
              .select(`
                *,
                employee:users!expense_claims_user_id_fkey(id, full_name, email, home_currency)
              `)
              .eq('business_id', userProfile.business_id)
              .gte('submitted_at', startDate.toISOString())
              .lt('submitted_at', nextMonthDate.toISOString()) // FIXED: exclusive end date
              .not('submitted_at', 'is', null)

            // Apply role-based filtering (same as main API)
            if (employeeId) {
              if (!isAdmin && !isManager) {
                controller.error(new Error('Only managers and admins can filter by employee ID'))
                return
              }
              batchQuery = batchQuery.eq('user_id', employeeId)
            } else {
              if (isAdmin) {
                // Admin can see all claims (no additional filtering)
              } else if (isManager) {
                // Managers see their team's claims + own claims
                batchQuery = batchQuery.or(`user_id.eq.${userProfile.user_id},reviewed_by.eq.${userProfile.user_id}`)
              } else {
                // Employees see only their own claims
                batchQuery = batchQuery.eq('user_id', userProfile.user_id)
              }
            }

            // Add pagination and ordering
            batchQuery = batchQuery
              .order('created_at', { ascending: true })
              .range(offset, offset + BATCH_SIZE - 1)

            const { data: claims, error } = await batchQuery

            if (error) {
              console.error('[CSV Stream Export] Database error:', error)
              controller.error(error)
              return
            }

            if (claims && claims.length > 0) {
              // 3. Convert batch to CSV rows and stream them
              const csvRows = claims.map(claimToCSVRow).join('')
              controller.enqueue(new TextEncoder().encode(csvRows))

              totalProcessed += claims.length
              offset += claims.length

              console.log(`[CSV Stream Export] Processed batch: ${claims.length} claims (total: ${totalProcessed})`)
            }

            // Check if we have more data to fetch
            if (!claims || claims.length < BATCH_SIZE) {
              hasMore = false
            }
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

    // 5. Determine filename based on scope
    let filename = `expense_report_${month}`
    if (employeeId) {
      // Will be set from first claim if available
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