/**
 * Monthly Expense Report API
 * Implements Otto's compliance reporting with Mel's export functionality
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { 
  MonthlyExpenseReport, 
  ExpenseCategory,
  EXPENSE_CATEGORY_CONFIG 
} from '@/types/expense-claims'

// Generate monthly expense report
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const reportMonth = searchParams.get('month') // YYYY-MM format
    const employeeId = searchParams.get('employee_id')
    const format = searchParams.get('format') || 'json' // json, pdf, csv

    if (!reportMonth || !/^\d{4}-\d{2}$/.test(reportMonth)) {
      return NextResponse.json(
        { success: false, error: 'Valid month parameter is required (YYYY-MM format)' },
        { status: 400 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get user's employee profile
    const { data: userProfile, error: profileError } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (profileError || !userProfile) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not found' },
        { status: 404 }
      )
    }

    // Determine target employee (for managers/finance viewing team reports)
    let targetEmployeeId = userProfile.id
    if (employeeId) {
      // Validate permission to view other employee's reports
      if (userProfile.role_permissions.admin) {
        // Admin can view anyone's reports
        targetEmployeeId = employeeId
      } else if (userProfile.role_permissions.manager) {
        // Managers can view their team's reports
        const { data: targetEmployee } = await supabase
          .from('employee_profiles')
          .select('manager_id')
          .eq('id', employeeId)
          .single()
          
        if (targetEmployee?.manager_id === userProfile.id) {
          targetEmployeeId = employeeId
        } else {
          return NextResponse.json(
            { success: false, error: 'Insufficient permissions to view this employee report' },
            { status: 403 }
          )
        }
      } else {
        // Employees can only view their own reports
        return NextResponse.json(
          { success: false, error: 'Insufficient permissions' },
          { status: 403 }
        )
      }
    }

    // Get target employee details
    const { data: targetEmployee, error: targetError } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('id', targetEmployeeId)
      .single()

    if (targetError || !targetEmployee) {
      return NextResponse.json(
        { success: false, error: 'Target employee not found' },
        { status: 404 }
      )
    }

    // Fetch expense claims for the specified month
    const { data: expenseClaims, error: claimsError } = await supabase
      .from('expense_claims')
      .select(`
        *,
        transaction:transactions(*),
        employee:employee_profiles!expense_claims_employee_id_fkey(*)
      `)
      .eq('employee_id', targetEmployeeId)
      .eq('claim_month', reportMonth)
      .order('created_at', { ascending: true })

    if (claimsError) {
      console.error('[Monthly Report API] Failed to fetch expense claims:', claimsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch expense claims' },
        { status: 500 }
      )
    }

    // Calculate summary statistics (Otto's financial analysis)
    const summary = {
      total_amount: 0,
      claim_count: expenseClaims?.length || 0,
      approved_amount: 0,
      pending_amount: 0,
      rejected_amount: 0
    }

    // Calculate category totals
    const categoryTotals: Record<ExpenseCategory, { amount: number; count: number }> = {
      travel_accommodation: { amount: 0, count: 0 },
      petrol_transport: { amount: 0, count: 0 },
      entertainment_meals: { amount: 0, count: 0 },
      office_supplies: { amount: 0, count: 0 },
      utilities_comms: { amount: 0, count: 0 },
      maintenance_repairs: { amount: 0, count: 0 },
      professional_services: { amount: 0, count: 0 },
      marketing_advertising: { amount: 0, count: 0 },
      training_development: { amount: 0, count: 0 },
      other_business: { amount: 0, count: 0 }
    }

    // Process each claim for statistics
    expenseClaims?.forEach(claim => {
      const amount = claim.transaction?.home_amount || 0
      summary.total_amount += amount

      // Categorize by status
      switch (claim.status) {
        case 'approved':
        case 'reimbursed':
        case 'paid':
          summary.approved_amount += amount
          break
        case 'rejected':
          summary.rejected_amount += amount
          break
        default:
          summary.pending_amount += amount
      }

      // Category breakdown
      const category = claim.expense_category as ExpenseCategory
      if (categoryTotals[category]) {
        categoryTotals[category].amount += amount
        categoryTotals[category].count += 1
      }
    })

    // Build monthly report object (Otto's compliance structure)
    const monthlyReport: MonthlyExpenseReport = {
      employee_id: targetEmployee.id,
      employee_name: targetEmployee.full_name,
      report_month: reportMonth,
      home_currency: targetEmployee.home_currency,
      summary,
      category_totals: categoryTotals,
      claims: expenseClaims || [],
      generated_at: new Date().toISOString(),
      generated_by: userProfile.id
    }

    // Handle different export formats (Mel's export functionality)
    switch (format) {
      case 'pdf':
        return await generatePDFReport(monthlyReport)
      case 'csv':
        return await generateCSVReport(monthlyReport)
      case 'json':
      default:
        return NextResponse.json({
          success: true,
          data: monthlyReport
        })
    }

  } catch (error) {
    console.error('[Monthly Report API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate monthly report'
      },
      { status: 500 }
    )
  }
}

// Generate PDF report (Otto's compliance requirement)
async function generatePDFReport(report: MonthlyExpenseReport): Promise<NextResponse> {
  // TODO: Implement PDF generation using a library like Puppeteer or PDFKit
  // This would generate a professional monthly expense report PDF
  
  const htmlContent = generateReportHTML(report)
  
  // For now, return HTML that can be printed
  return new NextResponse(htmlContent, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="expense-report-${report.employee_name}-${report.report_month}.html"`
    }
  })
}

// Generate CSV export (Mel's data export requirement)
async function generateCSVReport(report: MonthlyExpenseReport): Promise<NextResponse> {
  const headers = [
    'Claim ID',
    'Date',
    'Description', 
    'Category',
    'Vendor',
    'Amount',
    'Currency',
    'Status',
    'Business Purpose',
    'Submission Date',
    'Approval Date'
  ]
  
  const rows = report.claims.map(claim => [
    claim.id,
    claim.transaction?.transaction_date || '',
    claim.transaction?.description || '',
    EXPENSE_CATEGORY_CONFIG[claim.expense_category].label,
    claim.transaction?.vendor_name || '',
    claim.transaction?.original_amount || 0,
    claim.transaction?.original_currency || report.home_currency,
    claim.status,
    claim.business_purpose,
    claim.submission_date || '',
    claim.approval_date || ''
  ])
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')
  
  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="expense-report-${report.employee_name}-${report.report_month}.csv"`
    }
  })
}

// Generate HTML report for printing (Otto's compliance documentation)
function generateReportHTML(report: MonthlyExpenseReport): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Monthly Expense Report - ${report.employee_name} - ${report.report_month}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; }
        .category-breakdown { margin: 20px 0; }
        .claims-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .claims-table th, .claims-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .claims-table th { background-color: #f2f2f2; }
        .status-approved { color: green; }
        .status-rejected { color: red; }
        .status-pending { color: orange; }
        @media print { 
            body { margin: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Monthly Expense Report</h1>
        <h2>${report.employee_name}</h2>
        <h3>${report.report_month}</h3>
        <p>Generated on: ${new Date(report.generated_at).toLocaleDateString()}</p>
    </div>

    <div class="summary">
        <h3>Summary</h3>
        <p><strong>Total Claims:</strong> ${report.summary.claim_count}</p>
        <p><strong>Total Amount:</strong> ${report.summary.total_amount.toFixed(2)} ${report.home_currency}</p>
        <p><strong>Approved Amount:</strong> ${report.summary.approved_amount.toFixed(2)} ${report.home_currency}</p>
        <p><strong>Pending Amount:</strong> ${report.summary.pending_amount.toFixed(2)} ${report.home_currency}</p>
        <p><strong>Rejected Amount:</strong> ${report.summary.rejected_amount.toFixed(2)} ${report.home_currency}</p>
    </div>

    <div class="category-breakdown">
        <h3>Category Breakdown</h3>
        ${Object.entries(report.category_totals).map(([category, data]) => `
            <p><strong>${EXPENSE_CATEGORY_CONFIG[category as ExpenseCategory].label}:</strong> 
               ${data.amount.toFixed(2)} ${report.home_currency} (${data.count} claims)</p>
        `).join('')}
    </div>

    <h3>Detailed Claims</h3>
    <table class="claims-table">
        <thead>
            <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Business Purpose</th>
            </tr>
        </thead>
        <tbody>
            ${report.claims.map(claim => `
                <tr>
                    <td>${claim.transaction?.transaction_date || 'N/A'}</td>
                    <td>${claim.transaction?.description || 'N/A'}</td>
                    <td>${EXPENSE_CATEGORY_CONFIG[claim.expense_category].label}</td>
                    <td>${claim.transaction?.vendor_name || 'N/A'}</td>
                    <td>${(claim.transaction?.original_amount || 0).toFixed(2)} ${claim.transaction?.original_currency || report.home_currency}</td>
                    <td class="status-${claim.status}">${claim.status.replace('_', ' ').toUpperCase()}</td>
                    <td>${claim.business_purpose}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="no-print" style="margin-top: 30px;">
        <button onclick="window.print()">Print Report</button>
    </div>
</body>
</html>`
}