'use client'

import { cn } from '@/lib/utils'
import { formatBusinessDate } from '@/lib/utils'
import { Check, X, Circle } from 'lucide-react'

export interface TimelineStep {
  label: string
  timestamp?: number
  status: 'completed' | 'current' | 'upcoming' | 'failed'
}

interface StatusTimelineProps {
  steps: TimelineStep[]
  className?: string
}

export function StatusTimeline({ steps, className }: StatusTimelineProps) {
  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1

        return (
          <div key={step.label} className="flex gap-3">
            {/* Indicator column */}
            <div className="flex flex-col items-center">
              {/* Circle */}
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border-2 shrink-0',
                  step.status === 'completed' &&
                    'border-green-500 bg-green-500/10',
                  step.status === 'current' &&
                    'border-blue-500 bg-blue-500/10 animate-pulse',
                  step.status === 'upcoming' &&
                    'border-border bg-muted',
                  step.status === 'failed' &&
                    'border-red-500 bg-red-500/10'
                )}
              >
                {step.status === 'completed' && (
                  <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                )}
                {step.status === 'current' && (
                  <Circle className="h-2.5 w-2.5 fill-blue-500 text-blue-500" />
                )}
                {step.status === 'upcoming' && (
                  <Circle className="h-2.5 w-2.5 text-muted-foreground/40" />
                )}
                {step.status === 'failed' && (
                  <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                )}
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div
                  className={cn(
                    'w-0.5 flex-1 min-h-[16px]',
                    step.status === 'completed'
                      ? 'bg-green-500/30'
                      : step.status === 'failed'
                        ? 'bg-red-500/30'
                        : 'bg-border border-l border-dashed border-border bg-transparent'
                  )}
                />
              )}
            </div>

            {/* Content column */}
            <div className={cn('pb-4', isLast && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-medium leading-6',
                  step.status === 'completed' && 'text-foreground',
                  step.status === 'current' && 'text-blue-600 dark:text-blue-400',
                  step.status === 'upcoming' && 'text-muted-foreground',
                  step.status === 'failed' && 'text-red-600 dark:text-red-400'
                )}
              >
                {step.label}
              </p>
              {step.timestamp && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatBusinessDate(new Date(step.timestamp).toISOString().split('T')[0])}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
