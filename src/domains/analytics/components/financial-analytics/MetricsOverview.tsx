'use client';

import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Minus, PiggyBank, CreditCard } from 'lucide-react';
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/domains/accounting-entries/types';
import { AnalyticsData, AnalyticsTrends, MetricCardProps } from '@/domains/analytics/types/analytics';

interface MetricsOverviewProps {
  analytics: AnalyticsData | null;
  trends: AnalyticsTrends | null;
  homeCurrency: SupportedCurrency;
  loading: boolean;
}

export default function MetricsOverview({
  analytics,
  trends,
  homeCurrency,
  loading
}: MetricsOverviewProps) {

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-muted rounded w-20 mb-3"></div>
            <div className="h-8 bg-muted rounded w-32 mb-2"></div>
            <div className="h-3 bg-muted rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-muted-foreground text-center">No analytics data available</p>
      </div>
    );
  }

  const metrics: (MetricCardProps & { id: string })[] = [
    {
      id: 'income',
      title: 'Total Income',
      value: analytics.total_income,
      currency: homeCurrency,
      trend: trends?.income_change,
      icon: PiggyBank,
      className: 'border-green-700/50 bg-green-900/10'
    },
    {
      id: 'expenses', 
      title: 'Total Expenses',
      value: analytics.total_expenses,
      currency: homeCurrency,
      trend: trends?.expenses_change,
      icon: CreditCard,
      className: 'border-red-700/50 bg-red-900/10'
    },
    {
      id: 'profit',
      title: 'Net Profit',
      value: analytics.net_profit,
      currency: homeCurrency,
      trend: trends?.profit_change,
      icon: DollarSign,
      className: analytics.net_profit >= 0 
        ? 'border-green-700/50 bg-green-900/10' 
        : 'border-red-700/50 bg-red-900/10'
    },
    {
      id: 'margin',
      title: 'Profit Margin',
      value: analytics.total_income > 0 
        ? (analytics.net_profit / analytics.total_income) * 100
        : 0,
      currency: 'SGD' as SupportedCurrency, // Will be formatted as percentage
      trend: trends ? calculateMarginTrend(analytics, trends) : undefined,
      icon: TrendingUp,
      className: analytics.net_profit >= 0 
        ? 'border-blue-700/50 bg-blue-900/10'
        : 'border-orange-700/50 bg-orange-900/10'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.id} {...metric} />
      ))}
    </div>
  );
}

function MetricCard({
  title,
  value,
  currency,
  trend,
  icon: Icon,
  className = ''
}: MetricCardProps) {
  const formatValue = (val: number, curr: SupportedCurrency, isPercentage?: boolean) => {
    // Handle percentage formatting for profit margin
    if (title === 'Profit Margin') {
      return `${val.toFixed(1)}%`;
    }
    
    const symbol = CURRENCY_SYMBOLS[curr] || curr;
    
    if (Math.abs(val) >= 1000000) {
      return `${symbol}${(val / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(val) >= 1000) {
      return `${symbol}${(val / 1000).toFixed(1)}K`;
    }
    
    return `${symbol}${val.toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    })}`;
  };

  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) return null;

    if (trend > 0) {
      return <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />;
    } else {
      return <TrendingDown className="w-3 h-3 text-red-600 dark:text-red-400" />;
    }
  };

  const getTrendColor = () => {
    if (trend === undefined || trend === 0) return 'text-muted-foreground';
    return trend > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  const getTrendText = () => {
    if (trend === undefined) return '';
    if (trend === 0) return 'No change';
    
    const absChange = Math.abs(trend);
    const direction = trend > 0 ? 'up' : 'down';
    
    if (absChange >= 100) {
      return `${absChange.toFixed(0)}% ${direction}`;
    }
    return `${absChange.toFixed(1)}% ${direction}`;
  };

  return (
    <div className={`bg-card border border-border rounded-lg p-6 transition-all hover:bg-accent/50 ${className}`}>
      {/* Header with Title and Icon */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon && (
          <Icon className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      {/* Main Value */}
      <div className="mb-2">
        <p className="text-2xl font-bold text-foreground">
          {formatValue(value, currency)}
        </p>
      </div>

      {/* Trend Information */}
      <div className="flex items-center justify-between">
        {trend !== undefined ? (
          <div className="flex items-center space-x-1">
            {getTrendIcon()}
            <span className={`text-xs font-medium ${getTrendColor()}`}>
              {getTrendText()}
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-1">
            <Minus className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">No trend</span>
          </div>
        )}

        <span className="text-xs text-muted-foreground">vs. prev period</span>
      </div>
    </div>
  );
}

/**
 * Calculate profit margin trend based on current and previous period trends
 */
function calculateMarginTrend(analytics: AnalyticsData, trends: AnalyticsTrends): number {
  const currentMargin = analytics.total_income > 0 
    ? (analytics.net_profit / analytics.total_income) * 100 
    : 0;
  
  // Calculate previous period values
  const previousIncome = analytics.total_income / (1 + trends.income_change / 100);
  const previousProfit = analytics.net_profit / (1 + trends.profit_change / 100);
  const previousMargin = previousIncome > 0 ? (previousProfit / previousIncome) * 100 : 0;
  
  if (previousMargin === 0) return 0;
  return ((currentMargin - previousMargin) / Math.abs(previousMargin)) * 100;
}