/**
 * Financial Analytics Engine
 * Calculates business metrics for Southeast Asian SME cross-border operations
 */

import { createClient } from '@supabase/supabase-js';
import { SupportedCurrency } from '@/types/transaction';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface FinancialAnalytics {
  id?: string;
  user_id: string;
  period_start: Date;
  period_end: Date;
  total_income: number;
  total_expenses: number;
  net_profit: number;
  transaction_count: number;
  currency_breakdown: Record<string, number>;
  category_breakdown: Record<string, number>;
  calculated_at: Date;
}

export interface AnalyticsCalculationOptions {
  homeCurrency?: SupportedCurrency;
  forceRefresh?: boolean;
}

/**
 * Get Supabase user ID from Clerk user ID
 */
async function getSupabaseUserId(clerkUserId: string): Promise<string> {
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .single();

  if (error) {
    throw new Error(`Failed to find user with Clerk ID ${clerkUserId}: ${error.message}`);
  }

  if (!user) {
    throw new Error(`No user found with Clerk ID: ${clerkUserId}`);
  }

  return user.id;
}

/**
 * Calculate comprehensive financial analytics for a user within a date range
 */
export async function calculateFinancialAnalytics(
  clerkUserId: string,
  periodStart: Date,
  periodEnd: Date,
  options: AnalyticsCalculationOptions = {}
): Promise<FinancialAnalytics> {
  const { homeCurrency = 'SGD', forceRefresh = false } = options;

  // Get Supabase user ID for caching (but use Clerk ID for transactions)
  const supabaseUserId = await getSupabaseUserId(clerkUserId);

  // Check for existing analytics in cache (unless force refresh)
  if (!forceRefresh) {
    const cachedAnalytics = await getCachedAnalytics(supabaseUserId, periodStart, periodEnd);
    if (cachedAnalytics) {
      return cachedAnalytics;
    }
  }

  // Fetch all transactions for the user within the date range
  // IMPORTANT: Transactions are stored with Clerk user ID, not Supabase UUID!
  console.log('[Analytics Engine] Fetching transactions for user:', clerkUserId);
  console.log('[Analytics Engine] Date range:', periodStart.toISOString().split('T')[0], 'to', periodEnd.toISOString().split('T')[0]);
  
  // First, let's check what transactions exist for this user
  const { data: allUserTransactions, error: checkError } = await supabase
    .from('transactions')
    .select('id, transaction_date, transaction_type, original_amount, home_amount')
    .eq('user_id', clerkUserId)
    .order('transaction_date', { ascending: false })
    .limit(10);
    
  console.log('[Analytics Engine] Last 10 transactions for user:', allUserTransactions);
  
  const { data: transactions, error: transactionError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', clerkUserId)
    .gte('transaction_date', periodStart.toISOString().split('T')[0])
    .lte('transaction_date', periodEnd.toISOString().split('T')[0])
    .order('transaction_date', { ascending: true });

  if (transactionError) {
    console.error('[Analytics Engine] Transaction query error:', transactionError);
    throw new Error(`Failed to fetch transactions: ${transactionError.message}`);
  }

  console.log('[Analytics Engine] Found transactions:', transactions?.length || 0);
  if (transactions && transactions.length > 0) {
    console.log('[Analytics Engine] Sample transaction:', transactions[0]);
  }

  if (!transactions || transactions.length === 0) {
    // Return zero analytics for empty period
    const emptyAnalytics: FinancialAnalytics = {
      user_id: supabaseUserId,
      period_start: periodStart,
      period_end: periodEnd,
      total_income: 0,
      total_expenses: 0,
      net_profit: 0,
      transaction_count: 0,
      currency_breakdown: {},
      category_breakdown: {},
      calculated_at: new Date()
    };
    
    await cacheAnalytics(emptyAnalytics);
    return emptyAnalytics;
  }

  // Calculate metrics
  let totalIncome = 0;
  let totalExpenses = 0;
  const currencyBreakdown: Record<string, number> = {};
  const categoryBreakdown: Record<string, number> = {};

  for (const transaction of transactions) {
    const amount = transaction.home_amount || transaction.original_amount || 0;
    const currency = transaction.home_currency || transaction.original_currency || homeCurrency;
    const category = transaction.category || 'uncategorized';
    const type = transaction.transaction_type;

    // Aggregate by transaction type
    if (type === 'income') {
      totalIncome += amount;
    } else if (type === 'expense') {
      totalExpenses += Math.abs(amount); // Ensure expenses are positive for calculations
    }

    // Currency breakdown (net amounts by currency)
    if (!currencyBreakdown[currency]) {
      currencyBreakdown[currency] = 0;
    }
    currencyBreakdown[currency] += type === 'income' ? amount : -Math.abs(amount);

    // Category breakdown (expenses only, for business insights)
    if (type === 'expense') {
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = 0;
      }
      categoryBreakdown[category] += Math.abs(amount);
    }
  }

  const netProfit = totalIncome - totalExpenses;

  const analytics: FinancialAnalytics = {
    user_id: supabaseUserId,
    period_start: periodStart,
    period_end: periodEnd,
    total_income: totalIncome,
    total_expenses: totalExpenses,
    net_profit: netProfit,
    transaction_count: transactions.length,
    currency_breakdown: currencyBreakdown,
    category_breakdown: categoryBreakdown,
    calculated_at: new Date()
  };

  // Cache the calculated analytics
  await cacheAnalytics(analytics);

  return analytics;
}

/**
 * Get cached analytics from database if available and recent
 */
async function getCachedAnalytics(
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<FinancialAnalytics | null> {
  const { data: cached, error } = await supabase
    .from('financial_analytics')
    .select('*')
    .eq('user_id', userId)
    .eq('period_start', periodStart.toISOString().split('T')[0])
    .eq('period_end', periodEnd.toISOString().split('T')[0])
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !cached) {
    return null;
  }

  // Check if cache is recent (within 1 hour)
  const cacheAge = Date.now() - new Date(cached.calculated_at).getTime();
  const maxCacheAge = 60 * 60 * 1000; // 1 hour in milliseconds

  if (cacheAge > maxCacheAge) {
    return null; // Cache expired
  }

  return {
    id: cached.id,
    user_id: cached.user_id,
    period_start: new Date(cached.period_start),
    period_end: new Date(cached.period_end),
    total_income: cached.total_income,
    total_expenses: cached.total_expenses,
    net_profit: cached.net_profit,
    transaction_count: cached.transaction_count || 0,
    currency_breakdown: cached.currency_breakdown || {},
    category_breakdown: cached.category_breakdown || {},
    calculated_at: new Date(cached.calculated_at)
  };
}

/**
 * Store analytics in database cache
 */
async function cacheAnalytics(analytics: FinancialAnalytics): Promise<void> {
  const { error } = await supabase
    .from('financial_analytics')
    .upsert({
      user_id: analytics.user_id,
      period_start: analytics.period_start.toISOString().split('T')[0],
      period_end: analytics.period_end.toISOString().split('T')[0],
      total_income: analytics.total_income,
      total_expenses: analytics.total_expenses,
      net_profit: analytics.net_profit,
      transaction_count: analytics.transaction_count,
      currency_breakdown: analytics.currency_breakdown,
      category_breakdown: analytics.category_breakdown,
      calculated_at: analytics.calculated_at.toISOString()
    }, {
      onConflict: 'user_id,period_start,period_end'
    });

  if (error) {
    console.error('Failed to cache analytics:', error);
    // Don't throw - caching failure shouldn't break analytics calculation
  }
}

/**
 * Generate date ranges for common periods
 */
export function getAnalyticsPeriod(period: 'month' | 'quarter' | 'year', date?: Date): { start: Date; end: Date } {
  const now = date || new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case 'month':
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0) // Last day of current month
      };

    case 'quarter':
      const quarterStart = Math.floor(month / 3) * 3;
      return {
        start: new Date(year, quarterStart, 1),
        end: new Date(year, quarterStart + 3, 0) // Last day of quarter
      };

    case 'year':
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31)
      };

    default:
      throw new Error(`Invalid period: ${period}`);
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
  current: FinancialAnalytics;
  previous: FinancialAnalytics;
  trends: {
    income_change: number;
    expenses_change: number;
    profit_change: number;
  };
}> {
  // Calculate period length to determine previous period
  const periodLength = currentPeriod.end.getTime() - currentPeriod.start.getTime();
  const previousStart = new Date(currentPeriod.start.getTime() - periodLength);
  const previousEnd = new Date(currentPeriod.end.getTime() - periodLength);

  const [current, previous] = await Promise.all([
    calculateFinancialAnalytics(clerkUserId, currentPeriod.start, currentPeriod.end, options),
    calculateFinancialAnalytics(clerkUserId, previousStart, previousEnd, options)
  ]);

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
  };

  return { current, previous, trends };
}