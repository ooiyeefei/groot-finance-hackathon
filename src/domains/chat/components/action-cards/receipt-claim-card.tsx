'use client'

/**
 * Receipt Claim Action Card
 *
 * Renders extracted receipt data with Submit/Edit/Cancel buttons.
 * Supports single receipts and batch summaries.
 * Buttons dispatch messages back to the chat agent for processing.
 *
 * Part of 031-chat-receipt-process.
 */

import { useState } from 'react'
import { Receipt, Check, Pencil, X, Loader2, AlertTriangle } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'

interface SingleClaimData {
  claimId: string
  status: string
  merchant: string
  amount: number
  currency: string
  date: string
  category: string
  confidence: number
  lowConfidenceFields?: string[]
  duplicateWarning?: boolean
  existingClaimId?: string
}

interface BatchClaimData {
  batch: true
  claims: SingleClaimData[]
  errors?: string[]
}

type ReceiptClaimData = SingleClaimData | BatchClaimData

type CardState = 'idle' | 'loading' | 'done' | 'error'

function isBatch(data: ReceiptClaimData): data is BatchClaimData {
  return 'batch' in data && data.batch === true
}

function ReceiptClaimCard({ action, isHistorical }: ActionCardProps) {
  const data = action.data as unknown as ReceiptClaimData
  const [cardState, setCardState] = useState<CardState>('idle')
  const [actionDone, setActionDone] = useState<string | null>(null)

  if (!data) return null

  const sendChatMessage = (text: string) => {
    window.dispatchEvent(new CustomEvent('chat:send-message', { detail: { message: text } }))
  }

  const handleSubmit = async () => {
    setCardState('loading')
    if (isBatch(data)) {
      const ids = data.claims.map(c => c.claimId).join(',')
      sendChatMessage(`Submit all expense claims ${ids}`)
    } else {
      sendChatMessage(`Submit expense claim ${data.claimId}`)
    }
    setCardState('done')
    setActionDone('submitted')
  }

  const handleCancel = async () => {
    setCardState('loading')
    if (isBatch(data)) {
      const ids = data.claims.map(c => c.claimId).join(',')
      sendChatMessage(`Cancel expense claims ${ids}`)
    } else {
      sendChatMessage(`Cancel expense claim ${data.claimId}`)
    }
    setCardState('done')
    setActionDone('cancelled')
  }

  const handleEdit = () => {
    if (!isBatch(data)) {
      sendChatMessage(`I want to edit expense claim ${data.claimId}`)
    }
  }

  // Batch summary
  if (isBatch(data)) {
    const total = data.claims.reduce((sum, c) => sum + c.amount, 0)
    const currency = data.claims[0]?.currency || 'MYR'

    return (
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">
            {data.claims.length} Receipt{data.claims.length > 1 ? 's' : ''} Processed
          </span>
          {actionDone && (
            <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              actionDone === 'submitted'
                ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}>
              {actionDone === 'submitted' ? 'Submitted' : 'Cancelled'}
            </span>
          )}
        </div>
        <div className="px-3 py-2.5">
          <div className="space-y-1.5 mb-2">
            {data.claims.map((c) => (
              <div key={c.claimId} className="flex items-center justify-between text-xs">
                <span className="text-foreground truncate mr-2">{c.merchant}</span>
                <span className="text-foreground font-medium flex-shrink-0">
                  {c.currency} {c.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs border-t border-border pt-1.5 mb-2">
            <span className="text-muted-foreground font-medium">Total</span>
            <span className="text-foreground font-semibold">
              {currency} {total.toLocaleString()}
            </span>
          </div>
          {data.errors && data.errors.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-2">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{data.errors.length} receipt(s) failed to process</span>
            </div>
          )}
          {!isHistorical && !actionDone && cardState === 'idle' && (
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
              >
                <Check className="w-3 h-3" /> Submit All
              </button>
              <button
                onClick={handleCancel}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors font-medium"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          )}
          {cardState === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">Processing...</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Single receipt card
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Receipt className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Receipt Claim</span>
        {actionDone && (
          <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            actionDone === 'submitted'
              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          }`}>
            {actionDone === 'submitted' ? 'Submitted' : 'Cancelled'}
          </span>
        )}
        {!actionDone && data.confidence < 0.7 && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            Low Confidence
          </span>
        )}
      </div>

      {/* Details */}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between mb-1.5">
          <div>
            <p className="text-xs font-medium text-foreground">{data.merchant}</p>
            <p className="text-xs text-muted-foreground">
              {data.date} · {data.category}
            </p>
          </div>
          <span className="text-sm font-semibold text-foreground">
            {data.currency} {data.amount.toLocaleString()}
          </span>
        </div>

        {/* Low confidence warning */}
        {data.lowConfidenceFields && data.lowConfidenceFields.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-2">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>Not confident about: {data.lowConfidenceFields.join(', ')}</span>
          </div>
        )}

        {/* Duplicate warning */}
        {data.duplicateWarning && (
          <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-2">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>Possible duplicate — a similar claim already exists</span>
          </div>
        )}

        {/* Historical hint */}
        {isHistorical && !actionDone && (
          <p className="text-[10px] text-muted-foreground italic mb-1.5">
            This is from a previous session. Send a new receipt photo for up-to-date actions.
          </p>
        )}

        {/* Action buttons */}
        {!isHistorical && !actionDone && cardState === 'idle' && (
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
            >
              <Check className="w-3 h-3" /> Submit
            </button>
            <button
              onClick={handleEdit}
              className="inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors font-medium"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={handleCancel}
              className="inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors font-medium"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        )}

        {cardState === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Processing...</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('receipt_claim', ReceiptClaimCard)

export { ReceiptClaimCard }
