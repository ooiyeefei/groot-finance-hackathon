'use client'

/**
 * Plan Selection Page - Onboarding Flow
 *
 * Displays subscription plan options for new users during onboarding.
 * Uses the shared PricingTable component from billing domain.
 *
 * Features:
 * - Prominent 14-day free trial CTA (no credit card required)
 * - Paid plan cards via shared PricingTable component
 * - Trial routes to business-setup, paid plans route to checkout
 *
 * Flow:
 * - Trial → /onboarding/business (continue onboarding)
 * - Paid Plans → /api/v1/billing/checkout (Stripe checkout)
 *
 * Also handles expired trials:
 * - Shows "Trial Expired" messaging when ?trial_expired=true
 * - Hides trial CTA for expired users
 * - Prompts user to select a paid plan
 */

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'
import { SignOutButton } from '@clerk/nextjs'
import { PlanKey } from '@/lib/stripe/plans'
import { PricingTable } from '@/domains/billing/components/pricing-table'
import { TrialCTA } from '@/domains/onboarding/components/plan-selection/trial-cta'
import { useToast } from '@/components/ui/toast'
import { AlertTriangle, Loader2, LogOut } from 'lucide-react'

// Inner component that uses useSearchParams (must be wrapped in Suspense)
function PlanSelectionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const locale = useLocale()
  const { addToast } = useToast()
  const [isTrialLoading, setIsTrialLoading] = useState(false)

  // Check if this is an expired trial redirect
  const isTrialExpired = searchParams.get('trial_expired') === 'true'

  // Handle trial selection - continue to business setup
  const handleStartTrial = async () => {
    setIsTrialLoading(true)
    try {
      router.push(`/${locale}/onboarding/business`)
    } catch (error) {
      console.error('Error starting trial:', error)
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to start trial. Please try again.',
      })
      setIsTrialLoading(false)
    }
  }

  // Handle paid plan checkout (standalone mode)
  const handleCheckout = async (planName: PlanKey) => {
    try {
      const response = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName }),
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      console.error('Error creating checkout:', error)
      addToast({
        type: 'error',
        title: 'Error',
        description: 'Failed to start checkout. Please try again.',
      })
    }
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Trial Expired Banner */}
        {isTrialExpired && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">
                  Your Free Trial Has Expired
                </h2>
                <p className="text-muted-foreground">
                  Your 14-day free trial has ended. To continue using FinanSEAL and access your data,
                  please select a paid plan below. Your data is safe and will be available once you upgrade.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            {isTrialExpired ? 'Upgrade to Continue' : 'Choose Your Plan'}
          </h1>
          <p className="text-lg text-muted-foreground">
            {isTrialExpired
              ? 'Select a plan to unlock your account and continue using FinanSEAL'
              : 'Start with a 14-day free trial or select a paid plan'
            }
          </p>
        </div>

        {/* Trial CTA - Only show for new users, hide for expired trials */}
        {!isTrialExpired && (
          <>
            <div className="max-w-3xl mx-auto">
              <TrialCTA
                onStartTrial={handleStartTrial}
                isLoading={isTrialLoading}
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
          </>
        )}

        {/* Pricing Table - Standalone mode for onboarding */}
        <PricingTable
          standalone
          showLimits
          showCurrentPlan={false}
          onCheckout={handleCheckout}
          className="max-w-6xl mx-auto"
        />

        {/* Footer Note */}
        <div className="text-center pt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            All plans include full data access and email support
          </p>
          <SignOutButton redirectUrl="/en/sign-in">
            <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
    </div>
  )
}

// Loading fallback for Suspense
function PlanSelectionLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Loading plans...</span>
      </div>
    </div>
  )
}

// Page wrapper with Suspense boundary (required for useSearchParams)
export default function PlanSelectionPage() {
  return (
    <Suspense fallback={<PlanSelectionLoading />}>
      <PlanSelectionContent />
    </Suspense>
  )
}
