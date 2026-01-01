'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { PlanName } from '@/lib/stripe/plans'

interface CheckoutResponse {
  success: boolean
  data?: {
    sessionId: string
    url: string
  }
  error?: string
}

export function usePlanSelection() {
  const router = useRouter()
  const locale = useLocale()
  const [selectedPlan, setSelectedPlan] = useState<PlanName | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectPlan = async (plan: PlanName): Promise<void> => {
    setIsLoading(true)
    setError(null)
    setSelectedPlan(plan)

    try {
      // Trial plan: Call start-trial API, then proceed to business setup
      if (plan === 'trial') {
        const trialResponse = await fetch('/api/v1/onboarding/start-trial', {
          method: 'POST',
        })

        const trialResult = await trialResponse.json()

        if (!trialResponse.ok) {
          throw new Error(trialResult.error || 'Failed to start trial')
        }

        router.push(`/${locale}/onboarding/business`)
        return
      }

      // Enterprise plan: Navigate to contact/inquiry page
      if (plan === 'enterprise') {
        router.push('/contact?plan=enterprise')
        return
      }

      // Starter/Pro plans: Initiate Stripe Checkout
      const response = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planName: plan,
          isOnboarding: true,
          successUrl: `${window.location.origin}/${locale}/onboarding/business?session_id={CHECKOUT_SESSION_ID}`,
        }),
      })

      const result: CheckoutResponse = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create checkout session')
      }

      if (!result.success || !result.data?.url) {
        throw new Error('Invalid checkout response')
      }

      // Redirect to Stripe Checkout
      window.location.href = result.data.url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(message)
      console.error('[usePlanSelection] Error:', message)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    selectedPlan,
    setSelectedPlan,
    isLoading,
    error,
    handleSelectPlan,
  }
}
