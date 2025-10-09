/**
 * Google Sheets Export API for Expense Claims
 * Generates CSV format that can be imported to Google Sheets or exports directly via Google Sheets API
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'

interface ExportOptions {
  format: 'csv' | 'google_sheets'
  date_range: {
    start_date: string
    end_date: string
  }
  status_filter?: string[]
  department_filter?: string[]
  employee_filter?: string[]
  include_line_items?: boolean
}

interface ExpenseReportRow {
  claim_id: string
  employee_name: string
  user_id: string
  department: string
  submission_date: string
  transaction_date: string
  vendor_name: string
  description: string
  business_purpose: string
  category: string
  original_amount: number
  original_currency: string
  converted_amount_sgd: number
  status: string
  approved_by?: string
  approved_date?: string
  receipt_attached: boolean
  line_items_count: number
  policy_compliant: boolean
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const exportOptions: ExportOptions = body

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get user's employee profile to check permissions
    const { data: employeeProfile, error: profileError } = await supabase
      .from('business_memberships')
      .select('*, business_id')
      .eq('user_id', userId)
      .single()

    if (profileError || !employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    // Check if user has manager or finance permissions for exports
    const hasExportPermission =
      employeeProfile.role === 'manager' ||
      employeeProfile.role === 'admin'

    if (!hasExportPermission) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions for export' },
        { status: 403 }
      )
    }

    // Build query based on user role and filters
    let query = supabase
      .from('expense_claims')
      .select(`
        id,
        user_id,
        business_purpose,
        expense_category,
        status,
        submitted_at,
        approved_at,
        approved_by,
        claim_month,
        created_at,
        employee:users!inner(id,full_name,email),
        transactions (
          id,
          vendor_name,
          description,
          transaction_date,
          original_amount,
          original_currency,
          home_currency_amount
        )
      `)
      .eq('business_id', employeeProfile.business_id)
      .gte('claim_month', exportOptions.date_range.start_date)
      .lte('claim_month', exportOptions.date_range.end_date)
      .order('created_at', { ascending: false })

    // Apply filters
    if (exportOptions.status_filter && exportOptions.status_filter.length > 0) {
      query = query.in('status', exportOptions.status_filter)
    }

    if (exportOptions.department_filter && exportOptions.department_filter.length > 0) {
      query = query.in('employee_profiles.department', exportOptions.department_filter)
    }

    const { data: expenses, error: queryError } = await query

    if (queryError) {
      console.error('[Export API] Query error:', queryError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch expense data' },
        { status: 500 }
      )
    }

    if (!expenses || expenses.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No expenses found for the specified criteria' },
        { status: 404 }
      )
    }

    // Transform data for export
    const reportData: ExpenseReportRow[] = expenses.map(expense => {
      const employee = Array.isArray(expense.employee) ? expense.employee[0] : expense.employee
      const transaction = Array.isArray(expense.transactions) ? expense.transactions[0] : expense.transactions
      const lineItemsCount = 0 // TODO: Query line_items separately if needed

      return {
        claim_id: expense.id,
        employee_name: employee?.full_name || 'Unknown',
        user_id: employee?.id || 'Unknown',
        department: 'Unknown', // Department info no longer available from employee_profiles
        submission_date: expense.submitted_at || expense.created_at,
        transaction_date: transaction?.transaction_date || expense.claim_month,
        vendor_name: transaction?.vendor_name || 'Unknown',
        description: transaction?.description || 'Unknown',
        business_purpose: expense.business_purpose,
        category: expense.expense_category,
        original_amount: transaction?.original_amount || 0,
        original_currency: transaction?.original_currency || 'SGD',
        converted_amount_sgd: transaction?.home_currency_amount || transaction?.original_amount || 0,
        status: expense.status,
        approved_by: expense.approved_by || '',
        approved_date: expense.approved_at || '',
        receipt_attached: !!transaction?.id, // Check if transaction exists (implies receipt was processed)
        line_items_count: lineItemsCount,
        policy_compliant: true // Default for now, can be enhanced with policy rules
      }
    })

    // Generate export based on format
    if (exportOptions.format === 'csv') {
      const csvContent = generateCSV(reportData, exportOptions.include_line_items)
      
      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="expense-report-${exportOptions.date_range.start_date}-to-${exportOptions.date_range.end_date}.csv"`
        }
      })
    } else if (exportOptions.format === 'google_sheets') {
      // For Google Sheets integration, return structured data that can be used by frontend
      const sheetsData = generateGoogleSheetsData(reportData, exportOptions.include_line_items)
      
      return NextResponse.json({
        success: true,
        data: {
          export_format: 'google_sheets',
          row_count: reportData.length,
          sheets_data: sheetsData,
          metadata: {
            generated_at: new Date().toISOString(),
            date_range: exportOptions.date_range,
            generated_by: employeeProfile.user_id || 'Unknown',
            business_id: employeeProfile.business_id
          }
        }
      })
    }

  } catch (error) {
    console.error('[Export API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate export' },
      { status: 500 }
    )
  }
}

function generateCSV(data: ExpenseReportRow[], includeLineItems: boolean = false): string {
  const headers = [
    'Claim ID',
    'Employee Name', 
    'Employee ID',
    'Department',
    'Submission Date',
    'Transaction Date',
    'Vendor',
    'Description',
    'Business Purpose',
    'Category',
    'Original Amount',
    'Currency',
    'Amount (SGD)',
    'Status',
    'Approved By',
    'Approved Date',
    'Receipt Attached',
    'Line Items Count',
    'Policy Compliant'
  ]

  const csvRows = [headers.join(',')]

  data.forEach(row => {
    const csvRow = [
      `"${row.claim_id}"`,
      `"${row.employee_name}"`,
      `"${row.user_id}"`,
      `"${row.department}"`,
      `"${row.submission_date}"`,
      `"${row.transaction_date}"`,
      `"${row.vendor_name}"`,
      `"${row.description.replace(/"/g, '""')}"`,
      `"${row.business_purpose.replace(/"/g, '""')}"`,
      `"${row.category}"`,
      row.original_amount,
      `"${row.original_currency}"`,
      row.converted_amount_sgd,
      `"${row.status}"`,
      `"${row.approved_by}"`,
      `"${row.approved_date}"`,
      row.receipt_attached ? 'Yes' : 'No',
      row.line_items_count,
      row.policy_compliant ? 'Yes' : 'No'
    ]
    csvRows.push(csvRow.join(','))
  })

  return csvRows.join('\n')
}

function generateGoogleSheetsData(data: ExpenseReportRow[], includeLineItems: boolean = false) {
  const headers = [
    'Claim ID',
    'Employee Name', 
    'Employee ID',
    'Department',
    'Submission Date',
    'Transaction Date',
    'Vendor',
    'Description',
    'Business Purpose',
    'Category',
    'Original Amount',
    'Currency',
    'Amount (SGD)',
    'Status',
    'Approved By',
    'Approved Date',
    'Receipt Attached',
    'Line Items Count',
    'Policy Compliant'
  ]

  const rows = data.map(row => [
    row.claim_id,
    row.employee_name,
    row.user_id,
    row.department,
    row.submission_date,
    row.transaction_date,
    row.vendor_name,
    row.description,
    row.business_purpose,
    row.category,
    row.original_amount,
    row.original_currency,
    row.converted_amount_sgd,
    row.status,
    row.approved_by,
    row.approved_date,
    row.receipt_attached ? 'Yes' : 'No',
    row.line_items_count,
    row.policy_compliant ? 'Yes' : 'No'
  ])

  return {
    headers,
    rows,
    summary: {
      total_expenses: data.length,
      total_amount_sgd: data.reduce((sum, row) => sum + row.converted_amount_sgd, 0),
      pending_count: data.filter(row => row.status === 'pending').length,
      approved_count: data.filter(row => row.status === 'approved').length,
      rejected_count: data.filter(row => row.status === 'rejected').length
    }
  }
}