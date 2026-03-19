'use client'

/**
 * Expense Approval Card
 *
 * Renders pending expense submissions with Approve/Reject buttons.
 * Uses inline confirmation and triggers Convex mutations.
 */

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Check, X, Loader2, Receipt } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'

interface ExpenseApprovalData {
  submissionId: string
  submitterName: string
  totalAmount: number
  currency: string
  claimCount: number
  category?: string
  submittedDate: string
  status: 'pending' | 'approved' | 'rejected'
  claims?: Array<{ id: string; description: string; amount: number; category?: string }>
}

type CardState = 'idle' | 'confirm_approve' | 'confirm_reject' | 'loading' | 'done' | 'error'

function ExpenseApprovalCard({ action, isHistorical }: ActionCardProps) {
  const data = action.data as unknown as ExpenseApprovalData
  const [cardState, setCardState] = useState<CardState>('idle')
  const [finalStatus, setFinalStatus] = useState<'approved' | 'rejected' | null>(
    data.status !== 'pending' ? data.status : null
  )
  const [errorMsg, setErrorMsg] = useState('')

  const approveSubmission = useMutation(api.functions.expenseSubmissions.approve)
  const rejectSubmission = useMutation(api.functions.expenseSubmissions.reject)

  const handleAction = async (action: 'approve' | 'reject') => {
    setCardState('loading')
    setErrorMsg('')

    try {
      if (action === 'approve') {
        await approveSubmission({
          id: data.submissionId,
        })
        setFinalStatus('approved')
      } else {
        await rejectSubmission({
          id: data.submissionId,
          reason: 'Rejected via chat assistant',
        })
        setFinalStatus('rejected')
      }
      setCardState('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Operation failed')
      setCardState('error')
    }
  }

  if (!data?.submissionId) return null

  const displayStatus = finalStatus || data.status
  const isResolved = displayStatus === 'approved' || displayStatus === 'rejected'

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Receipt className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Expense Approval</span>
        {isResolved && (
          <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            displayStatus === 'approved'
              ? 'bg-green-500/15 text-green-600 dark:text-green-400'
              : 'bg-destructive/15 text-destructive'
          }`}>
            {displayStatus === 'approved' ? 'Approved' : 'Rejected'}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between mb-1.5">
          <div>
            <p className="text-xs font-medium text-foreground">{data.submitterName}</p>
            <p className="text-xs text-muted-foreground">
              {data.claimCount} {data.claimCount === 1 ? 'claim' : 'claims'}
              {data.category && ` · ${data.category}`}
            </p>
          </div>
          <span className="text-sm font-semibold text-foreground">
            {data.currency} {data.totalAmount?.toLocaleString() ?? '0'}
          </span>
        </div>

        <p className="text-xs text-muted-foreground mb-2">
          Submitted {data.submittedDate}
        </p>

        {/* Claim details (if provided) */}
        {data.claims && data.claims.length > 0 && (
          <div className="mb-2 space-y-1">
            {data.claims.slice(0, 3).map((claim) => (
              <div key={claim.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate mr-2">{claim.description}</span>
                <span className="text-foreground font-medium flex-shrink-0">
                  {data.currency} {claim.amount?.toLocaleString() ?? '0'}
                </span>
              </div>
            ))}
            {data.claims.length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{data.claims.length - 3} more
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!isHistorical && !isResolved && (
          <>
            {cardState === 'idle' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setCardState('confirm_approve')}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
                >
                  <Check className="w-3 h-3" /> Approve
                </button>
                <button
                  onClick={() => setCardState('confirm_reject')}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-destructive hover:bg-destructive/90 text-destructive-foreground transition-colors font-medium"
                >
                  <X className="w-3 h-3" /> Reject
                </button>
              </div>
            )}

            {/* Inline confirmation */}
            {(cardState === 'confirm_approve' || cardState === 'confirm_reject') && (
              <div className="bg-muted/50 border border-border rounded p-2">
                <p className="text-xs text-foreground mb-2">
                  {cardState === 'confirm_approve' ? 'Approve' : 'Reject'}{' '}
                  {data.currency} {data.totalAmount?.toLocaleString() ?? '0'} from{' '}
                  {data.submitterName}?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(cardState === 'confirm_approve' ? 'approve' : 'reject')}
                    className={`flex-1 text-xs px-3 py-1.5 rounded font-medium transition-colors ${
                      cardState === 'confirm_approve'
                        ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                        : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setCardState('idle')}
                    className="flex-1 text-xs px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Loading */}
            {cardState === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs">Processing...</span>
              </div>
            )}

            {/* Error with retry */}
            {cardState === 'error' && (
              <div className="bg-destructive/10 border border-destructive/30 rounded p-2">
                <p className="text-xs text-destructive mb-1.5">{errorMsg}</p>
                <button
                  onClick={() => setCardState('idle')}
                  className="text-xs text-primary hover:text-primary/80 font-medium"
                >
                  Try again
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('expense_approval', ExpenseApprovalCard)

export { ExpenseApprovalCard }
