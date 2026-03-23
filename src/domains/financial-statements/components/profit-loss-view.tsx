'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProfitLossStatement, ProfitLossLine } from '@/convex/lib/statement_generators/profit_loss_generator'
import { formatCurrency } from '@/lib/utils/format-number'

interface ProfitLossViewProps {
  data: ProfitLossStatement | null
  comparisonData?: {
    current: ProfitLossStatement
    comparison: ProfitLossStatement
    variance: any
  } | null
  isLoading: boolean
  showComparison: boolean
  onToggleComparison: () => void
}

interface SectionConfig {
  key: string
  label: string
  lines: ProfitLossLine[]
  total: number
  comparisonLines?: ProfitLossLine[]
  comparisonTotal?: number
}

function CollapsibleSection({
  config,
  currency,
  showComparison,
  comparisonCurrency,
}: {
  config: SectionConfig
  currency: string
  showComparison: boolean
  comparisonCurrency?: string
}) {
  const [expanded, setExpanded] = useState(false)

  const varianceAmount =
    config.comparisonTotal !== undefined
      ? config.total - config.comparisonTotal
      : 0
  const variancePct =
    config.comparisonTotal && config.comparisonTotal !== 0
      ? (varianceAmount / Math.abs(config.comparisonTotal)) * 100
      : 0

  return (
    <div>
      {/* Section header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 py-2 text-left text-foreground hover:bg-muted/50 rounded px-1 -mx-1"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-sm font-semibold">{config.label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrency(config.total, currency)}
        </span>
        {showComparison && config.comparisonTotal !== undefined && (
          <>
            <span className="w-28 text-right text-sm tabular-nums text-muted-foreground">
              {formatCurrency(config.comparisonTotal, comparisonCurrency ?? currency)}
            </span>
            <span
              className={`w-32 text-right text-sm tabular-nums ${
                varianceAmount >= 0 ? 'text-green-500' : 'text-destructive'
              }`}
            >
              {varianceAmount >= 0 ? '+' : ''}
              {formatCurrency(varianceAmount, currency)} (
              {variancePct >= 0 ? '+' : ''}
              {variancePct.toFixed(1)}%)
            </span>
          </>
        )}
      </button>

      {/* Expanded line items */}
      {expanded && config.lines.length > 0 && (
        <div className="ml-6 divide-y divide-border">
          {config.lines.map((line) => {
            const compLine = config.comparisonLines?.find(
              (cl) => cl.accountCode === line.accountCode
            )
            const lineVariance = compLine ? line.amount - compLine.amount : 0
            const lineVariancePct =
              compLine && compLine.amount !== 0
                ? (lineVariance / Math.abs(compLine.amount)) * 100
                : 0

            return (
              <div
                key={line.accountCode}
                className="flex items-center py-1.5 text-sm text-foreground"
              >
                <span className="w-16 font-mono text-xs text-muted-foreground">
                  {line.accountCode}
                </span>
                <span className="flex-1">{line.accountName}</span>
                <span className="tabular-nums">
                  {formatCurrency(line.amount, currency)}
                </span>
                {showComparison && config.comparisonTotal !== undefined && (
                  <>
                    <span className="w-28 text-right tabular-nums text-muted-foreground">
                      {compLine
                        ? formatCurrency(compLine.amount, comparisonCurrency ?? currency)
                        : '-'}
                    </span>
                    <span
                      className={`w-32 text-right tabular-nums ${
                        lineVariance >= 0
                          ? 'text-green-500'
                          : 'text-destructive'
                      }`}
                    >
                      {compLine
                        ? `${lineVariance >= 0 ? '+' : ''}${formatCurrency(
                            lineVariance,
                            currency
                          )} (${lineVariancePct >= 0 ? '+' : ''}${lineVariancePct.toFixed(1)}%)`
                        : '-'}
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {expanded && config.lines.length === 0 && (
        <p className="ml-6 py-2 text-xs text-muted-foreground">
          No items in this section
        </p>
      )}
    </div>
  )
}

function SummaryRow({
  label,
  amount,
  currency,
  bold,
  showComparison,
  comparisonAmount,
  comparisonCurrency,
}: {
  label: string
  amount: number
  currency: string
  bold?: boolean
  showComparison: boolean
  comparisonAmount?: number
  comparisonCurrency?: string
}) {
  const varianceAmount =
    comparisonAmount !== undefined ? amount - comparisonAmount : 0
  const variancePct =
    comparisonAmount && comparisonAmount !== 0
      ? (varianceAmount / Math.abs(comparisonAmount)) * 100
      : 0

  return (
    <div
      className={`flex items-center border-t border-border py-2 ${
        bold ? 'font-bold' : 'font-medium'
      } text-sm text-foreground`}
    >
      <span className="flex-1 pl-6">{label}</span>
      <span className="tabular-nums">{formatCurrency(amount, currency)}</span>
      {showComparison && comparisonAmount !== undefined && (
        <>
          <span className="w-28 text-right tabular-nums text-muted-foreground">
            {formatCurrency(comparisonAmount, comparisonCurrency ?? currency)}
          </span>
          <span
            className={`w-32 text-right tabular-nums ${
              varianceAmount >= 0 ? 'text-green-500' : 'text-destructive'
            }`}
          >
            {varianceAmount >= 0 ? '+' : ''}
            {formatCurrency(varianceAmount, currency)} (
            {variancePct >= 0 ? '+' : ''}
            {variancePct.toFixed(1)}%)
          </span>
        </>
      )}
    </div>
  )
}

export function ProfitLossView({
  data,
  comparisonData,
  isLoading,
  showComparison,
  onToggleComparison,
}: ProfitLossViewProps) {
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

  const comp = showComparison ? comparisonData?.comparison : undefined

  const sections: SectionConfig[] = [
    {
      key: 'revenue',
      label: 'Revenue',
      lines: data.revenue.lines,
      total: data.revenue.total,
      comparisonLines: comp?.revenue.lines,
      comparisonTotal: comp?.revenue.total,
    },
    {
      key: 'cogs',
      label: 'Cost of Goods Sold',
      lines: data.costOfGoodsSold.lines,
      total: data.costOfGoodsSold.total,
      comparisonLines: comp?.costOfGoodsSold.lines,
      comparisonTotal: comp?.costOfGoodsSold.total,
    },
    {
      key: 'opex',
      label: 'Operating Expenses',
      lines: data.operatingExpenses.lines,
      total: data.operatingExpenses.total,
      comparisonLines: comp?.operatingExpenses.lines,
      comparisonTotal: comp?.operatingExpenses.total,
    },
    {
      key: 'otherIncome',
      label: 'Other Income',
      lines: data.otherIncome.lines,
      total: data.otherIncome.total,
      comparisonLines: comp?.otherIncome.lines,
      comparisonTotal: comp?.otherIncome.total,
    },
    {
      key: 'otherExpenses',
      label: 'Other Expenses',
      lines: data.otherExpenses.lines,
      total: data.otherExpenses.total,
      comparisonLines: comp?.otherExpenses.lines,
      comparisonTotal: comp?.otherExpenses.total,
    },
  ]

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          Profit & Loss Statement
        </h3>
        <Button
          className={
            showComparison
              ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
              : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
          }
          size="sm"
          onClick={onToggleComparison}
        >
          {showComparison ? 'Hide Comparison' : 'Compare Periods'}
        </Button>
      </div>

      {/* Column headers when comparison is active */}
      {showComparison && comp && (
        <div className="mb-2 flex items-center border-b border-border pb-2 text-xs font-medium text-muted-foreground">
          <span className="flex-1" />
          <span>Current</span>
          <span className="w-28 text-right">Comparison</span>
          <span className="w-32 text-right">Variance</span>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-1">
        {/* Revenue */}
        <CollapsibleSection
          config={sections[0]}
          currency={data.currency}
          showComparison={showComparison && !!comp}
          comparisonCurrency={comp?.currency}
        />

        {/* COGS */}
        <CollapsibleSection
          config={sections[1]}
          currency={data.currency}
          showComparison={showComparison && !!comp}
          comparisonCurrency={comp?.currency}
        />

        {/* Gross Profit */}
        <SummaryRow
          label="Gross Profit"
          amount={data.grossProfit}
          currency={data.currency}
          showComparison={showComparison && !!comp}
          comparisonAmount={comp?.grossProfit}
          comparisonCurrency={comp?.currency}
        />

        {/* Operating Expenses */}
        <CollapsibleSection
          config={sections[2]}
          currency={data.currency}
          showComparison={showComparison && !!comp}
          comparisonCurrency={comp?.currency}
        />

        {/* Operating Income */}
        <SummaryRow
          label="Operating Income"
          amount={data.operatingIncome}
          currency={data.currency}
          showComparison={showComparison && !!comp}
          comparisonAmount={comp?.operatingIncome}
          comparisonCurrency={comp?.currency}
        />

        {/* Other Income */}
        <CollapsibleSection
          config={sections[3]}
          currency={data.currency}
          showComparison={showComparison && !!comp}
          comparisonCurrency={comp?.currency}
        />

        {/* Other Expenses */}
        <CollapsibleSection
          config={sections[4]}
          currency={data.currency}
          showComparison={showComparison && !!comp}
          comparisonCurrency={comp?.currency}
        />

        {/* Net Profit */}
        <SummaryRow
          label="Net Profit"
          amount={data.netProfit}
          currency={data.currency}
          bold
          showComparison={showComparison && !!comp}
          comparisonAmount={comp?.netProfit}
          comparisonCurrency={comp?.currency}
        />
      </div>
    </div>
  )
}
