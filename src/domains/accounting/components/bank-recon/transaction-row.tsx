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
  Brain,
  ShieldCheck,
  BookOpen,
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
    suggestedDebitAccountId?: Id<'chart_of_accounts'>
    suggestedCreditAccountId?: Id<'chart_of_accounts'>
    classificationConfidence?: number
    classificationTier?: number
    classificationReasoning?: string
    journalEntryId?: Id<'journal_entries'>
    classifiedBy?: string
  }
  coaAccounts?: Array<{ _id: Id<'chart_of_accounts'>; accountCode: string; accountName: string }> | null
  onViewCandidates: () => void
  onOpenClassification: () => void
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
  coaAccounts,
  onViewCandidates,
  onOpenClassification,
  onCategorize,
  onUncategorize,
}: TransactionRowProps) {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)

  const match = useQuery(api.functions.reconciliationMatches.getByBankTransaction, { bankTransactionId: tx._id })

  const confirmMatch = useMutation(api.functions.reconciliationMatches.confirmMatch)
  const rejectMatch = useMutation(api.functions.reconciliationMatches.rejectMatch)
  const unmatch = useMutation(api.functions.reconciliationMatches.unmatch)
  const confirmClassification = useMutation(api.functions.bankTransactions.confirmClassification)
  const rejectClassification = useMutation(api.functions.bankTransactions.rejectClassification)

  const confidence = tx.classificationConfidence ?? 0
  const tier = tx.classificationTier ?? 0
  const hasClassification = !!(tx.suggestedDebitAccountId && tx.suggestedCreditAccountId)

  // Resolve account names from COA cache
  const debitAccountName = coaAccounts?.find((a) => a._id === tx.suggestedDebitAccountId)
  const creditAccountName = coaAccounts?.find((a) => a._id === tx.suggestedCreditAccountId)

  // Confidence badge colors
  const confidenceBadge = hasClassification ? (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
        confidence >= 0.90
          ? 'text-emerald-500 bg-emerald-500/10'
          : confidence >= 0.70
            ? 'text-amber-500 bg-amber-500/10'
            : 'text-red-500 bg-red-500/10'
      }`}
    >
      {Math.round(confidence * 100)}%
    </span>
  ) : null

  // Tier badge
  const tierBadge = hasClassification ? (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
        tier === 1 ? 'bg-muted text-muted-foreground' : 'bg-purple-500/10 text-purple-500'
      }`}
    >
      {tier === 1 ? 'Rules' : 'AI'}
    </span>
  ) : null

  const statusIcon = {
    reconciled: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    suggested: <Clock className="w-4 h-4 text-amber-500" />,
    unmatched: <HelpCircle className="w-4 h-4 text-red-500" />,
    categorized: <Tag className="w-4 h-4 text-blue-500" />,
    classified: <Brain className="w-4 h-4 text-purple-500" />,
    posted: <ShieldCheck className="w-4 h-4 text-emerald-500" />,
  }[tx.reconciliationStatus] ?? <HelpCircle className="w-4 h-4 text-muted-foreground" />

  return (
    <div
      className={`grid grid-cols-[1fr_100px_100px_100px_180px] gap-2 px-4 py-2.5 text-sm items-center hover:bg-muted/30 transition-colors ${
        hasClassification && tx.reconciliationStatus !== 'posted' ? 'cursor-pointer' : ''
      }`}
      onClick={hasClassification && tx.reconciliationStatus !== 'posted' ? onOpenClassification : undefined}
    >
      {/* Description */}
      <div className="min-w-0">
        <div className="truncate text-foreground">{tx.description}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{tx.transactionDate}</span>
          {tx.reference && (
            <span className="text-xs text-muted-foreground">Ref: {tx.reference}</span>
          )}

          {/* Classification info */}
          {hasClassification && (
            <span className="flex items-center gap-1 text-xs text-primary">
              {debitAccountName && creditAccountName && (
                <>
                  <span className="text-red-500">DR</span>{' '}
                  {debitAccountName.accountCode}
                  {' → '}
                  <span className="text-emerald-500">CR</span>{' '}
                  {creditAccountName.accountCode}
                </>
              )}
            </span>
          )}

          {/* Badges */}
          {confidenceBadge}
          {tierBadge}

          {/* Legacy match info */}
          {!hasClassification && match?.accountingEntry && tx.reconciliationStatus !== 'unmatched' && (
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

          {tx.reconciliationStatus === 'posted' && tx.journalEntryId && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 flex items-center gap-0.5">
              <BookOpen className="w-3 h-3" />
              GL Posted
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
      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
        {statusIcon}

        {/* Classified: Post / Reject buttons */}
        {tx.reconciliationStatus === 'classified' && (
          <>
            <button
              onClick={() => confirmClassification({ id: tx._id })}
              className="p-1 rounded hover:bg-emerald-500/10 text-emerald-500"
              title="Post to GL"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => rejectClassification({ id: tx._id })}
              className="p-1 rounded hover:bg-red-500/10 text-red-500"
              title="Reject classification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {/* Suggested match: Confirm / Reject */}
        {tx.reconciliationStatus === 'suggested' && match && !hasClassification && (
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

        {/* Unmatched: Search + Categorize */}
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

        {/* Reconciled: Unmatch */}
        {tx.reconciliationStatus === 'reconciled' && (
          <button
            onClick={() => unmatch({ bankTransactionId: tx._id })}
            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
            title="Unmatch"
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Categorized: Uncategorize */}
        {tx.reconciliationStatus === 'categorized' && (
          <button
            onClick={() => onUncategorize(tx._id)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Uncategorize"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Posted: Read-only */}
        {tx.reconciliationStatus === 'posted' && (
          <span className="text-xs text-emerald-500 font-medium px-1">Done</span>
        )}
      </div>
    </div>
  )
}
