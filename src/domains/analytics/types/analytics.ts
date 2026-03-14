/**
 * Analytics Dashboard Types
 * Supporting multi-currency Southeast Asian SME operations
 */

import { SupportedCurrency } from '@/lib/types/currency';
import { EnhancedAgedReceivables, EnhancedAgedPayables, ComplianceAlert } from '@/domains/analytics/lib/engine';

export interface AgedReceivables {
  current: number;        // 0-30 days
  late_31_60: number;     // 31-60 days  
  late_61_90: number;     // 61-90 days
  late_90_plus: number;   // 90+ days
  total_outstanding: number;
}

export interface AgedPayables {
  current: number;        // 0-30 days
  late_31_60: number;     // 31-60 days  
  late_61_90: number;     // 61-90 days
  late_90_plus: number;   // 90+ days
  total_outstanding: number;
}

export interface AnalyticsData {
  total_income: number;
  total_expenses: number;
  net_profit: number;
  transaction_count: number;
  currency_breakdown: Record<string, number>;
  category_breakdown: Record<string, number>;
  aged_receivables: EnhancedAgedReceivables;
  aged_payables: EnhancedAgedPayables;
  compliance_alerts: ComplianceAlert[];
  period_start: string;
  period_end: string;
  calculated_at: string;
}

export interface AnalyticsTrends {
  income_change: number;
  expenses_change: number;
  profit_change: number;
}

export interface AnalyticsResponse {
  success: boolean;
  data: {
    analytics: AnalyticsData;
    trends?: AnalyticsTrends;
    previous_period?: AnalyticsData;
  };
  error?: string;
}

export interface DashboardProps {
  period?: 'month' | 'quarter' | 'year';
  homeCurrency?: SupportedCurrency;
  includeTrends?: boolean;
  onPeriodChange?: (period: 'month' | 'quarter' | 'year') => void;
  onActionClick?: (action: string) => void;
}

export interface MetricCardProps {
  title: string;
  value: number;
  currency: SupportedCurrency;
  trend?: number;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  color?: string;
  currency?: SupportedCurrency;
}

export interface CurrencyChartData extends ChartDataPoint {
  currency: SupportedCurrency;
  percentage: number;
}

export interface CategoryChartData extends ChartDataPoint {
  category: string;
  percentage: number;
}

export interface ActionItem {
  id: string;
  type: 'warning' | 'info' | 'success' | 'error';
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  priority: 'high' | 'medium' | 'low';
}

// Dark theme color palette for charts
export const DARK_THEME_COLORS = {
  income: '#10B981',      // green-500
  expense: '#EF4444',     // red-500  
  transfer: '#3B82F6',    // blue-500
  currencies: {
    SGD: '#8B5CF6',       // violet-500
    MYR: '#F59E0B',       // amber-500
    USD: '#10B981',       // green-500
    EUR: '#EF4444',       // red-500
    THB: '#3B82F6',       // blue-500
    IDR: '#F97316',       // orange-500
    CNY: '#84CC16',       // lime-500
    VND: '#EC4899',       // pink-500
    PHP: '#06B6D4',       // cyan-500
    others: '#6B7280'     // gray-500
  },
  categories: [
    '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', 
    '#3B82F6', '#F97316', '#84CC16', '#EC4899',
    '#06B6D4', '#8B5A2B', '#7C3AED', '#DC2626'
  ],
  chart: {
    text: '#F9FAFB',      // gray-50
    grid: '#374151',      // gray-700
    background: 'transparent'
  }
} as const;