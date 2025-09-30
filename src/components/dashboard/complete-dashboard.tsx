'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw, PiggyBank, CreditCard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/types/transaction';
import { useHomeCurrency } from '@/components/settings/currency-settings';
import useFinancialAnalytics from './hooks/use-financial-analytics';
import CurrencyBreakdown from './financial-analytics/CurrencyBreakdown';
import CategoryAnalysis from './financial-analytics/CategoryAnalysis';
import ActionCenter from './financial-analytics/ActionCenter';
import AgedReceivablesWidget from './AgedReceivablesWidget';
import AgedPayablesWidget from './AgedPayablesWidget';

export default function CompleteDashboard() {
  const t = useTranslations('dashboard');
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const homeCurrency = useHomeCurrency();
  
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
      case 'month': return t('periods.last60Days');
      case 'quarter': return t('periods.currentQuarter');
      case 'year': return t('periods.currentYear');
    }
  };

  const getTrendIcon = (trend?: number, metricType?: string) => {
    if (trend === undefined || trend === 0) return null;
    
    // For expenses, up is bad (red), down is good (green)
    if (metricType === 'expenses') {
      return trend > 0 
        ? <TrendingUp className="w-3 h-3 text-red-400" />
        : <TrendingDown className="w-3 h-3 text-green-400" />;
    }
    
    // For income/profit, up is good (green), down is bad (red)
    return trend > 0 
      ? <TrendingUp className="w-3 h-3 text-green-400" />
      : <TrendingDown className="w-3 h-3 text-red-400" />;
  };

  const getTrendColor = (trend?: number, metricType?: string) => {
    if (trend === undefined || trend === 0) return 'text-gray-400';
    
    // For expenses, up is bad (red), down is good (green)
    if (metricType === 'expenses') {
      return trend > 0 ? 'text-red-400' : 'text-green-400';
    }
    
    // For income/profit, up is good (green), down is bad (red)
    return trend > 0 ? 'text-green-400' : 'text-red-400';
  };

  const getTrendText = (trend?: number) => {
    if (trend === undefined) return '';
    if (trend === 0) return t('trends.noChange');

    const absChange = Math.abs(trend);
    const direction = trend > 0 ? t('trends.up') : t('trends.down');

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
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">{t('errorLoadingData')}</h3>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={refresh}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('retryLoading')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{t('financialDashboard')}</h2>
          <p className="text-sm text-gray-400">
            {getPeriodDisplayName(selectedPeriod)} • {t('displayedIn', { currency: homeCurrency })}
            {lastUpdated && (
              <span className="ml-2">• {t('updated')} {lastUpdated.toLocaleTimeString()}</span>
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
            <option value="month">{t('periods.last60Days')}</option>
            <option value="quarter">{t('periods.currentQuarter')}</option>
            <option value="year">{t('periods.currentYear')}</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={refresh}
            disabled={loading}
            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
            title={t('refreshData')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Metrics - 3+2 Grid Layout */}
      <div className="space-y-4">
        {/* Top Row: Primary Financial Health Metrics (3 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Total Income Card */}
        <div className="bg-gray-800 border border-green-700/50 bg-green-900/10 rounded-lg p-6 transition-all hover:bg-gray-750 shadow-sm min-h-[120px]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-300">{t('totalIncome')}</p>
            <PiggyBank className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mb-1">
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
                <span className="text-xs text-gray-500">{t('trends.noTrend')}</span>
              </div>
            )}
            <span className="text-xs text-gray-500">{t('trends.vsPrevPeriod')}</span>
          </div>
        </div>

        {/* Total Expenses Card */}
        <div className="bg-gray-800 border border-red-700/50 bg-red-900/10 rounded-lg p-6 transition-all hover:bg-gray-750 shadow-sm min-h-[120px]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-300">{t('totalExpenses')}</p>
            <CreditCard className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mb-1">
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
                {getTrendIcon(trends.expenses_change, 'expenses')}
                <span className={`text-xs font-medium ${getTrendColor(trends.expenses_change, 'expenses')}`}>
                  {getTrendText(trends.expenses_change)}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <span className="text-xs text-gray-500">{t('trends.noTrend')}</span>
              </div>
            )}
            <span className="text-xs text-gray-500">{t('trends.vsPrevPeriod')}</span>
          </div>
        </div>

          {/* Net Profit Card */}
        <div className={`bg-gray-800 border rounded-lg p-6 transition-all hover:bg-gray-750 shadow-sm min-h-[120px] ${
          analytics && analytics.net_profit >= 0 
            ? 'border-green-700/50 bg-green-900/10' 
            : 'border-red-700/50 bg-red-900/10'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-300">{t('netProfit')}</p>
            <DollarSign className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mb-1">
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
                <span className="text-xs text-gray-500">{t('trends.noTrend')}</span>
              </div>
            )}
            <span className="text-xs text-gray-500">{t('trends.vsPrevPeriod')}</span>
          </div>
        </div>
        </div>
        
        {/* Bottom Row: Operational Metrics (2 cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl">
        {/* Transaction Count Card */}
        <div className="bg-gray-800 border border-blue-700/50 bg-blue-900/10 rounded-lg p-6 transition-all hover:bg-gray-750 shadow-sm min-h-[120px]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-300">{t('transactions')}</p>
            <Activity className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mb-1">
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
              <span className="text-xs text-gray-500">{t('totalCount')}</span>
            </div>
            <span className="text-xs text-gray-500">{getPeriodDisplayName(selectedPeriod)}</span>
          </div>
        </div>

        {/* Profit Margin Card */}
        <div className={`bg-gray-800 border rounded-lg p-6 transition-all hover:bg-gray-750 shadow-sm min-h-[120px] ${
          analytics && analytics.net_profit >= 0 
            ? 'border-blue-700/50 bg-blue-900/10'
            : 'border-orange-700/50 bg-orange-900/10'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-300">{t('profitMargin')}</p>
            <TrendingUp className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mb-1">
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
                <span className="text-xs text-gray-500">{t('trends.noTrend')}</span>
              </div>
            )}
            <span className="text-xs text-gray-500">{t('trends.vsPrevPeriod')}</span>
          </div>
        </div>
        </div>
      </div>

      {/* Charts and Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aged Receivables - Priority placement for critical business metric */}
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

        {/* Aged Payables - Critical for cash flow management */}
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

        {/* Currency Breakdown Chart */}
        <CurrencyBreakdown
          currencyData={analytics?.currency_breakdown || {}}
          homeCurrency={homeCurrency}
          loading={loading}
        />

        {/* Category Analysis Chart */}
        <CategoryAnalysis
          categoryData={analytics?.category_breakdown || {}}
          homeCurrency={homeCurrency}
          loading={loading}
        />
      </div>

      {/* Action Center */}
      <ActionCenter
        analytics={analytics}
        trends={trends}
        onActionClick={(action) => {
          console.log('Action clicked:', action);
          // Handle action clicks here
        }}
        loading={loading}
      />
    </div>
  );
}