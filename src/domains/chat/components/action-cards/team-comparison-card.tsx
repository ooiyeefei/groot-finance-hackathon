'use client'

/**
 * Team Comparison Card
 *
 * Renders horizontal bar chart comparing employee spending,
 * with outlier highlighting and team average indicator.
 */

import { Users, Download, AlertTriangle } from 'lucide-react'
import { exportToCSV } from '../../lib/csv-export'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface EmployeeSpend {
  employeeId: string
  employeeName: string
  totalSpend: number
  claimCount: number
  isOutlier: boolean
  topCategories: Array<{ name: string; amount: number }>
}

interface TeamComparisonData {
  period: string
  currency: string
  employees: EmployeeSpend[]
  teamAverage: number
  teamTotal: number
  outlierThreshold: number
}

function TeamComparisonCard({ action }: ActionCardProps) {
  const data = action.data as unknown as TeamComparisonData

  if (!data?.employees?.length) return null

  const currency = data.currency || 'MYR'
  const maxSpend = Math.max(...data.employees.map((e) => e.totalSpend))
  const averageBarPercent = maxSpend > 0
    ? Math.min((data.teamAverage / maxSpend) * 100, 100)
    : 0

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-foreground">Team Spending Comparison</span>
          {data.period && (
            <span className="text-xs text-muted-foreground"> · {data.period}</span>
          )}
        </div>
        <button
          onClick={() => exportToCSV(
            'team-comparison.csv',
            ['Employee', 'Total Spend', 'Claim Count', 'Outlier', 'Top Categories'],
            data.employees.map((emp) => [
              emp.employeeName,
              emp.totalSpend,
              emp.claimCount,
              emp.isOutlier ? 'Yes' : 'No',
              emp.topCategories.map((c) => `${c.name}: ${c.amount}`).join('; '),
            ])
          )}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Export CSV"
          title="Export as CSV"
        >
          <Download className="w-3 h-3" />
        </button>
      </div>

      {/* Bar chart */}
      <div className="px-3 py-2.5 space-y-2">
        {data.employees.map((emp) => {
          const barPercent = maxSpend > 0
            ? Math.min((emp.totalSpend / maxSpend) * 100, 100)
            : 0

          return (
            <div key={emp.employeeId}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <div className="flex items-center gap-1 truncate mr-2">
                  <span className="text-foreground truncate">{emp.employeeName}</span>
                  {emp.isOutlier && (
                    <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-foreground font-medium">
                    {formatCurrency(emp.totalSpend, currency)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({emp.claimCount})
                  </span>
                </div>
              </div>

              {/* Bar with average line overlay */}
              <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    emp.isOutlier
                      ? 'bg-amber-500'
                      : 'bg-primary'
                  }`}
                  style={{ width: `${barPercent}%` }}
                />
                {/* Team average indicator */}
                {averageBarPercent > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px border-l border-dashed border-foreground/40"
                    style={{ left: `${averageBarPercent}%` }}
                    title={`Team avg: ${formatCurrency(data.teamAverage, currency)}`}
                  />
                )}
              </div>

              {/* Top categories (compact) */}
              {emp.topCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {emp.topCategories.slice(0, 3).map((cat) => (
                    <span
                      key={cat.name}
                      className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
                    >
                      {cat.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Team average legend */}
      <div className="px-3 py-1.5 border-t border-border">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-block w-3 border-t border-dashed border-foreground/40" />
          <span>Team average: {formatCurrency(data.teamAverage, currency)}</span>
        </div>
      </div>

      {/* Summary */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Team total: <span className="font-medium text-foreground">{formatCurrency(data.teamTotal, currency)}</span>
          </span>
          <span>
            Average: <span className="font-medium text-foreground">{formatCurrency(data.teamAverage, currency)}</span>
          </span>
          <span>
            Outlier threshold: <span className="font-medium text-foreground">{formatCurrency(data.outlierThreshold, currency)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('team_comparison', TeamComparisonCard)

export { TeamComparisonCard }
