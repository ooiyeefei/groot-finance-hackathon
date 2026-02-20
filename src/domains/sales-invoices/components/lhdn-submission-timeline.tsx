'use client'

import type { LhdnStatus } from '@/lib/constants/statuses'

interface LhdnSubmissionTimelineProps {
  lhdnStatus?: LhdnStatus
  lhdnSubmittedAt?: number
  lhdnValidatedAt?: number
}

interface TimelineStep {
  label: string
  timestamp?: number
  status: 'completed' | 'current' | 'future'
  color: string
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  return date.toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTerminalLabel(lhdnStatus: LhdnStatus): string {
  switch (lhdnStatus) {
    case 'valid': return 'Valid'
    case 'invalid': return 'Invalid'
    case 'cancelled': return 'Cancelled'
    default: return 'Validated'
  }
}

function getTerminalColor(lhdnStatus: LhdnStatus): string {
  switch (lhdnStatus) {
    case 'valid': return 'text-green-600 dark:text-green-400'
    case 'invalid': return 'text-red-600 dark:text-red-400'
    case 'cancelled': return 'text-yellow-600 dark:text-yellow-400'
    default: return 'text-muted-foreground'
  }
}

function getCircleClasses(step: TimelineStep): string {
  if (step.status === 'completed') {
    return 'bg-primary border-primary'
  }
  if (step.status === 'current') {
    switch (step.color) {
      case 'green': return 'bg-green-500 border-green-500'
      case 'red': return 'bg-red-500 border-red-500'
      case 'yellow': return 'bg-yellow-500 border-yellow-500'
      case 'blue': return 'bg-blue-500 border-blue-500'
      case 'gray': return 'bg-gray-500 border-gray-500'
      default: return 'bg-primary border-primary'
    }
  }
  return 'bg-muted border-border'
}

export function LhdnSubmissionTimeline({
  lhdnStatus,
  lhdnSubmittedAt,
  lhdnValidatedAt,
}: LhdnSubmissionTimelineProps) {
  if (!lhdnStatus) return null

  const steps: TimelineStep[] = []

  // Step 1: Pending (submitted)
  const isPendingDone = lhdnStatus !== 'pending'
  steps.push({
    label: 'Pending',
    timestamp: lhdnSubmittedAt,
    status: lhdnStatus === 'pending' ? 'current' : 'completed',
    color: 'gray',
  })

  // Step 2: Submitted
  const isSubmittedDone = ['valid', 'invalid', 'cancelled'].includes(lhdnStatus)
  steps.push({
    label: 'Submitted',
    timestamp: isPendingDone ? lhdnSubmittedAt : undefined,
    status: lhdnStatus === 'submitted'
      ? 'current'
      : isSubmittedDone
        ? 'completed'
        : 'future',
    color: 'blue',
  })

  // Step 3: Terminal state (Valid/Invalid/Cancelled)
  const isTerminal = ['valid', 'invalid', 'cancelled'].includes(lhdnStatus)
  steps.push({
    label: getTerminalLabel(lhdnStatus),
    timestamp: isTerminal ? lhdnValidatedAt : undefined,
    status: isTerminal ? 'current' : 'future',
    color: lhdnStatus === 'valid' ? 'green' : lhdnStatus === 'invalid' ? 'red' : 'yellow',
  })

  return (
    <div className="space-y-0">
      {steps.map((step, index) => (
        <div key={step.label} className="flex gap-3">
          {/* Circle + connector line */}
          <div className="flex flex-col items-center">
            <div
              className={`w-3 h-3 rounded-full border-2 shrink-0 ${getCircleClasses(step)}`}
            />
            {index < steps.length - 1 && (
              <div className="w-0.5 h-6 bg-border" />
            )}
          </div>

          {/* Label + timestamp */}
          <div className="pb-4 -mt-0.5">
            <p
              className={`text-sm font-medium ${
                step.status === 'future'
                  ? 'text-muted-foreground'
                  : step.status === 'current'
                    ? getTerminalColor(lhdnStatus)
                    : 'text-foreground'
              }`}
            >
              {step.label}
            </p>
            {step.timestamp && (
              <p className="text-xs text-muted-foreground">
                {formatTimestamp(step.timestamp)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
