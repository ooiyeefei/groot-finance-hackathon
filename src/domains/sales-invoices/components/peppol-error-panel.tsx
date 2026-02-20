'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'

interface PeppolErrorPanelProps {
  errors: Array<{ code: string; message: string }>
  onRetry: () => void
  isRetrying: boolean
}

export function PeppolErrorPanel({ errors, onRetry, isRetrying }: PeppolErrorPanelProps) {
  return (
    <Card className="border-destructive bg-destructive/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm font-medium text-foreground">
            Transmission Failed
          </p>
        </div>

        {errors.length > 0 ? (
          <ul className="space-y-2">
            {errors.map((error, index) => (
              <li key={index} className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  {error.code}
                </span>
                <span className="text-muted-foreground mx-1.5">—</span>
                <span className="text-foreground">{error.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            The transmission failed. Please check the invoice details and try again.
          </p>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isRetrying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Retrying...
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry transmission
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
