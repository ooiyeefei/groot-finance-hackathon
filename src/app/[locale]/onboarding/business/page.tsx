'use client'

/**
 * Business Creation Onboarding Page
 *
 * Thin wrapper that:
 * 1. Checks auth (redirects to sign-in if needed)
 * 2. Runs auto-recovery (switches to existing business if found)
 * 3. Renders BusinessOnboardingModal in "page" mode
 *
 * The actual 5-step wizard lives in BusinessOnboardingModal,
 * shared with the "Create New Business" flow in the sidebar.
 */

// Force dynamic rendering - required for Clerk authentication
export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'
import { useBusinessContext } from '@/contexts/business-context'
import BusinessOnboardingModal from '@/domains/onboarding/components/business-onboarding-modal'

export default function BusinessOnboarding() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  const { refreshMemberships, refreshContext } = useBusinessContext()

  const [isMounted, setIsMounted] = useState(false)
  const [isCheckingExistingBusinesses, setIsCheckingExistingBusinesses] = useState(true)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // AUTO-RECOVERY: Check if user has other businesses and switch to them
  // This handles the case where user's current business was deleted
  useEffect(() => {
    if (!isMounted || !isLoaded || !isSignedIn) return

    const checkExistingBusinesses = async () => {
      try {
        const response = await fetch('/api/v1/account-management/businesses')
        const result = await response.json()

        if (result.success && result.data?.businesses?.length > 0) {
          const targetBusiness = result.data.businesses[0]
          console.log('[BusinessOnboarding] Found existing business, switching:', targetBusiness.name)

          const switchResponse = await fetch('/api/v1/account-management/businesses/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: targetBusiness.id }),
          })

          if (switchResponse.ok) {
            await refreshContext()
            await refreshMemberships()
            router.push('/en/expense-claims')
            return
          }
        }
      } catch (error) {
        console.error('[BusinessOnboarding] Error checking existing businesses:', error)
      } finally {
        setIsCheckingExistingBusinesses(false)
      }
    }

    checkExistingBusinesses()
  }, [isMounted, isLoaded, isSignedIn, router, refreshContext, refreshMemberships])

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (isMounted && isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isMounted, isLoaded, isSignedIn, router])

  // Loading state
  if (!isMounted || !isLoaded || isCheckingExistingBusinesses) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{isCheckingExistingBusinesses ? 'Checking account...' : 'Loading...'}</span>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return null
  }

  return (
    <BusinessOnboardingModal
      isOpen={true}
      onClose={() => router.push('/en/onboarding/plan-selection')}
      mode="page"
    />
  )
}
