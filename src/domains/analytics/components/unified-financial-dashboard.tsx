'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw, PiggyBank, CreditCard } from 'lucide-react';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/domains/accounting-entries/types';
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
      ? <TrendingUp className="w-3 h-3 text-green-400" />
      : <TrendingDown className="w-3 h-3 text-red-400" />;
  };

  const getTrendColor = (trend?: number) => {
    if (trend === undefined || trend === 0) return 'text-gray-400';
    return trend > 0 ? 'text-green-400' : 'text-red-400';
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
      <div className={`bg-gray-800 rounded-lg border border-gray-700 p-6 ${className}`}>
        <div className="text-center">
          <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Error Loading Financial Data</h3>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={refresh}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
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
          <h2 className="text-xl font-semibold text-white">Financial Dashboard</h2>
          <p className="text-sm text-gray-400">
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
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="month">Last 60 Days</option>
            <option value="quarter">Current Quarter</option>
            <option value="year">Current Year</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Unified Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Income Card */}
        <div className="bg-gray-800 border border-green-700/50 bg-green-900/10 rounded-lg p-6 transition-all hover:bg-gray-750">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-300">Total Income</p>
            <PiggyBank className="w-5 h-5 text-gray-400" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-white">
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
                <span className="text-xs text-gray-500">No trend</span>
              </div>
            )}
            <span className="text-xs text-gray-500">vs. prev period</span>
          </div>
        </div>

        {/* Total Expenses Card */}
        <div className="bg-gray-800 border border-red-700/50 bg-red-900/10 rounded-lg p-6 transition-all hover:bg-gray-750">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-300">Total Expenses</p>
            <CreditCard className="w-5 h-5 text-gray-400" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-white">
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
                <span className="text-xs text-gray-500">No trend</span>
              </div>
            )}
            <span className="text-xs text-gray-500">vs. prev period</span>
          </div>
        </div>

        {/* Net Profit Card */}
        <div className={`bg-gray-800 border rounded-lg p-6 transition-all hover:bg-gray-750 ${
          analytics && analytics.net_profit >= 0 
            ? 'border-green-700/50 bg-green-900/10' 
            : 'border-red-700/50 bg-red-900/10'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-300">Net Profit</p>
            <DollarSign className="w-5 h-5 text-gray-400" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-white">
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
                <span className="text-xs text-gray-500">No trend</span>
              </div>
            )}
            <span className="text-xs text-gray-500">vs. prev period</span>
          </div>
        </div>

        {/* Transaction Count Card */}
        <div className="bg-gray-800 border border-blue-700/50 bg-blue-900/10 rounded-lg p-6 transition-all hover:bg-gray-750">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-300">Transactions</p>
            <Activity className="w-5 h-5 text-gray-400" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-white">
                {analytics ? analytics.transaction_count : '-'}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className="text-xs text-gray-500">Total count</span>
            </div>
            <span className="text-xs text-gray-500">{getPeriodDisplayName(selectedPeriod)}</span>
          </div>
        </div>

        {/* Profit Margin Card */}
        <div className={`bg-gray-800 border rounded-lg p-6 transition-all hover:bg-gray-750 ${
          analytics && analytics.net_profit >= 0 
            ? 'border-blue-700/50 bg-blue-900/10'
            : 'border-orange-700/50 bg-orange-900/10'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-300">Profit Margin</p>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <div className="mb-2">
            {loading ? (
              <div className="h-8 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-white">
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
                <span className="text-xs text-gray-500">No trend</span>
              </div>
            )}
            <span className="text-xs text-gray-500">vs. prev period</span>
          </div>
        </div>
      </div>
    </div>
  );
}