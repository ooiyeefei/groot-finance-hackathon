'use client'

/**
 * Spending Chart Card
 *
 * Renders horizontal bar chart for spending category breakdowns.
 * CSS-based visualization that fits within the 400px chat widget.
 */

import { BarChart3 } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'

interface ChartCategory {
  label: string
  value: number
  percentage?: number
  color?: string
}

interface SpendingChartData {
  chartType?: string
  title: string
  period?: string
  categories: ChartCategory[]
  total?: number
  currency?: string
}

const BAR_COLORS = [
  'bg-primary',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
] as const

function SpendingChart({ action }: ActionCardProps) {
  const data = action.data as unknown as SpendingChartData

  if (!data?.categories?.length) return null

  const currency = data.currency || 'SGD'
  const maxValue = Math.max(...data.categories.map((c) => c.value))

  // Calculate percentages if not provided
  const total = data.total || data.categories.reduce((sum, c) => sum + c.value, 0)
  const categoriesWithPct = data.categories.map((cat) => ({
    ...cat,
    percentage: cat.percentage ?? (total > 0 ? Math.round((cat.value / total) * 100) : 0),
  }))

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <BarChart3 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <div className="min-w-0">
          <span className="text-xs font-medium text-foreground">{data.title}</span>
          {data.period && (
            <span className="text-xs text-muted-foreground"> · {data.period}</span>
          )}
        </div>
      </div>

      {/* Bars */}
      <div className="px-3 py-2.5 space-y-2">
        {categoriesWithPct.map((cat, idx) => (
          <div key={cat.label}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-foreground truncate mr-2">{cat.label}</span>
              <span className="text-foreground font-medium flex-shrink-0">
                {currency} {cat.value.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                  style={{ width: `${maxValue > 0 ? (cat.value / maxValue) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground w-8 text-right flex-shrink-0">
                {cat.percentage}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      {total > 0 && (
        <div className="px-3 py-2 border-t border-border flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">Total</span>
          <span className="text-xs font-semibold text-foreground">
            {currency} {total.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}

// Register the card type
registerActionCard('spending_chart', SpendingChart)

export { SpendingChart }
