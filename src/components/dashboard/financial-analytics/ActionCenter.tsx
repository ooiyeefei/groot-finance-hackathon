'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, CheckCircle, CreditCard, PiggyBank, AlertCircle } from 'lucide-react';
import ActionButton from '@/components/ui/action-button';
import { AnalyticsData, AnalyticsTrends, ActionItem } from '../types/analytics';

interface ActionCenterProps {
  analytics: AnalyticsData | null;
  trends: AnalyticsTrends | null;
  onActionClick?: (action: string) => void;
  loading: boolean;
}

export default function ActionCenter({
  analytics,
  trends,
  onActionClick,
  loading
}: ActionCenterProps) {
  const actionItems = useMemo(() => {
    if (!analytics) return [];

    const items: ActionItem[] = [];

    // Negative profit alert
    if (analytics.net_profit < 0) {
      items.push({
        id: 'negative-profit',
        type: 'error',
        title: 'Negative Profit Alert',
        description: `Your expenses exceed income by ${Math.abs(analytics.net_profit).toLocaleString()}. Review your spending patterns.`,
        priority: 'high',
        action: {
          label: 'Review Expenses',
          onClick: () => onActionClick?.('review-expenses')
        }
      });
    }

    // Declining income trend
    if (trends?.income_change && trends.income_change < -10) {
      items.push({
        id: 'declining-income',
        type: 'warning',
        title: 'Income Declining',
        description: `Income has decreased by ${Math.abs(trends.income_change).toFixed(1)}% compared to last period.`,
        priority: 'high',
        action: {
          label: 'Analyze Revenue',
          onClick: () => onActionClick?.('analyze-revenue')
        }
      });
    }

    // Rising expenses trend
    if (trends?.expenses_change && trends.expenses_change > 20) {
      items.push({
        id: 'rising-expenses',
        type: 'warning',
        title: 'Expenses Rising',
        description: `Expenses have increased by ${trends.expenses_change.toFixed(1)}% compared to last period.`,
        priority: 'medium',
        action: {
          label: 'Control Costs',
          onClick: () => onActionClick?.('control-costs')
        }
      });
    }

    // Positive profit growth
    if (analytics.net_profit > 0 && trends?.profit_change && trends.profit_change > 20) {
      items.push({
        id: 'profit-growth',
        type: 'success',
        title: 'Strong Profit Growth',
        description: `Profit increased by ${trends.profit_change.toFixed(1)}%. Consider investing in growth opportunities.`,
        priority: 'medium',
        action: {
          label: 'Explore Growth',
          onClick: () => onActionClick?.('explore-growth')
        }
      });
    }

    // Currency exposure (multiple currencies with significant amounts)
    const currencies = Object.entries(analytics.currency_breakdown);
    const significantCurrencies = currencies.filter(([_, amount]) => Math.abs(amount) > 1000);
    
    if (significantCurrencies.length > 2) {
      items.push({
        id: 'currency-exposure',
        type: 'info',
        title: 'Multi-Currency Exposure',
        description: `You have exposure to ${significantCurrencies.length} currencies. Consider hedging foreign exchange risk.`,
        priority: 'low',
        action: {
          label: 'Review FX Risk',
          onClick: () => onActionClick?.('review-fx-risk')
        }
      });
    }

    // Low transaction volume (if very few categories)
    const categoryCount = Object.keys(analytics.category_breakdown).length;
    if (categoryCount < 3 && analytics.total_expenses > 0) {
      items.push({
        id: 'categorization',
        type: 'info',
        title: 'Improve Categorization',
        description: 'Most expenses are uncategorized. Better categorization helps with insights.',
        priority: 'low',
        action: {
          label: 'Categorize Transactions',
          onClick: () => onActionClick?.('categorize-transactions')
        }
      });
    }

    // High profit margin (good news)
    const profitMargin = analytics.total_income > 0 ? (analytics.net_profit / analytics.total_income) * 100 : 0;
    if (profitMargin > 30 && analytics.net_profit > 0) {
      items.push({
        id: 'healthy-margin',
        type: 'success',
        title: 'Healthy Profit Margin',
        description: `Your profit margin is ${profitMargin.toFixed(1)}%. You're maintaining strong profitability.`,
        priority: 'low'
      });
    }

    return items.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }, [analytics, trends, onActionClick]);

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="h-6 bg-gray-700 rounded w-32 mb-4 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-gray-700/50 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-600 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-600 rounded w-full mb-3"></div>
              <div className="h-8 bg-gray-600 rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (actionItems.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Action Center</h3>
        <div className="flex items-center justify-center py-8 text-gray-400">
          <div className="text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
            <p className="text-sm">All looking good!</p>
            <p className="text-xs mt-1">No urgent actions needed at this time</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Action Center</h3>
        <span className="text-xs text-gray-400">
          {actionItems.length} {actionItems.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actionItems.map((item) => (
          <ActionCard key={item.id} item={item} />
        ))}
      </div>

      {/* Summary footer */}
      <div className="mt-6 pt-4 border-t border-gray-700 flex items-center justify-between text-xs text-gray-400">
        <span>
          Priority items: {actionItems.filter(item => item.priority === 'high').length} high, 
          {' '}{actionItems.filter(item => item.priority === 'medium').length} medium
        </span>
        <span>Last updated: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

function ActionCard({ item }: { item: ActionItem }) {
  const getTypeStyles = () => {
    switch (item.type) {
      case 'error':
        return {
          borderColor: 'border-red-600',
          backgroundColor: 'bg-red-900/10',
          iconColor: 'text-red-400',
          icon: AlertTriangle
        };
      case 'warning':
        return {
          borderColor: 'border-yellow-600',
          backgroundColor: 'bg-yellow-900/10',
          iconColor: 'text-yellow-400',
          icon: AlertCircle
        };
      case 'success':
        return {
          borderColor: 'border-green-600',
          backgroundColor: 'bg-green-900/10',
          iconColor: 'text-green-400',
          icon: CheckCircle
        };
      case 'info':
      default:
        return {
          borderColor: 'border-blue-600',
          backgroundColor: 'bg-blue-900/10',
          iconColor: 'text-blue-400',
          icon: AlertCircle
        };
    }
  };

  const getPriorityBadge = () => {
    const colors = {
      high: 'bg-red-900/20 text-red-300 border-red-700/50',
      medium: 'bg-yellow-900/20 text-yellow-300 border-yellow-700/50',
      low: 'bg-gray-900/20 text-gray-300 border-gray-700/50'
    };

    return (
      <span className={`text-xs px-2 py-1 rounded-full border ${colors[item.priority]}`}>
        {item.priority}
      </span>
    );
  };

  const styles = getTypeStyles();
  const Icon = styles.icon;

  return (
    <div className={`
      border rounded-lg p-4 transition-all hover:bg-gray-750
      ${styles.borderColor} ${styles.backgroundColor}
    `}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center">
          <Icon className={`w-5 h-5 mr-2 ${styles.iconColor}`} />
          <h4 className="font-medium text-white text-sm">{item.title}</h4>
        </div>
        {getPriorityBadge()}
      </div>

      {/* Description */}
      <p className="text-gray-300 text-xs mb-4 leading-relaxed">
        {item.description}
      </p>

      {/* Action Button */}
      {item.action && (
        <ActionButton
          onClick={item.action.onClick}
          variant="secondary"
          size="sm"
          className="w-full text-xs"
        >
          {item.action.label}
        </ActionButton>
      )}
    </div>
  );
}