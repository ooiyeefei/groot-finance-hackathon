'use client'

/**
 * Plan Selection Page - Onboarding Flow
 *
 * Displays subscription plan options for new users during onboarding.
 * Features:
 * - Prominent 14-day free trial CTA (no credit card required)
 * - Three paid plan cards: Starter, Pro, Enterprise
 * - Trial routes to business-setup, paid plans route to checkout
 * - Mobile responsive grid layout
 * - Semantic design tokens for light/dark mode
 *
 * Flow:
 * - Trial → /onboarding/business-setup (continue onboarding)
 * - Paid Plans → /api/v1/billing/checkout (Stripe checkout)
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { FALLBACK_PLANS, PlanKey } from '@/lib/stripe/plans'
import { PlanCard } from '@/domains/onboarding/components/plan-selection/plan-card'
import { TrialCTA } from '@/domains/onboarding/components/plan-selection/trial-cta'
import { useToast } from '@/components/ui/toast'

export default function PlanSelectionPage() {
  const router = useRouter()
  const locale = useLocale()
  const { addToast } = useToast()
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null)

  // Handle trial selection - continue to business setup
  const handleStartTrial = async () => {
    setLoadingPlan('trial')
    try {
      // Route to business setup page (trial plan stored later in onboarding)
      router.push(`/${locale}/onboarding/business`)
    } catch (error) {
      console.error('Error starting trial:', error)
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to start trial. Please try again.',
      })
      setLoadingPlan(null)
    }
  }

  // Handle paid plan selection - redirect to Stripe checkout
  const handleSelectPlan = async (planName: PlanKey) => {
    if (planName === 'trial') {
      handleStartTrial()
      return
    }

    setLoadingPlan(planName)
    try {
      // Call checkout API to create Stripe session
      const response = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName }),
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const { url } = await response.json()

      // Redirect to Stripe Checkout
      window.location.href = url
    } catch (error) {
      console.error('Error creating checkout:', error)
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to start checkout. Please try again.',
      })
      setLoadingPlan(null)
    }
  }

  // Paid plans for display (excluding trial)
  const paidPlans = [
    { name: 'starter' as const, plan: FALLBACK_PLANS.starter, isRecommended: false },
    { name: 'pro' as const, plan: FALLBACK_PLANS.pro, isRecommended: true },
  ]

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            Choose Your Plan
          </h1>
          <p className="text-lg text-muted-foreground">
            Start with a 14-day free trial or select a paid plan
          </p>
        </div>

        {/* Trial CTA - Most Prominent */}
        <div className="max-w-3xl mx-auto">
          <TrialCTA
            onStartTrial={handleStartTrial}
            isLoading={loadingPlan === 'trial'}
          />
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-background text-muted-foreground">
              Or choose a paid plan
            </span>
          </div>
        </div>

        {/* Paid Plan Cards - 3 Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {paidPlans.map(({ name, plan, isRecommended }) => (
            <PlanCard
              key={name}
              planName={name}
              displayName={plan.name}
              features={plan.features}
              teamLimit={plan.teamLimit}
              ocrLimit={plan.ocrLimit}
              isRecommended={isRecommended}
              onSelect={() => handleSelectPlan(name)}
              isLoading={loadingPlan === name}
            />
          ))}
        </div>

        {/* Footer Note */}
        <div className="text-center pt-4">
          <p className="text-sm text-muted-foreground">
            All plans include full data access and email support
          </p>
        </div>
      </div>
    </div>
  )
}
