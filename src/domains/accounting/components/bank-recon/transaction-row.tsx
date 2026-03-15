'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import { formatCurrency } from '@/lib/utils/format-number'
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  Tag,
  Search,
  Check,
  X,
  Unlink,
  ChevronDown,
} from 'lucide-react'

interface TransactionRowProps {
  transaction: {
    _id: Id<'bank_transactions'>
    transactionDate: string
    description: string
    debitAmount?: number
    creditAmount?: number
    balance?: number
    reference?: string
    reconciliationStatus: string
    category?: string
    direction: string
  }
  onViewCandidates: () => void
  onCategorize: (txId: Id<'bank_transactions'>, category: 'bank_charges' | 'interest' | 'non_business' | 'other') => void
  onUncategorize: (txId: Id<'bank_transactions'>) => void
}

const categoryLabels: Record<string, string> = {
  bank_charges: 'Bank Charges',
  interest: 'Interest',
  non_business: 'Non-Business',
  other: 'Other',
}

export default function TransactionRow({
  transaction: tx,
  onViewCandidates,
  onCategorize,
  onUncategorize,
}: TransactionRowProps) {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)

  const match = useQuery(api.functions.reconciliationMatches.getByBankTransaction, { bankTransactionId: tx._id })

  const confirmMatch = useMutation(api.functions.reconciliationMatches.confirmMatch)
  const rejectMatch = useMutation(api.functions.reconciliationMatches.rejectMatch)
  const unmatch = useMutation(api.functions.reconciliationMatches.unmatch)

  const statusIcon = {
    reconciled: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    suggested: <Clock className="w-4 h-4 text-amber-500" />,
    unmatched: <HelpCircle className="w-4 h-4 text-red-500" />,
    categorized: <Tag className="w-4 h-4 text-blue-500" />,
  }[tx.reconciliationStatus] ?? <HelpCircle className="w-4 h-4 text-muted-foreground" />

  return (
    <div className="grid grid-cols-[1fr_100px_100px_100px_140px] gap-2 px-4 py-2.5 text-sm items-center hover:bg-muted/30 transition-colors">
      {/* Description */}
      <div className="min-w-0">
        <div className="truncate text-foreground">{tx.description}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{tx.transactionDate}</span>
          {tx.reference && (
            <span className="text-xs text-muted-foreground">Ref: {tx.reference}</span>
          )}
          {match?.accountingEntry && tx.reconciliationStatus !== 'unmatched' && (
            <span className="text-xs text-primary">
              → {(match.accountingEntry as any).description?.slice(0, 30) ?? 'Journal entry'}
              {match.confidenceLevel && (
                <span className={`ml-1 ${
                  match.confidenceLevel === 'high' ? 'text-emerald-500' :
                  match.confidenceLevel === 'medium' ? 'text-amber-500' : 'text-red-500'
                }`}>
                  ({match.confidenceLevel})
                </span>
              )}
            </span>
          )}
          {tx.reconciliationStatus === 'categorized' && tx.category && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
              {categoryLabels[tx.category] ?? tx.category}
            </span>
          )}
        </div>
      </div>

      {/* Debit */}
      <div className="text-right text-red-500 tabular-nums">
        {tx.debitAmount ? formatCurrency(tx.debitAmount, 'MYR') : '—'}
      </div>

      {/* Credit */}
      <div className="text-right text-emerald-500 tabular-nums">
        {tx.creditAmount ? formatCurrency(tx.creditAmount, 'MYR') : '—'}
      </div>

      {/* Balance */}
      <div className="text-right text-muted-foreground tabular-nums text-xs">
        {tx.balance != null ? formatCurrency(tx.balance, 'MYR') : '—'}
      </div>

      {/* Status + Actions */}
      <div className="flex items-center justify-center gap-1">
        {statusIcon}

        {tx.reconciliationStatus === 'suggested' && match && (
          <>
            <button
              onClick={() => confirmMatch({ matchId: match._id })}
              className="p-1 rounded hover:bg-emerald-500/10 text-emerald-500"
              title="Confirm match"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => rejectMatch({ matchId: match._id })}
              className="p-1 rounded hover:bg-red-500/10 text-red-500"
              title="Reject match"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {tx.reconciliationStatus === 'unmatched' && (
          <>
            <button
              onClick={onViewCandidates}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Find match"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Categorize"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showCategoryMenu && (
                <div className="absolute right-0 top-full mt-1 z-10 w-36 rounded-md border border-border bg-card shadow-lg py-1">
                  {(['bank_charges', 'interest', 'non_business', 'other'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        onCategorize(tx._id, cat)
                        setShowCategoryMenu(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted text-foreground"
                    >
                      {categoryLabels[cat]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tx.reconciliationStatus === 'reconciled' && (
          <button
            onClick={() => unmatch({ bankTransactionId: tx._id })}
            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
            title="Unmatch"
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        )}

        {tx.reconciliationStatus === 'categorized' && (
          <button
            onClick={() => onUncategorize(tx._id)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Uncategorize"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
