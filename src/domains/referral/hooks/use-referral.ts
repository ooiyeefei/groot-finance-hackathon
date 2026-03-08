'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'

export function useMyReferralCode() {
  const data = useQuery(api.functions.referral.getMyCode)

  return {
    code: data,
    isLoading: data === undefined,
    isOptedIn: data !== null && data !== undefined,
  }
}

export function useMyReferrals() {
  const data = useQuery(api.functions.referral.getMyReferrals)

  return {
    referrals: data ?? [],
    isLoading: data === undefined,
  }
}

export function useReferralStats() {
  const data = useQuery(api.functions.referral.getStats)

  return {
    stats: data ?? { totalReferrals: 0, inTrial: 0, paying: 0, churned: 0, totalEstimatedEarnings: 0 },
    isLoading: data === undefined,
  }
}

export function useOptIn() {
  const optIn = useMutation(api.functions.referral.optIn)
  return optIn
}
