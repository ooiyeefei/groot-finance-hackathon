/**
 * Action Card Data Schemas — Contract Definitions
 *
 * These interfaces define the data shape for each action card type.
 * The LLM emits these as JSON in ```actions``` blocks.
 * Frontend card components consume these via `action.data`.
 *
 * Feature: 013-chat-action-cards
 */

// ────────────────────────────────────────────────
// 1. Invoice Posting Card
// ────────────────────────────────────────────────

export interface InvoicePostingData {
  invoiceId: string
  vendorName: string
  amount: number
  currency: string
  invoiceDate: string
  invoiceNumber?: string
  dueDate?: string
  confidenceScore: number
  lineItems?: Array<{
    description: string
    quantity: number
    unitPrice: number
    totalAmount: number
  }>
  status: 'ready' | 'posted' | 'failed'
}

// ────────────────────────────────────────────────
// 2. Cash Flow Dashboard Card
// ────────────────────────────────────────────────

export interface CashFlowAlert {
  type: 'low_runway' | 'expense_exceeding_income'
  severity: 'critical' | 'high' | 'medium'
  message: string
}

export interface CashFlowDashboardData {
  runwayDays: number
  monthlyBurnRate: number
  estimatedBalance: number
  totalIncome: number
  totalExpenses: number
  expenseToIncomeRatio: number
  currency: string
  forecastPeriod?: string
  alerts: CashFlowAlert[]
}

// ────────────────────────────────────────────────
// 3. Compliance Alert Card
// ────────────────────────────────────────────────

export interface ComplianceAlertData {
  country: string
  countryCode: string
  authority: string
  topic: string
  severity: 'action_required' | 'for_information' | 'warning'
  requirements: string[]
  citationIndices: number[]
  effectiveDate?: string
  source?: string
}

// ────────────────────────────────────────────────
// 4. Budget Alert Card
// ────────────────────────────────────────────────

export interface BudgetCategory {
  name: string
  currentSpend: number
  averageSpend: number
  percentOfAverage: number
  status: 'on_track' | 'above_average' | 'overspending'
}

export interface BudgetAlertData {
  period: string
  currency: string
  categories: BudgetCategory[]
  totalCurrentSpend: number
  totalAverageSpend: number
  overallStatus: 'on_track' | 'above_average' | 'overspending'
}

// ────────────────────────────────────────────────
// 5. Time-Series Spending Chart (extends spending_chart)
// ────────────────────────────────────────────────

export interface SpendingTimeSeriesData {
  chartType: 'time_series'
  title: string
  currency: string
  periods: Array<{
    label: string
    total: number
    categories?: Array<{
      name: string
      amount: number
    }>
  }>
  trendPercent?: number
  trendDirection?: 'up' | 'down' | 'stable'
}

// ────────────────────────────────────────────────
// Rich Content Panel Extension
// ────────────────────────────────────────────────

export interface RichContentPayload {
  type: 'chart' | 'table' | 'dashboard'
  title: string
  data: unknown
  chartType?: 'bar' | 'line' | 'pie'
}
