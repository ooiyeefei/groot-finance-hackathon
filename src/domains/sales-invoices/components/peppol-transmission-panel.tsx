'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PeppolStatusBadge } from './peppol-status-badge'
import { PeppolErrorPanel } from './peppol-error-panel'
import { StatusTimeline, type TimelineStep } from '@/components/ui/status-timeline'
import { Send, Loader2, CheckCircle2 } from 'lucide-react'
import { formatBusinessDate } from '@/lib/utils'
import { PEPPOL_STATUSES, type PeppolStatus } from '@/lib/constants/statuses'

interface PeppolTransmissionPanelProps {
  peppolStatus?: PeppolStatus
  peppolTransmittedAt?: number
  peppolDeliveredAt?: number
  peppolErrors?: Array<{ code: string; message: string }>
  invoiceStatus: string
  businessHasPeppolId: boolean
  customerHasPeppolId: boolean
  onTransmit: () => Promise<void>
  onRetry: () => Promise<void>
}

export function PeppolTransmissionPanel({
  peppolStatus,
  peppolTransmittedAt,
  peppolDeliveredAt,
  peppolErrors,
  invoiceStatus,
  businessHasPeppolId,
  customerHasPeppolId,
  onTransmit,
  onRetry,
}: PeppolTransmissionPanelProps) {
  const [isTransmitting, setIsTransmitting] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const canTransmit =
    !peppolStatus &&
    invoiceStatus !== 'draft' &&
    invoiceStatus !== 'void' &&
    businessHasPeppolId &&
    customerHasPeppolId

  const handleTransmit = async () => {
    setShowConfirm(false)
    setIsTransmitting(true)
    try {
      await onTransmit()
    } finally {
      setIsTransmitting(false)
    }
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await onRetry()
    } finally {
      setIsRetrying(false)
    }
  }

  // Build timeline steps
  const buildTimelineSteps = (): TimelineStep[] => {
    if (!peppolStatus) return []

    const steps: TimelineStep[] = []

    // Step 1: Transmission initiated
    if (peppolStatus === PEPPOL_STATUSES.PENDING) {
      steps.push({ label: 'Transmission initiated', status: 'current' })
      steps.push({ label: 'Transmitted to network', status: 'upcoming' })
      steps.push({ label: 'Delivered to recipient', status: 'upcoming' })
    } else if (peppolStatus === PEPPOL_STATUSES.TRANSMITTED) {
      steps.push({
        label: 'Transmission initiated',
        timestamp: peppolTransmittedAt,
        status: 'completed',
      })
      steps.push({
        label: 'Transmitted to network',
        timestamp: peppolTransmittedAt,
        status: 'completed',
      })
      steps.push({ label: 'Delivered to recipient', status: 'current' })
    } else if (peppolStatus === PEPPOL_STATUSES.DELIVERED) {
      steps.push({
        label: 'Transmission initiated',
        timestamp: peppolTransmittedAt,
        status: 'completed',
      })
      steps.push({
        label: 'Transmitted to network',
        timestamp: peppolTransmittedAt,
        status: 'completed',
      })
      steps.push({
        label: 'Delivered to recipient',
        timestamp: peppolDeliveredAt,
        status: 'completed',
      })
    } else if (peppolStatus === PEPPOL_STATUSES.FAILED) {
      steps.push({
        label: 'Transmission initiated',
        timestamp: peppolTransmittedAt,
        status: 'completed',
      })
      steps.push({ label: 'Transmission failed', status: 'failed' })
    }

    return steps
  }

  const timelineSteps = buildTimelineSteps()

  // No Peppol status yet — show transmit button (or eligibility info)
  if (!peppolStatus) {
    const isDraftOrVoid = invoiceStatus === 'draft' || invoiceStatus === 'void'

    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Peppol InvoiceNow
            </CardTitle>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
              Coming Soon
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Peppol InvoiceNow is on the launchpad — coming soon!
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled
            className="bg-primary/60 text-primary-foreground cursor-not-allowed"
          >
            <Send className="h-4 w-4 mr-2" />
            Transmit via Peppol
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Has a Peppol status — show status panel with timeline
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Peppol InvoiceNow
            </CardTitle>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
              Coming Soon
            </span>
          </div>
          <PeppolStatusBadge status={peppolStatus} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Timeline */}
        {timelineSteps.length > 0 && (
          <StatusTimeline steps={timelineSteps} />
        )}

        {/* Delivery confirmation */}
        {peppolStatus === PEPPOL_STATUSES.DELIVERED && peppolDeliveredAt && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-sm text-foreground">
              Delivered on{' '}
              <span className="font-medium">
                {formatBusinessDate(new Date(peppolDeliveredAt).toISOString().split('T')[0])}
              </span>
            </p>
          </div>
        )}

        {/* Error panel with retry */}
        {peppolStatus === PEPPOL_STATUSES.FAILED && (
          <PeppolErrorPanel
            errors={peppolErrors ?? []}
            onRetry={handleRetry}
            isRetrying={isRetrying}
          />
        )}
      </CardContent>
    </Card>
  )
}
