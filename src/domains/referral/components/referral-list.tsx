'use client'

import { useMyReferrals } from '../hooks/use-referral'
import { REFERRAL_STATUS_CONFIG } from '../lib/referral-utils'

export function ReferralList() {
  const { referrals, isLoading } = useMyReferrals()

  if (isLoading) return null

  if (referrals.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center">
        <p className="text-muted-foreground text-sm">
          No referrals yet. Share your code to start earning!
        </p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Referred Businesses</h3>
      </div>
      <div className="divide-y divide-border">
        {referrals.map((referral) => {
          const statusConfig = REFERRAL_STATUS_CONFIG[referral.status] ?? {
            label: referral.status,
            color: 'text-muted-foreground',
          }

          return (
            <div key={referral._id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {referral.referredBusinessName || 'Pending'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(referral.capturedAt).toLocaleDateString()}
                  {referral.currentPlan && ` \u00B7 ${referral.currentPlan}`}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {referral.estimatedEarning != null && referral.estimatedEarning > 0 && (
                  <span className="text-sm font-medium text-foreground">
                    RM {referral.estimatedEarning}
                  </span>
                )}
                <span className={`text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
