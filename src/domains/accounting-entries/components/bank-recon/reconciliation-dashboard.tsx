'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import TransactionRow from './transaction-row'
import MatchCandidatesSheet from './match-candidates-sheet'
import { formatCurrency } from '@/lib/utils/format-number'
import { CheckCircle2, Clock, HelpCircle, Tag, Filter, Download } from 'lucide-react'

interface ReconciliationDashboardProps {
  businessId: Id<'businesses'>
  bankAccountId: Id<'bank_accounts'>
}

type StatusFilter = 'all' | 'unmatched' | 'suggested' | 'reconciled' | 'categorized'

export default function ReconciliationDashboard({
  businessId,
  bankAccountId,
}: ReconciliationDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [matchingTxId, setMatchingTxId] = useState<Id<'bank_transactions'> | null>(null)

  const summary = useQuery(api.functions.bankTransactions.getSummary, {
    businessId,
    bankAccountId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const reconSummary = useQuery(api.functions.reconciliationMatches.getReconciliationSummary, {
    businessId,
    bankAccountId,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const { transactions, totalCount } = useQuery(
    api.functions.bankTransactions.list,
    {
      businessId,
      bankAccountId,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 200,
    }
  ) ?? { transactions: [], totalCount: 0 }

  const updateStatus = useMutation(api.functions.bankTransactions.updateStatus)

  const handleCategorize = useCallback(async (
    txId: Id<'bank_transactions'>,
    category: 'bank_charges' | 'interest' | 'non_business' | 'other'
  ) => {
    await updateStatus({ id: txId, status: 'categorized', category })
  }, [updateStatus])

  const handleUncategorize = useCallback(async (txId: Id<'bank_transactions'>) => {
    await updateStatus({ id: txId, status: 'unmatched' })
  }, [updateStatus])

  const handleExportCsv = useCallback(() => {
    if (transactions.length === 0) return

    const headers = ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance', 'Status', 'Category']
    const rows = transactions.map((tx) => [
      tx.transactionDate,
      `"${(tx.description ?? '').replace(/"/g, '""')}"`,
      tx.reference ?? '',
      tx.debitAmount?.toFixed(2) ?? '',
      tx.creditAmount?.toFixed(2) ?? '',
      tx.balance?.toFixed(2) ?? '',
      tx.reconciliationStatus,
      tx.category ?? '',
    ])

    // Add summary rows at the bottom
    if (reconSummary) {
      rows.push([])
      rows.push(['', 'RECONCILIATION SUMMARY', '', '', '', '', '', ''])
      rows.push(['', 'Total Transactions', '', String(reconSummary.totalTransactions), '', '', '', ''])
      rows.push(['', 'Total Credits', '', '', reconSummary.totalCredits.toFixed(2), '', '', ''])
      rows.push(['', 'Total Debits', '', reconSummary.totalDebits.toFixed(2), '', '', '', ''])
      rows.push(['', 'Opening Balance', '', '', '', reconSummary.openingBalance.toFixed(2), '', ''])
      rows.push(['', 'Closing Balance', '', '', '', reconSummary.closingBalance.toFixed(2), '', ''])
      rows.push(['', `Reconciled: ${reconSummary.reconciled}`, '', `Suggested: ${reconSummary.suggested}`, '', `Unmatched: ${reconSummary.unmatched}`, '', `Categorized: ${reconSummary.categorized}`])
    }

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reconciliation-export-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [transactions, reconSummary])

  const statusCards = [
    {
      label: 'Reconciled',
      count: summary?.reconciled ?? 0,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      filter: 'reconciled' as StatusFilter,
    },
    {
      label: 'Suggested',
      count: summary?.suggested ?? 0,
      icon: Clock,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      filter: 'suggested' as StatusFilter,
    },
    {
      label: 'Unmatched',
      count: summary?.unmatched ?? 0,
      icon: HelpCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      filter: 'unmatched' as StatusFilter,
    },
    {
      label: 'Categorized',
      count: summary?.categorized ?? 0,
      icon: Tag,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      filter: 'categorized' as StatusFilter,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statusCards.map((card) => (
          <button
            key={card.filter}
            onClick={() => setStatusFilter(statusFilter === card.filter ? 'all' : card.filter)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              statusFilter === card.filter
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-foreground/20'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${card.bgColor}`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <div>
                <div className="text-2xl font-bold text-foreground">{card.count}</div>
                <div className="text-xs text-muted-foreground">{card.label}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Progress bar */}
      {summary && summary.total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Reconciliation progress</span>
            <span className="font-medium text-foreground">{summary.progressPercent}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${summary.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Reconciliation totals */}
      {reconSummary && reconSummary.totalTransactions > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-border p-2.5">
            <div className="text-muted-foreground">Total Credits</div>
            <div className="text-sm font-medium text-emerald-500 mt-0.5">{formatCurrency(reconSummary.totalCredits, 'MYR')}</div>
          </div>
          <div className="rounded-lg border border-border p-2.5">
            <div className="text-muted-foreground">Total Debits</div>
            <div className="text-sm font-medium text-red-500 mt-0.5">{formatCurrency(reconSummary.totalDebits, 'MYR')}</div>
          </div>
          <div className="rounded-lg border border-border p-2.5">
            <div className="text-muted-foreground">Opening Balance</div>
            <div className="text-sm font-medium text-foreground mt-0.5">{formatCurrency(reconSummary.openingBalance, 'MYR')}</div>
          </div>
          <div className="rounded-lg border border-border p-2.5">
            <div className="text-muted-foreground">Closing Balance</div>
            <div className="text-sm font-medium text-foreground mt-0.5">{formatCurrency(reconSummary.closingBalance, 'MYR')}</div>
          </div>
        </div>
      )}

      {/* Date filters + Export */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {totalCount} transaction{totalCount !== 1 ? 's' : ''}
          </span>
          {transactions.length > 0 && (
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border bg-card hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Export reconciliation as CSV"
            >
              <Download className="w-3 h-3" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Transaction list */}
      <div className="rounded-lg border border-border divide-y divide-border">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_100px_100px_140px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
          <div>Description</div>
          <div className="text-right">Debit</div>
          <div className="text-right">Credit</div>
          <div className="text-right">Balance</div>
          <div className="text-center">Status</div>
        </div>

        {transactions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {statusFilter !== 'all'
              ? `No ${statusFilter} transactions`
              : 'No transactions imported yet. Click "Import Statement" to begin.'
            }
          </div>
        ) : (
          transactions.map((tx) => (
            <TransactionRow
              key={tx._id}
              transaction={tx}
              onViewCandidates={() => setMatchingTxId(tx._id)}
              onCategorize={handleCategorize}
              onUncategorize={handleUncategorize}
            />
          ))
        )}
      </div>

      {/* Match candidates sheet */}
      {matchingTxId && (
        <MatchCandidatesSheet
          bankTransactionId={matchingTxId}
          businessId={businessId}
          onClose={() => setMatchingTxId(null)}
        />
      )}
    </div>
  )
}
