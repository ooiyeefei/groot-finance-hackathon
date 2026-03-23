'use client'

import { Loader2 } from 'lucide-react'
import type {
  BalanceSheetStatement,
  BalanceSheetLine,
} from '@/convex/lib/statement_generators/balance_sheet_generator'
import { formatCurrency } from '@/lib/utils/format-number'

interface BalanceSheetViewProps {
  data: BalanceSheetStatement | null
  isLoading: boolean
}

function SectionTable({
  title,
  lines,
  total,
  totalLabel,
  currency,
}: {
  title: string
  lines: BalanceSheetLine[]
  total: number
  totalLabel: string
  currency: string
}) {
  return (
    <div className="mb-1">
      <h4 className="py-1.5 pl-4 text-sm font-medium text-muted-foreground">
        {title}
      </h4>
      {lines.length > 0 ? (
        <div className="divide-y divide-border">
          {lines.map((line) => (
            <div
              key={line.accountCode}
              className="flex items-center py-1.5 pl-8 pr-0 text-sm text-foreground"
            >
              <span className="w-16 font-mono text-xs text-muted-foreground">
                {line.accountCode}
              </span>
              <span className="flex-1">{line.accountName}</span>
              <span className="tabular-nums">
                {formatCurrency(line.balance, currency)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-1.5 pl-8 text-xs text-muted-foreground">
          No items
        </p>
      )}
      <div className="flex items-center border-t border-border py-1.5 pl-8 pr-0 text-sm font-semibold text-foreground">
        <span className="flex-1">{totalLabel}</span>
        <span className="tabular-nums">
          {formatCurrency(total, currency)}
        </span>
      </div>
    </div>
  )
}

export function BalanceSheetView({ data, isLoading }: BalanceSheetViewProps) {
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

  const imbalance = Math.abs(
    data.totalAssets - data.totalLiabilitiesAndEquity
  )

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          Balance Sheet
        </h3>
        {data.balanced ? (
          <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-500">
            A = L + E
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
            Unbalanced ({formatCurrency(imbalance, data.currency)})
          </span>
        )}
      </div>

      {/* Unbalanced warning */}
      {!data.balanced && (
        <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          The accounting equation is not balanced. Assets (
          {formatCurrency(data.totalAssets, data.currency)}) does not equal
          Liabilities + Equity (
          {formatCurrency(data.totalLiabilitiesAndEquity, data.currency)}).
          Imbalance: {formatCurrency(imbalance, data.currency)}.
        </div>
      )}

      {/* ASSETS */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground border-b border-border pb-2 mb-2">
          ASSETS
        </h3>
        <SectionTable
          title="Current Assets"
          lines={data.currentAssets.lines}
          total={data.currentAssets.total}
          totalLabel="Total Current Assets"
          currency={data.currency}
        />
        <SectionTable
          title="Non-Current Assets"
          lines={data.nonCurrentAssets.lines}
          total={data.nonCurrentAssets.total}
          totalLabel="Total Non-Current Assets"
          currency={data.currency}
        />
        <div className="flex items-center border-t-2 border-border py-2 text-sm font-bold text-foreground">
          <span className="flex-1 pl-4">Total Assets</span>
          <span className="tabular-nums">
            {formatCurrency(data.totalAssets, data.currency)}
          </span>
        </div>
      </div>

      {/* LIABILITIES */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground border-b border-border pb-2 mb-2">
          LIABILITIES
        </h3>
        <SectionTable
          title="Current Liabilities"
          lines={data.currentLiabilities.lines}
          total={data.currentLiabilities.total}
          totalLabel="Total Current Liabilities"
          currency={data.currency}
        />
        <SectionTable
          title="Non-Current Liabilities"
          lines={data.nonCurrentLiabilities.lines}
          total={data.nonCurrentLiabilities.total}
          totalLabel="Total Non-Current Liabilities"
          currency={data.currency}
        />
        <div className="flex items-center border-t-2 border-border py-2 text-sm font-bold text-foreground">
          <span className="flex-1 pl-4">Total Liabilities</span>
          <span className="tabular-nums">
            {formatCurrency(data.totalLiabilities, data.currency)}
          </span>
        </div>
      </div>

      {/* EQUITY */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground border-b border-border pb-2 mb-2">
          EQUITY
        </h3>
        {data.equity.lines.length > 0 && (
          <div className="divide-y divide-border">
            {data.equity.lines.map((line) => (
              <div
                key={line.accountCode}
                className="flex items-center py-1.5 pl-8 text-sm text-foreground"
              >
                <span className="w-16 font-mono text-xs text-muted-foreground">
                  {line.accountCode}
                </span>
                <span className="flex-1">{line.accountName}</span>
                <span className="tabular-nums">
                  {formatCurrency(line.balance, data.currency)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Retained Earnings */}
        <div className="flex items-center border-t border-border py-1.5 pl-8 text-sm text-foreground">
          <span className="flex-1 italic">Retained Earnings</span>
          <span className="tabular-nums">
            {formatCurrency(data.retainedEarnings, data.currency)}
          </span>
        </div>

        <div className="flex items-center border-t-2 border-border py-2 text-sm font-bold text-foreground">
          <span className="flex-1 pl-4">Total Equity</span>
          <span className="tabular-nums">
            {formatCurrency(data.totalEquity, data.currency)}
          </span>
        </div>
      </div>

      {/* Total Liabilities & Equity */}
      <div className="flex items-center border-t-2 border-border bg-muted/50 rounded-b-lg py-3 text-sm font-bold text-foreground">
        <span className="flex-1 pl-4">Total Liabilities & Equity</span>
        <span className="tabular-nums">
          {formatCurrency(data.totalLiabilitiesAndEquity, data.currency)}
        </span>
      </div>
    </div>
  )
}
