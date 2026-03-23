'use client'

import { Loader2 } from 'lucide-react'
import type { CashFlowStatement } from '@/convex/lib/statement_generators/cash_flow_generator'
import { formatCurrency } from '@/lib/utils/format-number'

interface CashFlowViewProps {
  data: CashFlowStatement | null
  isLoading: boolean
}

function ActivitySection({
  title,
  lines,
  total,
  currency,
}: {
  title: string
  lines: { description: string; accountCode: string; amount: number }[]
  total: number
  currency: string
}) {
  return (
    <div className="mb-2">
      <h4 className="py-2 text-sm font-semibold text-foreground">{title}</h4>
      {lines.length > 0 ? (
        <div className="divide-y divide-border">
          {lines.map((line, idx) => (
            <div
              key={`${line.accountCode}-${idx}`}
              className="flex items-center py-1.5 pl-6 text-sm text-foreground"
            >
              <span className="flex-1">{line.description}</span>
              <span
                className={`tabular-nums ${
                  line.amount < 0 ? 'text-destructive' : ''
                }`}
              >
                {formatCurrency(line.amount, currency)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-1.5 pl-6 text-xs text-muted-foreground">
          No items
        </p>
      )}
      <div className="flex items-center border-t border-border py-1.5 pl-6 text-sm font-semibold text-foreground">
        <span className="flex-1">Total {title}</span>
        <span
          className={`tabular-nums ${total < 0 ? 'text-destructive' : ''}`}
        >
          {formatCurrency(total, currency)}
        </span>
      </div>
    </div>
  )
}

export function CashFlowView({ data, isLoading }: CashFlowViewProps) {
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

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          Cash Flow Statement
        </h3>
        {data.balanced ? (
          <span className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-500">
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
            Integrity Error
          </span>
        )}
      </div>

      {/* Opening Balance */}
      <div className="flex items-center border-b border-border py-2 text-sm font-semibold text-foreground">
        <span className="flex-1">Opening Balance</span>
        <span className="tabular-nums">
          {formatCurrency(data.openingBalance, data.currency)}
        </span>
      </div>

      {/* Activity Sections */}
      <ActivitySection
        title="Operating Activities"
        lines={data.operatingActivities.lines}
        total={data.operatingActivities.total}
        currency={data.currency}
      />
      <ActivitySection
        title="Investing Activities"
        lines={data.investingActivities.lines}
        total={data.investingActivities.total}
        currency={data.currency}
      />
      <ActivitySection
        title="Financing Activities"
        lines={data.financingActivities.lines}
        total={data.financingActivities.total}
        currency={data.currency}
      />

      {/* Net Change */}
      <div className="flex items-center border-t border-border py-2 text-sm font-semibold text-foreground">
        <span className="flex-1">Net Change in Cash</span>
        <span
          className={`tabular-nums ${
            data.netChange < 0 ? 'text-destructive' : ''
          }`}
        >
          {formatCurrency(data.netChange, data.currency)}
        </span>
      </div>

      {/* Closing Balance */}
      <div className="flex items-center border-t-2 border-border bg-muted/50 rounded-b-lg py-3 text-sm font-bold text-foreground">
        <span className="flex-1">Closing Balance</span>
        <span className="tabular-nums">
          {formatCurrency(data.closingBalance, data.currency)}
        </span>
      </div>
    </div>
  )
}
