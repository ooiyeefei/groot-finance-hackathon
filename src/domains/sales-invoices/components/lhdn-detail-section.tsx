'use client'

import { AlertTriangle, Copy, CheckCircle2, FileText } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LhdnStatusBadge } from './lhdn-status-badge'
import { LhdnSubmissionTimeline } from './lhdn-submission-timeline'
import { LhdnValidationErrors } from './lhdn-validation-errors'
import { LhdnSubmitButton } from './lhdn-submit-button'
import { LhdnCancelButton } from './lhdn-cancel-button'
import type { SalesInvoice } from '../types'
import { formatBusinessDate } from '@/lib/utils'

interface LhdnDetailSectionProps {
  invoice: SalesInvoice
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-xs font-mono text-foreground truncate">{value}</span>
        <button
          onClick={handleCopy}
          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          title="Copy"
        >
          {copied ? (
            <CheckCircle2 className="h-3 w-3 text-green-600" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  )
}

export function LhdnDetailSection({ invoice }: LhdnDetailSectionProps) {
  // Don't show if no LHDN interaction at all
  const hasLhdnData = invoice.lhdnStatus || invoice.lhdnSubmissionId || invoice.lhdnDocumentUuid

  if (!hasLhdnData) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            LHDN e-Invoice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No LHDN submission yet.
            </p>
          </div>
          <LhdnSubmitButton invoice={invoice} />
        </CardContent>
      </Card>
    )
  }

  const isRejected = invoice.lhdnStatus === 'rejected'
  const isCancelledByBuyer = invoice.lhdnStatus === 'cancelled_by_buyer'
  const hasStatusChange = isRejected || isCancelledByBuyer

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            LHDN e-Invoice
          </CardTitle>
          <LhdnStatusBadge status={invoice.lhdnStatus} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Review Required Warning Banner */}
        {invoice.lhdnReviewRequired && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Review Required — Journal Entry May Need Reversal
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  This invoice has a posted journal entry. The {isRejected ? 'rejection' : 'cancellation'} means the AR entry may no longer be valid.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Rejection / Cancellation Details */}
        {hasStatusChange && (
          <div className="rounded-md border border-border bg-muted/50 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge className={isRejected
                ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
                : 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30'
              }>
                {isRejected ? 'Buyer Rejected' : 'Cancelled by Buyer'}
              </Badge>
            </div>
            {invoice.lhdnStatusReason && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Reason: </span>
                {invoice.lhdnStatusReason}
              </p>
            )}
            {isRejected && invoice.lhdnRejectedAt && (
              <p className="text-xs text-muted-foreground">
                Rejected at: {formatBusinessDate(new Date(invoice.lhdnRejectedAt).toISOString().split('T')[0])}
              </p>
            )}
            {isCancelledByBuyer && invoice.lhdnRejectedAt && (
              <p className="text-xs text-muted-foreground">
                Cancelled at: {formatBusinessDate(new Date(invoice.lhdnRejectedAt).toISOString().split('T')[0])}
              </p>
            )}
          </div>
        )}

        {/* LHDN Metadata */}
        <div className="space-y-2">
          {invoice.lhdnDocumentUuid && (
            <CopyableField label="Document UUID" value={invoice.lhdnDocumentUuid} />
          )}
          {invoice.lhdnLongId && (
            <CopyableField label="Long ID" value={invoice.lhdnLongId} />
          )}
          {invoice.lhdnSubmissionId && (
            <CopyableField label="Submission ID" value={invoice.lhdnSubmissionId} />
          )}
          {invoice.lhdnValidatedAt && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Validated</span>
              <span className="text-xs text-foreground">
                {formatBusinessDate(new Date(invoice.lhdnValidatedAt).toISOString().split('T')[0])}
              </span>
            </div>
          )}
        </div>

        {/* Submission Timeline */}
        <LhdnSubmissionTimeline
          lhdnStatus={invoice.lhdnStatus}
          lhdnSubmittedAt={invoice.lhdnSubmittedAt}
          lhdnValidatedAt={invoice.lhdnValidatedAt}
        />

        {/* Validation Errors (shown for invalid status) */}
        {invoice.lhdnValidationErrors && invoice.lhdnValidationErrors.length > 0 && (
          <LhdnValidationErrors
            errors={invoice.lhdnValidationErrors}
            status={invoice.lhdnStatus}
          />
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <LhdnSubmitButton invoice={invoice} />
          <LhdnCancelButton invoice={invoice} />
        </div>
      </CardContent>
    </Card>
  )
}
