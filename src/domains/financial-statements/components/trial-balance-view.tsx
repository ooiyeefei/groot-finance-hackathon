'use client'

import { Loader2 } from 'lucide-react'
import type { TrialBalanceStatement } from '@/convex/lib/statement_generators/trial_balance_generator'
import { formatCurrency } from '@/lib/utils/format-number'

interface TrialBalanceViewProps {
  data: TrialBalanceStatement | null
  isLoading: boolean
}

export function TrialBalanceView({ data, isLoading }: TrialBalanceViewProps) {
  if (isLoading) {
    return (
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Generating report...</span>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
        <p className="py-12 text-center text-muted-foreground">
          No data available for the selected period
        </p>
      </div>
    )
  }

  const sortedLines = [...data.lines].sort((a, b) =>
    a.accountCode.localeCompare(b.accountCode)
  )

  const difference = Math.abs(data.totalDebits - data.totalCredits)

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          Trial Balance
        </h3>
        {data.balanced ? (
          <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-500">
            Balanced
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
            Unbalanced ({formatCurrency(difference, data.currency)})
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Account Code</th>
              <th className="pb-2 pr-4 font-medium">Account Name</th>
              <th className="pb-2 pr-4 font-medium">Type</th>
              <th className="pb-2 pl-4 text-right font-medium">Debit Balance</th>
              <th className="pb-2 pl-4 text-right font-medium">Credit Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedLines.map((line) => (
              <tr key={line.accountCode} className="text-foreground">
                <td className="py-2 pr-4 font-mono text-xs">{line.accountCode}</td>
                <td className="py-2 pr-4">{line.accountName}</td>
                <td className="py-2 pr-4 capitalize text-muted-foreground">
                  {line.accountType}
                </td>
                <td className="py-2 pl-4 text-right tabular-nums">
                  {line.debitBalance > 0
                    ? formatCurrency(line.debitBalance, data.currency)
                    : '-'}
                </td>
                <td className="py-2 pl-4 text-right tabular-nums">
                  {line.creditBalance > 0
                    ? formatCurrency(line.creditBalance, data.currency)
                    : '-'}
                </td>
              </tr>
            ))}

            {/* Totals row */}
            <tr className="border-t-2 border-border font-bold text-foreground">
              <td className="pt-3 pr-4" />
              <td className="pt-3 pr-4">TOTAL</td>
              <td className="pt-3 pr-4" />
              <td className="pt-3 pl-4 text-right tabular-nums">
                {formatCurrency(data.totalDebits, data.currency)}
              </td>
              <td className="pt-3 pl-4 text-right tabular-nums">
                {formatCurrency(data.totalCredits, data.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
