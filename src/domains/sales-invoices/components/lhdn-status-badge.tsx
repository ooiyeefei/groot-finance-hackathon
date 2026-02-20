'use client'

import { Badge } from '@/components/ui/badge'
import type { LhdnStatus } from '@/lib/constants/statuses'

interface LhdnStatusBadgeProps {
  status: LhdnStatus | undefined
}

const STATUS_CONFIG: Record<LhdnStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/30',
  },
  submitted: {
    label: 'Submitted',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  },
  valid: {
    label: 'Valid',
    className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
  },
  invalid: {
    label: 'Invalid',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
  },
}

export function LhdnStatusBadge({ status }: LhdnStatusBadgeProps) {
  if (!status) return null

  const config = STATUS_CONFIG[status]
  if (!config) return null

  return <Badge className={config.className}>{config.label}</Badge>
}
