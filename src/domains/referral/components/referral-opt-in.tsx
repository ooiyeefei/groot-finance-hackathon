'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Gift, Loader2 } from 'lucide-react'
import { useOptIn } from '../hooks/use-referral'

export function ReferralOptIn() {
  const optIn = useOptIn()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOptIn = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await optIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to opt in')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 text-center max-w-md mx-auto">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
        <Gift className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">
        Start Earning with Referrals
      </h2>
      <p className="text-muted-foreground text-sm mb-1">
        Share your unique code and earn <strong className="text-foreground">RM 80</strong> for every business that subscribes to an annual plan.
      </p>
      <p className="text-muted-foreground text-sm mb-6">
        Referred businesses get <strong className="text-foreground">RM 100 off</strong> their annual plan.
      </p>
      {error && (
        <p className="text-destructive text-sm mb-4">{error}</p>
      )}
      <Button
        onClick={handleOptIn}
        disabled={isLoading}
        className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
        size="lg"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Setting up...
          </>
        ) : (
          'Start Referring'
        )}
      </Button>
    </div>
  )
}
