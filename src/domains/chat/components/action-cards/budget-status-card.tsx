'use client'

/**
 * Budget Status Card
 *
 * Renders budget status per category with progress bars,
 * color-coded by spend percentage, and an export CSV button.
 */

import { PieChart, Download } from 'lucide-react'
import { exportToCSV } from '../../lib/csv-export'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface BudgetCategory {
  categoryId: string
  categoryName: string
  budgetLimit: number
  currentSpend: number
  remaining: number
  percentUsed: number
  status: 'on_track' | 'warning' | 'overspent'
}

interface BudgetStatusData {
  period: string
  currency: string
  categories: BudgetCategory[]
  totalBudget: number
  totalSpend: number
  overallStatus: 'on_track' | 'warning' | 'overspent'
}

const STATUS_CONFIG = {
  on_track: {
    label: 'On Track',
    badge: 'bg-green-500/15 text-green-600 dark:text-green-400',
    bar: 'bg-emerald-500',
  },
  warning: {
    label: 'Warning',
    badge: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
    bar: 'bg-amber-500',
  },
  overspent: {
    label: 'Overspent',
    badge: 'bg-destructive/15 text-destructive',
    bar: 'bg-red-500',
  },
} as const

function getBarColor(percentUsed: number): string {
  if (percentUsed >= 100) return 'bg-red-500'
  if (percentUsed >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function BudgetStatusCard({ action }: ActionCardProps) {
  const data = action.data as unknown as BudgetStatusData

  if (!data?.categories?.length) return null

  const currency = data.currency || 'MYR'
  const overallConfig = STATUS_CONFIG[data.overallStatus] || STATUS_CONFIG.on_track
  const totalPercentUsed = data.totalBudget > 0
    ? Math.round((data.totalSpend / data.totalBudget) * 100)
    : 0

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <PieChart className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-foreground">Budget Status</span>
          {data.period && (
            <span className="text-xs text-muted-foreground"> · {data.period}</span>
          )}
        </div>
        <button
          onClick={() => exportToCSV(
            'budget-status.csv',
            ['Category', 'Budget Limit', 'Current Spend', 'Remaining', '% Used', 'Status'],
            data.categories.map((cat) => [
              cat.categoryName,
              cat.budgetLimit,
              cat.currentSpend,
              cat.remaining,
              Math.round(cat.percentUsed),
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

          const pctUsed = typeof cat.percentUsed === 'number' && !isNaN(cat.percentUsed) ? cat.percentUsed : 0

          return (
            <div key={cat.categoryId || cat.categoryName}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-foreground truncate mr-2">{cat.categoryName}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-foreground font-medium">
                    {formatCurrency(cat.currentSpend || 0, currency)} / {formatCurrency(cat.budgetLimit || 0, currency)}
                  </span>
                  <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${config.badge}`}>
                    {cat.status === 'overspent' ? 'Over' : `${Math.round(pctUsed)}%`}
                  </span>
                </div>
              </div>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(pctUsed)}`}
                  style={{ width: `${Math.min(pctUsed, 100)}%` }}
                />
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
              {formatCurrency(data.totalSpend, currency)}
            </span>
            <span className="text-muted-foreground ml-1.5">
              / {formatCurrency(data.totalBudget, currency)}
            </span>
            <span className={`ml-1.5 text-[10px] font-medium px-1 py-0.5 rounded ${
              STATUS_CONFIG[data.overallStatus]?.badge || STATUS_CONFIG.on_track.badge
            }`}>
              {totalPercentUsed}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('budget_status', BudgetStatusCard)

export { BudgetStatusCard }
