'use client'

import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'

/**
 * LHDN E-Invoice Delivery Status Component
 * 001-einv-pdf-gen: Display delivery status, timestamp, recipient, and error details
 */

interface LhdnDeliveryStatusProps {
  deliveryStatus?: string | null
  deliveredAt?: number | null
  deliveredTo?: string | null
  deliveryError?: string | null
}

export function LhdnDeliveryStatus({
  deliveryStatus,
  deliveredAt,
  deliveredTo,
  deliveryError,
}: LhdnDeliveryStatusProps) {
  if (!deliveryStatus) {
    return null
  }

  const getStatusBadge = () => {
    switch (deliveryStatus) {
      case 'delivered':
        return (
          <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Delivered
          </Badge>
        )
      case 'failed':
        return (
          <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
            <AlertCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        )
      case 'pending':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        )
      default:
        return null
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  return (
    <div className="flex flex-col gap-2 p-4 bg-muted rounded-lg border border-border">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground font-medium">Buyer Delivery:</span>
        {getStatusBadge()}
      </div>

      {deliveryStatus === 'delivered' && deliveredAt && (
        <div className="text-sm text-muted-foreground">
          Sent on {formatTimestamp(deliveredAt)}
          {deliveredTo && (
            <span className="ml-1">
              to <span className="text-foreground font-medium">{deliveredTo}</span>
            </span>
          )}
        </div>
      )}

      {deliveryStatus === 'failed' && deliveryError && (
        <div className="text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{deliveryError}</span>
        </div>
      )}
    </div>
  )
}
