'use client'

import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { LhdnStatus } from '@/lib/constants/statuses'
import type { LhdnValidationError } from '../types'

interface LhdnValidationErrorsProps {
  errors: LhdnValidationError[]
  status: LhdnStatus | undefined
}

export function LhdnValidationErrors({ errors, status }: LhdnValidationErrorsProps) {
  if (status !== 'invalid') return null

  return (
    <Card className="border-red-500/30 bg-red-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-sm font-medium text-foreground">
            LHDN Validation Errors
          </p>
        </div>

        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Validation failed — no error details available from LHDN.
          </p>
        ) : (
          <div className="space-y-2">
            {errors.map((error, index) => (
              <div
                key={`${error.code}-${index}`}
                className="bg-card/50 border border-border rounded-md p-2.5 space-y-0.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs text-red-600 dark:text-red-400">
                    {error.code}
                  </span>
                  {error.target && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {error.target}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground">{error.message}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
