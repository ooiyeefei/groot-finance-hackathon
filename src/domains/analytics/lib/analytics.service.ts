/**
 * Analytics Service - Unified business logic for financial analytics domain
 *
 * North Star Architecture:
 * - Consolidated analytics, realtime metrics, and cash flow monitoring
 * - Reuses existing analytics engine and risk-scoring logic
 * - Multi-tenant security with business_id isolation
 * - Performance optimization with RPC functions
 *
 * Migrated from:
 * - src/lib/analytics/engine.ts (calculateFinancialAnalytics, calculateAnalyticsTrends)
 * - src/app/api/analytics/realtime/route.ts (realtime RPC handler)
 * - src/lib/monitoring/cash-flow-monitor.ts (runCashFlowMonitoring + 5 helpers)
 */

import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/db/supabase-server'
import { SupportedCurrency } from '@/domains/accounting-entries/types'
import {
  calculateFinancialAnalytics as calculateAnalyticsEngine,
  calculateAnalyticsTrends as calculateTrendsEngine,
  FinancialAnalytics,
  AnalyticsCalculationOptions
} from '@/domains/analytics/lib/engine'
import { calculateRiskScore, TransactionRiskContext, DEFAULT_RISK_CONFIG } from '@/domains/analytics/lib/risk-scoring'
import { withCache, CACHE_TTL } from '@/lib/cache/api-cache'

// ==========================================
// Type Definitions
// ==========================================

export interface CashFlowAlert {
  id: string
  type: 'overdue_receivables' | 'payment_deadline' | 'currency_exposure' | 'cash_shortage'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  amount?: number
  currency?: SupportedCurrency
  due_date?: string
  transaction_ids?: string[]
  recommendation: string
  created_at: string
}

export interface CashFlowProjection {
  period: '7_day' | '30_day' | '90_day'
  period_label: string
  period_start: string
  period_end: string
  projected_inflows: number
  projected_outflows: number
  net_cash_flow: number
  confidence_level: 'low' | 'medium' | 'high'
  currency: SupportedCurrency
}

export interface MonitoringConfig {
  cash_reserve_threshold: number  // Minimum cash reserve days
  receivable_aging_threshold: number  // Days before receivable considered overdue
  payment_deadline_window: number  // Days ahead to alert for upcoming payments
  currency_exposure_threshold: number  // Percentage threshold for currency concentration
  enable_alerts: boolean
}

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  cash_reserve_threshold: 30,  // 30 days of expenses
  receivable_aging_threshold: 45,  // Alert after 45 days overdue
  payment_deadline_window: 7,  // Alert 7 days before payment due
  currency_exposure_threshold: 50,  // Alert if >50% in single currency
  enable_alerts: true
}

// ==========================================
// Dashboard Analytics Functions
// ==========================================

/**
 * Calculate comprehensive financial analytics for dashboard
 * Delegates to analytics engine with security and caching
 */
export async function calculateFinancialAnalytics(
  clerkUserId: string,
  periodStart: Date,
  periodEnd: Date,
  options: AnalyticsCalculationOptions = {}
): Promise<FinancialAnalytics> {
  // Cache analytics results since they're expensive to calculate
  return await withCache(
    clerkUserId,
    'dashboard-analytics',
    async () => await calculateAnalyticsEngine(clerkUserId, periodStart, periodEnd, options),
    {
      params: {
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        homeCurrency: options.homeCurrency || 'SGD'
      },
      ttlMs: CACHE_TTL.DASHBOARD_ANALYTICS,
      skipCache: options.forceRefresh || false
    }
  );
}

/**
 * Compare current period with previous period for trend analysis
 */
export async function calculateAnalyticsTrends(
  clerkUserId: string,
  currentPeriod: { start: Date; end: Date },
  options: AnalyticsCalculationOptions = {}
): Promise<{
  current: FinancialAnalytics
  previous: FinancialAnalytics
  trends: {
    income_change: number
    expenses_change: number
    profit_change: number
  }
}> {
  return await calculateTrendsEngine(clerkUserId, currentPeriod, options)
}

// ==========================================
// Realtime Metrics Functions
// ==========================================


// ==========================================
// Cash Flow Monitoring Functions
// ==========================================

/**
 * Main cash flow monitoring orchestrator
 * Consolidates all monitoring logic from cash-flow-monitor.ts
 */
export async function runCashFlowMonitoring(
  clerkUserId: string,
  config: MonitoringConfig = DEFAULT_MONITORING_CONFIG
): Promise<{
  alerts: CashFlowAlert[]
  projections: CashFlowProjection[]
  summary: {
    total_alerts: number
    critical_alerts: number
    next_critical_date?: string
  }
}> {
  const alerts: CashFlowAlert[] = []
  const projections: CashFlowProjection[] = []

  // Get user data with business context
  const userProfile = await getUserData(clerkUserId)

  if (!userProfile.business_id) {
    throw new Error('No business context found')
  }

  // Create authenticated Supabase client
  const supabase = await createAuthenticatedSupabaseClient(clerkUserId)

  try {
    // 1. Check overdue receivables
    const receivableAlerts = await checkOverdueReceivables(clerkUserId, config, supabase, userProfile)
    alerts.push(...receivableAlerts)

    // 2. Check upcoming payment deadlines
    const paymentAlerts = await checkPaymentDeadlines(clerkUserId, config, supabase, userProfile)
    alerts.push(...paymentAlerts)

    // 3. Analyze currency exposure risk
    const currencyAlerts = await checkCurrencyExposure(clerkUserId, config, supabase, userProfile)
    alerts.push(...currencyAlerts)

    // 4. Generate cash flow projections
    const cashProjections = await generateCashFlowProjections(clerkUserId, supabase, userProfile)
    projections.push(...cashProjections)

    // 5. Check for potential cash shortages
    const cashAlerts = await checkCashShortageRisk(clerkUserId, projections, config)
    alerts.push(...cashAlerts)

  } catch (error) {
    console.error('[Analytics Service] Error in cash flow monitoring:', error)
    throw error
  }

  // Calculate summary
  const criticalAlerts = alerts.filter(a => a.severity === 'critical')
  const nextCriticalDate = alerts
    .filter(a => a.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0]?.due_date

  const summary = {
    total_alerts: alerts.length,
    critical_alerts: criticalAlerts.length,
    next_critical_date: nextCriticalDate
  }

  return {
    alerts,
    projections,
    summary
  }
}

/**
 * Check for overdue receivables (income transactions)
 */
async function checkOverdueReceivables(
  clerkUserId: string,
  config: MonitoringConfig,
  supabase: any,
  userProfile: any
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = []

  // Fetch income transactions that are overdue
  const { data: receivables, error } = await supabase
    .from('accounting_entries')
    .select('*')
    .eq('user_id', userProfile.id)
    .eq('business_id', userProfile.business_id)
    .eq('transaction_type', 'Income')
    .in('status', ['pending', 'awaiting_payment', 'overdue'])

  if (error) {
    console.error('[Analytics Service] Error fetching receivables:', error)
    return alerts
  }

  if (!receivables || receivables.length === 0) {
    return alerts
  }

  const currentDate = new Date()

  for (const receivable of receivables) {
    const dueDate = receivable.due_date ? new Date(receivable.due_date) : null
    const transactionDate = new Date(receivable.transaction_date)

    // Default to 30 days payment terms if no due date
    const effectiveDueDate = dueDate || new Date(transactionDate.getTime() + (30 * 24 * 60 * 60 * 1000))

    const daysPastDue = Math.floor((currentDate.getTime() - effectiveDueDate.getTime()) / (1000 * 60 * 60 * 24))

    // Only alert if past the configured threshold
    if (daysPastDue > config.receivable_aging_threshold) {
      // Calculate risk score
      const riskContext: TransactionRiskContext = {
        amount: receivable.home_currency_amount || receivable.original_amount,
        currency: receivable.home_currency || receivable.original_currency,
        daysPastDue,
        transactionType: 'income',
        paymentTerms: 30
      }

      const riskScore = calculateRiskScore(riskContext, DEFAULT_RISK_CONFIG)

      alerts.push({
        id: `receivable-${receivable.id}`,
        type: 'overdue_receivables',
        severity: riskScore.level,
        title: 'Overdue Receivable',
        description: `Payment from ${receivable.vendor_name || 'customer'} is ${daysPastDue} days overdue`,
        amount: receivable.home_currency_amount || receivable.original_amount,
        currency: receivable.home_currency || receivable.original_currency,
        due_date: effectiveDueDate.toISOString(),
        transaction_ids: [receivable.id],
        recommendation: riskScore.recommendation,
        created_at: new Date().toISOString()
      })
    }
  }

  return alerts
}

/**
 * Check for upcoming payment deadlines (expense transactions)
 */
async function checkPaymentDeadlines(
  clerkUserId: string,
  config: MonitoringConfig,
  supabase: any,
  userProfile: any
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = []

  // Fetch expense transactions with upcoming due dates
  const { data: payables, error } = await supabase
    .from('accounting_entries')
    .select('*')
    .eq('user_id', userProfile.id)
    .eq('business_id', userProfile.business_id)
    .eq('transaction_type', 'Expense')
    .in('status', ['pending', 'awaiting_payment'])

  if (error) {
    console.error('[Analytics Service] Error fetching payables:', error)
    return alerts
  }

  if (!payables || payables.length === 0) {
    return alerts
  }

  const currentDate = new Date()
  const windowDate = new Date(currentDate.getTime() + (config.payment_deadline_window * 24 * 60 * 60 * 1000))

  for (const payable of payables) {
    const dueDate = payable.due_date ? new Date(payable.due_date) : null

    if (!dueDate) continue

    // Alert if due date is within the configured window
    if (dueDate <= windowDate && dueDate >= currentDate) {
      const daysUntilDue = Math.floor((dueDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))

      alerts.push({
        id: `payment-${payable.id}`,
        type: 'payment_deadline',
        severity: daysUntilDue <= 3 ? 'high' : 'medium',
        title: 'Upcoming Payment Due',
        description: `Payment to ${payable.vendor_name || 'vendor'} due in ${daysUntilDue} days`,
        amount: payable.home_currency_amount || payable.original_amount,
        currency: payable.home_currency || payable.original_currency,
        due_date: dueDate.toISOString(),
        transaction_ids: [payable.id],
        recommendation: `Schedule payment to maintain supplier relationships`,
        created_at: new Date().toISOString()
      })
    }
  }

  return alerts
}

/**
 * Check currency exposure concentration risk
 */
async function checkCurrencyExposure(
  clerkUserId: string,
  config: MonitoringConfig,
  supabase: any,
  userProfile: any
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = []

  // Fetch all active transactions
  const { data: transactions, error } = await supabase
    .from('accounting_entries')
    .select('original_currency, home_currency_amount, original_amount')
    .eq('user_id', userProfile.id)
    .eq('business_id', userProfile.business_id)
    .in('status', ['pending', 'awaiting_payment'])

  if (error) {
    console.error('[Analytics Service] Error fetching transactions:', error)
    return alerts
  }

  if (!transactions || transactions.length === 0) {
    return alerts
  }

  // Calculate currency breakdown
  const currencyTotals: Record<string, number> = {}
  let totalAmount = 0

  for (const txn of transactions) {
    const amount = Math.abs(txn.home_currency_amount || txn.original_amount || 0)
    const currency = txn.original_currency

    if (!currencyTotals[currency]) {
      currencyTotals[currency] = 0
    }

    currencyTotals[currency] += amount
    totalAmount += amount
  }

  // Check if any currency exceeds threshold
  for (const [currency, amount] of Object.entries(currencyTotals)) {
    const percentage = (amount / totalAmount) * 100

    if (percentage > config.currency_exposure_threshold) {
      alerts.push({
        id: `currency-${currency}`,
        type: 'currency_exposure',
        severity: percentage > 70 ? 'high' : 'medium',
        title: 'High Currency Concentration',
        description: `${percentage.toFixed(1)}% of outstanding transactions are in ${currency}`,
        amount,
        currency: currency as SupportedCurrency,
        recommendation: `Consider diversifying currency exposure to reduce foreign exchange risk`,
        created_at: new Date().toISOString()
      })
    }
  }

  return alerts
}

/**
 * Generate cash flow projections (7, 30, 90 days)
 */
async function generateCashFlowProjections(
  clerkUserId: string,
  supabase: any,
  userProfile: any
): Promise<CashFlowProjection[]> {
  const projections: CashFlowProjection[] = []

  const currentDate = new Date()
  const periods = [
    { days: 7, period: '7_day' as const, label: '7-Day Projection' },
    { days: 30, period: '30_day' as const, label: '30-Day Projection' },
    { days: 90, period: '90_day' as const, label: '90-Day Projection' }
  ]

  for (const { days, period, label } of periods) {
    const periodEnd = new Date(currentDate.getTime() + (days * 24 * 60 * 60 * 1000))

    // Fetch transactions with due dates in this period
    const { data: transactions, error } = await supabase
      .from('accounting_entries')
      .select('transaction_type, home_currency_amount, original_amount, due_date')
      .eq('user_id', userProfile.id)
      .eq('business_id', userProfile.business_id)
      .gte('due_date', currentDate.toISOString().split('T')[0])
      .lte('due_date', periodEnd.toISOString().split('T')[0])

    if (error) {
      console.error('[Analytics Service] Error fetching projection data:', error)
      continue
    }

    let projectedInflows = 0
    let projectedOutflows = 0

    if (transactions) {
      for (const txn of transactions) {
        const amount = Math.abs(txn.home_currency_amount || txn.original_amount || 0)

        if (txn.transaction_type === 'Income') {
          projectedInflows += amount
        } else {
          projectedOutflows += amount
        }
      }
    }

    projections.push({
      period,
      period_label: label,
      period_start: currentDate.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
      projected_inflows: projectedInflows,
      projected_outflows: projectedOutflows,
      net_cash_flow: projectedInflows - projectedOutflows,
      confidence_level: days <= 7 ? 'high' : days <= 30 ? 'medium' : 'low',
      currency: userProfile.home_currency || 'SGD'
    })
  }

  return projections
}

/**
 * Check for potential cash shortage risk
 */
async function checkCashShortageRisk(
  clerkUserId: string,
  projections: CashFlowProjection[],
  config: MonitoringConfig
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = []

  // Check each projection for negative cash flow
  for (const projection of projections) {
    if (projection.net_cash_flow < 0) {
      const severity = projection.period === '7_day' ? 'critical' :
                      projection.period === '30_day' ? 'high' : 'medium'

      alerts.push({
        id: `cash-shortage-${projection.period}`,
        type: 'cash_shortage',
        severity,
        title: 'Potential Cash Shortage',
        description: `Projected negative cash flow of ${Math.abs(projection.net_cash_flow).toFixed(2)} ${projection.currency} in ${projection.period_label}`,
        amount: Math.abs(projection.net_cash_flow),
        currency: projection.currency,
        recommendation: `Review upcoming expenses and accelerate receivables collection`,
        created_at: new Date().toISOString()
      })
    }
  }

  return alerts
}
