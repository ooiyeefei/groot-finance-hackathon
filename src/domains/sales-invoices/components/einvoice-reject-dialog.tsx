'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, AlertTriangle, Clock } from 'lucide-react'
import { toast } from 'sonner'

const REJECTION_WINDOW_MS = 72 * 60 * 60 * 1000 // 72 hours

interface EinvoiceRejectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentUuid: string
  supplierName?: string
  businessId: string
  /** Timestamp (ms) of document creation/validation for countdown */
  documentTimestamp: number
  onRejected?: () => void
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`
  }
  return `${minutes}m remaining`
}

export default function EinvoiceRejectDialog({
  open,
  onOpenChange,
  documentUuid,
  supplierName,
  businessId,
  documentTimestamp,
  onRejected,
}: EinvoiceRejectDialogProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(0)

  // Update countdown every minute
  useEffect(() => {
    if (!open) return

    const updateTime = () => {
      const elapsed = Date.now() - documentTimestamp
      const remaining = REJECTION_WINDOW_MS - elapsed
      setTimeRemaining(Math.max(0, remaining))
    }

    updateTime()
    const interval = setInterval(updateTime, 60 * 1000)
    return () => clearInterval(interval)
  }, [open, documentTimestamp])

  const isExpired = timeRemaining <= 0

  const handleReject = async () => {
    if (!reason.trim()) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/einvoice-received/${encodeURIComponent(documentUuid)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          reason: reason.trim(),
        }),
      })

      const result = await response.json()

      if (!result.success) {
        if (result.error === 'REJECTION_WINDOW_EXPIRED') {
          setError('The 72-hour rejection window has expired. This document can no longer be rejected.')
        } else {
          setError(result.error || 'Failed to reject e-invoice')
        }
        return
      }

      toast.success('E-invoice rejected successfully')
      setReason('')
      onOpenChange(false)
      onRejected?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject e-invoice')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Reject E-Invoice
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Reject the received e-invoice{supplierName ? ` from ${supplierName}` : ''} via LHDN.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 72-hour countdown */}
          <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
            isExpired
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : timeRemaining < 6 * 60 * 60 * 1000
                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          }`}>
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              {isExpired
                ? 'Rejection window has expired'
                : `Rejection window: ${formatTimeRemaining(timeRemaining)}`
              }
            </span>
          </div>

          {/* Reason input */}
          <div className="space-y-2">
            <Label htmlFor="rejection-reason" className="text-foreground font-medium">
              Rejection Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="rejection-reason"
              placeholder="Enter the reason for rejecting this e-invoice..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px] bg-input border-border text-foreground"
              disabled={loading || isExpired}
            />
          </div>

          {/* Error display */}
          {error && (
            <div className="text-sm bg-destructive/10 text-destructive rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleReject}
            disabled={loading || !reason.trim() || isExpired}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Reject E-Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
