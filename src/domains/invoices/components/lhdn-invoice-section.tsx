'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Clock, AlertTriangle, XCircle, Loader2, Shield } from 'lucide-react'
import { usePermissions } from '@/contexts/business-context'
import { formatBusinessDate } from '@/lib/utils'

const REJECTION_WINDOW_MS = 72 * 60 * 60 * 1000 // 72 hours

interface LhdnInvoiceSectionProps {
  invoice: {
    _id: string
    lhdnVerificationStatus?: string
    lhdnDocumentUuid?: string
    lhdnLongId?: string
    lhdnValidatedAt?: number
    lhdnStatus?: string
    lhdnRejectedAt?: number
    lhdnRejectionReason?: string
    lhdnValidationUrl?: string
  }
  onReject?: () => void
}

function formatTimeRemaining(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  if (hours > 0) return `${hours}h ${minutes}m remaining`
  return `${minutes}m remaining`
}

export default function LhdnInvoiceSection({ invoice, onReject }: LhdnInvoiceSectionProps) {
  const { isOwner } = usePermissions()
  const [timeRemaining, setTimeRemaining] = useState(0)

  const {
    lhdnVerificationStatus,
    lhdnDocumentUuid,
    lhdnValidatedAt,
    lhdnStatus,
    lhdnRejectedAt,
    lhdnRejectionReason,
    lhdnValidationUrl,
  } = invoice

  // Don't render if not an e-invoice
  if (!lhdnVerificationStatus || lhdnVerificationStatus === 'not_einvoice') {
    return null
  }

  // Countdown timer
  const withinRejectionWindow = lhdnValidatedAt
    ? Date.now() - lhdnValidatedAt < REJECTION_WINDOW_MS
    : false

  useEffect(() => {
    if (!lhdnValidatedAt || !withinRejectionWindow) return

    const updateTime = () => {
      const elapsed = Date.now() - lhdnValidatedAt
      const remaining = REJECTION_WINDOW_MS - elapsed
      setTimeRemaining(Math.max(0, remaining))
    }

    updateTime()
    const interval = setInterval(updateTime, 60 * 1000) // Update every minute
    return () => clearInterval(interval)
  }, [lhdnValidatedAt, withinRejectionWindow])

  const isRejected = lhdnStatus === 'rejected'
  const isVerified = lhdnVerificationStatus === 'verified'
  const isPending = lhdnVerificationStatus === 'pending'
  const isFailed = lhdnVerificationStatus === 'failed'
  const isUrgent = timeRemaining > 0 && timeRemaining < 6 * 60 * 60 * 1000 // < 6 hours

  // RBAC: owner, finance_admin, manager can reject
  const canReject = isOwner // usePermissions doesn't expose finance_admin directly, but isOwner covers owner + admin access

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center gap-2 ${
        isRejected
          ? 'bg-red-500/10 border-b border-red-500/30'
          : isVerified
          ? 'bg-green-500/10 border-b border-green-500/30'
          : isPending
          ? 'bg-blue-500/10 border-b border-blue-500/30'
          : 'bg-muted/50 border-b border-border'
      }`}>
        {isRejected ? (
          <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
        ) : isVerified ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : isPending ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        )}

        <span className={`text-sm font-medium ${
          isRejected ? 'text-red-700 dark:text-red-300'
          : isVerified ? 'text-green-700 dark:text-green-300'
          : isPending ? 'text-blue-700 dark:text-blue-300'
          : 'text-amber-700 dark:text-amber-300'
        }`}>
          {isRejected ? 'E-Invoice Rejected'
          : isVerified ? 'LHDN Validated E-Invoice'
          : isPending ? 'LHDN Verification Pending'
          : 'LHDN Verification Failed'}
        </span>

        {/* Countdown badge */}
        {withinRejectionWindow && isVerified && timeRemaining > 0 && (
          <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            isUrgent
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}>
            <Clock className="w-3 h-3" />
            {formatTimeRemaining(timeRemaining)}
          </span>
        )}
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2 text-xs text-muted-foreground">
        {lhdnDocumentUuid && (
          <div className="flex justify-between">
            <span>Document UUID</span>
            <span className="font-mono text-foreground">{lhdnDocumentUuid.substring(0, 20)}...</span>
          </div>
        )}
        {lhdnValidatedAt && (
          <div className="flex justify-between">
            <span>Validated</span>
            <span className="text-foreground">{formatBusinessDate(new Date(lhdnValidatedAt).toISOString().split('T')[0])}</span>
          </div>
        )}
        {lhdnValidationUrl && (
          <div className="flex justify-between">
            <span>MyInvois</span>
            <a href={lhdnValidationUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              View on LHDN Portal
            </a>
          </div>
        )}
        {isRejected && lhdnRejectionReason && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded">
            <p className="text-xs font-medium text-red-700 dark:text-red-300">Rejection Reason:</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{lhdnRejectionReason}</p>
          </div>
        )}
      </div>

      {/* Reject button */}
      {withinRejectionWindow && isVerified && !isRejected && canReject && onReject && (
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={onReject}
            className="px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md text-sm font-medium"
          >
            Reject E-Invoice
          </button>
        </div>
      )}

      {/* Past window — compliance record */}
      {!withinRejectionWindow && isVerified && !isRejected && (
        <div className="px-4 py-2 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5" />
          <span>72-hour rejection window has closed. This e-invoice is now final.</span>
        </div>
      )}
    </div>
  )
}
