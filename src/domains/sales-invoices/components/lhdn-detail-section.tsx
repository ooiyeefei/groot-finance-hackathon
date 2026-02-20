'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LhdnStatusBadge } from './lhdn-status-badge'
import { LhdnSubmitButton } from './lhdn-submit-button'
import { LhdnValidationErrors } from './lhdn-validation-errors'
import { LhdnSubmissionTimeline } from './lhdn-submission-timeline'
import { LhdnQrCode } from './lhdn-qr-code'
import type { SalesInvoice } from '../types'

interface LhdnDetailSectionProps {
  invoice: SalesInvoice
}

export function LhdnDetailSection({ invoice }: LhdnDetailSectionProps) {
  const hasLhdnData = invoice.lhdnStatus !== undefined

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            LHDN e-Invoice
          </CardTitle>
          {hasLhdnData && <LhdnStatusBadge status={invoice.lhdnStatus} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Document reference IDs */}
        {(invoice.lhdnSubmissionId || invoice.lhdnDocumentUuid) && (
          <div className="space-y-1.5 text-sm">
            {invoice.lhdnSubmissionId && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Submission ID</span>
                <span className="font-mono text-xs text-foreground">
                  {invoice.lhdnSubmissionId}
                </span>
              </div>
            )}
            {invoice.lhdnDocumentUuid && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Document UUID</span>
                <span className="font-mono text-xs text-foreground">
                  {invoice.lhdnDocumentUuid}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Validation errors (when invalid) */}
        {invoice.lhdnStatus === 'invalid' && (
          <LhdnValidationErrors
            errors={invoice.lhdnValidationErrors ?? []}
            status={invoice.lhdnStatus}
          />
        )}

        {/* Submission timeline */}
        {hasLhdnData && (
          <LhdnSubmissionTimeline
            lhdnStatus={invoice.lhdnStatus}
            lhdnSubmittedAt={invoice.lhdnSubmittedAt}
            lhdnValidatedAt={invoice.lhdnValidatedAt}
          />
        )}

        {/* QR code (when validated with longId) */}
        {invoice.lhdnLongId && (
          <LhdnQrCode lhdnLongId={invoice.lhdnLongId} />
        )}

        {/* Submit/Resubmit button */}
        <LhdnSubmitButton invoice={invoice} />
      </CardContent>
    </Card>
  )
}
