'use client'

/**
 * Receipt Proposal Action Card
 *
 * Shown when create_expense_from_receipt returns a proposal.
 * Provides "Create Claim" and "Add More Receipts" buttons.
 * "Create Claim" calls confirmProposal directly (bypasses LLM for reliability).
 *
 * Uses useQuery to check proposal status on mount — survives page refresh
 * and re-renders without losing state.
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Receipt, Check, Plus, Loader2 } from 'lucide-react'
import { registerActionCard, type ActionCardProps } from './registry'
import type { Id } from '@/convex/_generated/dataModel'

interface ReceiptProposalData {
  proposalId: string
  attachmentCount: number
  message: string
}

type CardState = 'idle' | 'loading' | 'done' | 'error' | 'expired'

function ReceiptProposalCard({ action, isHistorical }: ActionCardProps) {
  const data = action.data as unknown as ReceiptProposalData
  const [cardState, setCardState] = useState<CardState>('idle')
  const [resultMsg, setResultMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const confirmProposal = useMutation(api.functions.mcpProposals.confirmProposal)

  // Query proposal status from Convex — survives refresh/re-renders
  const proposalResult = useQuery(
    api.functions.mcpProposals.getProposal,
    data?.proposalId
      ? { proposalId: data.proposalId as Id<'mcp_proposals'> }
      : 'skip'
  )

  // Sync card state with proposal status from DB
  useEffect(() => {
    if (!proposalResult?.found || !proposalResult.proposal) return

    const status = proposalResult.proposal.status
    if ((status === 'executed' || status === 'confirmed') && cardState !== 'done') {
      setResultMsg('Expense claim created')
      setCardState('done')
    } else if (status === 'expired' && cardState === 'idle') {
      setCardState('expired')
    } else if (status === 'failed' && cardState === 'idle') {
      setErrorMsg('Proposal execution failed. Please upload receipt again.')
      setCardState('error')
    }
  }, [proposalResult, cardState])

  if (!data?.proposalId) return null

  const handleCreate = async () => {
    setCardState('loading')
    setErrorMsg('')

    try {
      const result = await confirmProposal({
        proposalId: data.proposalId as Id<'mcp_proposals'>,
      })

      if (result.success) {
        const execResult = result.result as Record<string, unknown> | undefined
        const claimCount = execResult?.claimCount ?? 1
        setResultMsg(`Created ${claimCount} draft expense claim${Number(claimCount) > 1 ? 's' : ''}`)
        setCardState('done')
      } else {
        const err = result.error || ''
        // Already executed = success (e.g. double-click, refresh)
        if (err.includes('ALREADY_EXECUTED') || err.includes('ALREADY_CONFIRMED')) {
          setResultMsg('Expense claim already created')
          setCardState('done')
        } else if (err.includes('EXPIRED')) {
          setCardState('expired')
        } else {
          setErrorMsg(err || 'Failed to create expense claim')
          setCardState('error')
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create expense claim'
      if (msg.includes('ALREADY_EXECUTED') || msg.includes('ALREADY_CONFIRMED')) {
        setResultMsg('Expense claim already created')
        setCardState('done')
      } else {
        setErrorMsg(msg)
        setCardState('error')
      }
    }
  }

  const handleAddMore = () => {
    window.dispatchEvent(
      new CustomEvent('chat:send-message', {
        detail: { message: 'I want to add more receipts to this expense report' },
      })
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Receipt className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Receipt Ready</span>
        {cardState === 'done' && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
            Created
          </span>
        )}
        {cardState === 'expired' && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
            Expired
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        {/* Success */}
        {cardState === 'done' && (
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
            {resultMsg || 'Expense claim created'}. You can view it in Expense Claims.
          </p>
        )}

        {/* Expired */}
        {cardState === 'expired' && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This proposal has expired. Please upload the receipt again to create a new claim.
          </p>
        )}

        {/* Error */}
        {cardState === 'error' && (
          <div className="bg-destructive/10 border border-destructive/30 rounded p-2">
            <p className="text-xs text-destructive">{errorMsg}</p>
          </div>
        )}

        {/* Action buttons — only show when pending */}
        {!isHistorical && cardState === 'idle' && (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              {data.attachmentCount} receipt{data.attachmentCount > 1 ? 's' : ''} ready to become expense claim{data.attachmentCount > 1 ? 's' : ''}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
              >
                <Check className="w-3 h-3" /> Create Claim
              </button>
              <button
                onClick={handleAddMore}
                className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors font-medium"
              >
                <Plus className="w-3 h-3" /> Add More Receipts
              </button>
            </div>
          </>
        )}

        {/* Historical hint */}
        {isHistorical && cardState === 'idle' && (
          <p className="text-[10px] text-muted-foreground italic">
            This is from a previous session. Upload a new receipt to create a claim.
          </p>
        )}

        {/* Loading */}
        {cardState === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Creating expense claim...</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('receipt_proposal', ReceiptProposalCard)

export { ReceiptProposalCard }
