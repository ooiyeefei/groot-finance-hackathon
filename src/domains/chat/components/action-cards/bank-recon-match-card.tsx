'use client'

/**
 * Bank Recon Match Card
 *
 * Renders a bank transaction match suggestion with Accept/Reject buttons.
 * Shows confidence score, match type, and matched invoice details.
 */

import { useState } from 'react'
import { Check, X, Loader2, ArrowRightLeft } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'

interface MatchedItem {
  type: string
  id: string
  reference: string
  amount: number
  vendor?: string
}

interface BankReconMatchData {
  matchId: string
  runId?: string
  bankTransaction: {
    id: string
    date: string
    amount: number
    description: string
  }
  matchedItems: MatchedItem[]
  confidence: number
  matchType: 'exact' | 'fuzzy' | 'split'
  status?: 'pending' | 'accepted' | 'rejected'
}

type CardState = 'idle' | 'loading' | 'done' | 'error'

function confidenceColor(score: number): string {
  if (score >= 0.9) return 'bg-green-500/15 text-green-600 dark:text-green-400'
  if (score >= 0.7) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  return 'bg-destructive/15 text-destructive'
}

function matchTypeBadge(type: string): string {
  switch (type) {
    case 'exact': return 'Exact Match'
    case 'split': return 'Split Match'
    default: return 'Fuzzy Match'
  }
}

function BankReconMatchCard({ action, isHistorical, onActionComplete }: ActionCardProps) {
  const data = action.data as unknown as BankReconMatchData
  const [cardState, setCardState] = useState<CardState>('idle')
  const [finalStatus, setFinalStatus] = useState<'accepted' | 'rejected' | null>(
    data.status && data.status !== 'pending' ? data.status as 'accepted' | 'rejected' : null
  )
  const [errorMsg, setErrorMsg] = useState('')

  const handleAction = async (matchAction: 'accept' | 'reject') => {
    setCardState('loading')
    setErrorMsg('')

    try {
      // The agent will call accept_recon_match MCP tool — we emit an event
      // that the chat handler picks up and routes to the MCP tool
      onActionComplete?.({
        success: true,
        message: JSON.stringify({
          tool: 'accept_recon_match',
          args: {
            action: matchAction,
            matchId: data.matchId,
          },
        }),
      })
      setFinalStatus(matchAction === 'accept' ? 'accepted' : 'rejected')
      setCardState('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Operation failed')
      setCardState('error')
    }
  }

  if (!data?.matchId) return null

  const isResolved = finalStatus === 'accepted' || finalStatus === 'rejected'
  const txn = data.bankTransaction
  const amt = Math.abs(txn.amount)
  const isDebit = txn.amount < 0

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <ArrowRightLeft className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Bank Reconciliation Match</span>
        <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${confidenceColor(data.confidence)}`}>
          {Math.round(data.confidence * 100)}%
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
          {matchTypeBadge(data.matchType)}
        </span>
        {isResolved && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            finalStatus === 'accepted'
              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : 'bg-destructive/15 text-destructive'
          }`}>
            {finalStatus === 'accepted' ? 'Accepted' : 'Rejected'}
          </span>
        )}
      </div>

      {/* Bank Transaction */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{txn.date}</p>
            <p className="text-sm font-medium text-foreground truncate max-w-[250px]">{txn.description}</p>
          </div>
          <p className={`text-sm font-semibold ${isDebit ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
            {isDebit ? '-' : '+'}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(amt)}
          </p>
        </div>
      </div>

      {/* Matched Items */}
      {data.matchedItems.map((item, i) => (
        <div key={i} className="px-3 py-1.5 bg-muted/30 border-b border-border/30">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              → {item.reference} {item.vendor ? `(${item.vendor})` : ''}
            </span>
            <span className="font-medium text-foreground">
              {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(item.amount)}
            </span>
          </div>
        </div>
      ))}

      {/* Actions */}
      {!isResolved && !isHistorical && (
        <div className="px-3 py-2 flex gap-2">
          <button
            onClick={() => handleAction('accept')}
            disabled={cardState === 'loading'}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
          >
            {cardState === 'loading' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Accept
          </button>
          <button
            onClick={() => handleAction('reject')}
            disabled={cardState === 'loading'}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground disabled:opacity-50"
          >
            <X className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="px-3 py-1.5 text-xs text-destructive bg-destructive/10">
          {errorMsg}
        </div>
      )}
    </div>
  )
}

// Self-register on import
registerActionCard('bank_recon_match', BankReconMatchCard)
