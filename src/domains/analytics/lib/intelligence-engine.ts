/**
 * Intelligence Engine for Proactive Financial Insights
 * Advanced analytics and predictive insights for Southeast Asian SME operations
 */

import { FinancialAnalytics, ComplianceAlert } from './engine';
import { RiskScore, calculateRiskScore, TransactionRiskContext, DEFAULT_RISK_CONFIG } from './risk-scoring';
import { SupportedCurrency } from '@/lib/types/currency';
import { ActionItem, AnalyticsData } from '@/domains/analytics/types/analytics';

export interface IntelligentInsight {
  id: string;
  type: 'predictive' | 'anomaly' | 'opportunity' | 'risk' | 'efficiency';
  severity: 'info' | 'warning' | 'critical';
  confidence: number; // 0-100 confidence in the insight
  title: string;
  description: string;
  impact: {
    financial?: number; // Projected financial impact
    probability?: number; // 0-100 probability of occurrence
    timeframe?: string; // When this might happen
  };
  recommendations: string[];
  data_points: string[]; // Supporting evidence
  priority_score: number; // 0-100 for ranking
}

export interface CashFlowPrediction {
  period: string; // 'next_week' | 'next_month' | 'next_quarter'
  predicted_inflow: number;
  predicted_outflow: number;
  net_position: number;
  confidence: number;
  risk_factors: string[];
}

export interface TrendAnalysis {
  metric: string;
  direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  rate_of_change: number; // percentage per period
  statistical_significance: number; // 0-100
  pattern_type: 'linear' | 'seasonal' | 'exponential' | 'cyclical';
}

export interface AnomalyDetection {
  transaction_id?: string;
  anomaly_type: 'amount' | 'frequency' | 'timing' | 'vendor' | 'category';
  severity: 'minor' | 'moderate' | 'severe';
  deviation_score: number; // How many standard deviations from normal
  explanation: string;
  suggested_action: string;
}

/**
 * Generate intelligent insights from financial analytics
 */
export function generateIntelligentInsights(
  currentAnalytics: AnalyticsData,
  previousAnalytics?: AnalyticsData,
  historicalData?: AnalyticsData[]
): IntelligentInsight[] {
  const insights: IntelligentInsight[] = [];

  // 1. Predictive Cash Flow Insights
  insights.push(...generateCashFlowInsights(currentAnalytics, previousAnalytics));

  // 2. Trend Analysis Insights
  if (previousAnalytics) {
    insights.push(...generateTrendInsights(currentAnalytics, previousAnalytics));
  }

  // 3. Risk and Compliance Insights
  insights.push(...generateRiskInsights(currentAnalytics));

  // 4. Efficiency and Optimization Insights
  insights.push(...generateEfficiencyInsights(currentAnalytics, previousAnalytics));

  // 5. Seasonal and Pattern Insights
  if (historicalData && historicalData.length >= 3) {
    insights.push(...generateSeasonalInsights(currentAnalytics, historicalData));
  }

  // Sort by priority score (highest first)
  return insights.sort((a, b) => b.priority_score - a.priority_score);
}

/**
 * Generate cash flow prediction insights
 */
function generateCashFlowInsights(
  current: AnalyticsData,
  previous?: AnalyticsData
): IntelligentInsight[] {
  const insights: IntelligentInsight[] = [];

  // Analyze outstanding receivables for cash flow prediction
  const totalReceivables = current.aged_receivables.total_outstanding;
  const highRiskReceivables = current.aged_receivables.late_90_plus;

  if (totalReceivables > 0) {
    const collectionRate = 1 - (highRiskReceivables / totalReceivables);
    const predictedInflow = totalReceivables * collectionRate;

    insights.push({
      id: 'cash-flow-prediction',
      type: 'predictive',
      severity: totalReceivables > 50000 ? 'warning' : 'info',
      confidence: Math.min(90, collectionRate * 100),
      title: 'Cash Flow Prediction',
      description: `Based on current receivables, expect ${formatCurrency(predictedInflow, 'SGD')} inflow over next 30 days`,
      impact: {
        financial: predictedInflow,
        probability: collectionRate * 100,
        timeframe: 'next 30 days'
      },
      recommendations: [
        highRiskReceivables > 0 ? 'Follow up on overdue receivables immediately' : 'Maintain current collection processes',
        'Consider offering early payment discounts for faster cash conversion'
      ],
      data_points: [
        `Total outstanding: ${formatCurrency(totalReceivables, 'SGD')}`,
        `High-risk amount: ${formatCurrency(highRiskReceivables, 'SGD')}`,
        `Collection efficiency: ${(collectionRate * 100).toFixed(1)}%`
      ],
      priority_score: totalReceivables > 50000 ? 85 : 65
    });
  }

  // Payables cash flow impact
  const totalPayables = current.aged_payables.total_outstanding;
  if (totalPayables > 0) {
    const urgentPayables = current.aged_payables.late_31_60 + current.aged_payables.late_90_plus;

    insights.push({
      id: 'payables-cash-impact',
      type: 'risk',
      severity: urgentPayables > totalPayables * 0.5 ? 'critical' : 'warning',
      confidence: 95,
      title: 'Supplier Payment Obligations',
      description: `${formatCurrency(totalPayables, 'SGD')} in outstanding payables with ${formatCurrency(urgentPayables, 'SGD')} requiring immediate attention`,
      impact: {
        financial: -totalPayables,
        probability: 100,
        timeframe: 'next 30 days'
      },
      recommendations: [
        'Prioritize payments to maintain supplier relationships',
        urgentPayables > 0 ? 'Negotiate payment plans for overdue amounts' : 'Maintain current payment schedule'
      ],
      data_points: [
        `Total payables: ${formatCurrency(totalPayables, 'SGD')}`,
        `Urgent payments: ${formatCurrency(urgentPayables, 'SGD')}`,
        `Payment pressure: ${((urgentPayables / totalPayables) * 100).toFixed(1)}%`
      ],
      priority_score: urgentPayables > totalPayables * 0.5 ? 90 : 70
    });
  }

  return insights;
}

/**
 * Generate trend-based insights
 */
function generateTrendInsights(
  current: AnalyticsData,
  previous: AnalyticsData
): IntelligentInsight[] {
  const insights: IntelligentInsight[] = [];

  // Revenue trend analysis
  const revenueChange = previous.total_income > 0
    ? ((current.total_income - previous.total_income) / previous.total_income) * 100
    : 0;

  if (Math.abs(revenueChange) > 10) {
    const isPositive = revenueChange > 0;
    insights.push({
      id: 'revenue-trend',
      type: isPositive ? 'opportunity' : 'risk',
      severity: Math.abs(revenueChange) > 25 ? 'critical' : 'warning',
      confidence: 85,
      title: `${isPositive ? 'Revenue Growth' : 'Revenue Decline'} Detected`,
      description: `Revenue has ${isPositive ? 'increased' : 'decreased'} by ${Math.abs(revenueChange).toFixed(1)}% compared to previous period`,
      impact: {
        financial: current.total_income - previous.total_income,
        probability: 80,
        timeframe: 'continuing trend'
      },
      recommendations: isPositive ? [
        'Consider scaling operations to capitalize on growth',
        'Ensure adequate cash flow management for expansion'
      ] : [
        'Investigate causes of revenue decline',
        'Review and adjust business strategy',
        'Consider cost reduction measures'
      ],
      data_points: [
        `Current revenue: ${formatCurrency(current.total_income, 'SGD')}`,
        `Previous revenue: ${formatCurrency(previous.total_income, 'SGD')}`,
        `Change: ${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}%`
      ],
      priority_score: Math.min(95, 70 + Math.abs(revenueChange))
    });
  }

  // Expense trend analysis
  const expenseChange = previous.total_expenses > 0
    ? ((current.total_expenses - previous.total_expenses) / previous.total_expenses) * 100
    : 0;

  if (expenseChange > 15) {
    insights.push({
      id: 'expense-trend',
      type: 'risk',
      severity: expenseChange > 30 ? 'critical' : 'warning',
      confidence: 85,
      title: 'Rising Expense Trend',
      description: `Expenses have increased by ${expenseChange.toFixed(1)}% - monitor cost efficiency`,
      impact: {
        financial: -(current.total_expenses - previous.total_expenses),
        probability: 75,
        timeframe: 'ongoing impact'
      },
      recommendations: [
        'Review largest expense categories for optimization',
        'Implement cost control measures',
        'Negotiate better terms with suppliers'
      ],
      data_points: [
        `Current expenses: ${formatCurrency(current.total_expenses, 'SGD')}`,
        `Previous expenses: ${formatCurrency(previous.total_expenses, 'SGD')}`,
        `Increase: +${expenseChange.toFixed(1)}%`
      ],
      priority_score: Math.min(90, 65 + expenseChange)
    });
  }

  // Profit margin analysis
  const currentMargin = current.total_income > 0 ? (current.net_profit / current.total_income) * 100 : 0;
  const previousMargin = previous.total_income > 0 ? (previous.net_profit / previous.total_income) * 100 : 0;
  const marginChange = currentMargin - previousMargin;

  if (Math.abs(marginChange) > 5) {
    const isImproving = marginChange > 0;
    insights.push({
      id: 'margin-trend',
      type: isImproving ? 'opportunity' : 'risk',
      severity: Math.abs(marginChange) > 15 ? 'critical' : 'warning',
      confidence: 90,
      title: `Profit Margin ${isImproving ? 'Improvement' : 'Deterioration'}`,
      description: `Profit margin has ${isImproving ? 'improved' : 'declined'} by ${Math.abs(marginChange).toFixed(1)} percentage points`,
      impact: {
        financial: current.net_profit - previous.net_profit,
        probability: 85,
        timeframe: 'current trend'
      },
      recommendations: isImproving ? [
        'Maintain current operational efficiency',
        'Consider reinvesting profits for growth'
      ] : [
        'Review pricing strategy',
        'Optimize operational costs',
        'Focus on high-margin activities'
      ],
      data_points: [
        `Current margin: ${currentMargin.toFixed(1)}%`,
        `Previous margin: ${previousMargin.toFixed(1)}%`,
        `Change: ${marginChange > 0 ? '+' : ''}${marginChange.toFixed(1)}pp`
      ],
      priority_score: Math.min(95, 75 + Math.abs(marginChange))
    });
  }

  return insights;
}

/**
 * Generate risk-based insights
 */
function generateRiskInsights(current: AnalyticsData): IntelligentInsight[] {
  const insights: IntelligentInsight[] = [];

  // High-risk receivables concentration
  const criticalReceivables = current.aged_receivables.risk_distribution.critical || 0;
  const highReceivables = current.aged_receivables.risk_distribution.high || 0;
  const totalHighRisk = criticalReceivables + highReceivables;

  if (totalHighRisk > 0) {
    insights.push({
      id: 'high-risk-receivables',
      type: 'risk',
      severity: criticalReceivables > 0 ? 'critical' : 'warning',
      confidence: 95,
      title: 'High-Risk Receivables Alert',
      description: `${totalHighRisk} receivables transactions classified as high or critical risk`,
      impact: {
        financial: current.aged_receivables.total_outstanding * 0.3, // Estimated potential loss
        probability: 30 + (criticalReceivables * 20),
        timeframe: 'next 60 days'
      },
      recommendations: [
        'Implement immediate collection procedures',
        'Consider factoring or credit insurance',
        'Review customer credit policies'
      ],
      data_points: [
        `Critical risk: ${criticalReceivables} transactions`,
        `High risk: ${highReceivables} transactions`,
        `Average risk score: ${current.aged_receivables.average_risk_score.toFixed(1)}`
      ],
      priority_score: 85 + (criticalReceivables * 5)
    });
  }

  // Currency concentration risk
  const currencies = Object.keys(current.currency_breakdown);
  if (currencies.length > 3) {
    const totalExposure = Object.values(current.currency_breakdown)
      .reduce((sum, amount) => sum + Math.abs(amount), 0);

    insights.push({
      id: 'currency-concentration',
      type: 'risk',
      severity: 'warning',
      confidence: 80,
      title: 'Multi-Currency Exposure Risk',
      description: `Exposure to ${currencies.length} currencies creates foreign exchange risk`,
      impact: {
        financial: totalExposure * 0.05, // 5% potential FX impact
        probability: 60,
        timeframe: 'ongoing market volatility'
      },
      recommendations: [
        'Consider hedging major currency exposures',
        'Monitor exchange rate movements',
        'Implement natural hedging strategies'
      ],
      data_points: [
        `Currencies: ${currencies.join(', ')}`,
        `Total exposure: ${formatCurrency(totalExposure, 'SGD')}`,
        `Volatility risk: Medium to High`
      ],
      priority_score: 60 + (currencies.length * 3)
    });
  }

  return insights;
}

/**
 * Generate efficiency and optimization insights
 */
function generateEfficiencyInsights(
  current: AnalyticsData,
  previous?: AnalyticsData
): IntelligentInsight[] {
  const insights: IntelligentInsight[] = [];

  // Category concentration analysis
  const categories = Object.entries(current.category_breakdown);
  if (categories.length > 0) {
    const totalExpenses = current.total_expenses;
    const topCategory = categories.reduce((max, [cat, amount]) =>
      amount > max.amount ? { category: cat, amount } : max,
      { category: '', amount: 0 }
    );

    if (topCategory.amount > totalExpenses * 0.4) {
      insights.push({
        id: 'expense-concentration',
        type: 'efficiency',
        severity: 'warning',
        confidence: 85,
        title: 'High Expense Concentration',
        description: `${topCategory.category} represents ${((topCategory.amount / totalExpenses) * 100).toFixed(1)}% of total expenses`,
        impact: {
          financial: topCategory.amount * 0.1, // 10% potential savings
          probability: 70,
          timeframe: 'next quarter with optimization'
        },
        recommendations: [
          `Review ${topCategory.category} spending for optimization opportunities`,
          'Diversify expense categories to reduce concentration risk',
          'Negotiate bulk discounts or better terms'
        ],
        data_points: [
          `${topCategory.category}: ${formatCurrency(topCategory.amount, 'SGD')}`,
          `Percentage of total: ${((topCategory.amount / totalExpenses) * 100).toFixed(1)}%`,
          `Optimization potential: High`
        ],
        priority_score: 65
      });
    }
  }

  // Transaction volume efficiency
  if (current.transaction_count < 10 && current.total_expenses > 5000) {
    insights.push({
      id: 'transaction-efficiency',
      type: 'efficiency',
      severity: 'info',
      confidence: 75,
      title: 'Transaction Processing Efficiency',
      description: 'Low transaction volume suggests potential for bulk processing and automation',
      impact: {
        financial: 500, // Estimated administrative savings
        probability: 80,
        timeframe: 'next month with process improvements'
      },
      recommendations: [
        'Consider consolidating vendor payments',
        'Implement automated recurring transactions',
        'Use bulk processing for similar transactions'
      ],
      data_points: [
        `Transaction count: ${current.transaction_count}`,
        `Average transaction size: ${formatCurrency(current.total_expenses / current.transaction_count, 'SGD')}`,
        `Processing efficiency: Below optimal`
      ],
      priority_score: 50
    });
  }

  return insights;
}

/**
 * Generate seasonal and pattern insights
 */
function generateSeasonalInsights(
  current: AnalyticsData,
  historical: AnalyticsData[]
): IntelligentInsight[] {
  const insights: IntelligentInsight[] = [];

  // Simple seasonal analysis based on historical patterns
  if (historical.length >= 6) {
    const currentMonth = new Date(current.period_start).getMonth();
    const historicalSameMonth = historical.filter(h =>
      new Date(h.period_start).getMonth() === currentMonth
    );

    if (historicalSameMonth.length >= 2) {
      const avgHistoricalRevenue = historicalSameMonth
        .reduce((sum, h) => sum + h.total_income, 0) / historicalSameMonth.length;

      const seasonalVariance = ((current.total_income - avgHistoricalRevenue) / avgHistoricalRevenue) * 100;

      if (Math.abs(seasonalVariance) > 20) {
        insights.push({
          id: 'seasonal-pattern',
          type: 'predictive',
          severity: Math.abs(seasonalVariance) > 40 ? 'warning' : 'info',
          confidence: 70,
          title: 'Seasonal Pattern Detected',
          description: `Revenue is ${seasonalVariance > 0 ? 'above' : 'below'} seasonal average by ${Math.abs(seasonalVariance).toFixed(1)}%`,
          impact: {
            financial: current.total_income - avgHistoricalRevenue,
            probability: 65,
            timeframe: 'seasonal trend'
          },
          recommendations: [
            seasonalVariance > 0 ? 'Capitalize on strong seasonal performance' : 'Prepare for typical seasonal downturn',
            'Adjust cash flow planning for seasonal patterns',
            'Consider seasonal marketing or inventory adjustments'
          ],
          data_points: [
            `Current period: ${formatCurrency(current.total_income, 'SGD')}`,
            `Historical average: ${formatCurrency(avgHistoricalRevenue, 'SGD')}`,
            `Seasonal variance: ${seasonalVariance > 0 ? '+' : ''}${seasonalVariance.toFixed(1)}%`
          ],
          priority_score: 55 + Math.abs(seasonalVariance) / 4
        });
      }
    }
  }

  return insights;
}

/**
 * Convert insights to action items for UI display
 */
export function convertInsightsToActionItems(
  insights: IntelligentInsight[],
  onActionClick?: (action: string) => void
): ActionItem[] {
  return insights.slice(0, 6).map(insight => ({
    id: insight.id,
    type: insight.severity === 'critical' ? 'error' :
          insight.severity === 'warning' ? 'warning' :
          insight.type === 'opportunity' ? 'success' : 'info',
    title: insight.title,
    description: `${insight.description} (${insight.confidence}% confidence)`,
    priority: insight.priority_score > 80 ? 'high' :
              insight.priority_score > 60 ? 'medium' : 'low',
    action: insight.recommendations.length > 0 ? {
      label: 'View Details',
      onClick: () => onActionClick?.(insight.id)
    } : undefined
  }));
}

/**
 * Utility function for currency formatting
 */
function formatCurrency(amount: number, currency: SupportedCurrency): string {
  const symbols: Record<SupportedCurrency, string> = {
    'SGD': 'S$',
    'MYR': 'RM',
    'USD': '$',
    'EUR': '€',
    'THB': '฿',
    'IDR': 'Rp',
    'CNY': '¥',
    'VND': '₫',
    'PHP': '₱',
    'INR': '₹'
  };

  const symbol = symbols[currency] || currency;

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
}