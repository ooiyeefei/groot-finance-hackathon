'use client';

import { useState, Suspense, lazy } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw, PiggyBank, CreditCard, Loader2 } from 'lucide-react';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/domains/accounting-entries/types';
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency';
import useFinancialAnalytics from '@/domains/analytics/hooks/use-financial-analytics';

// Lazy load heavy components to improve initial page load
const CurrencyBreakdown = lazy(() => import('./financial-analytics/CurrencyBreakdown'));
const CategoryAnalysis = lazy(() => import('./financial-analytics/CategoryAnalysis'));
const ActionCenter = lazy(() => import('./financial-analytics/ActionCenter'));
const AgedReceivablesWidget = lazy(() => import('./AgedReceivablesWidget'));
const AgedPayablesWidget = lazy(() => import('./AgedPayablesWidget'));

// Loading component for Suspense fallbacks
// CLS FIX: Height must match actual component heights to prevent layout shift
// Chart widgets: ~340px (h-64 chart + header + padding)
// Use min-h to reserve space while content loads
const ComponentLoader = ({ title, height = 'chart' }: { title: string; height?: 'chart' | 'compact' }) => (
  <div className={`bg-card text-card-foreground border rounded-lg p-card-padding ${
    height === 'chart' ? 'min-h-[340px]' : 'min-h-[200px]'
  }`}>
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading {title}...</p>
      </div>
    </div>
  </div>
);

export default function CompleteDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const { currency: homeCurrency } = useHomeCurrency();

  const { analytics, trends, loading, error, refresh, lastUpdated } = useFinancialAnalytics({
    period: selectedPeriod,
    homeCurrency,
    includeTrends: true
  });

  const formatCurrency = (amount: number, currency: SupportedCurrency, isPercentage?: boolean) => {
    if (isPercentage) {
      return `${amount.toFixed(1)}%`;
    }
    
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    
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
  };

  const getPeriodDisplayName = (period: 'month' | 'quarter' | 'year') => {
    switch (period) {
      case 'month': return 'Last 60 Days';
      case 'quarter': return 'Current Quarter';
      case 'year': return 'Current Year';
    }
  };

  const getTrendIcon = (trend?: number, metricType?: string) => {
    if (trend === undefined || trend === 0) return null;

    // For expenses, up is bad (red), down is good (green)
    if (metricType === 'expenses') {
      return trend > 0
        ? <TrendingUp className="w-3 h-3 text-destructive" />
        : <TrendingDown className="w-3 h-3 text-green-600 dark:text-green-400" />;
    }

    // For income/profit, up is good (green), down is bad (red)
    return trend > 0
      ? <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
      : <TrendingDown className="w-3 h-3 text-destructive" />;
  };

  const getTrendColor = (trend?: number, metricType?: string) => {
    if (trend === undefined || trend === 0) return 'text-muted-foreground';

    // For expenses, up is bad (red), down is good (green)
    if (metricType === 'expenses') {
      return trend > 0 ? 'text-destructive' : 'text-green-600 dark:text-green-400';
    }

    // For income/profit, up is good (green), down is bad (red)
    return trend > 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive';
  };

  const getTrendText = (trend?: number) => {
    if (trend === undefined) return '';
    if (trend === 0) return 'No change';
    
    const absChange = Math.abs(trend);
    const direction = trend > 0 ? 'up' : 'down';
    
    if (absChange >= 100) {
      return `${absChange.toFixed(0)}% ${direction}`;
    }
    return `${absChange.toFixed(1)}% ${direction}`;
  };

  // Calculate profit margin
  const profitMargin = analytics && analytics.total_income > 0 
    ? (analytics.net_profit / analytics.total_income) * 100 
    : 0;

  // Calculate margin trend
  const marginTrend = trends && analytics ? (() => {
    const currentMargin = profitMargin;
    const previousIncome = analytics.total_income / (1 + trends.income_change / 100);
    const previousProfit = analytics.net_profit / (1 + trends.profit_change / 100);
    const previousMargin = previousIncome > 0 ? (previousProfit / previousIncome) * 100 : 0;
    
    if (previousMargin === 0) return 0;
    return ((currentMargin - previousMargin) / Math.abs(previousMargin)) * 100;
  })() : undefined;

  if (error) {
    return (
      <div className="bg-card text-card-foreground rounded-lg border p-card-padding">
        <div className="text-center">
          <div className="w-12 h-12 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Error Loading Financial Data</h3>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <button
            onClick={refresh}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-section-gap">
      {/* Header with Period Selector */}
      {/* CLS FIX: Fixed height header to prevent shift when lastUpdated appears */}
      <div className="flex items-center justify-between min-h-[52px]">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Financial Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            {getPeriodDisplayName(selectedPeriod)} • Converted to {homeCurrency}
            <span className="ml-2">• Updated {lastUpdated ? lastUpdated.toLocaleTimeString() : '--:--:--'}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as 'month' | 'quarter' | 'year')}
            className="px-3 py-1.5 bg-muted text-foreground border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="month">Last 60 Days</option>
            <option value="quarter">Current Quarter</option>
            <option value="year">Current Year</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 bg-muted hover:bg-accent text-foreground rounded-lg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Metrics - 3+2 Grid Layout */}
      <div className="space-y-card-gap">
        {/* Top Row: Primary Financial Health Metrics (3 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-card-gap">
        {/* Total Income Card - Translucent green for both light and dark modes */}
        {/* CLS FIX: Fixed internal heights to prevent layout shift */}
        <div className="bg-green-50 dark:bg-gray-800 dark:bg-green-900/10 border border-green-200 dark:border-green-700/50 rounded-lg p-card-padding transition-all shadow-sm min-h-[120px]">
          <div className="flex items-center justify-between mb-2 h-5">
            <p className="text-sm font-medium text-green-900 dark:text-gray-300">Total Income</p>
            <PiggyBank className="w-4 h-4 text-green-700 dark:text-gray-400" />
          </div>
          <div className="mb-1 h-9 flex items-center">
            {loading ? (
              <div className="h-8 w-full bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-green-900 dark:text-white leading-tight">
                {analytics ? formatCurrency(analytics.total_income, homeCurrency) : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between h-4">
            {loading ? (
              <div className="h-3 w-20 bg-muted rounded animate-pulse"></div>
            ) : trends?.income_change !== undefined ? (
              <div className="flex items-center space-x-1">
                {getTrendIcon(trends.income_change)}
                <span className={`text-xs font-medium ${getTrendColor(trends.income_change)}`}>
                  {getTrendText(trends.income_change)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-green-700 dark:text-gray-500">No trend</span>
              </div>
            )}
            <span className="text-xs text-green-700 dark:text-gray-500">vs. prev period</span>
          </div>
        </div>

        {/* Total Expenses Card - Translucent red for both light and dark modes */}
        {/* CLS FIX: Fixed internal heights to prevent layout shift */}
        <div className="bg-red-50 dark:bg-gray-800 dark:bg-red-900/10 border border-red-200 dark:border-red-700/50 rounded-lg p-card-padding transition-all shadow-sm min-h-[120px]">
          <div className="flex items-center justify-between mb-2 h-5">
            <p className="text-sm font-medium text-red-900 dark:text-gray-300">Total Expenses</p>
            <CreditCard className="w-4 h-4 text-red-700 dark:text-gray-400" />
          </div>
          <div className="mb-1 h-9 flex items-center">
            {loading ? (
              <div className="h-8 w-full bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-red-900 dark:text-white leading-tight">
                {analytics ? formatCurrency(analytics.total_expenses, homeCurrency) : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between h-4">
            {loading ? (
              <div className="h-3 w-20 bg-muted rounded animate-pulse"></div>
            ) : trends?.expenses_change !== undefined ? (
              <div className="flex items-center space-x-1">
                {getTrendIcon(trends.expenses_change, 'expenses')}
                <span className={`text-xs font-medium ${getTrendColor(trends.expenses_change, 'expenses')}`}>
                  {getTrendText(trends.expenses_change)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-red-700 dark:text-gray-500">No trend</span>
              </div>
            )}
            <span className="text-xs text-red-700 dark:text-gray-500">vs. prev period</span>
          </div>
        </div>

          {/* Net Profit Card - Dynamic translucent background based on positive/negative */}
        {/* CLS FIX: Fixed internal heights to prevent layout shift */}
        <div className={`border rounded-lg p-card-padding transition-all shadow-sm min-h-[120px] ${
          analytics && analytics.net_profit >= 0
            ? 'bg-green-50 dark:bg-gray-800 dark:bg-green-900/10 border-green-200 dark:border-green-700/50'
            : 'bg-red-50 dark:bg-gray-800 dark:bg-red-900/10 border-red-200 dark:border-red-700/50'
        }`}>
          <div className="flex items-center justify-between mb-2 h-5">
            <p className={`text-sm font-medium ${
              analytics && analytics.net_profit >= 0
                ? 'text-green-900 dark:text-gray-300'
                : 'text-red-900 dark:text-gray-300'
            }`}>Net Profit</p>
            <DollarSign className={`w-4 h-4 ${
              analytics && analytics.net_profit >= 0
                ? 'text-green-700 dark:text-gray-400'
                : 'text-red-700 dark:text-gray-400'
            }`} />
          </div>
          <div className="mb-1 h-9 flex items-center">
            {loading ? (
              <div className="h-8 w-full bg-muted rounded animate-pulse"></div>
            ) : (
              <p className={`text-2xl font-bold leading-tight ${
                analytics && analytics.net_profit >= 0
                  ? 'text-green-900 dark:text-white'
                  : 'text-red-900 dark:text-white'
              }`}>
                {analytics ? formatCurrency(analytics.net_profit, homeCurrency) : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between h-4">
            {loading ? (
              <div className="h-3 w-20 bg-muted rounded animate-pulse"></div>
            ) : trends?.profit_change !== undefined ? (
              <div className="flex items-center space-x-1">
                {getTrendIcon(trends.profit_change)}
                <span className={`text-xs font-medium ${getTrendColor(trends.profit_change)}`}>
                  {getTrendText(trends.profit_change)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className={`text-xs ${
                  analytics && analytics.net_profit >= 0
                    ? 'text-green-700 dark:text-gray-500'
                    : 'text-red-700 dark:text-gray-500'
                }`}>No trend</span>
              </div>
            )}
            <span className={`text-xs ${
              analytics && analytics.net_profit >= 0
                ? 'text-green-700 dark:text-gray-500'
                : 'text-red-700 dark:text-gray-500'
            }`}>vs. prev period</span>
          </div>
        </div>
        </div>
        
        {/* Bottom Row: Operational Metrics (2 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-card-gap max-w-2xl">
        {/* Transaction Count Card */}
        {/* CLS FIX: Fixed internal heights to prevent layout shift */}
        <div className="bg-card text-card-foreground border rounded-lg p-card-padding transition-all shadow-sm min-h-[120px]">
          <div className="flex items-center justify-between mb-2 h-5">
            <p className="text-sm font-medium opacity-80">Transactions</p>
            <Activity className="w-4 h-4 opacity-60" />
          </div>
          <div className="mb-1 h-9 flex items-center">
            {loading ? (
              <div className="h-8 w-full bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold leading-tight">
                {analytics ? analytics.transaction_count : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between h-4">
            <div className="flex items-center space-x-1">
              <span className="text-xs opacity-60">Total count</span>
            </div>
            <span className="text-xs opacity-60">{getPeriodDisplayName(selectedPeriod)}</span>
          </div>
        </div>

        {/* Profit Margin Card */}
        {/* CLS FIX: Fixed internal heights to prevent layout shift */}
        <div className={`border rounded-lg p-card-padding transition-all shadow-sm min-h-[120px] ${
          analytics && analytics.net_profit >= 0
            ? 'bg-card text-card-foreground'
            : 'bg-warning text-warning-foreground dark:bg-[var(--warning-translucent)] dark:border-yellow-700/30'
        }`}>
          <div className="flex items-center justify-between mb-2 h-5">
            <p className="text-sm font-medium opacity-80">Profit Margin</p>
            <TrendingUp className="w-4 h-4 opacity-60" />
          </div>
          <div className="mb-1 h-9 flex items-center">
            {loading ? (
              <div className="h-8 w-full bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold leading-tight">
                {formatCurrency(profitMargin, homeCurrency, true)}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between h-4">
            {loading ? (
              <div className="h-3 w-20 bg-muted rounded animate-pulse"></div>
            ) : marginTrend !== undefined ? (
              <div className="flex items-center space-x-1">
                {getTrendIcon(marginTrend)}
                <span className={`text-xs font-medium ${getTrendColor(marginTrend)}`}>
                  {getTrendText(marginTrend)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs opacity-60">No trend</span>
              </div>
            )}
            <span className="text-xs opacity-60">vs. prev period</span>
          </div>
        </div>
        </div>
      </div>

      {/* Charts and Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-card-gap">
        {/* Aged Receivables - Priority placement for critical business metric */}
        <Suspense fallback={<ComponentLoader title="Aged Receivables" />}>
          <AgedReceivablesWidget
            agedReceivables={analytics?.aged_receivables || {
              current: 0,
              late_31_60: 0,
              late_61_90: 0,
              late_90_plus: 0,
              total_outstanding: 0,
              risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
              average_risk_score: 0,
              high_risk_transactions: 0
            }}
            homeCurrency={homeCurrency}
            loading={loading}
          />
        </Suspense>

        {/* Aged Payables - Critical for cash flow management */}
        <Suspense fallback={<ComponentLoader title="Aged Payables" />}>
          <AgedPayablesWidget
            agedPayables={analytics?.aged_payables || {
              current: 0,
              late_31_60: 0,
              late_61_90: 0,
              late_90_plus: 0,
              total_outstanding: 0,
              risk_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
              average_risk_score: 0,
              high_risk_transactions: 0
            }}
            homeCurrency={homeCurrency}
            loading={loading}
          />
        </Suspense>

        {/* Currency Breakdown Chart */}
        <Suspense fallback={<ComponentLoader title="Currency Analysis" />}>
          <CurrencyBreakdown
            currencyData={analytics?.currency_breakdown || {}}
            homeCurrency={homeCurrency}
            loading={loading}
          />
        </Suspense>

        {/* Category Analysis Chart */}
        <Suspense fallback={<ComponentLoader title="Category Analysis" />}>
          <CategoryAnalysis
            categoryData={analytics?.category_breakdown || {}}
            homeCurrency={homeCurrency}
            loading={loading}
          />
        </Suspense>
      </div>

      {/* Action Center */}
      <Suspense fallback={<ComponentLoader title="Action Center" />}>
        <ActionCenter
          analytics={analytics}
          trends={trends}
          onActionClick={(action) => {
            console.log('Action clicked:', action);
            // Handle action clicks here
          }}
          loading={loading}
        />
      </Suspense>
    </div>
  );
}