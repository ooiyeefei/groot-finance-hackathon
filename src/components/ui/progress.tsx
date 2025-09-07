/**
 * Progress Component
 * Simple progress bar for DSPy processing visualization
 */

'use client'

import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
}

export function Progress({ value, max = 100, className, ...props }: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-gray-700',
        className
      )}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-blue-600 transition-all duration-300 ease-in-out"
        style={{
          transform: `translateX(-${100 - percentage}%)`
        }}
      />
    </div>
  )
}