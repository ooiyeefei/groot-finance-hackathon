'use client'

import { FileCheck, Loader2, AlertCircle, FileUp, QrCode, Upload, Ban } from 'lucide-react'

interface EinvoiceStatusBadgeProps {
  einvoiceRequestStatus?: string | null
  einvoiceAttached?: boolean
  einvoiceSource?: string | null
  merchantFormUrl?: string | null
  lhdnReceivedStatus?: string | null
}

/**
 * E-Invoice status badge for expense claim list/detail views
 * Shows the current state of e-invoice retrieval for a claim
 */
export default function EinvoiceStatusBadge({
  einvoiceRequestStatus,
  einvoiceAttached,
  einvoiceSource,
  merchantFormUrl,
  lhdnReceivedStatus,
}: EinvoiceStatusBadgeProps) {
  const getConfig = () => {
    // Cancelled LHDN document
    if (lhdnReceivedStatus === 'cancelled') {
      return {
        icon: Ban,
        text: 'E-Invoice Cancelled',
        className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 line-through',
        animate: false,
      }
    }

    // Received / attached
    if (einvoiceAttached) {
      if (einvoiceSource === 'manual_upload') {
        return {
          icon: Upload,
          text: 'E-Invoice (Manual)',
          className: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/30',
          animate: false,
        }
      }
      return {
        icon: FileCheck,
        text: 'E-Invoice Received',
        className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
        animate: false,
      }
    }

    switch (einvoiceRequestStatus) {
      case 'requesting':
        return {
          icon: Loader2,
          text: 'Requesting',
          className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
          animate: true,
        }
      case 'requested':
        return {
          icon: FileUp,
          text: 'Requested',
          className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30',
          animate: false,
        }
      case 'submitted':
        return {
          icon: FileCheck,
          text: 'Submitted',
          className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
          animate: false,
        }
      case 'received':
        return {
          icon: FileCheck,
          text: 'Received',
          className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
          animate: false,
        }
      case 'failed':
        return {
          icon: AlertCircle,
          text: 'Failed',
          className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
          animate: false,
        }
      default:
        break
    }

    // QR detected but no request yet
    if (merchantFormUrl) {
      return {
        icon: QrCode,
        text: 'QR Detected',
        className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
        animate: false,
      }
    }

    // No e-invoice status
    return null
  }

  const config = getConfig()
  if (!config) return null

  const Icon = config.icon

  return (
    <div
      className={`${config.className} inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium`}
    >
      <Icon
        className={`w-3 h-3 mr-1 ${config.animate ? 'animate-spin' : ''}`}
      />
      {config.text}
    </div>
  )
}
