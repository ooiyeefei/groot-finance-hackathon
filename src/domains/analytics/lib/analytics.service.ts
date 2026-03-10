/**
 * Analytics Service - Unified business logic for financial analytics domain
 *
 * North Star Architecture:
 * - Consolidated analytics, realtime metrics, and cash flow monitoring
 * - Reuses existing analytics engine and risk-scoring logic
 * - Multi-tenant security with business_id isolation
 * - Performance optimization with Convex queries
 *
 * Migrated to Convex from Supabase
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { SupportedCurrency } from '@/domains/accounting-entries/types'
import {
  calculateFinancialAnalytics as calculateAnalyticsEngine,
  calculateAnalyticsTrends as calculateTrendsEngine,
  FinancialAnalytics,
  AnalyticsCalculationOptions
} from '@/domains/analytics/lib/engine'
import { calculateRiskScore, TransactionRiskContext, DEFAULT_RISK_CONFIG } from '@/domains/analytics/lib/risk-scoring'
import { withCache, CACHE_TTL } from '@/lib/cache/api-cache'
import { currencyService } from '@/lib/services/currency-service'

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
// Currency Conversion Helpers
// ==========================================

/**
 * Convert analytics amounts from source currency to target currency
 * Used when user's preferred display currency differs from business's home currency
 */
async function convertAnalyticsCurrency(
  analytics: FinancialAnalytics,
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency
): Promise<FinancialAnalytics> {
  if (fromCurrency === toCurrency) {
    return analytics
  }

  console.log(`[Analytics Service] Converting analytics from ${fromCurrency} to ${toCurrency}`)

  try {
    const rate = await currencyService.getCurrentRate(fromCurrency, toCurrency)

    // Helper to convert a number
    const convert = (amount: number): number => {
      return Number((amount * rate).toFixed(2))
    }

    // Convert main metrics
    const converted: FinancialAnalytics = {
      ...analytics,
      total_income: convert(analytics.total_income),
      total_expenses: convert(analytics.total_expenses),
      net_profit: convert(analytics.net_profit),

      // Convert aged receivables
      aged_receivables: {
        ...analytics.aged_receivables,
        current: convert(analytics.aged_receivables.current),
        late_31_60: convert(analytics.aged_receivables.late_31_60),
        late_61_90: convert(analytics.aged_receivables.late_61_90),
        late_90_plus: convert(analytics.aged_receivables.late_90_plus),
        total_outstanding: convert(analytics.aged_receivables.total_outstanding),
      },

      // Convert aged payables
      aged_payables: {
        ...analytics.aged_payables,
        current: convert(analytics.aged_payables.current),
        late_31_60: convert(analytics.aged_payables.late_31_60),
        late_61_90: convert(analytics.aged_payables.late_61_90),
        late_90_plus: convert(analytics.aged_payables.late_90_plus),
        total_outstanding: convert(analytics.aged_payables.total_outstanding),
      },

      // Note: currency_breakdown and category_breakdown are already in various currencies
      // They show the original currency distribution, so we keep them as-is
    }

    console.log(`[Analytics Service] Conversion complete. Rate: ${rate} ${fromCurrency}→${toCurrency}`)
    return converted
  } catch (error) {
    console.error('[Analytics Service] Currency conversion failed:', error)
    // Return unconverted data rather than failing completely
    return analytics
  }
}

/**
 * Get business's home currency from Convex
 */
async function getBusinessHomeCurrency(businessId: string): Promise<SupportedCurrency> {
  try {
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.warn('[Analytics Service] No Convex client, defaulting to SGD')
      return 'SGD'
    }

    const businessProfile = await client.query(api.functions.businesses.getBusinessProfileByStringId, {
      businessId
    })

    return (businessProfile?.home_currency as SupportedCurrency) || 'MYR'
  } catch (error) {
    console.error('[Analytics Service] Failed to get business currency:', error)
    return 'SGD'
  }
}

// ==========================================
// Dashboard Analytics Functions
// ==========================================

/**
 * Calculate comprehensive financial analytics for dashboard
 * Delegates to analytics engine with security and caching
 *
 * Currency Flow:
 * 1. Convex returns data in business's home currency
 * 2. If user's preferred currency differs, we convert the amounts
 * 3. This allows users to view dashboards in their preferred currency
 */
export async function calculateFinancialAnalytics(
  clerkUserId: string,
  periodStart: Date,
  periodEnd: Date,
  options: AnalyticsCalculationOptions = {}
): Promise<FinancialAnalytics> {
  const targetCurrency = options.homeCurrency || 'MYR'

  // Get user profile to find their business ID
  const userProfile = await ensureUserProfile(clerkUserId)
  if (!userProfile || !userProfile.business_id) {
    throw new Error('No business context found')
  }

  // Get the business's actual home currency (what Convex returns data in)
  const businessCurrency = await getBusinessHomeCurrency(userProfile.business_id)

  // Determine cache key - include both currencies for proper caching
  const cacheParams = {
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    businessCurrency,
    targetCurrency
  }

  // Cache analytics results since they're expensive to calculate
  return await withCache(
    clerkUserId,
    'dashboard-analytics',
    async () => {
      // Calculate analytics in business currency
      const analytics = await calculateAnalyticsEngine(clerkUserId, periodStart, periodEnd, {
        ...options,
        homeCurrency: businessCurrency // Engine calculates in business currency
      })

      // Convert to user's preferred currency if different
      if (targetCurrency !== businessCurrency) {
        return await convertAnalyticsCurrency(analytics, businessCurrency, targetCurrency)
      }

      return analytics
    },
    {
      params: cacheParams,
      ttlMs: CACHE_TTL.DASHBOARD_ANALYTICS,
      skipCache: options.forceRefresh || false
    }
  );
}

/**
 * Compare current period with previous period for trend analysis
 *
 * Currency Flow:
 * 1. Engine returns data in business's home currency
 * 2. If user's preferred currency differs, we convert the amounts
 * 3. Trends (percentage changes) are calculated BEFORE conversion (same currency)
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
  const targetCurrency = options.homeCurrency || 'MYR'

  // Get user profile to find their business ID
  const userProfile = await ensureUserProfile(clerkUserId)
  if (!userProfile || !userProfile.business_id) {
    throw new Error('No business context found')
  }

  // Get the business's actual home currency (what Convex returns data in)
  const businessCurrency = await getBusinessHomeCurrency(userProfile.business_id)

  // Get raw analytics from engine (in business currency)
  // Pass businessCurrency to engine so trends are calculated in same currency
  const engineResult = await calculateTrendsEngine(clerkUserId, currentPeriod, {
    ...options,
    homeCurrency: businessCurrency
  })

  // Convert to user's preferred currency if different
  if (targetCurrency !== businessCurrency) {
    console.log(`[Analytics Service] Converting trends from ${businessCurrency} to ${targetCurrency}`)

    const [convertedCurrent, convertedPrevious] = await Promise.all([
      convertAnalyticsCurrency(engineResult.current, businessCurrency, targetCurrency),
      convertAnalyticsCurrency(engineResult.previous, businessCurrency, targetCurrency)
    ])

    return {
      current: convertedCurrent,
      previous: convertedPrevious,
      trends: engineResult.trends // Trends are percentages, no conversion needed
    }
  }

  return engineResult
}

// ==========================================
// Cash Flow Monitoring Functions
// ==========================================

/**
 * Main cash flow monitoring orchestrator
 * Uses Convex queries for all database operations
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

  // Get user profile with business context
  const userProfile = await ensureUserProfile(clerkUserId)
  if (!userProfile || !userProfile.business_id) {
    throw new Error('No business context found')
  }

  const homeCurrency = userProfile.home_currency || 'MYR'

  // Get Convex client
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  try {
    // 1. Check overdue receivables
    const receivableAlerts = await checkOverdueReceivables(
      config,
      convexClient,
      userProfile.business_id,
      homeCurrency
    )
    alerts.push(...receivableAlerts)

    // 2. Check upcoming payment deadlines
    const paymentAlerts = await checkPaymentDeadlines(
      config,
      convexClient,
      userProfile.business_id,
      homeCurrency
    )
    alerts.push(...paymentAlerts)

    // 3. Analyze currency exposure risk
    const currencyAlerts = await checkCurrencyExposure(
      config,
      convexClient,
      userProfile.business_id
    )
    alerts.push(...currencyAlerts)

    // 4. Generate cash flow projections
    const cashProjections = await generateCashFlowProjections(
      convexClient,
      userProfile.business_id,
      homeCurrency
    )
    projections.push(...cashProjections)

    // 5. Check for potential cash shortages
    const cashAlerts = checkCashShortageRisk(projections, config)
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
 * Check for overdue receivables using Convex query
 */
async function checkOverdueReceivables(
  config: MonitoringConfig,
  convexClient: any,
  businessId: string,
  homeCurrency: string
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = []

  // Fetch overdue receivables via Convex
  const overdueItems = await convexClient.query(api.functions.analytics.getOverdueReceivables, {
    businessId: businessId as any,
    agingThresholdDays: config.receivable_aging_threshold
  })

  if (!overdueItems || overdueItems.length === 0) {
    return alerts
  }

  for (const item of overdueItems) {
    // Calculate risk score
    const riskContext: TransactionRiskContext = {
      amount: item.amount,
      currency: item.currency as SupportedCurrency,
      daysPastDue: item.daysPastDue,
      transactionType: 'income',
      paymentTerms: 30
    }

    const riskScore = calculateRiskScore(riskContext, DEFAULT_RISK_CONFIG)

    alerts.push({
      id: `receivable-${item.id}`,
      type: 'overdue_receivables',
      severity: riskScore.level,
      title: 'Overdue Receivable',
      description: `Payment from ${item.vendorName || 'customer'} is ${item.daysPastDue} days overdue`,
      amount: item.amount,
      currency: item.currency as SupportedCurrency,
      due_date: item.dueDate,
      transaction_ids: [item.id],
      recommendation: riskScore.recommendation,
      created_at: new Date().toISOString()
    })
  }

  return alerts
}

/**
 * Check for upcoming payment deadlines using Convex query
 */
async function checkPaymentDeadlines(
  config: MonitoringConfig,
  convexClient: any,
  businessId: string,
  homeCurrency: string
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = []

  // Fetch upcoming payments via Convex
  const upcomingPayments = await convexClient.query(api.functions.analytics.getUpcomingPayments, {
    businessId: businessId as any,
    windowDays: config.payment_deadline_window
  })

  if (!upcomingPayments || upcomingPayments.length === 0) {
    return alerts
  }

  for (const payment of upcomingPayments) {
    alerts.push({
      id: `payment-${payment.id}`,
      type: 'payment_deadline',
      severity: payment.daysUntilDue <= 3 ? 'high' : 'medium',
      title: 'Upcoming Payment Due',
      description: `Payment to ${payment.vendorName || 'vendor'} due in ${payment.daysUntilDue} days`,
      amount: payment.amount,
      currency: payment.currency as SupportedCurrency,
      due_date: payment.dueDate,
      transaction_ids: [payment.id],
      recommendation: `Schedule payment to maintain supplier relationships`,
      created_at: new Date().toISOString()
    })
  }

  return alerts
}

/**
 * Check currency exposure concentration risk using Convex query
 */
async function checkCurrencyExposure(
  config: MonitoringConfig,
  convexClient: any,
  businessId: string
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = []

  // Fetch currency exposure via Convex
  const exposureData = await convexClient.query(api.functions.analytics.getCurrencyExposure, {
    businessId: businessId as any
  })

  if (!exposureData || !exposureData.currencyExposure || exposureData.currencyExposure.length === 0) {
    return alerts
  }

  // Check if any currency exceeds threshold
  for (const exposure of exposureData.currencyExposure) {
    if (exposure.percentage > config.currency_exposure_threshold) {
      alerts.push({
        id: `currency-${exposure.currency}`,
        type: 'currency_exposure',
        severity: exposure.percentage > 70 ? 'high' : 'medium',
        title: 'High Currency Concentration',
        description: `${exposure.percentage.toFixed(1)}% of outstanding transactions are in ${exposure.currency}`,
        amount: exposure.amount,
        currency: exposure.currency as SupportedCurrency,
        recommendation: `Consider diversifying currency exposure to reduce foreign exchange risk`,
        created_at: new Date().toISOString()
      })
    }
  }

  return alerts
}

/**
 * Generate cash flow projections using Convex queries
 */
async function generateCashFlowProjections(
  convexClient: any,
  businessId: string,
  homeCurrency: string
): Promise<CashFlowProjection[]> {
  const projections: CashFlowProjection[] = []

  const periods = [
    { days: 7, period: '7_day' as const, label: '7-Day Projection' },
    { days: 30, period: '30_day' as const, label: '30-Day Projection' },
    { days: 90, period: '90_day' as const, label: '90-Day Projection' }
  ]

  for (const { days, period, label } of periods) {
    const projectionData = await convexClient.query(api.functions.analytics.getCashFlowProjection, {
      businessId: businessId as any,
      periodDays: days
    })

    if (projectionData) {
      projections.push({
        period,
        period_label: label,
        period_start: projectionData.periodStart,
        period_end: projectionData.periodEnd,
        projected_inflows: projectionData.projectedInflows,
        projected_outflows: projectionData.projectedOutflows,
        net_cash_flow: projectionData.netCashFlow,
        confidence_level: days <= 7 ? 'high' : days <= 30 ? 'medium' : 'low',
        currency: (projectionData.currency || homeCurrency) as SupportedCurrency
      })
    }
  }

  return projections
}

/**
 * Check for potential cash shortage risk (pure calculation - no DB access)
 */
function checkCashShortageRisk(
  projections: CashFlowProjection[],
  config: MonitoringConfig
): CashFlowAlert[] {
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
