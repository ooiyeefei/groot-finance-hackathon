'use client'

/**
 * Revenue Summary Card
 *
 * Shows income breakdown by source with totals, transaction count,
 * and a simple bar visualization of revenue sources.
 */

import { TrendingUp, Download, Expand } from 'lucide-react'
import { exportToCSV } from '../../lib/csv-export'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface RevenueSource {
  name: string
  amount: number
  count: number
  percentOfTotal: number
}

interface RevenueSummaryData {
  period: string
  currency: string
  sources: RevenueSource[]
  totalRevenue: number
  transactionCount: number
}

function RevenueSummaryCard({ action, onViewDetails }: ActionCardProps) {
  const data = action.data as unknown as RevenueSummaryData

  if (!data?.sources?.length) return null

  const currency = data.currency || 'MYR'

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-green-500/5 border-b border-border flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Revenue Summary</span>
        {data.period && (
          <span className="text-xs text-muted-foreground"> · {data.period}</span>
        )}
        <button
          onClick={() => exportToCSV(
            'revenue-summary.csv',
            ['Source', 'Amount', 'Transactions', '% of Total'],
            data.sources.map((src) => [
              src.name,
              src.amount,
              src.count,
              Math.round(src.percentOfTotal),
            ])
          )}
          className="ml-auto p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Export CSV"
          title="Export as CSV"
        >
          <Download className="w-3 h-3" />
        </button>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
          {data.transactionCount} txn{data.transactionCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Source rows */}
      <div className="px-3 py-2.5 space-y-2.5">
        {data.sources.map((src) => (
          <div key={src.name}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-foreground truncate mr-2">{src.name}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-foreground font-medium">
                  {formatCurrency(src.amount, currency)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {Math.round(src.percentOfTotal)}%
                </span>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min(src.percentOfTotal, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Total summary */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Total Revenue</span>
          <span className="font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(data.totalRevenue, currency)}
          </span>
        </div>
      </div>

      {/* View Details */}
      {onViewDetails && (
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => onViewDetails({
              type: 'table',
              title: `Revenue Summary — ${data.period}`,
              data: {
                columns: ['Source', 'Amount', 'Transactions', '% of Total'],
                rows: data.sources.map((src) => [
                  src.name,
                  formatCurrency(src.amount, currency),
                  String(src.count),
                  `${Math.round(src.percentOfTotal)}%`,
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

registerActionCard('revenue_summary', RevenueSummaryCard)

export { RevenueSummaryCard }
