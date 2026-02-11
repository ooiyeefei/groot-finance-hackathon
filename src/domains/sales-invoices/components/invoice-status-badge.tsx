'use client'

import { Badge } from '@/components/ui/badge'
import type { SalesInvoiceStatus } from '../types'

interface InvoiceStatusBadgeProps {
  status: SalesInvoiceStatus
}

const STATUS_CONFIG: Record<SalesInvoiceStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  },
  sent: {
    label: 'Sent',
    className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30',
  },
  partially_paid: {
    label: 'Partially Paid',
    className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
  },
  paid: {
    label: 'Paid',
    className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
  },
  overdue: {
    label: 'Overdue',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
  },
  void: {
    label: 'Void',
    className: 'bg-muted text-muted-foreground border border-border',
  },
}

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return <Badge className={config.className}>{config.label}</Badge>
}
