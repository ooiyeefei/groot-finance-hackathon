'use client'

import { useState } from 'react'
import { FileCheck2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useActiveBusiness } from '@/contexts/business-context'
import { useToast } from '@/components/ui/toast'
import { LhdnStatusBadge } from '@/domains/sales-invoices/components/lhdn-status-badge'
import type { LhdnStatus } from '@/lib/constants/statuses'

interface SelfBillPromptProps {
  claimId: string
  claimStatus: string
  lhdnStatus?: LhdnStatus
  lhdnValidatedAt?: number
  selfBillRequired?: boolean
  receiptQrCodeDetected?: boolean
}

const CANCELLATION_WINDOW_MS = 72 * 60 * 60 * 1000

export function SelfBillPrompt({
  claimId,
  claimStatus,
  lhdnStatus,
  lhdnValidatedAt,
  selfBillRequired,
  receiptQrCodeDetected,
}: SelfBillPromptProps) {
  const { businessId } = useActiveBusiness()
  const { addToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)

  // Only show for approved/reimbursed claims
  if (claimStatus !== 'approved' && claimStatus !== 'reimbursed') return null

  // Show if self-bill is required, or no QR code detected on receipt, or no LHDN status yet
  const shouldPrompt = selfBillRequired || receiptQrCodeDetected === false || !lhdnStatus

  // Calculate cancellation window for valid status
  const canCancel = lhdnStatus === 'valid' && lhdnValidatedAt &&
    (Date.now() - lhdnValidatedAt) < CANCELLATION_WINDOW_MS

  const timeRemainingMs = lhdnValidatedAt
    ? CANCELLATION_WINDOW_MS - (Date.now() - lhdnValidatedAt)
    : 0
  const hoursRemaining = Math.max(0, Math.floor(timeRemainingMs / (60 * 60 * 1000)))
  const minutesRemaining = Math.max(0, Math.floor((timeRemainingMs % (60 * 60 * 1000)) / (60 * 1000)))

  // If already submitted/valid/cancelled, show status with optional cancel
  if (lhdnStatus && lhdnStatus !== 'invalid') {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Self-Billed E-Invoice
            </CardTitle>
            <LhdnStatusBadge status={lhdnStatus} />
          </div>
        </CardHeader>
        {canCancel && (
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              Cancellation window: {hoursRemaining}h {minutesRemaining}m remaining
            </p>
            {showCancelForm ? (
              <div className="space-y-2">
                <textarea
                  className="w-full text-sm border border-border rounded-md p-2 bg-input text-foreground"
                  placeholder="Reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCancel}
                    disabled={isCancelling || !cancelReason.trim()}
                  >
                    {isCancelling ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-1" />
                    )}
                    Confirm Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowCancelForm(false); setCancelReason('') }}
                  >
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCancelForm(true)}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancel E-Invoice
              </Button>
            )}
          </CardContent>
        )}
        {lhdnStatus === 'valid' && !canCancel && lhdnValidatedAt && (
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              72-hour cancellation window has expired.
            </p>
          </CardContent>
        )}
      </Card>
    )
  }

  if (!shouldPrompt) return null

  const handleSubmit = async () => {
    if (!businessId) return

    setIsSubmitting(true)
    try {
      const response = await fetch(
        `/api/v1/expense-claims/${claimId}/lhdn/self-bill`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Self-bill submission failed')
      }

      addToast({
        type: 'success',
        title: 'Self-billed e-invoice submitted to LHDN',
      })
    } catch (error) {
      addToast({
        type: 'error',
        title: error instanceof Error ? error.message : 'Failed to submit self-billed e-invoice',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!businessId || !cancelReason.trim()) return

    setIsCancelling(true)
    try {
      const response = await fetch(
        `/api/v1/expense-claims/${claimId}/lhdn/cancel`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId, reason: cancelReason.trim() }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Cancellation failed')
      }

      addToast({
        type: 'success',
        title: 'Self-billed e-invoice cancelled',
      })
      setShowCancelForm(false)
      setCancelReason('')
    } catch (error) {
      addToast({
        type: 'error',
        title: error instanceof Error ? error.message : 'Failed to cancel e-invoice',
      })
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <Card className="bg-card border-border border-yellow-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Self-Billed E-Invoice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {receiptQrCodeDetected === false
            ? 'No e-invoice QR code detected on this receipt. A self-billed e-invoice may be required.'
            : 'Self-billing may be required for this expense claim.'}
        </p>

        {lhdnStatus === 'invalid' && (
          <p className="text-sm text-destructive">
            Previous submission was rejected. You can resubmit.
          </p>
        )}

        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <FileCheck2 className="h-4 w-4 mr-1" />
          )}
          {lhdnStatus === 'invalid' ? 'Resubmit Self-Billed E-Invoice' : 'Generate Self-Billed E-Invoice'}
        </Button>
      </CardContent>
    </Card>
  )
}
