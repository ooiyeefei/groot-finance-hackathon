'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Minus, RefreshCw } from 'lucide-react';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/types/transaction';
import ActionButton from '@/components/ui/action-button';
import useFinancialAnalytics from '../hooks/use-financial-analytics';
import { DashboardProps } from '../types/analytics';
import MetricsOverview from './MetricsOverview';
import CurrencyBreakdown from './CurrencyBreakdown';
import CategoryAnalysis from './CategoryAnalysis';
import PeriodSelector from './PeriodSelector';
import ActionCenter from './ActionCenter';

export default function FinancialDashboard({
  period = 'month',
  homeCurrency = 'SGD',
  includeTrends = true,
  onPeriodChange,
  onActionClick
}: DashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>(period);

  const {
    analytics,
    trends,
    previousPeriod,
    loading,
    error,
    refresh,
    lastUpdated
  } = useFinancialAnalytics({
    period: selectedPeriod,
    homeCurrency,
    includeTrends,
    autoRefresh: false // Manual refresh for better UX control
  });

  const handlePeriodChange = (newPeriod: 'month' | 'quarter' | 'year') => {
    setSelectedPeriod(newPeriod);
    onPeriodChange?.(newPeriod);
  };

  const handleRefresh = async () => {
    await refresh();
  };

  if (error) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Financial Analytics</h2>
          <ActionButton onClick={handleRefresh} variant="secondary" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </ActionButton>
        </div>
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Financial Dashboard</h1>
          <p className="text-gray-400 text-sm">
            {analytics ? (
              <>
                {new Date(analytics.period_start).toLocaleDateString()} - {new Date(analytics.period_end).toLocaleDateString()}
                {lastUpdated && (
                  <span className="ml-2">
                    • Updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </>
            ) : (
              'Loading analytics...'
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <PeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodChange={handlePeriodChange}
            disabled={loading}
          />
          <ActionButton 
            onClick={handleRefresh} 
            variant="secondary" 
            size="sm"
            disabled={loading}
            aria-label="Refresh analytics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </ActionButton>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Metrics Overview - Top Row */}
        <div className="lg:col-span-12">
          <MetricsOverview
            analytics={analytics}
            trends={trends}
            homeCurrency={homeCurrency}
            loading={loading}
          />
        </div>

        {/* Currency Breakdown Chart */}
        <div className="lg:col-span-6">
          <CurrencyBreakdown
            currencyData={analytics?.currency_breakdown || {}}
            homeCurrency={homeCurrency}
            loading={loading}
          />
        </div>

        {/* Category Analysis Chart */}
        <div className="lg:col-span-6">
          <CategoryAnalysis
            categoryData={analytics?.category_breakdown || {}}
            homeCurrency={homeCurrency}
            loading={loading}
          />
        </div>

        {/* Action Center - Bottom Row */}
        <div className="lg:col-span-12">
          <ActionCenter
            analytics={analytics}
            trends={trends}
            onActionClick={onActionClick}
            loading={loading}
          />
        </div>
      </div>

      {/* Mobile-Specific Footer Info */}
      <div className="sm:hidden bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Currency: {CURRENCY_SYMBOLS[homeCurrency]} {homeCurrency}</span>
          {analytics && (
            <span>
              {Object.keys(analytics.currency_breakdown).length} currencies tracked
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for the dashboard
 */
export function FinancialDashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="h-8 bg-gray-700 rounded w-64 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-48"></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 bg-gray-700 rounded w-32"></div>
          <div className="h-10 bg-gray-700 rounded w-10"></div>
        </div>
      </div>

      {/* Metrics Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <div className="h-4 bg-gray-700 rounded w-20 mb-3"></div>
            <div className="h-8 bg-gray-700 rounded w-32 mb-2"></div>
            <div className="h-3 bg-gray-700 rounded w-16"></div>
          </div>
        ))}
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="h-6 bg-gray-700 rounded w-40 mb-4"></div>
          <div className="h-64 bg-gray-700 rounded"></div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="h-6 bg-gray-700 rounded w-40 mb-4"></div>
          <div className="h-64 bg-gray-700 rounded"></div>
        </div>
      </div>

      {/* Action Center Skeleton */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="h-6 bg-gray-700 rounded w-32 mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-gray-700/50 rounded-lg p-4">
              <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-600 rounded w-full mb-3"></div>
              <div className="h-8 bg-gray-600 rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}