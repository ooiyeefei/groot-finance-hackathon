/**
 * forecast_cash_flow MCP Tool Implementation
 *
 * Projects future cash balance based on historical income/expense patterns.
 * Wraps the existing Convex insights:forecastCashFlow algorithm.
 */

import { getConvexClient, ConvexError } from '../lib/convex-client.js';
import { validateBusinessAccess, type AuthContext } from '../lib/auth.js';
import type {
  ForecastCashFlowInput,
  ForecastCashFlowOutput,
  ForecastDay,
  CashFlowAlert,
  MCPErrorResponse,
} from '../contracts/mcp-tools.js';

interface AccountingEntry {
  _id: string;
  businessId: string;
  transactionType: string;
  transactionDate?: string;
  dueDate?: string;
  status?: string;
  originalAmount?: number;
  homeCurrencyAmount?: number;
  deletedAt?: number;
}

/**
 * Execute forecast_cash_flow tool
 *
 * @param args - Tool arguments (may include business_id for backward compatibility)
 * @param authContext - Authentication context from API key (preferred source of businessId)
 */
export async function forecastCashFlow(
  args: Record<string, unknown>,
  authContext?: AuthContext
): Promise<ForecastCashFlowOutput | MCPErrorResponse> {
  // Type-safe input parsing
  const input = args as ForecastCashFlowInput;

  // Use businessId from auth context if available (API key auth)
  // Fall back to args.business_id for backward compatibility
  let businessId: string;

  if (authContext?.businessId) {
    businessId = authContext.businessId;
  } else {
    const authResult = validateBusinessAccess(input.business_id);
    if (!authResult.authorized) {
      return {
        error: true,
        code: authResult.error!.code as MCPErrorResponse['code'],
        message: authResult.error!.message,
      };
    }
    businessId = authResult.businessId!;
  }
  const horizonDays = input.horizon_days || 30;
  const scenario = input.scenario || 'moderate';
  const includeRecurring = input.include_recurring !== false;

  try {
    const convex = getConvexClient();

    // Query accounting entries for the business
    const entries = await convex.query<AccountingEntry[]>(
      'functions/financialIntelligence:getMcpAccountingEntries',
      { businessId }
    );

    if (!entries || entries.length === 0) {
      return {
        error: true,
        code: 'INSUFFICIENT_DATA',
        message: 'No transactions found for this business',
        details: { businessId },
      };
    }

    const activeEntries = entries.filter(e => !e.deletedAt);

    // Calculate current balance
    let currentBalance = activeEntries.reduce((balance, entry) => {
      const amount = entry.homeCurrencyAmount || entry.originalAmount || 0;
      if (entry.transactionType === 'Income') {
        return balance + amount;
      } else {
        return balance - Math.abs(amount);
      }
    }, 0);

    // Get historical averages (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

    const recentEntries = activeEntries.filter(e =>
      e.transactionDate && e.transactionDate >= ninetyDaysAgoStr
    );

    const totalIncome = recentEntries
      .filter(e => e.transactionType === 'Income')
      .reduce((sum, e) => sum + (e.homeCurrencyAmount || e.originalAmount || 0), 0);

    const totalExpenses = recentEntries
      .filter(e => e.transactionType === 'Expense')
      .reduce((sum, e) => sum + Math.abs(e.homeCurrencyAmount || e.originalAmount || 0), 0);

    // Calculate daily averages
    let dailyIncome = totalIncome / 90;
    let dailyExpenses = totalExpenses / 90;

    // Apply scenario adjustments
    switch (scenario) {
      case 'conservative':
        dailyIncome *= 0.8;
        dailyExpenses *= 1.2;
        break;
      case 'optimistic':
        dailyIncome *= 1.2;
        dailyExpenses *= 0.8;
        break;
      // 'moderate' uses base averages
    }

    // Get pending payments (upcoming expenses)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const pendingPayments = activeEntries.filter(e =>
      e.status !== 'paid' &&
      e.dueDate &&
      e.dueDate >= todayStr &&
      (e.transactionType === 'Expense' || e.transactionType === 'Cost of Goods Sold')
    ).map(e => ({
      date: e.dueDate!,
      amount: Math.abs(e.homeCurrencyAmount || e.originalAmount || 0),
    }));

    // Generate daily projections
    const forecast: ForecastDay[] = [];
    let runningBalance = currentBalance;
    const alerts: CashFlowAlert[] = [];

    // Track if we've already created a negative balance alert
    let negativeBalanceAlerted = false;

    for (let day = 1; day <= horizonDays; day++) {
      const projectionDate = new Date(today);
      projectionDate.setDate(today.getDate() + day);
      const dateStr = projectionDate.toISOString().split('T')[0];

      // Base income/expense from historical average
      let expectedIncome = dailyIncome;
      let expectedExpenses = dailyExpenses;

      // Add known payments due on this day
      const duePayments = pendingPayments.filter(p => p.date === dateStr);
      for (const payment of duePayments) {
        expectedExpenses += payment.amount;
      }

      runningBalance = runningBalance + expectedIncome - expectedExpenses;

      // Confidence decreases with time
      const confidence: 'high' | 'medium' | 'low' =
        day <= 7 ? 'high' : day <= 14 ? 'medium' : 'low';

      forecast.push({
        date: dateStr,
        projected_balance: Math.round(runningBalance),
        projected_income: Math.round(expectedIncome),
        projected_expenses: Math.round(expectedExpenses),
        confidence,
      });

      // Check for negative balance alert
      if (runningBalance < 0 && !negativeBalanceAlerted) {
        alerts.push({
          type: 'negative_balance',
          severity: day <= 7 ? 'critical' : 'warning',
          date: dateStr,
          message: `Projected negative balance of ${Math.round(runningBalance).toLocaleString()} by ${dateStr}`,
          recommendation: 'Consider reducing discretionary spending or accelerating receivables',
        });
        negativeBalanceAlerted = true;
      }
    }

    // Calculate summary metrics
    const totalProjectedIncome = dailyIncome * horizonDays;
    const baseProjectedExpenses = dailyExpenses * horizonDays;
    const pendingTotal = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalProjectedExpenses = baseProjectedExpenses + pendingTotal;
    const netChange = totalProjectedIncome - totalProjectedExpenses;
    const burnRateDaily = dailyExpenses;
    const projectedEndBalance = currentBalance + netChange;

    // Calculate runway
    let runwayDays: number | undefined;
    if (burnRateDaily > dailyIncome && currentBalance > 0) {
      const netBurnRate = burnRateDaily - dailyIncome;
      runwayDays = Math.ceil(currentBalance / netBurnRate);
    }

    // Check for high burn rate alert
    if (totalIncome > 0) {
      const burnRatio = totalExpenses / totalIncome;
      if (burnRatio > 1.5) {
        alerts.push({
          type: 'high_burn_rate',
          severity: burnRatio > 2 ? 'critical' : 'warning',
          message: `Expenses are ${Math.round(burnRatio * 100)}% of income over the last 90 days`,
          recommendation: 'Review expense categories to identify cost reduction opportunities',
        });
      }
    }

    // Check for low runway alert
    if (runwayDays !== undefined && runwayDays <= 30) {
      alerts.push({
        type: 'low_runway',
        severity: runwayDays <= 14 ? 'critical' : 'warning',
        message: `At current burn rate, runway is approximately ${runwayDays} days`,
        recommendation: 'Urgent action needed to extend financial runway',
      });
    }

    return {
      forecast,
      alerts,
      summary: {
        current_balance: Math.round(currentBalance),
        projected_end_balance: Math.round(projectedEndBalance),
        total_projected_income: Math.round(totalProjectedIncome),
        total_projected_expenses: Math.round(totalProjectedExpenses),
        net_change: Math.round(netChange),
        burn_rate_daily: Math.round(burnRateDaily),
        runway_days: runwayDays,
        scenario_used: scenario,
        horizon_days: horizonDays,
      },
    };
  } catch (error) {
    console.error('[forecast_cash_flow] Error:', error);

    if (error instanceof ConvexError) {
      return {
        error: true,
        code: 'CONVEX_ERROR',
        message: error.message,
      };
    }

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
