'use client'

import { Loader2 } from 'lucide-react'
import { useMyReferralCode, useOptIn } from '../hooks/use-referral'
import { ReferralCodeDisplay } from './referral-code-display'
import { ReferralStatsCards } from './referral-stats-cards'
import { ReferralList } from './referral-list'
import { useEffect, useState } from 'react'

export default function ReferralDashboard() {
  const { code, isLoading, isOptedIn } = useMyReferralCode()
  const optIn = useOptIn()
  const [autoGenerating, setAutoGenerating] = useState(false)

  // Auto-generate code if user doesn't have one (backfill edge case)
  useEffect(() => {
    if (!isLoading && !isOptedIn && !autoGenerating) {
      setAutoGenerating(true)
      optIn().catch(() => setAutoGenerating(false))
    }
  }, [isLoading, isOptedIn, autoGenerating, optIn])

  if (isLoading || !isOptedIn || !code) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Setting up your referral code...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <ReferralCodeDisplay code={code.code} referralUrl={code.referralUrl} />
      <ReferralStatsCards />
      <ReferralList />
    </div>
  )
}
