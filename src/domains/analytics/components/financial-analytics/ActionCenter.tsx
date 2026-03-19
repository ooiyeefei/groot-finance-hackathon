'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { AlertTriangle, TrendingDown, TrendingUp, CheckCircle, CreditCard, PiggyBank, AlertCircle, Calendar, Clock } from 'lucide-react';
import ActionButton from '@/components/ui/action-button';
import { AnalyticsData, AnalyticsTrends, ActionItem } from '@/domains/analytics/types/analytics';
import { AccountingEntry } from '@/lib/types/currency';

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
  const { isLoaded, isSignedIn } = useAuth();
  const [statusBasedData, setStatusBasedData] = useState<{
    overdueTransactions: AccountingEntry[];
    upcomingDueTransactions: AccountingEntry[];
    awaitingPaymentCount: number;
  }>({
    overdueTransactions: [],
    upcomingDueTransactions: [],
    awaitingPaymentCount: 0
  });

  // Client-only timestamp to avoid hydration mismatch
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Fetch status-based transaction data for smart alerts
  // Wait for Clerk auth to be loaded before fetching
  useEffect(() => {
    // Don't fetch until auth is fully loaded and user is signed in
    if (!isLoaded || !isSignedIn) {
      return;
    }

    const fetchStatusData = async () => {
      try {
        const response = await fetch('/api/v1/accounting-entries?include_status_analytics=true');
        if (response.ok) {
          const data = await response.json();
          
          const today = new Date();
          const nextWeek = new Date();
          nextWeek.setDate(today.getDate() + 7);
          
          const overdue = data.transactions?.filter((t: AccountingEntry) =>
            t.status === 'overdue' ||
            (t.due_date && new Date(t.due_date) < today && t.status !== 'paid')
          ) || [];

          const upcomingDue = data.transactions?.filter((t: AccountingEntry) =>
            t.due_date &&
            new Date(t.due_date) >= today &&
            new Date(t.due_date) <= nextWeek &&
            t.status !== 'paid'
          ) || [];

          // NOTE: 'awaiting_payment' status removed from system - using 'pending' instead
          const awaitingCount = data.transactions?.filter((t: AccountingEntry) =>
            t.status === 'pending'
          ).length || 0;
          
          setStatusBasedData({
            overdueTransactions: overdue,
            upcomingDueTransactions: upcomingDue,
            awaitingPaymentCount: awaitingCount
          });
        }
      } catch (error) {
        // Error handled silently - status-based analytics are non-critical
      }
    };

    fetchStatusData();
  }, [analytics, isLoaded, isSignedIn]); // Refetch when analytics change or auth state changes

  // Update timestamp on client side to avoid hydration mismatch
  useEffect(() => {
    setLastUpdated(new Date().toLocaleTimeString());
  }, [statusBasedData]); // Update when data changes

  const actionItems = useMemo(() => {
    if (!analytics) return [];

    const items: ActionItem[] = [];

    // TASK 3: Compliance alerts (highest priority)
    if (analytics.compliance_alerts && analytics.compliance_alerts.length > 0) {
      // Group compliance alerts by status and risk level
      const criticalAlerts = analytics.compliance_alerts.filter(alert => 
        alert.compliance_status === 'non_compliant' || alert.risk_level === 'critical'
      );
      const requiresAttentionAlerts = analytics.compliance_alerts.filter(alert => 
        alert.compliance_status === 'requires_attention' && alert.risk_level !== 'critical'
      );

      // Critical compliance alerts
      if (criticalAlerts.length > 0) {
        items.push({
          id: 'critical-compliance',
          type: 'error',
          title: 'Critical Compliance Issues',
          description: `${criticalAlerts.length} transaction${criticalAlerts.length === 1 ? '' : 's'} with critical compliance violations requiring immediate attention.`,
          priority: 'high',
          action: {
            label: 'Review Compliance',
            onClick: () => onActionClick?.('review-critical-compliance')
          }
        });
      }

      // Requires attention alerts
      if (requiresAttentionAlerts.length > 0) {
        items.push({
          id: 'compliance-attention',
          type: 'warning',
          title: 'Compliance Review Needed',
          description: `${requiresAttentionAlerts.length} cross-border transaction${requiresAttentionAlerts.length === 1 ? '' : 's'} require${requiresAttentionAlerts.length === 1 ? 's' : ''} compliance review.`,
          priority: 'high',
          action: {
            label: 'Review Transactions',
            onClick: () => onActionClick?.('review-compliance-transactions')
          }
        });
      }
    }

    // Status-based alerts (high priority)
    if (statusBasedData.overdueTransactions.length > 0) {
      items.push({
        id: 'overdue-transactions',
        type: 'error',
        title: 'Overdue Payments',
        description: `You have ${statusBasedData.overdueTransactions.length} overdue ${statusBasedData.overdueTransactions.length === 1 ? 'transaction' : 'transactions'} requiring immediate attention.`,
        priority: 'high',
        action: {
          label: 'Review Overdue',
          onClick: () => onActionClick?.('review-overdue')
        }
      });
    }

    if (statusBasedData.upcomingDueTransactions.length > 0) {
      items.push({
        id: 'upcoming-due',
        type: 'warning',
        title: 'Upcoming Due Dates',
        description: `${statusBasedData.upcomingDueTransactions.length} ${statusBasedData.upcomingDueTransactions.length === 1 ? 'payment is' : 'payments are'} due within the next 7 days.`,
        priority: 'high',
        action: {
          label: 'View Calendar',
          onClick: () => onActionClick?.('view-payment-calendar')
        }
      });
    }

    if (statusBasedData.awaitingPaymentCount > 0) {
      items.push({
        id: 'awaiting-payment',
        type: 'info',
        title: 'Awaiting Payment',
        description: `${statusBasedData.awaitingPaymentCount} ${statusBasedData.awaitingPaymentCount === 1 ? 'transaction is' : 'transactions are'} waiting for payment confirmation.`,
        priority: 'medium',
        action: {
          label: 'Update Status',
          onClick: () => onActionClick?.('update-payment-status')
        }
      });
    }

    // Negative profit alert
    if ((analytics.net_profit ?? 0) < 0) {
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
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="h-6 bg-record-layer-2 rounded w-32 mb-4 animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="bg-record-layer-2/50 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-record-layer-2 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-record-layer-2 rounded w-full mb-3"></div>
              <div className="h-8 bg-record-layer-2 rounded w-20"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (actionItems.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Action Center</h3>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-600 dark:text-green-400" />
            <p className="text-sm">All looking good!</p>
            <p className="text-xs mt-1">No urgent actions needed at this time</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Action Center</h3>
        <span className="text-xs text-muted-foreground">
          {actionItems.length} {actionItems.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {actionItems.map((item) => (
          <ActionCard key={item.id} item={item} />
        ))}
      </div>

      {/* Summary footer */}
      <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Priority items: {actionItems.filter(item => item.priority === 'high').length} high,
          {' '}{actionItems.filter(item => item.priority === 'medium').length} medium
        </span>
        <span>Last updated: {lastUpdated || 'Loading...'}</span>
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
      high: 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700/50',
      medium: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700/50',
      low: 'bg-muted text-muted-foreground border-border'
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
      border rounded-lg p-4 transition-all hover:bg-accent/50
      ${styles.borderColor} ${styles.backgroundColor}
    `}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center">
          <Icon className={`w-5 h-5 mr-2 ${styles.iconColor}`} />
          <h4 className="font-medium text-foreground text-sm">{item.title}</h4>
        </div>
        {getPriorityBadge()}
      </div>

      {/* Description */}
      <p className="text-muted-foreground text-xs mb-4 leading-relaxed">
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