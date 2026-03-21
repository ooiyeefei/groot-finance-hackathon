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
  MonthlyForecastOutput,
  MonthlyBucket,
  ForecastRiskAlert,
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
): Promise<ForecastCashFlowOutput | MonthlyForecastOutput | MCPErrorResponse> {
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

  // If forecast_months is provided, use monthly granularity
  if (input.forecast_months || input.granularity === 'monthly') {
    return forecastMonthly(businessId, input, authContext);
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

// --- AR/AP interfaces for monthly forecast ---

interface SalesInvoice {
  _id: string;
  businessId: string;
  totalAmount?: number;
  homeCurrencyAmount?: number;
  dueDate?: string;
  paymentStatus?: string;
  status?: string;
  currency?: string;
}

interface PurchaseInvoice {
  _id: string;
  businessId: string;
  totalAmount?: number;
  homeCurrencyAmount?: number;
  dueDate?: string;
  paymentStatus?: string;
  accountingStatus?: string;
  currency?: string;
}

/**
 * Monthly granularity forecast with AR/AP awareness.
 * Projects cash balance month-by-month, incorporating known receivables and payables.
 */
async function forecastMonthly(
  businessId: string,
  input: ForecastCashFlowInput,
  _authContext?: AuthContext
): Promise<MonthlyForecastOutput | MCPErrorResponse> {
  const forecastMonths = input.forecast_months || 6;
  const scenario = input.scenario || 'moderate';
  const includeArAp = input.include_known_ar_ap !== false;

  try {
    const convex = getConvexClient();

    // 1. Get historical accounting entries
    const entries = await convex.query<AccountingEntry[]>(
      'functions/financialIntelligence:getMcpAccountingEntries',
      { businessId }
    );

    if (!entries || entries.length === 0) {
      return {
        error: true,
        code: 'INSUFFICIENT_DATA',
        message: 'No transactions found. At least 1 month of data is needed for forecasting.',
        details: { businessId },
      };
    }

    const activeEntries = entries.filter(e => !e.deletedAt);

    // 2. Calculate current balance
    const currentBalance = activeEntries.reduce((balance, entry) => {
      const amount = entry.homeCurrencyAmount || entry.originalAmount || 0;
      return entry.transactionType === 'Income'
        ? balance + amount
        : balance - Math.abs(amount);
    }, 0);

    // 3. Calculate monthly averages from historical data (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0];

    const historicalEntries = activeEntries.filter(e =>
      e.transactionDate && e.transactionDate >= sixMonthsAgoStr
    );

    // Group by month to get monthly averages
    const monthlyData = new Map<string, { income: number; expenses: number }>();
    for (const entry of historicalEntries) {
      if (!entry.transactionDate) continue;
      const monthKey = entry.transactionDate.substring(0, 7); // YYYY-MM
      const existing = monthlyData.get(monthKey) || { income: 0, expenses: 0 };
      const amount = Math.abs(entry.homeCurrencyAmount || entry.originalAmount || 0);
      if (entry.transactionType === 'Income') {
        existing.income += amount;
      } else {
        existing.expenses += amount;
      }
      monthlyData.set(monthKey, existing);
    }

    const monthCount = Math.max(monthlyData.size, 1);
    let totalHistIncome = 0;
    let totalHistExpenses = 0;
    for (const data of monthlyData.values()) {
      totalHistIncome += data.income;
      totalHistExpenses += data.expenses;
    }

    let avgMonthlyIncome = totalHistIncome / monthCount;
    let avgMonthlyExpenses = totalHistExpenses / monthCount;

    // Apply scenario adjustments
    switch (scenario) {
      case 'conservative':
        avgMonthlyIncome *= 0.8;
        avgMonthlyExpenses *= 1.2;
        break;
      case 'optimistic':
        avgMonthlyIncome *= 1.2;
        avgMonthlyExpenses *= 0.8;
        break;
    }

    // 4. Get known AR (unpaid sales invoices) and AP (posted purchase invoices)
    let arByMonth = new Map<string, number>();
    let apByMonth = new Map<string, number>();
    let totalKnownAr = 0;
    let totalKnownAp = 0;

    if (includeArAp) {
      try {
        const salesInvoices = await convex.query<SalesInvoice[]>(
          'functions/financialIntelligence:getMcpSalesInvoices',
          { businessId }
        );

        if (salesInvoices) {
          for (const inv of salesInvoices) {
            if (inv.paymentStatus === 'paid' || !inv.dueDate) continue;
            const amount = inv.homeCurrencyAmount || inv.totalAmount || 0;
            if (amount <= 0) continue;
            const monthKey = inv.dueDate.substring(0, 7);
            arByMonth.set(monthKey, (arByMonth.get(monthKey) || 0) + amount);
            totalKnownAr += amount;
          }
        }
      } catch (e) {
        console.warn('[forecast_cash_flow] Could not fetch sales invoices for AR:', e);
      }

      try {
        const purchaseInvoices = await convex.query<PurchaseInvoice[]>(
          'functions/financialIntelligence:getMcpPurchaseInvoices',
          { businessId }
        );

        if (purchaseInvoices) {
          for (const inv of purchaseInvoices) {
            if (inv.paymentStatus === 'paid' || !inv.dueDate) continue;
            const amount = inv.homeCurrencyAmount || inv.totalAmount || 0;
            if (amount <= 0) continue;
            const monthKey = inv.dueDate.substring(0, 7);
            apByMonth.set(monthKey, (apByMonth.get(monthKey) || 0) + amount);
            totalKnownAp += amount;
          }
        }
      } catch (e) {
        console.warn('[forecast_cash_flow] Could not fetch purchase invoices for AP:', e);
      }
    }

    // 5. Generate monthly forecast
    const months: MonthlyBucket[] = [];
    const riskAlerts: ForecastRiskAlert[] = [];
    let runningBalance = currentBalance;
    const today = new Date();

    for (let m = 1; m <= forecastMonths; m++) {
      const futureDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
      const monthKey = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;

      const knownArDue = arByMonth.get(monthKey) || 0;
      const knownApDue = apByMonth.get(monthKey) || 0;

      const projectedIncome = avgMonthlyIncome + knownArDue;
      const projectedExpenses = avgMonthlyExpenses + knownApDue;

      runningBalance = runningBalance + projectedIncome - projectedExpenses;

      const confidence: 'high' | 'medium' | 'low' =
        m <= 2 ? 'high' : m <= 4 ? 'medium' : 'low';

      months.push({
        month: monthKey,
        projected_income: Math.round(projectedIncome),
        projected_expenses: Math.round(projectedExpenses),
        known_ar_due: Math.round(knownArDue),
        known_ap_due: Math.round(knownApDue),
        net_balance: Math.round(runningBalance),
        confidence,
      });
    }

    // 6. Calculate runway and risk alerts
    const netMonthlyBurn = avgMonthlyExpenses - avgMonthlyIncome;
    let runwayMonths: number;
    if (netMonthlyBurn > 0 && currentBalance > 0) {
      runwayMonths = Math.round((currentBalance / netMonthlyBurn) * 10) / 10;
    } else {
      runwayMonths = forecastMonths; // Positive cash flow = at least the forecast period
    }

    // Risk: runway below 2 months of operating expenses
    const twoMonthThreshold = avgMonthlyExpenses * 2;
    if (runwayMonths < 2) {
      riskAlerts.push({
        type: 'low_runway',
        severity: runwayMonths < 1 ? 'critical' : 'warning',
        message: `Cash runway is approximately ${runwayMonths.toFixed(1)} months at current burn rate`,
        recommendation: 'Urgently review expenses and accelerate receivables collection',
      });
    }

    // Risk: negative balance in any projected month
    for (const bucket of months) {
      if (bucket.net_balance < 0) {
        riskAlerts.push({
          type: 'negative_balance',
          severity: 'critical',
          month: bucket.month,
          message: `Projected negative balance of ${bucket.net_balance.toLocaleString()} in ${bucket.month}`,
          recommendation: 'Review upcoming expenses and consider delaying non-essential payments',
        });
        break; // Only alert on first negative month
      }
    }

    // Risk: balance drops below 2-month threshold
    for (const bucket of months) {
      if (bucket.net_balance > 0 && bucket.net_balance < twoMonthThreshold) {
        riskAlerts.push({
          type: 'low_runway',
          severity: 'warning',
          month: bucket.month,
          message: `Projected balance of ${bucket.net_balance.toLocaleString()} in ${bucket.month} is below 2-month operating expenses threshold (${Math.round(twoMonthThreshold).toLocaleString()})`,
          recommendation: 'Monitor closely and prepare contingency plans',
        });
        break;
      }
    }

    // Determine overall risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (riskAlerts.some(a => a.severity === 'critical')) riskLevel = 'critical';
    else if (riskAlerts.some(a => a.severity === 'warning')) riskLevel = 'medium';
    else if (runwayMonths < 4) riskLevel = 'medium';

    // 7. Detect currency from entries
    const currencyEntry = activeEntries.find(e => e.transactionType === 'Income' || e.transactionType === 'Expense');
    const currency = 'MYR'; // Default — will use business home currency from context

    return {
      months,
      risk_alerts: riskAlerts,
      summary: {
        current_balance: Math.round(currentBalance),
        runway_months: runwayMonths,
        scenario_used: scenario,
        risk_level: riskLevel,
        total_known_ar: Math.round(totalKnownAr),
        total_known_ap: Math.round(totalKnownAp),
        avg_monthly_expenses: Math.round(avgMonthlyExpenses),
        avg_monthly_income: Math.round(avgMonthlyIncome),
      },
      currency,
    };
  } catch (error) {
    console.error('[forecast_cash_flow] Monthly forecast error:', error);

    if (error instanceof ConvexError) {
      return { error: true, code: 'CONVEX_ERROR', message: error.message };
    }

    return {
      error: true,
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
