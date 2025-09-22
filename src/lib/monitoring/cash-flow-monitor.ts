/**
 * Proactive Cash Flow and Risk Monitoring System
 * Real-time monitoring and alerting for critical financial metrics
 */

import { createClient } from '@supabase/supabase-js';
import { calculateRiskScore, TransactionRiskContext, DEFAULT_RISK_CONFIG } from '@/lib/analytics/risk-scoring';
import { SupportedCurrency } from '@/types/transaction';

// Create Supabase client with error handling for build process
function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Supabase configuration missing during build process');
    return null as any;
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

const supabase = createSupabaseClient();

export interface CashFlowAlert {
  id: string;
  type: 'cash_shortage' | 'overdue_receivables' | 'payment_deadline' | 'currency_risk';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  amount?: number;
  currency?: SupportedCurrency;
  due_date?: string;
  recommended_actions: string[];
  created_at: Date;
}

export interface CashFlowProjection {
  period: '7_days' | '30_days' | '90_days';
  expected_inflow: number;
  expected_outflow: number;
  net_position: number;
  confidence_level: number; // 0-100
  risk_factors: string[];
  critical_dates: Array<{
    date: string;
    type: 'receivable' | 'payable';
    amount: number;
    description: string;
  }>;
}

export interface MonitoringConfig {
  cash_reserve_threshold: number; // Minimum cash level alert
  receivables_aging_days: number; // Alert when receivables exceed this
  payables_aging_days: number; // Alert when payables exceed this
  currency_exposure_limit: number; // Alert when single currency exposure exceeds %
  check_interval_minutes: number; // How often to run monitoring
}

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  cash_reserve_threshold: 10000, // $10K SGD equivalent
  receivables_aging_days: 45,
  payables_aging_days: 30,
  currency_exposure_limit: 60, // 60% exposure to any single currency
  check_interval_minutes: 30
};

/**
 * Monitor cash flow and generate real-time alerts
 */
export async function runCashFlowMonitoring(
  clerkUserId: string,
  config: MonitoringConfig = DEFAULT_MONITORING_CONFIG
): Promise<{
  alerts: CashFlowAlert[];
  projections: CashFlowProjection[];
  summary: {
    total_alerts: number;
    critical_alerts: number;
    next_critical_date?: string;
  };
}> {
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const alerts: CashFlowAlert[] = [];
  const projections: CashFlowProjection[] = [];

  try {
    // 1. Check overdue receivables
    const receivableAlerts = await checkOverdueReceivables(clerkUserId, config);
    alerts.push(...receivableAlerts);

    // 2. Check upcoming payment deadlines
    const paymentAlerts = await checkPaymentDeadlines(clerkUserId, config);
    alerts.push(...paymentAlerts);

    // 3. Analyze currency exposure risk
    const currencyAlerts = await checkCurrencyExposure(clerkUserId, config);
    alerts.push(...currencyAlerts);

    // 4. Generate cash flow projections
    const cashProjections = await generateCashFlowProjections(clerkUserId);
    projections.push(...cashProjections);

    // 5. Check for potential cash shortages
    const cashAlerts = await checkCashShortageRisk(clerkUserId, projections, config);
    alerts.push(...cashAlerts);

    const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
    const nextCriticalDate = findNextCriticalDate(projections);

    return {
      alerts,
      projections,
      summary: {
        total_alerts: alerts.length,
        critical_alerts: criticalAlerts.length,
        next_critical_date: nextCriticalDate
      }
    };

  } catch (error) {
    console.error('Cash flow monitoring error:', error);
    throw new Error(`Monitoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check for overdue receivables that need attention
 */
async function checkOverdueReceivables(
  clerkUserId: string,
  config: MonitoringConfig
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = [];

  const { data: overdueReceivables, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', clerkUserId)
    .eq('transaction_type', 'income')
    .in('status', ['pending', 'awaiting_payment', 'overdue'])
    .not('due_date', 'is', null);

  if (error) {
    console.error('Error fetching overdue receivables:', error);
    return alerts;
  }

  if (overdueReceivables && overdueReceivables.length > 0) {
    const currentDate = new Date();

    for (const transaction of overdueReceivables) {
      if (transaction.due_date) {
        const dueDate = new Date(transaction.due_date);
        const daysPastDue = Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysPastDue > config.receivables_aging_days) {
          const riskContext: TransactionRiskContext = {
            amount: transaction.home_amount || transaction.original_amount,
            currency: transaction.home_currency || transaction.original_currency || 'SGD',
            daysPastDue,
            transactionType: 'income'
          };

          const riskScore = calculateRiskScore(riskContext, DEFAULT_RISK_CONFIG);

          alerts.push({
            id: `receivable_${transaction.id}`,
            type: 'overdue_receivables',
            severity: riskScore.level === 'critical' ? 'critical' : 'warning',
            title: 'Overdue Receivable Alert',
            description: `Invoice from ${transaction.vendor_name || 'Unknown'} is ${daysPastDue} days overdue`,
            amount: transaction.home_amount || transaction.original_amount,
            currency: transaction.home_currency || transaction.original_currency || 'SGD',
            due_date: transaction.due_date,
            recommended_actions: [
              'Send payment reminder to customer',
              'Consider collection agency if > 90 days',
              'Review customer credit terms'
            ],
            created_at: new Date()
          });
        }
      }
    }
  }

  return alerts;
}

/**
 * Check for upcoming payment deadlines
 */
async function checkPaymentDeadlines(
  clerkUserId: string,
  config: MonitoringConfig
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = [];

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + config.payables_aging_days);

  const { data: upcomingPayables, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', clerkUserId)
    .eq('transaction_type', 'expense')
    .in('status', ['pending', 'awaiting_payment'])
    .not('due_date', 'is', null)
    .lte('due_date', futureDate.toISOString().split('T')[0]);

  if (error) {
    console.error('Error fetching upcoming payables:', error);
    return alerts;
  }

  if (upcomingPayables && upcomingPayables.length > 0) {
    const totalAmount = upcomingPayables.reduce((sum: number, t: any) =>
      sum + Math.abs(t.home_amount || t.original_amount), 0
    );

    alerts.push({
      id: `payables_upcoming_${Date.now()}`,
      type: 'payment_deadline',
      severity: totalAmount > 50000 ? 'critical' : 'warning',
      title: 'Upcoming Payment Deadlines',
      description: `${upcomingPayables.length} payments totaling ${formatCurrency(totalAmount, 'SGD')} due within ${config.payables_aging_days} days`,
      amount: totalAmount,
      currency: 'SGD',
      recommended_actions: [
        'Review cash availability for upcoming payments',
        'Consider early payment discounts',
        'Prioritize high-value or critical suppliers'
      ],
      created_at: new Date()
    });
  }

  return alerts;
}

/**
 * Check currency exposure risk
 */
async function checkCurrencyExposure(
  clerkUserId: string,
  config: MonitoringConfig
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = [];

  // Get all open transactions to calculate currency exposure
  const { data: openTransactions, error } = await supabase
    .from('transactions')
    .select('original_currency, original_amount, home_amount, transaction_type')
    .eq('user_id', clerkUserId)
    .in('status', ['pending', 'awaiting_payment']);

  if (error || !openTransactions) {
    return alerts;
  }

  // Calculate exposure by currency
  const exposureByCurrency: Record<string, number> = {};
  let totalExposure = 0;

  for (const transaction of openTransactions) {
    const currency = transaction.original_currency || 'SGD';
    const amount = Math.abs(transaction.home_amount || transaction.original_amount || 0);

    if (!exposureByCurrency[currency]) {
      exposureByCurrency[currency] = 0;
    }
    exposureByCurrency[currency] += amount;
    totalExposure += amount;
  }

  // Check if any single currency exceeds the limit
  for (const [currency, exposure] of Object.entries(exposureByCurrency)) {
    const exposurePercentage = (exposure / totalExposure) * 100;

    if (exposurePercentage > config.currency_exposure_limit) {
      alerts.push({
        id: `currency_${currency}_${Date.now()}`,
        type: 'currency_risk',
        severity: exposurePercentage > 80 ? 'critical' : 'warning',
        title: 'High Currency Exposure',
        description: `${exposurePercentage.toFixed(1)}% exposure to ${currency} creates foreign exchange risk`,
        amount: exposure,
        currency: currency as SupportedCurrency,
        recommended_actions: [
          'Consider hedging currency exposure',
          'Monitor exchange rate movements closely',
          'Diversify currency exposure where possible'
        ],
        created_at: new Date()
      });
    }
  }

  return alerts;
}

/**
 * Generate cash flow projections for different time periods
 */
async function generateCashFlowProjections(
  clerkUserId: string
): Promise<CashFlowProjection[]> {
  const projections: CashFlowProjection[] = [];

  // Generate projections for 7, 30, and 90 days
  const periods = [
    { days: 7, period: '7_days' as const },
    { days: 30, period: '30_days' as const },
    { days: 90, period: '90_days' as const }
  ];

  for (const { days, period } of periods) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    // Fetch expected receivables (income due)
    const { data: expectedReceivables } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', clerkUserId)
      .eq('transaction_type', 'income')
      .in('status', ['pending', 'awaiting_payment'])
      .lte('due_date', endDate.toISOString().split('T')[0]);

    // Fetch expected payables (expenses due)
    const { data: expectedPayables } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', clerkUserId)
      .eq('transaction_type', 'expense')
      .in('status', ['pending', 'awaiting_payment'])
      .lte('due_date', endDate.toISOString().split('T')[0]);

    const inflow = expectedReceivables?.reduce((sum: number, t: any) =>
      sum + (t.home_amount || t.original_amount || 0), 0) || 0;

    const outflow = expectedPayables?.reduce((sum: number, t: any) =>
      sum + Math.abs(t.home_amount || t.original_amount || 0), 0) || 0;

    const criticalDates = [
      ...(expectedReceivables?.map((t: any) => ({
        date: t.due_date || t.transaction_date,
        type: 'receivable' as const,
        amount: t.home_amount || t.original_amount || 0,
        description: `Payment from ${t.vendor_name || 'Unknown'}`
      })) || []),
      ...(expectedPayables?.map((t: any) => ({
        date: t.due_date || t.transaction_date,
        type: 'payable' as const,
        amount: Math.abs(t.home_amount || t.original_amount || 0),
        description: `Payment to ${t.vendor_name || 'Unknown'}`
      })) || [])
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate confidence based on data quality and historical patterns
    const confidence = Math.max(50, Math.min(95,
      70 + (expectedReceivables?.length || 0) + (expectedPayables?.length || 0)
    ));

    projections.push({
      period,
      expected_inflow: inflow,
      expected_outflow: outflow,
      net_position: inflow - outflow,
      confidence_level: confidence,
      risk_factors: [
        ...(inflow > outflow * 1.5 ? ['Heavy reliance on incoming payments'] : []),
        ...(outflow > inflow * 1.5 ? ['Significant cash outflow expected'] : []),
        ...(criticalDates.length > 10 ? ['High transaction volume creates complexity'] : [])
      ],
      critical_dates: criticalDates.slice(0, 10) // Top 10 critical dates
    });
  }

  return projections;
}

/**
 * Check for potential cash shortage risks
 */
async function checkCashShortageRisk(
  clerkUserId: string,
  projections: CashFlowProjection[],
  config: MonitoringConfig
): Promise<CashFlowAlert[]> {
  const alerts: CashFlowAlert[] = [];

  // For this implementation, we'll use net position as a proxy for cash shortage risk
  // In a real implementation, you'd also check current cash balances

  const shortTermProjection = projections.find(p => p.period === '7_days');
  if (shortTermProjection && shortTermProjection.net_position < -config.cash_reserve_threshold) {
    alerts.push({
      id: `cash_shortage_${Date.now()}`,
      type: 'cash_shortage',
      severity: 'critical',
      title: 'Cash Shortage Risk',
      description: `Projected negative cash flow of ${formatCurrency(Math.abs(shortTermProjection.net_position), 'SGD')} in next 7 days`,
      amount: Math.abs(shortTermProjection.net_position),
      currency: 'SGD',
      recommended_actions: [
        'Accelerate collection of outstanding receivables',
        'Negotiate extended payment terms with suppliers',
        'Consider short-term financing options',
        'Prioritize only essential payments'
      ],
      created_at: new Date()
    });
  }

  return alerts;
}

/**
 * Find the next critical date from projections
 */
function findNextCriticalDate(projections: CashFlowProjection[]): string | undefined {
  const allDates = projections
    .flatMap(p => p.critical_dates)
    .filter(d => new Date(d.date) > new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return allDates.length > 0 ? allDates[0].date : undefined;
}

/**
 * Format currency for display
 */
function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    'SGD': 'S$',
    'MYR': 'RM',
    'USD': '$',
    'EUR': '€',
    'THB': '฿',
    'IDR': 'Rp',
    'CNY': '¥',
    'VND': '₫',
    'PHP': '₱'
  };

  const symbol = symbols[currency] || currency;

  if (Math.abs(amount) >= 1000000) {
    return `${symbol}${(amount / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return `${symbol}${(amount / 1000).toFixed(1)}K`;
  }

  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

/**
 * Convert monitoring alerts to action items for the UI
 */
export function convertMonitoringAlertsToActionItems(
  alerts: CashFlowAlert[],
  onActionClick?: (action: string) => void
): Array<{
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  action?: {
    label: string;
    onClick: () => void;
  };
}> {
  return alerts.slice(0, 5).map(alert => ({
    id: alert.id,
    type: alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info',
    title: alert.title,
    description: alert.description,
    priority: alert.severity === 'critical' ? 'high' : alert.severity === 'warning' ? 'medium' : 'low',
    action: alert.recommended_actions.length > 0 ? {
      label: 'View Actions',
      onClick: () => onActionClick?.(alert.id)
    } : undefined
  }));
}