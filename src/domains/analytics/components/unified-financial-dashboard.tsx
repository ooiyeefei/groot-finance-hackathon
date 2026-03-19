'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw, PiggyBank, CreditCard } from 'lucide-react';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/lib/types/currency';
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency';
import useFinancialAnalytics from '@/domains/analytics/hooks/use-financial-analytics';

interface UnifiedFinancialDashboardProps {
  className?: string;
}

export default function UnifiedFinancialDashboard({ className = '' }: UnifiedFinancialDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const { currency: homeCurrency } = useHomeCurrency();

  const { analytics, trends, loading, error, refresh, lastUpdated } = useFinancialAnalytics({
    period: selectedPeriod,
    homeCurrency,
    includeTrends: true
  });

  const formatCurrency = (amount: number, currency: SupportedCurrency, isPercentage?: boolean) => {
    if (amount == null || isNaN(amount)) return '--';
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

  const getTrendIcon = (trend?: number) => {
    if (trend === undefined || trend === 0) return null;
    return trend > 0
      ? <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
      : <TrendingDown className="w-3 h-3 text-red-600 dark:text-red-400" />;
  };

  const getTrendColor = (trend?: number) => {
    if (trend === undefined || trend === 0) return 'text-muted-foreground';
    return trend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
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
      <div className={`bg-card rounded-lg border border-border p-6 ${className}`}>
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
    <div className={`space-y-6 ${className}`}>
      {/* Header with Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Financial Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            {getPeriodDisplayName(selectedPeriod)} • Displayed in {homeCurrency}
            {lastUpdated && (
              <span className="ml-2">• Updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as 'month' | 'quarter' | 'year')}
            className="px-3 py-1.5 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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

      {/* Unified Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Income Card */}
        <div className="bg-card border border-green-700/50 bg-green-900/10 rounded-lg p-6 transition-all hover:bg-accent/50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Total Income</p>
            <PiggyBank className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {analytics ? formatCurrency(analytics.total_income, homeCurrency) : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            {trends?.income_change !== undefined ? (
              <div className="flex items-center space-x-1">
                {getTrendIcon(trends.income_change)}
                <span className={`text-xs font-medium ${getTrendColor(trends.income_change)}`}>
                  {getTrendText(trends.income_change)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-muted-foreground">No trend</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">vs. prev period</span>
          </div>
        </div>

        {/* Total Expenses Card */}
        <div className="bg-card border border-red-700/50 bg-red-900/10 rounded-lg p-6 transition-all hover:bg-accent/50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
            <CreditCard className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {analytics ? formatCurrency(analytics.total_expenses, homeCurrency) : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            {trends?.expenses_change !== undefined ? (
              <div className="flex items-center space-x-1">
                {getTrendIcon(trends.expenses_change)}
                <span className={`text-xs font-medium ${getTrendColor(trends.expenses_change)}`}>
                  {getTrendText(trends.expenses_change)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-muted-foreground">No trend</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">vs. prev period</span>
          </div>
        </div>

        {/* Net Profit Card */}
        <div className={`bg-card border rounded-lg p-6 transition-all hover:bg-accent/50 ${
          analytics && analytics.net_profit >= 0
            ? 'border-green-700/50 bg-green-900/10'
            : 'border-red-700/50 bg-red-900/10'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Net Profit</p>
            <DollarSign className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {analytics ? formatCurrency(analytics.net_profit, homeCurrency) : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            {trends?.profit_change !== undefined ? (
              <div className="flex items-center space-x-1">
                {getTrendIcon(trends.profit_change)}
                <span className={`text-xs font-medium ${getTrendColor(trends.profit_change)}`}>
                  {getTrendText(trends.profit_change)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-muted-foreground">No trend</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">vs. prev period</span>
          </div>
        </div>

        {/* Transaction Count Card */}
        <div className="bg-card border border-blue-700/50 bg-blue-900/10 rounded-lg p-6 transition-all hover:bg-accent/50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Transactions</p>
            <Activity className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {analytics ? analytics.transaction_count : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className="text-xs text-muted-foreground">Total count</span>
            </div>
            <span className="text-xs text-muted-foreground">{getPeriodDisplayName(selectedPeriod)}</span>
          </div>
        </div>

        {/* Profit Margin Card */}
        <div className={`bg-card border rounded-lg p-6 transition-all hover:bg-accent/50 ${
          analytics && analytics.net_profit >= 0
            ? 'border-blue-700/50 bg-blue-900/10'
            : 'border-orange-700/50 bg-orange-900/10'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Profit Margin</p>
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-muted rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(profitMargin, homeCurrency, true)}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            {marginTrend !== undefined ? (
              <div className="flex items-center space-x-1">
                {getTrendIcon(marginTrend)}
                <span className={`text-xs font-medium ${getTrendColor(marginTrend)}`}>
                  {getTrendText(marginTrend)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-muted-foreground">No trend</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">vs. prev period</span>
          </div>
        </div>
      </div>
    </div>
  );
}