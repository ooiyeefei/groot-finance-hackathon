'use client'

import { Badge } from '@/components/ui/badge'
import type { PeppolStatus } from '@/lib/constants/statuses'

interface PeppolStatusBadgeProps {
  status: PeppolStatus
}

const STATUS_CONFIG: Record<PeppolStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-muted text-muted-foreground border border-border',
  },
  transmitted: {
    label: 'Transmitted',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  },
  delivered: {
    label: 'Delivered',
    className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
  },
}

export function PeppolStatusBadge({ status }: PeppolStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return <Badge className={config.className}>{config.label}</Badge>
}
