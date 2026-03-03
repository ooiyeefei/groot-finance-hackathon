'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

const CURRENT_POLICY_VERSION = process.env.NEXT_PUBLIC_CURRENT_POLICY_VERSION || '2026-03-03'

/**
 * Hook to check if the current user has valid consent for the current policy version.
 * Uses Convex real-time subscriptions for automatic cross-tab reactivity.
 */
export function useConsent() {
  const result = useQuery(api.functions.consent.hasAcceptedCurrentPolicy, {
    policyType: 'privacy_policy',
    policyVersion: CURRENT_POLICY_VERSION,
  })

  return {
    hasConsent: result?.hasConsent ?? false,
    wasRevoked: result?.wasRevoked ?? false,
    isLoading: result === undefined,
    record: result?.record,
    policyVersion: CURRENT_POLICY_VERSION,
  }
}

/**
 * Hook to get all consent history for the current user.
 */
export function useConsentHistory() {
  const result = useQuery(api.functions.consent.getConsentHistory, {})

  return {
    records: result?.records ?? [],
    isLoading: result === undefined,
  }
}
