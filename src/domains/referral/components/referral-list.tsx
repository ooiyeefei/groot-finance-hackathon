'use client'

import { useMyReferrals } from '../hooks/use-referral'
import { REFERRAL_STATUS_CONFIG, getCommissionRange } from '../lib/referral-utils'

export function ReferralList({ codeType }: { codeType?: string }) {
  const { referrals, isLoading } = useMyReferrals()

  if (isLoading) return null

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-base font-semibold text-foreground">Referred Businesses</h3>
      </div>

      {referrals.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-muted-foreground text-base">
            No referrals yet. Share your code to start earning!
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            Earn RM {getCommissionRange(codeType).min} (Starter) or RM {getCommissionRange(codeType).max} (Pro) for every annual subscription.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {referrals.map((referral) => {
            const statusConfig = REFERRAL_STATUS_CONFIG[referral.status] ?? {
              label: referral.status,
              color: 'text-muted-foreground',
            }

            return (
              <div key={referral._id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-foreground truncate">
                    {referral.referredBusinessName || 'Pending'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {new Date(referral.capturedAt).toLocaleDateString()}
                    {referral.currentPlan && ` \u00B7 ${referral.currentPlan}`}
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  {referral.estimatedEarning != null && referral.estimatedEarning > 0 && (
                    <span className="text-base font-semibold text-foreground">
                      RM {referral.estimatedEarning}
                    </span>
                  )}
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${statusConfig.color} ${
                    referral.status === 'paid' || referral.status === 'upgraded' ? 'bg-green-50' :
                    referral.status === 'trial' ? 'bg-yellow-50' :
                    referral.status === 'churned' || referral.status === 'cancelled' ? 'bg-red-50' :
                    'bg-muted'
                  }`}>
                    {statusConfig.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
