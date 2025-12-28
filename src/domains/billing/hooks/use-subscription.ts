'use client'

/**
 * useSubscription Hook
 *
 * Client-side hook for fetching and managing subscription state.
 * Provides real-time subscription status, usage tracking, and checkout actions.
 */

import { useState, useEffect, useCallback } from 'react'
import { PlanName } from '@/lib/stripe/plans'

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

  // Fetch on mount
  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

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
