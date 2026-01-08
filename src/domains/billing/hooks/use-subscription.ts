'use client'

/**
 * useSubscription Hook
 *
 * Client-side hook for fetching and managing subscription state.
 * Provides real-time subscription status, usage tracking, and checkout actions.
 *
 * CLS FIX: Implements localStorage caching to prevent flicker on navigation.
 * Data is cached per-business and shown immediately while fresh data loads in background.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { PlanName } from '@/lib/stripe/plans'
import { useActiveBusiness } from '@/contexts/business-context'

// ============================================================================
// SUBSCRIPTION CACHING UTILITIES (CLS Prevention)
// ============================================================================

const SUBSCRIPTION_CACHE_KEY = 'subscription-data'

/**
 * Get cached subscription data from localStorage.
 * Returns cached data if:
 * - businessId is null (use any cached data during hydration)
 * - businessId matches cached business
 */
function getCachedSubscription(businessId: string | null): SubscriptionData | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(SUBSCRIPTION_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as SubscriptionData
      // Use cache if:
      // 1. businessId is null (during hydration, show cached data to prevent flicker)
      // 2. businessId matches the cached business
      if (!businessId || parsed.business?.id === businessId) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

/**
 * Save subscription data to localStorage for instant hydration.
 */
function cacheSubscription(data: SubscriptionData | null): void {
  if (typeof window === 'undefined') return

  try {
    if (data) {
      localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(data))
    } else {
      localStorage.removeItem(SUBSCRIPTION_CACHE_KEY)
    }
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

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
  // Get current business context - refetch when business changes
  const { businessId } = useActiveBusiness()

  // CLS FIX: Initialize from localStorage cache for instant hydration
  const [data, setData] = useState<SubscriptionData | null>(() => {
    return getCachedSubscription(businessId)
  })

  // CLS FIX: Only show loading if no cached data available
  const [isLoading, setIsLoading] = useState(() => {
    return !getCachedSubscription(businessId)
  })

  const [error, setError] = useState<string | null>(null)
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)

  // Track if we've already fetched for this businessId to prevent duplicate calls
  const lastFetchedBusinessId = useRef<string | null>(null)

  const fetchSubscription = useCallback(async (showLoading = false) => {
    try {
      // Only show loading spinner if explicitly requested (no cached data)
      if (showLoading) {
        setIsLoading(true)
      }
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
      // CLS FIX: Cache the data for instant hydration on next navigation
      cacheSubscription(result.data)
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
    // Skip if businessId is null (wait for business context to hydrate)
    // We still show cached data via useState initializer
    if (!businessId) {
      return
    }

    // Skip if we've already fetched for this businessId (prevents duplicate calls)
    if (lastFetchedBusinessId.current === businessId) {
      return
    }
    lastFetchedBusinessId.current = businessId

    // Check if we have cached data for this business
    const cached = getCachedSubscription(businessId)

    if (cached) {
      // Use cached data immediately, fetch fresh in background silently
      setData(cached)
      setIsLoading(false)
      fetchSubscription(false) // Silent background refresh
    } else {
      // No cache, show loading and fetch
      fetchSubscription(true)
    }
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
