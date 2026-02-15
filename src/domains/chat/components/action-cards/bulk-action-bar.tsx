'use client'

/**
 * Bulk Action Bar
 *
 * Wrapper component that enables batch selection and processing
 * when 2+ approval-type cards (expense_approval or invoice_posting)
 * are rendered in a single response.
 */

import { useState, useCallback } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { CheckSquare, Square, Loader2, AlertCircle } from 'lucide-react'
import type { ChatAction } from '../../lib/sse-parser'
import { getActionCardComponent } from './index'

interface BulkActionBarProps {
  actions: ChatAction[]
  cardType: string
  isHistorical: boolean
}

type ItemStatus = 'pending' | 'processing' | 'done' | 'failed'

interface ProcessingState {
  phase: 'idle' | 'confirming' | 'processing' | 'complete'
  itemStatuses: Map<string, ItemStatus>
  successCount: number
  failCount: number
}

function BulkActionBar({ actions, cardType, isHistorical }: BulkActionBarProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [state, setState] = useState<ProcessingState>({
    phase: 'idle',
    itemStatuses: new Map(),
    successCount: 0,
    failCount: 0,
  })

  const approveExpense = useMutation(api.functions.expenseSubmissions.approve)
  const createEntry = useMutation(api.functions.accountingEntries.create)

  const actionIds = actions.map((a) => a.id || `bulk-${actions.indexOf(a)}`)

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selected.size === actions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(actionIds))
    }
  }, [actions.length, actionIds, selected.size])

  const handleBulkApprove = async () => {
    setState((prev) => ({ ...prev, phase: 'processing' }))
    const statuses = new Map<string, ItemStatus>()
    let success = 0
    let fail = 0

    for (const actionId of selected) {
      const action = actions.find((a) => (a.id || `bulk-${actions.indexOf(a)}`) === actionId)
      if (!action) continue

      statuses.set(actionId, 'processing')
      setState((prev) => ({ ...prev, itemStatuses: new Map(statuses) }))

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = action.data as any
        if (cardType === 'expense_approval') {
          await approveExpense({ id: data.submissionId })
        } else if (cardType === 'invoice_posting') {
          await createEntry({
            transactionType: 'Expense',
            originalAmount: data.amount,
            originalCurrency: data.currency,
            transactionDate: data.invoiceDate,
            vendorName: data.vendorName,
            sourceRecordId: data.invoiceId,
            sourceDocumentType: 'invoice',
            createdByMethod: 'ocr',
          })
        }
        statuses.set(actionId, 'done')
        success++
      } catch {
        statuses.set(actionId, 'failed')
        fail++
      }
    }

    setState({ phase: 'complete', itemStatuses: new Map(statuses), successCount: success, failCount: fail })
  }

  const retryFailed = useCallback(() => {
    // Re-select only failed items
    const failedIds = new Set<string>()
    state.itemStatuses.forEach((status, id) => {
      if (status === 'failed') failedIds.add(id)
    })
    setSelected(failedIds)
    setState({ phase: 'idle', itemStatuses: new Map(), successCount: 0, failCount: 0 })
  }, [state.itemStatuses])

  const CardComponent = getActionCardComponent(cardType)
  const allSelected = selected.size === actions.length && actions.length > 0

  return (
    <div className="space-y-2">
      {/* Bulk select bar */}
      {!isHistorical && state.phase !== 'processing' && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-muted/50 border border-border rounded-lg">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary transition-colors"
          >
            {allSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-primary" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {allSelected ? 'Deselect All' : 'Select All'} ({actions.length})
          </button>

          {selected.size > 0 && state.phase === 'idle' && (
            <button
              onClick={() => setState((prev) => ({ ...prev, phase: 'confirming' }))}
              className="text-xs px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
            >
              Approve Selected ({selected.size})
            </button>
          )}
        </div>
      )}

      {/* Inline confirmation */}
      {state.phase === 'confirming' && (
        <div className="bg-muted/50 border border-border rounded-lg p-2">
          <p className="text-xs text-foreground mb-2">
            Approve {selected.size} {selected.size === 1 ? 'item' : 'items'}?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleBulkApprove}
              className="flex-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setState((prev) => ({ ...prev, phase: 'idle' }))}
              className="flex-1 text-xs px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {state.phase === 'processing' && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 border border-border rounded-lg text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Processing {selected.size} items...</span>
        </div>
      )}

      {/* Completion summary */}
      {state.phase === 'complete' && (
        <div className="px-2 py-1.5 bg-muted/50 border border-border rounded-lg">
          <div className="flex items-center gap-2 text-xs">
            {state.failCount === 0 ? (
              <span className="text-green-600 dark:text-green-400 font-medium">
                All {state.successCount} items approved
              </span>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-foreground">
                  {state.successCount} approved, {state.failCount} failed
                </span>
                <button
                  onClick={retryFailed}
                  className="ml-auto text-xs text-primary hover:text-primary/80 font-medium"
                >
                  Retry Failed
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Individual cards with checkboxes */}
      {actions.map((action, idx) => {
        const actionId = action.id || `bulk-${idx}`
        const itemStatus = state.itemStatuses.get(actionId)
        const isSelected = selected.has(actionId)

        return (
          <div key={actionId} className="flex items-start gap-2">
            {/* Checkbox */}
            {!isHistorical && state.phase !== 'processing' && state.phase !== 'complete' && (
              <button
                onClick={() => toggleSelect(actionId)}
                className="mt-2 flex-shrink-0"
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            )}

            {/* Status indicator during processing */}
            {(state.phase === 'processing' || state.phase === 'complete') && (
              <div className="mt-2 flex-shrink-0">
                {itemStatus === 'processing' && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {itemStatus === 'done' && <CheckSquare className="w-4 h-4 text-green-600 dark:text-green-400" />}
                {itemStatus === 'failed' && <AlertCircle className="w-4 h-4 text-destructive" />}
                {!itemStatus && <Square className="w-4 h-4 text-muted-foreground" />}
              </div>
            )}

            {/* Card */}
            <div className="flex-1">
              <CardComponent
                action={action}
                isHistorical={isHistorical || state.phase === 'processing' || state.phase === 'complete'}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { BulkActionBar }
