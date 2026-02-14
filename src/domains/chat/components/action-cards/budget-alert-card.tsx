'use client'

/**
 * Budget Alert Card
 *
 * Shows current month spending vs. rolling 3-month historical average
 * per category, with CSS progress bars and color-coded status indicators.
 */

import { Wallet, Expand, Download } from 'lucide-react'
import { exportToCSV } from '../../lib/csv-export'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface BudgetCategory {
  name: string
  currentSpend: number
  averageSpend: number
  percentOfAverage: number
  status: 'on_track' | 'above_average' | 'overspending'
}

interface BudgetAlertData {
  period: string
  currency: string
  categories: BudgetCategory[]
  totalCurrentSpend: number
  totalAverageSpend: number
  overallStatus: 'on_track' | 'above_average' | 'overspending'
}

const STATUS_CONFIG = {
  on_track: {
    label: 'On Track',
    badge: 'bg-green-500/15 text-green-600 dark:text-green-400',
    bar: 'bg-green-500',
  },
  above_average: {
    label: 'Above Average',
    badge: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    bar: 'bg-yellow-500',
  },
  overspending: {
    label: 'Overspending',
    badge: 'bg-destructive/15 text-destructive',
    bar: 'bg-destructive',
  },
} as const

function BudgetAlertCard({ action, onViewDetails }: ActionCardProps) {
  const data = action.data as unknown as BudgetAlertData

  if (!data?.categories?.length) return null

  const currency = data.currency || 'SGD'
  const overallConfig = STATUS_CONFIG[data.overallStatus] || STATUS_CONFIG.on_track

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Wallet className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Budget Alert</span>
        {data.period && (
          <span className="text-xs text-muted-foreground"> · {data.period}</span>
        )}
        <button
          onClick={() => exportToCSV(
            'budget-alert.csv',
            ['Category', 'Current Spend', 'Average Spend', '% of Average', 'Status'],
            data.categories.map((cat) => [
              cat.name,
              cat.currentSpend,
              cat.averageSpend,
              Math.round(cat.percentOfAverage),
              STATUS_CONFIG[cat.status]?.label || cat.status,
            ])
          )}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Export CSV"
          title="Export as CSV"
        >
          <Download className="w-3 h-3" />
        </button>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${overallConfig.badge}`}>
          {overallConfig.label}
        </span>
      </div>

      {/* Category rows */}
      <div className="px-3 py-2.5 space-y-2.5">
        {data.categories.map((cat) => {
          const config = STATUS_CONFIG[cat.status] || STATUS_CONFIG.on_track
          const barWidth = Math.min(cat.percentOfAverage, 150)

          return (
            <div key={cat.name}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-foreground truncate mr-2">{cat.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-foreground font-medium">
                    {formatCurrency(cat.currentSpend, currency)}
                  </span>
                  <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${config.badge}`}>
                    {Math.round(cat.percentOfAverage)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${config.bar}`}
                    style={{ width: `${Math.min(barWidth / 1.5, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-16 text-right flex-shrink-0">
                  avg {formatCurrency(cat.averageSpend, currency)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Total summary */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Total</span>
          <div className="text-right">
            <span className="font-semibold text-foreground">
              {formatCurrency(data.totalCurrentSpend, currency)}
            </span>
            <span className="text-muted-foreground ml-1.5">
              / avg {formatCurrency(data.totalAverageSpend, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* View Details */}
      {onViewDetails && (
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => onViewDetails({
              type: 'table',
              title: `Budget Alert — ${data.period}`,
              data: {
                columns: ['Category', 'Current', 'Average', '% of Avg', 'Status'],
                rows: data.categories.map((cat) => [
                  cat.name,
                  formatCurrency(cat.currentSpend, currency),
                  formatCurrency(cat.averageSpend, currency),
                  `${Math.round(cat.percentOfAverage)}%`,
                  STATUS_CONFIG[cat.status]?.label || cat.status,
                ]),
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

// Register the card type
registerActionCard('budget_alert', BudgetAlertCard)

export { BudgetAlertCard }
