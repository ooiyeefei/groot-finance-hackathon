'use client'

import { Loader2, Zap, ExternalLink } from 'lucide-react'
import { useMyReferralCode, useOptIn } from '../hooks/use-referral'
import { ReferralCodeDisplay } from './referral-code-display'
import { ReferralStatsCards } from './referral-stats-cards'
import { ReferralList } from './referral-list'
import { getCommissionRange } from '../lib/referral-utils'
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

  const isReseller = code.type === 'partner_reseller'
  const { min, max } = getCommissionRange(code.type)
  const promoMin = min * 2
  const promoMax = max * 2

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Launch Promo Banner */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-8 translate-x-8" />
        <div className="relative flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-400 uppercase tracking-wider mb-1">Launch Promo</p>
            <p className="text-lg font-bold">
              2x {isReseller ? 'reseller' : 'referral'} fee — RM {promoMin} to RM {promoMax} per deal
            </p>
            <p className="text-sm text-slate-300 mt-1">
              Limited to the first 50 annual subscriptions. First come, first served.
            </p>
          </div>
        </div>
      </div>

      {/* Code Display */}
      <ReferralCodeDisplay code={code.code} referralUrl={code.referralUrl} codeType={code.type} />

      {/* Stats Cards */}
      <ReferralStatsCards />

      {/* Referral List */}
      <ReferralList codeType={code.type} />

      {/* Program Link */}
      <div className="text-center pt-2">
        <a
          href="https://finance.hellogroot.com/referral?t=groot2026"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
        >
          View full Referral Program details
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  )
}
