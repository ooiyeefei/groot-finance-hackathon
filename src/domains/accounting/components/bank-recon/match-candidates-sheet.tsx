'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { formatCurrency } from '@/lib/utils/format-number'
import { CheckCircle2, Search, Split, X, Sparkles, Calendar, Hash, AlignLeft } from 'lucide-react'

interface MatchCandidatesSheetProps {
  bankTransactionId: Id<'bank_transactions'>
  businessId: Id<'businesses'>
  onClose: () => void
}

export default function MatchCandidatesSheet({
  bankTransactionId,
  businessId,
  onClose,
}: MatchCandidatesSheetProps) {
  const bankTx = useQuery(api.functions.bankTransactions.getById, { id: bankTransactionId })
  const candidates = useQuery(api.functions.reconciliationMatches.getCandidates, { bankTransactionId })
  const createManualMatch = useMutation(api.functions.reconciliationMatches.createManualMatch)
  const createSplitMatch = useMutation(api.functions.reconciliationMatches.createSplitMatch)

  const [searchQuery, setSearchQuery] = useState('')
  const [splitMode, setSplitMode] = useState(false)
  const [selectedEntryIds, setSelectedEntryIds] = useState<Id<'journal_entries'>[]>([])

  // Filter candidates by search query
  const filteredCandidates = candidates?.filter((c) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      c.accountingEntry.description?.toLowerCase().includes(q) ||
      c.accountingEntry.sourceId?.toLowerCase().includes(q) ||
      c.accountingEntry.memo?.toLowerCase().includes(q) ||
      c.accountingEntry.sourceType?.toLowerCase().includes(q)
    )
  })

  const handleManualMatch = async (entryId: Id<'journal_entries'>) => {
    await createManualMatch({
      bankTransactionId,
      journalEntryId: entryId,
    })
    onClose()
  }

  const toggleSplitSelection = (entryId: Id<'journal_entries'>) => {
    setSelectedEntryIds((prev) =>
      prev.includes(entryId)
        ? prev.filter((id) => id !== entryId)
        : [...prev, entryId]
    )
  }

  const selectedTotal = filteredCandidates
    ?.filter((c) => selectedEntryIds.includes(c.accountingEntry._id))
    .reduce((sum, c) => sum + (c.accountingEntry.totalDebit || c.accountingEntry.totalCredit || 0), 0) ?? 0

  const bankTxAmount = bankTx?.amount ?? 0
  const splitMatchReady = selectedEntryIds.length >= 2 && Math.abs(selectedTotal - bankTxAmount) < 0.01

  const handleSplitMatch = async () => {
    if (!splitMatchReady) return
    await createSplitMatch({
      bankTransactionId,
      journalEntryIds: selectedEntryIds,
    })
    onClose()
  }

  // Get confidence display info
  const getConfidenceDisplay = (level: string, score: number) => {
    switch (level) {
      case 'high':
        return {
          label: 'Strong Match',
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-50 border-emerald-200',
          icon: '🎯',
          barColor: 'bg-emerald-500',
        }
      case 'medium':
        return {
          label: 'Likely Match',
          color: 'text-amber-600',
          bgColor: 'bg-amber-50 border-amber-200',
          icon: '✓',
          barColor: 'bg-amber-500',
        }
      case 'low':
        return {
          label: 'Possible Match',
          color: 'text-slate-600',
          bgColor: 'bg-slate-50 border-slate-200',
          icon: '?',
          barColor: 'bg-slate-400',
        }
      default:
        return {
          label: 'Possible Match',
          color: 'text-slate-600',
          bgColor: 'bg-slate-50 border-slate-200',
          icon: '?',
          barColor: 'bg-slate-400',
        }
    }
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-[640px] sm:max-w-[640px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <SheetTitle>Smart Match Suggestions</SheetTitle>
          </div>
          <SheetDescription>
            Our system analyzed your accounting records and found these potential matches
          </SheetDescription>
        </SheetHeader>

        {bankTx && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="text-sm font-medium text-foreground">{bankTx.description}</div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{bankTx.transactionDate}</span>
              <span className={bankTx.direction === 'credit' ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                {bankTx.direction === 'credit' ? '+' : '-'}{formatCurrency(bankTx.amount, 'MYR')}
              </span>
              {bankTx.reference && <span>Ref: {bankTx.reference}</span>}
            </div>
          </div>
        )}

        {/* Mode toggle + Search */}
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by description, vendor, reference..."
              className="w-full h-9 rounded-md border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={() => {
              setSplitMode(!splitMode)
              setSelectedEntryIds([])
            }}
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition-colors ${
              splitMode
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
            title="Split matching: match one bank transaction to multiple journal entries"
          >
            <Split className="w-3.5 h-3.5" />
            Split Mode
          </button>
        </div>

        {/* Split mode summary bar */}
        {splitMode && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Select entries that together equal the bank transaction amount
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">Selected: </span>
                <span className={`font-semibold ${
                  splitMatchReady ? 'text-emerald-600' :
                  selectedTotal > bankTxAmount ? 'text-red-600' : 'text-foreground'
                }`}>
                  {formatCurrency(selectedTotal, 'MYR')}
                </span>
                <span className="text-muted-foreground"> / {formatCurrency(bankTxAmount, 'MYR')}</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedEntryIds.length > 0 && (
                  <button
                    onClick={() => setSelectedEntryIds([])}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={handleSplitMatch}
                  disabled={!splitMatchReady}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Confirm Split ({selectedEntryIds.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Candidates */}
        <div className="mt-4 space-y-3">
          {!filteredCandidates || filteredCandidates.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground space-y-2">
              <div className="text-3xl">🔍</div>
              {candidates && candidates.length === 0
                ? <div>
                    <div className="font-medium">No matches found</div>
                    <div className="text-xs mt-1">Try adjusting the date range or manually categorize this transaction</div>
                  </div>
                : <div>No results match your search</div>
              }
            </div>
          ) : (
            filteredCandidates.map((candidate) => {
              const entry = candidate.accountingEntry
              const isSelected = selectedEntryIds.includes(entry._id)
              const display = getConfidenceDisplay(candidate.confidenceLevel, candidate.confidenceScore)
              const confidencePercent = Math.round(candidate.confidenceScore * 100)

              return (
                <div
                  key={entry._id}
                  className={`rounded-lg border p-4 transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : `${display.bgColor} border hover:border-primary/50 hover:shadow-sm`
                  }`}
                >
                  {/* Confidence badge */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-lg">{display.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-semibold ${display.color}`}>
                          {display.label} • {confidencePercent}%
                        </div>
                        <div className="mt-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${display.barColor} transition-all duration-300`}
                            style={{ width: `${confidencePercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    {splitMode ? (
                      <button
                        onClick={() => toggleSplitSelection(entry._id)}
                        className={`flex-shrink-0 w-8 h-8 rounded-md border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleManualMatch(entry._id)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium transition-colors shadow-sm"
                        title="Match this entry"
                      >
                        Match
                      </button>
                    )}
                  </div>

                  {/* Entry details */}
                  <div className="space-y-2 mt-3">
                    <div className="text-sm font-medium text-foreground truncate">
                      {entry.description ?? 'No description'}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {entry.transactionDate}
                      </div>
                      <div className="font-semibold text-foreground">
                        {formatCurrency(entry.totalDebit || entry.totalCredit || 0, entry.homeCurrency)}
                      </div>
                      {entry.sourceId && (
                        <div className="flex items-center gap-1">
                          <Hash className="w-3 h-3" />
                          {entry.sourceId}
                        </div>
                      )}
                      {entry.entryNumber && (
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {entry.entryNumber}
                        </span>
                      )}
                      {entry.sourceType && (
                        <span className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                          {entry.sourceType}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Match reasoning */}
                  <div className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <AlignLeft className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span className="italic">{candidate.matchReason}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Help text at bottom */}
        {filteredCandidates && filteredCandidates.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary" />
              <div>
                Confidence scores are calculated based on amount, date proximity, reference numbers, and description similarity. Higher scores indicate stronger matches.
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
