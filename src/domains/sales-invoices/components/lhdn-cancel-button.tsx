'use client'

import { useState } from 'react'
import { XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActiveBusiness } from '@/contexts/business-context'
import { useToast } from '@/components/ui/toast'
import type { SalesInvoice } from '../types'

interface LhdnCancelButtonProps {
  invoice: SalesInvoice
}

export function LhdnCancelButton({ invoice }: LhdnCancelButtonProps) {
  const { businessId } = useActiveBusiness()
  const { addToast } = useToast()
  const [isCancelling, setIsCancelling] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [reason, setReason] = useState('')

  // Only show for validated invoices within 72-hour window
  if (invoice.lhdnStatus !== 'valid' || !invoice.lhdnValidatedAt) return null

  const CANCELLATION_WINDOW_MS = 72 * 60 * 60 * 1000
  const elapsed = Date.now() - invoice.lhdnValidatedAt
  const isExpired = elapsed > CANCELLATION_WINDOW_MS

  if (isExpired) {
    return (
      <p className="text-xs text-muted-foreground">
        Cancellation window expired (72 hours after validation).
      </p>
    )
  }

  const hoursRemaining = Math.max(0, Math.floor((CANCELLATION_WINDOW_MS - elapsed) / (60 * 60 * 1000)))

  const handleCancel = async () => {
    if (!businessId || !reason.trim()) return

    setIsCancelling(true)
    try {
      const response = await fetch(
        `/api/v1/sales-invoices/${invoice._id}/lhdn/cancel`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, reason: reason.trim() }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Cancellation failed')
      }

      addToast({ type: 'success', title: 'E-invoice cancelled successfully' })
      setShowConfirm(false)
      setReason('')
    } catch (error) {
      addToast({
        type: 'error',
        title: error instanceof Error ? error.message : 'Failed to cancel e-invoice',
      })
    } finally {
      setIsCancelling(false)
    }
  }

  if (showConfirm) {
    return (
      <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm text-foreground font-medium">Cancel E-Invoice</p>
        <p className="text-xs text-muted-foreground">
          {hoursRemaining}h remaining in cancellation window.
        </p>
        <textarea
          className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Enter cancellation reason (required)..."
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleCancel}
            disabled={isCancelling || !reason.trim()}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {isCancelling && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Confirm Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setShowConfirm(false); setReason('') }}
            disabled={isCancelling}
          >
            Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => setShowConfirm(true)}
      className="text-destructive hover:text-destructive hover:bg-destructive/10"
    >
      <XCircle className="h-4 w-4 mr-1" />
      Cancel E-Invoice ({hoursRemaining}h left)
    </Button>
  )
}
