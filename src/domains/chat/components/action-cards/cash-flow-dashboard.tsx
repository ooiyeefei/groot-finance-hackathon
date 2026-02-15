'use client'

/**
 * Cash Flow Dashboard Card
 *
 * Renders financial health metrics from the analyze_cash_flow tool:
 * runway days, burn rate, projected balance, expense ratio, and alert badges.
 */

import { Activity, AlertTriangle, TrendingDown, TrendingUp, Expand } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface CashFlowAlert {
  type: 'low_runway' | 'expense_exceeding_income'
  severity: 'critical' | 'high' | 'medium'
  message: string
}

interface CashFlowDashboardData {
  runwayDays: number
  monthlyBurnRate: number
  estimatedBalance: number
  totalIncome: number
  totalExpenses: number
  expenseToIncomeRatio: number
  currency: string
  forecastPeriod?: string
  alerts: CashFlowAlert[]
}

const SEVERITY_COLORS = {
  critical: 'bg-destructive/15 text-destructive border-destructive/30',
  high: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  medium: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
} as const

function CashFlowDashboard({ action, onViewDetails }: ActionCardProps) {
  const data = action.data as unknown as CashFlowDashboardData

  if (!data || data.runwayDays === undefined) return null

  const currency = data.currency || 'SGD'
  const netCashFlow = data.totalIncome - data.totalExpenses
  const isPositiveFlow = netCashFlow >= 0

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Activity className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Cash Flow Dashboard</span>
        {data.forecastPeriod && (
          <span className="text-xs text-muted-foreground"> · {data.forecastPeriod}</span>
        )}
      </div>

      {/* Metrics Grid (2x2) */}
      <div className="grid grid-cols-2 gap-px bg-border">
        <MetricCell
          label="Runway"
          value={`${formatNumber(data.runwayDays, 0)} days`}
          icon={data.runwayDays < 30 ? 'warning' : 'neutral'}
        />
        <MetricCell
          label="Monthly Burn"
          value={formatCurrency(data.monthlyBurnRate, currency)}
          icon="neutral"
        />
        <MetricCell
          label="Est. Balance"
          value={formatCurrency(data.estimatedBalance, currency)}
          icon={data.estimatedBalance < 0 ? 'warning' : 'neutral'}
        />
        <MetricCell
          label="Net Cash Flow"
          value={formatCurrency(Math.abs(netCashFlow), currency)}
          prefix={isPositiveFlow ? '+' : '-'}
          icon={isPositiveFlow ? 'positive' : 'negative'}
        />
      </div>

      {/* Expense-to-Income Ratio */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Expense-to-Income Ratio</span>
          <span className={`font-medium ${
            data.expenseToIncomeRatio > 1
              ? 'text-destructive'
              : data.expenseToIncomeRatio > 0.8
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-green-600 dark:text-green-400'
          }`}>
            {formatNumber(data.expenseToIncomeRatio * 100, 1)}%
          </span>
        </div>
        <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              data.expenseToIncomeRatio > 1
                ? 'bg-destructive'
                : data.expenseToIncomeRatio > 0.8
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(data.expenseToIncomeRatio * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Alerts */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="px-3 py-2 border-t border-border space-y-1.5">
          {data.alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-1.5 px-2 py-1.5 rounded text-xs border ${SEVERITY_COLORS[alert.severity]}`}
            >
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* View Details */}
      {onViewDetails && (
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => onViewDetails({
              type: 'dashboard',
              title: `Cash Flow ${data.forecastPeriod || 'Dashboard'}`,
              data: {
                metrics: [
                  { label: 'Runway Days', value: data.runwayDays },
                  { label: 'Monthly Burn Rate', value: formatCurrency(data.monthlyBurnRate, currency) },
                  { label: 'Estimated Balance', value: formatCurrency(data.estimatedBalance, currency) },
                  { label: 'Total Income', value: formatCurrency(data.totalIncome, currency) },
                  { label: 'Total Expenses', value: formatCurrency(data.totalExpenses, currency) },
                  { label: 'Expense-to-Income', value: `${(data.expenseToIncomeRatio * 100).toFixed(1)}%` },
                ],
              },
            })}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Expand className="w-3 h-3" />
            View Details
          </button>
        </div>
      )}
    </div>
  )
}

function MetricCell({
  label,
  value,
  prefix,
  icon,
}: {
  label: string
  value: string
  prefix?: string
  icon: 'positive' | 'negative' | 'warning' | 'neutral'
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <div className="flex items-center gap-1">
        {icon === 'positive' && <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />}
        {icon === 'negative' && <TrendingDown className="w-3 h-3 text-destructive" />}
        {icon === 'warning' && <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />}
        <span className="text-xs font-semibold text-foreground">
          {prefix}{value}
        </span>
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('cash_flow_dashboard', CashFlowDashboard)

export { CashFlowDashboard }
