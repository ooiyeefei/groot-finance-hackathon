'use client'

/**
 * Trend Comparison Card
 *
 * Renders period comparisons and multi-period trend charts.
 * Two modes:
 * - comparison: Side-by-side period values with change metrics
 * - trend: CSS-based vertical bar chart with period labels
 *
 * Supports dual-currency display when displayCurrency is present.
 * Follows the spending-time-series.tsx CSS-based chart pattern.
 */

import { TrendingUp, TrendingDown, Minus as MinusIcon, BarChart3, ArrowLeftRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface PeriodData {
  label: string
  amount: number
  convertedAmount?: number
}

interface TrendComparisonCardData {
  chartType: 'comparison' | 'trend'
  title: string
  currency: string
  displayCurrency?: string
  exchangeRate?: number

  // Comparison mode
  periodA?: PeriodData
  periodB?: PeriodData
  absoluteChange?: number
  percentageChange?: number
  direction?: 'up' | 'down' | 'stable'

  // Trend mode
  periods?: PeriodData[]
  overallDirection?: 'up' | 'down' | 'stable'
  overallChangePercent?: number
}

function TrendComparisonCard({ action }: ActionCardProps) {
  const data = action.data as unknown as TrendComparisonCardData

  if (!data) return null

  if (data.chartType === 'comparison') {
    return <ComparisonView data={data} />
  }

  return <TrendView data={data} />
}

function ComparisonView({ data }: { data: TrendComparisonCardData }) {
  if (!data.periodA || !data.periodB) return null

  const TrendIcon = data.direction === 'up'
    ? TrendingUp
    : data.direction === 'down'
      ? TrendingDown
      : MinusIcon

  const trendColor = data.direction === 'up'
    ? 'text-green-600 dark:text-green-400'
    : data.direction === 'down'
      ? 'text-destructive'
      : 'text-muted-foreground'

  const formatAmount = (period: PeriodData) => {
    const home = formatCurrency(period.amount, data.currency)
    if (period.convertedAmount !== undefined && data.displayCurrency) {
      return `${home} (~ ${formatCurrency(period.convertedAmount, data.displayCurrency)})`
    }
    return home
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <ArrowLeftRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">{data.title}</span>
        {data.percentageChange !== undefined && data.direction && (
          <span className={`ml-auto flex items-center gap-0.5 text-[10px] font-medium ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {data.direction === 'stable' ? 'Stable' : `${Math.abs(data.percentageChange)}%`}
          </span>
        )}
      </div>

      {/* Comparison body */}
      <div className="p-3">
        <div className="grid grid-cols-2 gap-3">
          {/* Period A */}
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground mb-1">{data.periodA.label}</div>
            <div className="text-sm font-semibold text-foreground">{formatAmount(data.periodA)}</div>
          </div>

          {/* Period B */}
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground mb-1">{data.periodB.label}</div>
            <div className="text-sm font-semibold text-foreground">{formatAmount(data.periodB)}</div>
          </div>
        </div>

        {/* Change indicator */}
        {data.absoluteChange !== undefined && (
          <div className={`mt-2 pt-2 border-t border-border text-center ${trendColor}`}>
            <span className="text-xs font-medium">
              {data.direction === 'up' ? '+' : data.direction === 'down' ? '' : ''}
              {formatCurrency(data.absoluteChange, data.currency)}
              {' '}({data.direction === 'up' ? '+' : ''}{data.percentageChange}%)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function TrendView({ data }: { data: TrendComparisonCardData }) {
  if (!data.periods?.length) return null

  const maxAmount = Math.max(...data.periods.map((p) => p.amount))
  const currency = data.currency || 'MYR'

  const TrendIcon = data.overallDirection === 'up'
    ? TrendingUp
    : data.overallDirection === 'down'
      ? TrendingDown
      : MinusIcon

  const trendColor = data.overallDirection === 'up'
    ? 'text-green-600 dark:text-green-400'
    : data.overallDirection === 'down'
      ? 'text-destructive'
      : 'text-muted-foreground'

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">{data.title}</span>
        {data.overallChangePercent !== undefined && data.overallDirection && (
          <span className={`ml-auto flex items-center gap-0.5 text-[10px] font-medium ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {data.overallDirection === 'stable' ? 'Stable' : `${Math.abs(data.overallChangePercent)}%`}
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="p-3">
        <div className="flex items-end gap-1" style={{ height: '120px' }}>
          {data.periods.map((period, i) => {
            const height = maxAmount > 0 ? (period.amount / maxAmount) * 100 : 0
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: '100px' }}>
                  <div
                    className="w-full max-w-[32px] bg-primary rounded-t transition-all"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${period.label}: ${formatCurrency(period.amount, currency)}${
                      period.convertedAmount !== undefined && data.displayCurrency
                        ? ` (~ ${formatCurrency(period.convertedAmount, data.displayCurrency)})`
                        : ''
                    }`}
                  />
                </div>
                <span className="text-[8px] text-muted-foreground text-center leading-tight truncate w-full">
                  {period.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Summary row */}
        <div className="mt-2 pt-2 border-t border-border">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{data.periods[0]?.label}: {formatCurrency(data.periods[0]?.amount || 0, currency)}</span>
            <span>{data.periods[data.periods.length - 1]?.label}: {formatCurrency(data.periods[data.periods.length - 1]?.amount || 0, currency)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

registerActionCard('trend_comparison_card', TrendComparisonCard)
