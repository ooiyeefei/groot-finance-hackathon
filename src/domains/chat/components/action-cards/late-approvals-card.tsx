'use client'

/**
 * Late Approvals Card
 *
 * Renders overdue expense submissions with inline approval flow.
 * Uses state machine pattern: idle → confirm → loading → done.
 */

import { useState, useCallback } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Clock, Check, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface LateSubmission {
  submissionId: string
  submitterName: string
  title: string
  totalAmount: number
  currency: string
  submittedAt: string
  waitingDays: number
  claimCount: number
}

interface LateApprovalsData {
  lateSubmissions: LateSubmission[]
  totalLate: number
  oldestWaitingDays: number
}

type RowState = 'idle' | 'confirm' | 'loading' | 'done' | 'error'

function getWaitingBadgeClass(days: number): string {
  if (days >= 5) return 'bg-destructive/15 text-destructive'
  if (days >= 3) return 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
  return 'bg-muted text-muted-foreground'
}

function LateApprovalsCard({ action, isHistorical }: ActionCardProps) {
  const data = action.data as unknown as LateApprovalsData

  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const [errorMessages, setErrorMessages] = useState<Record<string, string>>({})
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())

  const approveSubmission = useMutation(api.functions.expenseSubmissions.approve)

  const setRowState = useCallback((id: string, state: RowState) => {
    setRowStates((prev) => ({ ...prev, [id]: state }))
  }, [])

  const handleApprove = useCallback(async (submissionId: string) => {
    setRowState(submissionId, 'loading')
    setErrorMessages((prev) => ({ ...prev, [submissionId]: '' }))

    try {
      await approveSubmission({ id: submissionId })
      setRowState(submissionId, 'done')
      setApprovedIds((prev) => new Set(prev).add(submissionId))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approval failed'
      setErrorMessages((prev) => ({ ...prev, [submissionId]: message }))
      setRowState(submissionId, 'error')
    }
  }, [approveSubmission, setRowState])

  if (!data?.lateSubmissions?.length) return null

  const visibleSubmissions = data.lateSubmissions.filter(
    (s) => !approvedIds.has(s.submissionId)
  )
  const approvedCount = approvedIds.size
  const remainingCount = data.totalLate - approvedCount

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground flex-1">
          Late Approvals
        </span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">
          {remainingCount > 0 ? `${remainingCount} overdue` : 'All cleared'}
        </span>
      </div>

      {/* Submission rows */}
      {visibleSubmissions.length > 0 ? (
        <div className="divide-y divide-border">
          {visibleSubmissions.map((submission) => {
            const state = rowStates[submission.submissionId] || 'idle'
            const errorMsg = errorMessages[submission.submissionId] || ''

            return (
              <div key={submission.submissionId} className="px-3 py-2.5">
                {/* Submission info */}
                <div className="flex items-start justify-between mb-1">
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-xs font-medium text-foreground truncate">
                      {submission.submitterName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {submission.title}
                      {submission.claimCount > 0 && (
                        <span> · {submission.claimCount} {submission.claimCount === 1 ? 'claim' : 'claims'}</span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground flex-shrink-0">
                    {formatCurrency(submission.totalAmount, submission.currency || 'MYR')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {submission.submittedAt}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${getWaitingBadgeClass(submission.waitingDays)}`}>
                      {submission.waitingDays} {submission.waitingDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>

                  {/* Action area */}
                  {!isHistorical && state === 'idle' && (
                    <button
                      onClick={() => setRowState(submission.submissionId, 'confirm')}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
                    >
                      <Check className="w-3 h-3" /> Approve Now
                    </button>
                  )}
                </div>

                {/* Inline confirmation */}
                {state === 'confirm' && (
                  <div className="mt-2 bg-muted/50 border border-border rounded p-2">
                    <p className="text-xs text-foreground mb-2">
                      Approve {formatCurrency(submission.totalAmount, submission.currency || 'MYR')} from {submission.submitterName}?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(submission.submissionId)}
                        className="flex-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
                      >
                        Yes, Approve
                      </button>
                      <button
                        onClick={() => setRowState(submission.submissionId, 'idle')}
                        className="flex-1 text-xs px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Loading */}
                {state === 'loading' && (
                  <div className="mt-2 flex items-center justify-center gap-2 py-1.5 text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs">Approving...</span>
                  </div>
                )}

                {/* Error with retry */}
                {state === 'error' && (
                  <div className="mt-2 bg-destructive/10 border border-destructive/30 rounded p-2">
                    <p className="text-xs text-destructive mb-1.5">{errorMsg}</p>
                    <button
                      onClick={() => setRowState(submission.submissionId, 'idle')}
                      className="text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Historical hint */}
                {isHistorical && (
                  <p className="mt-1 text-[10px] text-muted-foreground italic">
                    From a previous session. Ask &quot;what needs my approval?&quot; for current data.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            All {approvedCount} {approvedCount === 1 ? 'submission' : 'submissions'} approved.
          </p>
        </div>
      )}

      {/* Summary footer */}
      {data.oldestWaitingDays > 0 && visibleSubmissions.length > 0 && (
        <div className="px-3 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Oldest waiting: <span className="font-medium text-foreground">{data.oldestWaitingDays} business days</span>
          </p>
        </div>
      )}
    </div>
  )
}

// Register the card type
registerActionCard('late_approvals', LateApprovalsCard)

export { LateApprovalsCard }
