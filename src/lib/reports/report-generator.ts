/**
 * Report Generator Orchestrator
 *
 * Accepts a reportType + period + businessId, queries Convex for data,
 * renders PDF, and returns the PDF buffer + HTML summary.
 *
 * NOTE: This module is designed to be called from Lambda (server-side only).
 * It uses dynamic imports for @react-pdf/renderer.
 */

import type { PnlReportData } from './templates/pnl-template'
import type { CashFlowReportData } from './templates/cash-flow-template'
import type { ArAgingReportData } from './templates/ar-aging-template'
import type { ApAgingReportData } from './templates/ap-aging-template'
import type { ExpenseSummaryReportData } from './templates/expense-summary-template'
import type { TrialBalanceReportData } from './templates/trial-balance-template'
import type { BalanceSheetReportData } from './templates/balance-sheet-template'
import type { DebtorStatementData } from './templates/debtor-statement-template'
import type { VendorStatementData } from './templates/vendor-statement-template'

export type ReportType = 'pnl' | 'cash_flow' | 'ar_aging' | 'ap_aging' | 'expense_summary' | 'trial_balance' | 'balance_sheet'

export interface ReportGenerationInput {
  reportType: ReportType
  businessId: string
  businessName: string
  currency: string
  periodStart: string
  periodEnd: string
}

export interface ReportGenerationOutput {
  pdfBuffer: Buffer
  htmlSummary: string
  metadata: {
    reportType: ReportType
    businessName: string
    periodStart: string
    periodEnd: string
    generatedAt: string
    title: string
  }
}

const REPORT_TITLES: Record<ReportType, string> = {
  pnl: 'Profit & Loss Statement',
  cash_flow: 'Cash Flow Statement',
  ar_aging: 'Accounts Receivable Aging',
  ap_aging: 'Accounts Payable Aging',
  expense_summary: 'Expense Summary',
  trial_balance: 'Trial Balance',
  balance_sheet: 'Balance Sheet',
}

/**
 * Generate a report PDF + HTML summary
 *
 * This is a placeholder orchestrator. The actual data fetching will be
 * implemented in scheduledReportJobs.ts which queries Convex directly.
 * This module handles the PDF rendering and HTML summary generation.
 */
export async function generateReport(
  input: ReportGenerationInput,
  reportData: PnlReportData | CashFlowReportData | ArAgingReportData | ApAgingReportData | ExpenseSummaryReportData | TrialBalanceReportData | BalanceSheetReportData
): Promise<ReportGenerationOutput> {
  const generatedAt = new Date().toISOString()
  const title = REPORT_TITLES[input.reportType]

  // Dynamic import to avoid bundling issues in non-server contexts
  const { renderToBuffer } = await import('@react-pdf/renderer')

  let pdfBuffer: Buffer
  let htmlSummary: string

  switch (input.reportType) {
    case 'pnl': {
      const { PnlReportDocument } = await import('./templates/pnl-template')
      const data = reportData as PnlReportData
      pdfBuffer = await renderToBuffer(PnlReportDocument({ data }) as any) as unknown as Buffer
      htmlSummary = buildPnlHtmlSummary(data)
      break
    }
    case 'cash_flow': {
      const { CashFlowReportDocument } = await import('./templates/cash-flow-template')
      const data = reportData as CashFlowReportData
      pdfBuffer = await renderToBuffer(CashFlowReportDocument({ data }) as any) as unknown as Buffer
      htmlSummary = buildCashFlowHtmlSummary(data)
      break
    }
    case 'ar_aging': {
      const { ArAgingReportDocument } = await import('./templates/ar-aging-template')
      const data = reportData as ArAgingReportData
      pdfBuffer = await renderToBuffer(ArAgingReportDocument({ data }) as any) as unknown as Buffer
      htmlSummary = buildArAgingHtmlSummary(data)
      break
    }
    case 'ap_aging': {
      const { ApAgingReportDocument } = await import('./templates/ap-aging-template')
      const data = reportData as ApAgingReportData
      pdfBuffer = await renderToBuffer(ApAgingReportDocument({ data }) as any) as unknown as Buffer
      htmlSummary = buildApAgingHtmlSummary(data)
      break
    }
    case 'expense_summary': {
      const { ExpenseSummaryReportDocument } = await import('./templates/expense-summary-template')
      const data = reportData as ExpenseSummaryReportData
      pdfBuffer = await renderToBuffer(ExpenseSummaryReportDocument({ data }) as any) as unknown as Buffer
      htmlSummary = buildExpenseSummaryHtmlSummary(data)
      break
    }
    case 'trial_balance': {
      const { TrialBalanceReportDocument } = await import('./templates/trial-balance-template')
      const data = reportData as TrialBalanceReportData
      pdfBuffer = await renderToBuffer(TrialBalanceReportDocument({ data }) as any) as unknown as Buffer
      htmlSummary = buildTrialBalanceHtmlSummary(data)
      break
    }
    case 'balance_sheet': {
      const { BalanceSheetReportDocument } = await import('./templates/balance-sheet-template')
      const data = reportData as BalanceSheetReportData
      pdfBuffer = await renderToBuffer(BalanceSheetReportDocument({ data }) as any) as unknown as Buffer
      htmlSummary = buildBalanceSheetHtmlSummary(data)
      break
    }
  }

  return {
    pdfBuffer,
    htmlSummary,
    metadata: {
      reportType: input.reportType,
      businessName: input.businessName,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      generatedAt,
      title,
    },
  }
}

// ─── HTML Summary Builders ─────────────────────────────────

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function buildPnlHtmlSummary(data: PnlReportData): string {
  return `
<h2>Profit & Loss — ${data.periodStart} to ${data.periodEnd}</h2>
<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;">
<tr style="border-bottom:2px solid #000;font-weight:bold;"><td>Revenue</td><td style="text-align:right">${fmt(data.totalRevenue, data.currency)}</td></tr>
<tr><td>Cost of Goods Sold</td><td style="text-align:right">(${fmt(Math.abs(data.totalCogs), data.currency)})</td></tr>
<tr style="border-bottom:1px solid #ccc;font-weight:bold;"><td>Gross Profit</td><td style="text-align:right">${fmt(data.grossProfit, data.currency)}</td></tr>
<tr><td>Operating Expenses</td><td style="text-align:right">(${fmt(Math.abs(data.totalExpenses), data.currency)})</td></tr>
<tr style="border-top:2px solid #000;font-weight:bold;font-size:16px;"><td>Net Income</td><td style="text-align:right">${fmt(data.netIncome, data.currency)}</td></tr>
</table>`
}

function buildCashFlowHtmlSummary(data: CashFlowReportData): string {
  return `
<h2>Cash Flow — ${data.periodStart} to ${data.periodEnd}</h2>
<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;">
<tr><td>Opening Balance</td><td style="text-align:right">${fmt(data.openingBalance, data.currency)}</td></tr>
<tr><td>Total Inflows</td><td style="text-align:right">${fmt(data.totalInflows, data.currency)}</td></tr>
<tr><td>Total Outflows</td><td style="text-align:right">(${fmt(Math.abs(data.totalOutflows), data.currency)})</td></tr>
<tr style="font-weight:bold;"><td>Net Change</td><td style="text-align:right">${fmt(data.netChange, data.currency)}</td></tr>
<tr style="border-top:2px solid #000;font-weight:bold;font-size:16px;"><td>Closing Balance</td><td style="text-align:right">${fmt(data.closingBalance, data.currency)}</td></tr>
</table>`
}

function buildArAgingHtmlSummary(data: ArAgingReportData): string {
  return `
<h2>AR Aging — As of ${data.periodEnd}</h2>
<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
<tr style="border-bottom:2px solid #000;font-weight:bold;"><td>Bucket</td><td style="text-align:right">Amount</td></tr>
<tr><td>Current</td><td style="text-align:right">${fmt(data.totals.current, data.currency)}</td></tr>
<tr><td>1-30 Days</td><td style="text-align:right">${fmt(data.totals.days30, data.currency)}</td></tr>
<tr><td>31-60 Days</td><td style="text-align:right">${fmt(data.totals.days60, data.currency)}</td></tr>
<tr><td>61-90 Days</td><td style="text-align:right">${fmt(data.totals.days90, data.currency)}</td></tr>
<tr><td>90+ Days</td><td style="text-align:right">${fmt(data.totals.days120plus, data.currency)}</td></tr>
<tr style="border-top:2px solid #000;font-weight:bold;"><td>Total Outstanding</td><td style="text-align:right">${fmt(data.totals.total, data.currency)}</td></tr>
</table>
<p style="font-size:12px;color:#666;">${data.customers.length} customers with outstanding balances.</p>`
}

function buildApAgingHtmlSummary(data: ApAgingReportData): string {
  return `
<h2>AP Aging — As of ${data.periodEnd}</h2>
<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
<tr style="border-bottom:2px solid #000;font-weight:bold;"><td>Bucket</td><td style="text-align:right">Amount</td></tr>
<tr><td>Current</td><td style="text-align:right">${fmt(data.totals.current, data.currency)}</td></tr>
<tr><td>1-30 Days</td><td style="text-align:right">${fmt(data.totals.days30, data.currency)}</td></tr>
<tr><td>31-60 Days</td><td style="text-align:right">${fmt(data.totals.days60, data.currency)}</td></tr>
<tr><td>61-90 Days</td><td style="text-align:right">${fmt(data.totals.days90, data.currency)}</td></tr>
<tr><td>90+ Days</td><td style="text-align:right">${fmt(data.totals.days120plus, data.currency)}</td></tr>
<tr style="border-top:2px solid #000;font-weight:bold;"><td>Total Outstanding</td><td style="text-align:right">${fmt(data.totals.total, data.currency)}</td></tr>
</table>
<p style="font-size:12px;color:#666;">${data.vendors.length} vendors with outstanding balances.</p>`
}

function buildExpenseSummaryHtmlSummary(data: ExpenseSummaryReportData): string {
  const catRows = data.byCategory.map(
    (c) => `<tr><td>${c.category}</td><td style="text-align:right">${c.claimCount}</td><td style="text-align:right">${fmt(c.totalAmount, data.currency)}</td></tr>`
  ).join('')

  return `
<h2>Expense Summary — ${data.periodStart} to ${data.periodEnd}</h2>
<p><strong>Total:</strong> ${data.totalClaims} claims, ${fmt(data.totalAmount, data.currency)}</p>
<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
<tr style="border-bottom:2px solid #000;font-weight:bold;"><td>Category</td><td style="text-align:right">Claims</td><td style="text-align:right">Amount</td></tr>
${catRows}
</table>`
}

function buildTrialBalanceHtmlSummary(data: TrialBalanceReportData): string {
  const rows = data.lines.map(
    (l) => `<tr><td>${l.accountCode}</td><td>${l.accountName}</td><td style="text-align:right">${fmt(l.debitBalance, data.currency)}</td><td style="text-align:right">${fmt(l.creditBalance, data.currency)}</td></tr>`
  ).join('')

  return `
<h2>Trial Balance — As of ${data.asOfDate}</h2>
<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px;">
<tr style="border-bottom:2px solid #000;font-weight:bold;"><td>Code</td><td>Account</td><td style="text-align:right">Debit</td><td style="text-align:right">Credit</td></tr>
${rows}
<tr style="border-top:2px solid #000;font-weight:bold;"><td colspan="2">TOTAL</td><td style="text-align:right">${fmt(data.totalDebits, data.currency)}</td><td style="text-align:right">${fmt(data.totalCredits, data.currency)}</td></tr>
</table>
<p style="font-size:12px;color:${data.balanced ? '#22c55e' : '#ef4444'};">${data.balanced ? '✓ Balanced' : '✗ Unbalanced'}</p>`
}

function buildBalanceSheetHtmlSummary(data: BalanceSheetReportData): string {
  return `
<h2>Balance Sheet — As of ${data.asOfDate}</h2>
<table style="width:100%;border-collapse:collapse;font-family:sans-serif;font-size:14px;">
<tr style="border-bottom:1px solid #ccc;font-weight:bold;"><td>Total Assets</td><td style="text-align:right">${fmt(data.totalAssets, data.currency)}</td></tr>
<tr><td>Total Liabilities</td><td style="text-align:right">${fmt(data.totalLiabilities, data.currency)}</td></tr>
<tr><td>Retained Earnings</td><td style="text-align:right">${fmt(data.retainedEarnings, data.currency)}</td></tr>
<tr style="border-bottom:1px solid #ccc;"><td>Total Equity</td><td style="text-align:right">${fmt(data.totalEquity, data.currency)}</td></tr>
<tr style="border-top:2px solid #000;font-weight:bold;font-size:16px;"><td>Total L + E</td><td style="text-align:right">${fmt(data.totalLiabilitiesAndEquity, data.currency)}</td></tr>
</table>
<p style="font-size:12px;color:${data.balanced ? '#22c55e' : '#ef4444'};">${data.balanced ? '✓ A = L + E' : '✗ Equation does not balance'}</p>`
}

// ─── Individual Statement Generation ─────────────────────────

/**
 * Generate an individual debtor statement PDF
 */
export async function generateDebtorStatement(data: DebtorStatementData): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer')
  const { DebtorStatementDocument } = await import('./templates/debtor-statement-template')
  return await renderToBuffer(DebtorStatementDocument({ data }) as any) as unknown as Buffer
}

/**
 * Generate an individual vendor statement PDF
 */
export async function generateVendorStatement(data: VendorStatementData): Promise<Buffer> {
  const { renderToBuffer } = await import('@react-pdf/renderer')
  const { VendorStatementDocument } = await import('./templates/vendor-statement-template')
  return await renderToBuffer(VendorStatementDocument({ data }) as any) as unknown as Buffer
}
