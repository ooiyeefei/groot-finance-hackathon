'use client'

import { Loader2 } from 'lucide-react'
import { useMyReferralCode } from '../hooks/use-referral'
import { ReferralOptIn } from './referral-opt-in'
import { ReferralCodeDisplay } from './referral-code-display'
import { ReferralStatsCards } from './referral-stats-cards'
import { ReferralList } from './referral-list'

export default function ReferralDashboard() {
  const { code, isLoading, isOptedIn } = useMyReferralCode()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!isOptedIn || !code) {
    return <ReferralOptIn />
  }

  return (
    <div className="space-y-6">
      <ReferralCodeDisplay code={code.code} referralUrl={code.referralUrl} />
      <ReferralStatsCards />
      <ReferralList />
    </div>
  )
}
