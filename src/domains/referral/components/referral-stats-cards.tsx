'use client'

import { Users, Clock, CreditCard, TrendingUp } from 'lucide-react'
import { useReferralStats } from '../hooks/use-referral'

export function ReferralStatsCards() {
  const { stats, isLoading } = useReferralStats()

  const cards = [
    { label: 'Total Referrals', value: stats.totalReferrals, icon: Users, color: 'text-foreground' },
    { label: 'In Trial', value: stats.inTrial, icon: Clock, color: 'text-yellow-600' },
    { label: 'Paying', value: stats.paying, icon: CreditCard, color: 'text-green-600' },
    { label: 'Est. Earnings', value: `RM ${stats.totalEstimatedEarnings}`, icon: TrendingUp, color: 'text-primary' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2.5 mb-3">
            <card.icon className={`w-6 h-6 ${card.color}`} />
            <span className="text-base text-muted-foreground font-medium">{card.label}</span>
          </div>
          <p className={`text-3xl sm:text-4xl font-bold ${card.color}`}>
            {isLoading ? '-' : card.value}
          </p>
        </div>
      ))}
    </div>
  )
}
