/**
 * Financial Analytics Engine
 * Calculates business metrics for Southeast Asian SME cross-border operations
 *
 * Migrated to Convex from Supabase
 * Uses Convex queries for all database operations
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { SupportedCurrency } from '@/lib/types/currency'
import { AgedReceivables, AgedPayables } from '@/domains/analytics/types/analytics'
import { calculateRiskScore, TransactionRiskContext, RiskScore, DEFAULT_RISK_CONFIG } from './risk-scoring'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('Analytics:Engine')

export interface EnhancedAgedReceivables extends AgedReceivables {
  risk_distribution: {
    low: number
    medium: number
    high: number
    critical: number
  }
  average_risk_score: number
  high_risk_transactions: number
}

export interface EnhancedAgedPayables extends AgedPayables {
  risk_distribution: {
    low: number
    medium: number
    high: number
    critical: number
  }
  average_risk_score: number
  high_risk_transactions: number
}

export interface ComplianceAlert {
  transaction_id: string
  compliance_status: 'requires_attention' | 'non_compliant'
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  description: string
  vendor_name?: string
  original_amount: number
  original_currency: string
  recommendations: string[]
}

export interface FinancialAnalytics {
  id?: string
  user_id: string
  period_start: Date
  period_end: Date
  total_income: number
  total_expenses: number
  net_profit: number
  transaction_count: number
  currency_breakdown: Record<string, number>
  category_breakdown: Record<string, number>
  aged_receivables: EnhancedAgedReceivables
  aged_payables: EnhancedAgedPayables
  compliance_alerts: ComplianceAlert[]
  calculated_at: Date
}

export interface AnalyticsCalculationOptions {
  homeCurrency?: SupportedCurrency
  forceRefresh?: boolean
}

/**
 * Get user data including business context for secure analytics
 */
async function getUserDataForAnalytics(clerkUserId: string): Promise<{ convexUserId: string; businessId: string }> {
  log.debug('Getting user data for analytics:', clerkUserId)

  try {
    const userProfile = await ensureUserProfile(clerkUserId)

    if (!userProfile || !userProfile.business_id) {
      throw new Error(`User missing business context`)
    }

    log.debug('Successfully retrieved user data', {
      hasBusinessId: !!userProfile.business_id,
      role: userProfile.role
    })

    return {
      convexUserId: userProfile.id,
      businessId: userProfile.business_id
    }
  } catch (error) {
    log.error('Failed to get user data for analytics:', error)
    throw new Error(`Failed to resolve user for analytics: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Calculate comprehensive financial analytics using Convex queries
 * Uses optimized Convex queries for all database operations
 */
export async function calculateFinancialAnalytics(
  clerkUserId: string,
  periodStart: Date,
  periodEnd: Date,
  options: AnalyticsCalculationOptions = {}
): Promise<FinancialAnalytics> {
  const { homeCurrency = 'SGD', forceRefresh = false } = options

  log.debug('Starting analytics calculation', {
    period: `${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`,
    homeCurrency
  })

  // Get user data with business context
  const userData = await getUserDataForAnalytics(clerkUserId)
  const { convexUserId, businessId } = userData

  // Get Convex client
  const { client: convexClient } = await getAuthenticatedConvex()
  if (!convexClient) {
    throw new Error('Failed to get Convex client')
  }

  try {
    // Get dashboard analytics from Convex
    log.debug('Calling Convex getDashboardAnalytics query')

    const dashboardResult = await convexClient.query(api.functions.analytics.getDashboardAnalytics, {
      businessId: businessId as any,
      startDate: periodStart.toISOString().split('T')[0],
      endDate: periodEnd.toISOString().split('T')[0]
    })

    if (!dashboardResult) {
      log.debug('No data returned from Convex query')
      return createEmptyAnalytics(convexUserId, periodStart, periodEnd)
    }

    log.debug('Convex query completed', {
      totalIncome: dashboardResult.totalIncome,
      totalExpenses: dashboardResult.totalExpenses,
      transactionCount: dashboardResult.transactionCount
    })

    // Get aged receivables
    const receivablesResult = await convexClient.query(api.functions.analytics.getAgedReceivables, {
      businessId: businessId as any
    })

    // Get aged payables
    const payablesResult = await convexClient.query(api.functions.analytics.getAgedPayables, {
      businessId: businessId as any
    })

    // Transform Convex results to expected FinancialAnalytics interface
    const analytics: FinancialAnalytics = {
      user_id: convexUserId,
      period_start: periodStart,
      period_end: periodEnd,
      total_income: dashboardResult.totalIncome || 0,
      total_expenses: dashboardResult.totalExpenses || 0,
      net_profit: dashboardResult.netProfit || 0,
      transaction_count: dashboardResult.transactionCount || 0,
      currency_breakdown: dashboardResult.currencyBreakdown || {},
      category_breakdown: dashboardResult.categoryBreakdown || {},

      // Enhanced aged receivables with risk distribution
      aged_receivables: receivablesResult ? {
        current: receivablesResult.current || 0,
        late_31_60: receivablesResult.late31_60 || 0,
        late_61_90: receivablesResult.late61_90 || 0,
        late_90_plus: receivablesResult.late90Plus || 0,
        total_outstanding: receivablesResult.totalOutstanding || 0,
        risk_distribution: receivablesResult.riskDistribution || { low: 0, medium: 0, high: 0, critical: 0 },
        average_risk_score: receivablesResult.averageRiskScore || 0,
        high_risk_transactions: receivablesResult.highRiskTransactions || 0
      } : {
        current: 0,
        late_31_60: 0,
        late_61_90: 0,
        late_90_plus: 0,
        total_outstanding: 0,
        risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
        average_risk_score: 0,
        high_risk_transactions: 0
      },

      // Enhanced aged payables with risk distribution
      aged_payables: payablesResult ? {
        current: payablesResult.current || 0,
        late_31_60: payablesResult.late31_60 || 0,
        late_61_90: payablesResult.late61_90 || 0,
        late_90_plus: payablesResult.late90Plus || 0,
        total_outstanding: payablesResult.totalOutstanding || 0,
        risk_distribution: payablesResult.riskDistribution || { low: 0, medium: 0, high: 0, critical: 0 },
        average_risk_score: payablesResult.averageRiskScore || 0,
        high_risk_transactions: payablesResult.highRiskTransactions || 0
      } : {
        current: 0,
        late_31_60: 0,
        late_61_90: 0,
        late_90_plus: 0,
        total_outstanding: 0,
        risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
        average_risk_score: 0,
        high_risk_transactions: 0
      },

      // Compliance alerts (empty for now - can be enhanced later)
      compliance_alerts: [],

      calculated_at: new Date()
    }

    log.debug('Analytics calculation complete', {
      total_income: analytics.total_income,
      total_expenses: analytics.total_expenses,
      net_profit: analytics.net_profit,
      transaction_count: analytics.transaction_count
    })

    return analytics

  } catch (error) {
    log.error('Error in analytics calculation:', error)
    throw error
  }
}

/**
 * Create empty analytics structure for periods with no data
 */
function createEmptyAnalytics(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): FinancialAnalytics {
  return {
    user_id: userId,
    period_start: periodStart,
    period_end: periodEnd,
    total_income: 0,
    total_expenses: 0,
    net_profit: 0,
    transaction_count: 0,
    currency_breakdown: {},
    category_breakdown: {},
    aged_receivables: {
      current: 0,
      late_31_60: 0,
      late_61_90: 0,
      late_90_plus: 0,
      total_outstanding: 0,
      risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
      average_risk_score: 0,
      high_risk_transactions: 0
    },
    aged_payables: {
      current: 0,
      late_31_60: 0,
      late_61_90: 0,
      late_90_plus: 0,
      total_outstanding: 0,
      risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
      average_risk_score: 0,
      high_risk_transactions: 0
    },
    compliance_alerts: [],
    calculated_at: new Date()
  }
}

/**
 * Generate date ranges for common periods
 */
export function getAnalyticsPeriod(period: 'month' | 'quarter' | 'year', date?: Date): { start: Date; end: Date } {
  const now = date || new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  switch (period) {
    case 'month':
      // "Last 60 Days" - rolling 60-day window ending today
      const sixtyDaysAgo = new Date(now)
      sixtyDaysAgo.setDate(now.getDate() - 60)
      return {
        start: sixtyDaysAgo,
        end: now
      }

    case 'quarter':
      const quarterStart = Math.floor(month / 3) * 3
      return {
        start: new Date(year, quarterStart, 1),
        end: new Date(year, quarterStart + 3, 0) // Last day of quarter
      }

    case 'year':
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31)
      }

    default:
      throw new Error(`Invalid period: ${period}`)
  }
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
  log.debug('Starting trends calculation')

  // Calculate period length to determine previous period
  const periodLength = currentPeriod.end.getTime() - currentPeriod.start.getTime()
  const previousStart = new Date(currentPeriod.start.getTime() - periodLength)
  const previousEnd = new Date(currentPeriod.end.getTime() - periodLength)

  // Calculate analytics for both periods in parallel
  const [current, previous] = await Promise.all([
    calculateFinancialAnalytics(clerkUserId, currentPeriod.start, currentPeriod.end, options),
    calculateFinancialAnalytics(clerkUserId, previousStart, previousEnd, options)
  ])

  const trends = {
    income_change: previous.total_income > 0
      ? ((current.total_income - previous.total_income) / previous.total_income) * 100
      : 0,
    expenses_change: previous.total_expenses > 0
      ? ((current.total_expenses - previous.total_expenses) / previous.total_expenses) * 100
      : 0,
    profit_change: previous.net_profit !== 0
      ? ((current.net_profit - previous.net_profit) / Math.abs(previous.net_profit)) * 100
      : 0
  }

  log.debug('Trends calculation completed', {
    income_change: trends.income_change.toFixed(2) + '%',
    expenses_change: trends.expenses_change.toFixed(2) + '%',
    profit_change: trends.profit_change.toFixed(2) + '%'
  })

  return { current, previous, trends }
}
