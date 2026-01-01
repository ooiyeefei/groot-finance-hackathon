'use client'

/**
 * useSubscription Hook
 *
 * Client-side hook for fetching and managing subscription state.
 * Provides real-time subscription status, usage tracking, and checkout actions.
 */

import { useState, useEffect, useCallback } from 'react'
import { PlanName } from '@/lib/stripe/plans'
import { useActiveBusiness } from '@/contexts/business-context'

export interface TrialInfo {
  isOnTrial: boolean
  trialStartDate: string | null
  trialEndDate: string | null
  daysRemaining: number | null
  trialExpired: boolean
}

// ============================================================================
// TRIAL CALCULATION UTILITIES (Centralized - Single Source of Truth)
// ============================================================================

/** Standard trial duration in days */
export const TRIAL_DURATION_DAYS = 14

/**
 * Calculate days used in trial period from start date.
 * Day 1 starts immediately when trial begins (not after 24 hours).
 *
 * @param trial - The trial info object
 * @returns Number of days used (1-based, minimum 1)
 */
export function calculateTrialDaysUsed(trial: TrialInfo): number {
  if (trial.trialStartDate) {
    const startDate = new Date(trial.trialStartDate)
    const now = new Date()
    // Set both to start of day for accurate day counting
    const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const daysDiff = Math.floor((today.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(1, daysDiff + 1) // +1 because Day 1 is the first day
  }
  // Fallback to old calculation if no start date
  return TRIAL_DURATION_DAYS - (trial.daysRemaining ?? 0)
}

/**
 * Calculate trial progress as a percentage (0-100).
 *
 * @param trial - The trial info object
 * @returns Progress percentage (0-100)
 */
export function calculateTrialProgress(trial: TrialInfo): number {
  const daysUsed = calculateTrialDaysUsed(trial)
  return Math.min(100, Math.round((daysUsed / TRIAL_DURATION_DAYS) * 100))
}

export interface SubscriptionData {
  plan: {
    name: PlanName
    displayName: string
    price: number
    currency: string
    features: string[]
  }
  subscription: {
    status: string
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    cancelAt: string | null
  }
  usage: {
    ocrUsed: number
    ocrLimit: number
    ocrRemaining: number
    ocrPercentage: number
    isUnlimited: boolean
  }
  trial: TrialInfo
  business: {
    id: string
    name: string
  }
}

export interface UseSubscriptionReturn {
  data: SubscriptionData | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  createCheckout: (planName: PlanName) => Promise<string | null>
  isCheckoutLoading: boolean
}

export function useSubscription(): UseSubscriptionReturn {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)

  // Get current business context - refetch when business changes
  const { businessId } = useActiveBusiness()

  const fetchSubscription = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/v1/billing/subscription', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch subscription')
      }

      setData(result.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('[useSubscription] Error:', message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount and when business changes
  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription, businessId])

  /**
   * Create a Stripe Checkout session and redirect to payment
   */
  const createCheckout = useCallback(async (planName: PlanName): Promise<string | null> => {
    try {
      setIsCheckoutLoading(true)
      setError(null)

      const response = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planName }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create checkout session')
      }

      // Redirect to Stripe Checkout
      if (result.data?.url) {
        window.location.href = result.data.url
        return result.data.sessionId
      }

      throw new Error('No checkout URL returned')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('[useSubscription] Checkout error:', message)
      return null
    } finally {
      setIsCheckoutLoading(false)
    }
  }, [])

  return {
    data,
    isLoading,
    error,
    refetch: fetchSubscription,
    createCheckout,
    isCheckoutLoading,
  }
}
