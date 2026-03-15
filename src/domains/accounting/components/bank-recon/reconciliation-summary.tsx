'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import {
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useState, useCallback } from 'react'

interface ReconciliationSummaryProps {
  bankAccountId: Id<'bank_accounts'>
  dateFrom?: string
  dateTo?: string
}

export default function ReconciliationSummary({
  bankAccountId,
  dateFrom,
  dateTo,
}: ReconciliationSummaryProps) {
  const [showOutstanding, setShowOutstanding] = useState(false)

  const summary = useQuery(api.functions.bankTransactions.getReconciliationSummary, {
    bankAccountId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const handleExportSummary = useCallback(() => {
    if (!summary) return

    const headers = ['Date', 'Description', 'Amount', 'Direction']
    const rows = (summary.outstandingItems ?? []).map((item: any) => [
      item.date,
      `"${(item.description ?? '').replace(/"/g, '""')}"`,
      Math.abs(item.amount).toFixed(2),
      item.direction,
    ])

    // Add summary header
    const summaryRows = [
      ['RECONCILIATION SUMMARY'],
      [`Bank: ${summary.bankName} (****${summary.accountNumberLast4})`],
      [`Currency: ${summary.currency}`],
      [''],
      ['Metric', 'Value'],
      ['Total Transactions', String(summary.totalTransactions)],
      ['Total Credits', summary.totalCredits.toFixed(2)],
      ['Total Debits', summary.totalDebits.toFixed(2)],
      ['Closing Balance', summary.closingBalance.toFixed(2)],
      [''],
      ['Reconciled', String(summary.reconciledCount)],
      ['Classified (AI)', String(summary.classifiedCount)],
      ['Posted to GL', String(summary.postedCount)],
      ['Categorized', String(summary.categorizedCount)],
      ['Unmatched', String(summary.unmatchedCount)],
      ['Unmatched Amount', summary.unmatchedAmount.toFixed(2)],
      ['Progress', `${summary.progressPercent}%`],
      [''],
      ['OUTSTANDING ITEMS'],
      headers.join(','),
      ...rows.map((r: string[]) => r.join(',')),
    ]

    const csv = summaryRows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `recon-summary-${summary.accountNumberLast4}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [summary])

  if (!summary) return null

  const isFullyReconciled = summary.unmatchedCount === 0 && summary.totalTransactions > 0

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Reconciliation Summary</span>
        </div>
        <button
          onClick={handleExportSummary}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-card hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Export reconciliation summary as CSV"
        >
          <Download className="w-3 h-3" />
          Export
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Balance summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Closing Balance</div>
            <div className="text-base font-semibold text-foreground mt-0.5">
              {formatCurrency(summary.closingBalance, summary.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Reconciled</div>
            <div className="text-base font-semibold text-emerald-500 mt-0.5">
              {formatCurrency(summary.reconciledAmount, summary.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Posted to GL</div>
            <div className="text-base font-semibold text-primary mt-0.5">
              {formatCurrency(summary.postedAmount, summary.currency)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Remaining Unmatched</div>
            <div className={`text-base font-semibold mt-0.5 ${
              summary.unmatchedAmount > 0 ? 'text-red-500' : 'text-emerald-500'
            }`}>
              {formatCurrency(summary.unmatchedAmount, summary.currency)}
            </div>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span>
            <span className="font-medium text-emerald-500">{summary.reconciledCount}</span> reconciled
          </span>
          <span>
            <span className="font-medium text-purple-500">{summary.classifiedCount}</span> classified
          </span>
          <span>
            <span className="font-medium text-primary">{summary.postedCount}</span> posted
          </span>
          <span>
            <span className="font-medium text-blue-500">{summary.categorizedCount}</span> categorized
          </span>
          <span>
            <span className="font-medium text-red-500">{summary.unmatchedCount}</span> unmatched
          </span>
        </div>

        {/* Fully reconciled badge */}
        {isFullyReconciled && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
            All transactions reconciled or categorized
          </div>
        )}

        {/* Remaining difference alert */}
        {summary.remainingDifference > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              {summary.unmatchedCount} outstanding item{summary.unmatchedCount !== 1 ? 's' : ''} totalling{' '}
              <span className="font-medium">
                {formatCurrency(summary.remainingDifference, summary.currency)}
              </span>
            </span>
          </div>
        )}

        {/* Outstanding items list */}
        {summary.outstandingItems.length > 0 && (
          <div>
            <button
              onClick={() => setShowOutstanding(!showOutstanding)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showOutstanding ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              Outstanding Items ({summary.totalOutstandingItems})
            </button>

            {showOutstanding && (
              <div className="mt-2 rounded-lg border border-border divide-y divide-border max-h-64 overflow-y-auto">
                {summary.outstandingItems.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-muted-foreground flex-shrink-0">
                        {formatBusinessDate(item.date)}
                      </span>
                      <span className="text-foreground truncate">{item.description}</span>
                    </div>
                    <span className={`flex-shrink-0 font-medium ${
                      item.direction === 'debit' ? 'text-red-500' : 'text-emerald-500'
                    }`}>
                      {item.direction === 'debit' ? '-' : '+'}
                      {formatCurrency(Math.abs(item.amount), summary.currency)}
                    </span>
                  </div>
                ))}
                {summary.totalOutstandingItems > summary.outstandingItems.length && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    ... and {summary.totalOutstandingItems - summary.outstandingItems.length} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
