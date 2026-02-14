'use client'

/**
 * Spending Time-Series Card
 *
 * Renders multi-period spending data as vertical bar groups with
 * category stacking, trend indicators, and period labels.
 * CSS-based visualization (no charting library).
 */

import { TrendingUp, TrendingDown, Minus as MinusIcon, BarChart3 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface TimeSeriesPeriod {
  label: string
  total: number
  categories?: Array<{
    name: string
    amount: number
  }>
}

interface SpendingTimeSeriesData {
  chartType: 'time_series'
  title: string
  currency: string
  periods: TimeSeriesPeriod[]
  trendPercent?: number
  trendDirection?: 'up' | 'down' | 'stable'
}

const CATEGORY_COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-orange-500',
] as const

function SpendingTimeSeries({ action }: ActionCardProps) {
  const data = action.data as unknown as SpendingTimeSeriesData

  if (!data?.periods?.length) return null

  const currency = data.currency || 'SGD'
  const maxTotal = Math.max(...data.periods.map((p) => p.total))

  // Collect unique category names for legend
  const categoryNames = new Set<string>()
  data.periods.forEach((p) => {
    p.categories?.forEach((c) => categoryNames.add(c.name))
  })
  const categories = Array.from(categoryNames)

  const TrendIcon = data.trendDirection === 'up'
    ? TrendingUp
    : data.trendDirection === 'down'
      ? TrendingDown
      : MinusIcon

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">{data.title}</span>
        {data.trendPercent !== undefined && data.trendDirection && (
          <span className={`ml-auto flex items-center gap-0.5 text-[10px] font-medium ${
            data.trendDirection === 'up'
              ? 'text-destructive'
              : data.trendDirection === 'down'
                ? 'text-green-600 dark:text-green-400'
                : 'text-muted-foreground'
          }`}>
            <TrendIcon className="w-3 h-3" />
            {data.trendDirection === 'stable' ? 'Stable' : `${Math.abs(data.trendPercent)}%`}
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="px-3 py-2.5">
        <div className="flex items-end gap-1.5" style={{ minHeight: '80px' }}>
          {data.periods.map((period) => {
            const barHeight = maxTotal > 0 ? (period.total / maxTotal) * 100 : 0
            return (
              <div key={period.label} className="flex-1 flex flex-col items-center gap-1">
                {/* Bar */}
                <div className="w-full flex flex-col justify-end" style={{ height: '64px' }}>
                  {period.categories && period.categories.length > 0 ? (
                    // Stacked bar
                    <div
                      className="w-full rounded-t overflow-hidden flex flex-col-reverse"
                      style={{ height: `${barHeight}%` }}
                    >
                      {period.categories.map((cat, catIdx) => {
                        const catPct = period.total > 0 ? (cat.amount / period.total) * 100 : 0
                        return (
                          <div
                            key={cat.name}
                            className={`w-full ${CATEGORY_COLORS[catIdx % CATEGORY_COLORS.length]}`}
                            style={{ height: `${catPct}%`, minHeight: catPct > 0 ? '2px' : '0px' }}
                          />
                        )
                      })}
                    </div>
                  ) : (
                    // Single bar
                    <div
                      className="w-full bg-primary rounded-t"
                      style={{ height: `${barHeight}%` }}
                    />
                  )}
                </div>
                {/* Value label */}
                <span className="text-[9px] text-muted-foreground font-medium">
                  {formatCurrency(period.total, currency)}
                </span>
                {/* Period label */}
                <span className="text-[9px] text-muted-foreground truncate max-w-full">
                  {period.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Category legend */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border">
            {categories.slice(0, 6).map((name, idx) => (
              <div key={name} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-sm ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`} />
                <span className="text-[9px] text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('spending_time_series', SpendingTimeSeries)

export { SpendingTimeSeries }
