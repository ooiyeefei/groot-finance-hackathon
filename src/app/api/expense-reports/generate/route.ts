/**
 * Expense Report Generation API
 * Generates comprehensive expense reports in CSV or Google Sheets format
 * Based on the CHL ELECTRICAL ENTERPRISE claim form format
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'

// Types for expense report generation
export interface ExpenseReportParams {
  employee_id?: string // If not provided, gets all employees (admin only)
  date_from: string    // YYYY-MM-DD format
  date_to: string      // YYYY-MM-DD format
  month_shortcut?: string // Optional: YYYY-MM for quick month selection
  export_format: 'csv' | 'google_sheets'
  google_oauth_token?: string // Required for Google Sheets export
}

export interface ExpenseReportData {
  employee_info: {
    full_name: string
    employee_id: string
    email: string
    designation: string
    business_name: string
  }
  report_period: {
    from: string
    to: string
    month_year: string
  }
  categories: {
    [categoryName: string]: {
      items: Array<{
        date: string
        particulars: string
        amount: number
        currency: string
        vendor_name: string
        reference_number?: string
      }>
      total: number
      currency: string
    }
  }
  grand_total: number
  currency: string
}

// Category mapping from database categories to report display names
const REPORT_CATEGORY_MAPPING = {
  'travel': 'TRAVELLING & ACCOMMODATION',
  'travel_accommodation': 'TRAVELLING & ACCOMMODATION',
  'TRAVEL': 'TRAVELLING & ACCOMMODATION',
  'petrol': 'PETROL',
  'petrol_transport': 'PETROL',
  'toll': 'TOLL',
  'entertainment': 'ENTERTAINMENT',
  'entertainment_meals': 'ENTERTAINMENT',
  'office_supplies': 'OFFICE SUPPLIES',
  'utilities': 'UTILITIES & COMMUNICATIONS',
  'utilities_comms': 'UTILITIES & COMMUNICATIONS',
  'training': 'TRAINING & DEVELOPMENT',
  'training_development': 'TRAINING & DEVELOPMENT',
  'marketing': 'MARKETING & ADVERTISING',
  'marketing_advertising': 'MARKETING & ADVERTISING',
  'maintenance': 'MAINTENANCE & REPAIRS',
  'maintenance_repairs': 'MAINTENANCE & REPAIRS',
  'other': 'OTHER EXPENSES',
  'other_business': 'OTHER EXPENSES'
}

async function generateExpenseReportData(
  employeeId: string,
  dateFrom: string,
  dateTo: string,
  supabase: any
): Promise<ExpenseReportData> {

  // Get employee information
  const { data: employeeData, error: employeeError } = await supabase
    .from('employee_profiles')
    .select(`
      id,
      employee_id,
      job_title,
      user_id,
      business_id,
      users!inner(full_name, email),
      businesses!inner(name)
    `)
    .eq('id', employeeId)
    .single()

  if (employeeError || !employeeData) {
    throw new Error(`Failed to fetch employee data: ${employeeError?.message}`)
  }

  // Get expense claims with transactions for the date range
  const { data: expenseData, error: expenseError } = await supabase
    .from('expense_claims')
    .select(`
      id,
      status,
      expense_category,
      business_purpose,
      created_at,
      transaction:transactions!inner(
        transaction_date,
        description,
        original_amount,
        original_currency,
        vendor_name,
        reference_number,
        line_items(
          item_description,
          quantity,
          unit_price,
          total_amount
        )
      )
    `)
    .eq('employee_id', employeeId)
    .in('status', ['approved', 'paid', 'reimbursed'])
    .gte('transaction.transaction_date', dateFrom)
    .lte('transaction.transaction_date', dateTo)
    .order('transaction.transaction_date', { ascending: true })

  if (expenseError) {
    throw new Error(`Failed to fetch expense data: ${expenseError.message}`)
  }

  // Process and categorize expenses
  const categories: ExpenseReportData['categories'] = {}
  let grandTotal = 0
  const baseCurrency = 'MYR' // Default currency for reports

  for (const expense of expenseData || []) {
    const transaction = expense.transaction
    const reportCategory = REPORT_CATEGORY_MAPPING[expense.expense_category as keyof typeof REPORT_CATEGORY_MAPPING] || 'OTHER EXPENSES'

    if (!categories[reportCategory]) {
      categories[reportCategory] = {
        items: [],
        total: 0,
        currency: baseCurrency
      }
    }

    // Process line items or main transaction
    if (transaction.line_items && transaction.line_items.length > 0) {
      // Has line items - use detailed breakdown
      for (const lineItem of transaction.line_items) {
        categories[reportCategory].items.push({
          date: transaction.transaction_date,
          particulars: lineItem.item_description || transaction.description,
          amount: parseFloat(lineItem.total_amount || '0'),
          currency: transaction.original_currency,
          vendor_name: transaction.vendor_name || '',
          reference_number: transaction.reference_number
        })
        categories[reportCategory].total += parseFloat(lineItem.total_amount || '0')
        grandTotal += parseFloat(lineItem.total_amount || '0')
      }
    } else {
      // No line items - use main transaction
      categories[reportCategory].items.push({
        date: transaction.transaction_date,
        particulars: transaction.description,
        amount: parseFloat(transaction.original_amount || '0'),
        currency: transaction.original_currency,
        vendor_name: transaction.vendor_name || '',
        reference_number: transaction.reference_number
      })
      categories[reportCategory].total += parseFloat(transaction.original_amount || '0')
      grandTotal += parseFloat(transaction.original_amount || '0')
    }
  }

  return {
    employee_info: {
      full_name: employeeData.users.full_name,
      employee_id: employeeData.employee_id,
      email: employeeData.users.email,
      designation: employeeData.job_title || 'Employee',
      business_name: employeeData.businesses.name
    },
    report_period: {
      from: dateFrom,
      to: dateTo,
      month_year: new Date(dateFrom).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric'
      }).toUpperCase()
    },
    categories,
    grand_total: grandTotal,
    currency: baseCurrency
  }
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

    const body: ExpenseReportParams = await request.json()
    const {
      employee_id,
      date_from,
      date_to,
      month_shortcut,
      export_format,
      google_oauth_token
    } = body

    // Validate required fields
    if (!export_format || !['csv', 'google_sheets'].includes(export_format)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing export_format. Must be "csv" or "google_sheets"' },
        { status: 400 }
      )
    }

    if (export_format === 'google_sheets' && !google_oauth_token) {
      return NextResponse.json(
        { success: false, error: 'Google OAuth token required for Google Sheets export' },
        { status: 400 }
      )
    }

    // Handle month shortcut (e.g., "2025-01" -> full month date range)
    let actualDateFrom = date_from
    let actualDateTo = date_to

    if (month_shortcut && !date_from && !date_to) {
      const [year, month] = month_shortcut.split('-')
      actualDateFrom = `${year}-${month}-01`
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
      actualDateTo = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`
    }

    if (!actualDateFrom || !actualDateTo) {
      return NextResponse.json(
        { success: false, error: 'Missing date range. Provide either date_from/date_to or month_shortcut' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)
    const serviceSupabase = createServiceSupabaseClient()

    // Get current user's employee profile for permission checking
    const currentUserProfile = await ensureEmployeeProfile(userId)
    if (!currentUserProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    // Determine target employee
    let targetEmployeeId = employee_id

    if (!targetEmployeeId) {
      // No specific employee provided - check if user can access all employees
      if (!currentUserProfile.role_permissions.admin && !currentUserProfile.role_permissions.manager) {
        // Regular employees can only generate their own reports
        targetEmployeeId = currentUserProfile.id
      } else {
        return NextResponse.json(
          { success: false, error: 'Admin/Manager must specify employee_id when generating reports for others' },
          { status: 400 }
        )
      }
    } else {
      // Specific employee requested - check permissions
      if (!currentUserProfile.role_permissions.admin && !currentUserProfile.role_permissions.manager) {
        // Regular employees can only access their own data
        if (targetEmployeeId !== currentUserProfile.id) {
          return NextResponse.json(
            { success: false, error: 'Insufficient permissions to access other employee data' },
            { status: 403 }
          )
        }
      }
    }

    console.log(`[Expense Report API] Generating report for employee: ${targetEmployeeId}`)
    console.log(`[Expense Report API] Date range: ${actualDateFrom} to ${actualDateTo}`)
    console.log(`[Expense Report API] Export format: ${export_format}`)

    // Generate report data
    const reportData = await generateExpenseReportData(
      targetEmployeeId,
      actualDateFrom,
      actualDateTo,
      serviceSupabase
    )

    if (export_format === 'csv') {
      // Generate CSV format
      const csvContent = await generateCSVReport(reportData)

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="expense_report_${reportData.employee_info.employee_id}_${reportData.report_period.month_year}.csv"`
        }
      })
    } else {
      // Google Sheets export
      const sheetsUrl = await generateGoogleSheetsReport(reportData, google_oauth_token!)

      return NextResponse.json({
        success: true,
        data: {
          report_data: reportData,
          google_sheets_url: sheetsUrl,
          message: 'Report exported to Google Sheets successfully'
        }
      })
    }

  } catch (error) {
    console.error('[Expense Report API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate expense report'
      },
      { status: 500 }
    )
  }
}

// Helper function to generate CSV report
async function generateCSVReport(reportData: ExpenseReportData): Promise<string> {
  const csvRows: string[] = []

  // Header information
  csvRows.push(`${reportData.employee_info.business_name}`)
  csvRows.push(`CLAIM FORM - ${reportData.report_period.month_year}`)
  csvRows.push('')
  csvRows.push(`NAME,${reportData.employee_info.full_name}`)
  csvRows.push(`DESIGNATION,${reportData.employee_info.designation}`)
  csvRows.push(`APPROVED BY,`)
  csvRows.push('')

  // Table header
  csvRows.push('No.,Date,Particulars,Amount (RM),Total (RM)')

  let rowNumber = 1

  // Process each category
  for (const [categoryName, categoryData] of Object.entries(reportData.categories)) {
    if (categoryData.items.length === 0) continue

    // Category header
    csvRows.push(`,,${categoryName},,`)

    // Category items
    for (const item of categoryData.items) {
      csvRows.push(`${rowNumber},${item.date},"${item.particulars}",${item.amount.toFixed(2)},`)
      rowNumber++
    }

    // Category total
    csvRows.push(`,,,,${categoryData.total.toFixed(2)}`)
    csvRows.push('') // Empty line between categories
  }

  // Grand total
  csvRows.push(`,,TOTAL,,${reportData.grand_total.toFixed(2)}`)

  return csvRows.join('\n')
}

// Helper function to generate Google Sheets report
async function generateGoogleSheetsReport(
  reportData: ExpenseReportData,
  oauthToken: string
): Promise<string> {
  const { GoogleSpreadsheet } = await import('google-spreadsheet')
  const { OAuth2Client } = await import('google-auth-library')

  try {
    // Create OAuth2 client with the provided token
    const auth = new OAuth2Client()
    auth.setCredentials({
      access_token: oauthToken
    })

    // Create a new spreadsheet
    const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(auth, {
      title: `${reportData.employee_info.business_name} - Expense Report - ${reportData.employee_info.employee_id} - ${reportData.report_period.month_year}`
    })

    // Get the default sheet
    const sheet = doc.sheetsByIndex[0]
    await sheet.updateProperties({ title: 'Expense Report' })

    // Clear the sheet
    await sheet.clear()

    // Prepare header rows
    const headerRows = [
      [reportData.employee_info.business_name],
      [`CLAIM FORM - ${reportData.report_period.month_year}`],
      [''],
      ['NAME', reportData.employee_info.full_name],
      ['DESIGNATION', reportData.employee_info.designation],
      ['APPROVED BY', ''],
      [''],
      ['No.', 'Date', 'Particulars', 'Amount (RM)', 'Total (RM)']
    ]

    // Add header rows
    await sheet.addRows(headerRows)

    let rowNumber = 1

    // Process each category
    for (const [categoryName, categoryData] of Object.entries(reportData.categories)) {
      if (categoryData.items.length === 0) continue

      // Add category header
      await sheet.addRow(['', '', categoryName, '', ''])

      // Add category items
      for (const item of categoryData.items) {
        await sheet.addRow([
          rowNumber,
          item.date,
          item.particulars,
          item.amount.toFixed(2),
          ''
        ])
        rowNumber++
      }

      // Add category total
      await sheet.addRow(['', '', '', '', categoryData.total.toFixed(2)])
      await sheet.addRow(['']) // Empty row between categories
    }

    // Add grand total
    await sheet.addRow(['', '', 'TOTAL', '', reportData.grand_total.toFixed(2)])

    // Basic sheet formatting
    try {
      await sheet.updateProperties({ title: 'Expense Report' })
    } catch (formatError) {
      // Formatting is optional, continue if it fails
      console.warn('[Google Sheets Export] Sheet formatting failed:', formatError)
    }

    console.log(`[Google Sheets Export] Created spreadsheet: ${doc.spreadsheetId}`)

    // Return the spreadsheet URL
    return `https://docs.google.com/spreadsheets/d/${doc.spreadsheetId}/edit`

  } catch (error) {
    console.error('[Google Sheets Export] Failed to create spreadsheet:', error)
    throw new Error(`Failed to create Google Sheets export: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// GET endpoint for employee list (for admin/manager dropdowns)
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

    // Get current user's employee profile for permission checking
    const currentUserProfile = await ensureEmployeeProfile(userId)
    if (!currentUserProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    let employeeQuery = supabase
      .from('employee_profiles')
      .select(`
        id,
        employee_id,
        job_title,
        users!inner(full_name, email)
      `)

    // Apply role-based filtering
    if (currentUserProfile.role_permissions.admin) {
      // Admin can see all employees in their business
      employeeQuery = employeeQuery.eq('business_id', currentUserProfile.business_id)
    } else if (currentUserProfile.role_permissions.manager) {
      // Managers can see their team + themselves
      employeeQuery = employeeQuery
        .eq('business_id', currentUserProfile.business_id)
        .or(`id.eq.${currentUserProfile.id},manager_id.eq.${currentUserProfile.id}`)
    } else {
      // Regular employees can only see themselves
      employeeQuery = employeeQuery.eq('id', currentUserProfile.id)
    }

    const { data: employees, error } = await employeeQuery.order('users.full_name')

    if (error) {
      throw new Error(`Failed to fetch employees: ${error.message}`)
    }

    const formattedEmployees = employees?.map(emp => ({
      id: emp.id,
      employee_id: emp.employee_id,
      full_name: (emp.users as any).full_name,
      email: (emp.users as any).email,
      job_title: emp.job_title
    })) || []

    return NextResponse.json({
      success: true,
      data: {
        employees: formattedEmployees,
        current_user: {
          id: currentUserProfile.id,
          permissions: currentUserProfile.role_permissions
        }
      }
    })

  } catch (error) {
    console.error('[Expense Report API - Employee List] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch employee list'
      },
      { status: 500 }
    )
  }
}