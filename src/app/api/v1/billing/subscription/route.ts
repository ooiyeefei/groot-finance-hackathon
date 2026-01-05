/**
 * Subscription Status API Route
 *
 * Returns current subscription status for the authenticated user's business.
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 *
 * @route GET /api/v1/billing/subscription
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getStripe } from '@/lib/stripe/client'
import { getPlan, PlanKey, getOcrLimitSync } from '@/lib/stripe/plans'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

export async function GET(request: NextRequest) {
  console.log('[Billing Subscription] Fetching subscription status')

  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Billing Subscription] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get current business via authenticated query
    const business = await client.query(api.functions.businesses.getCurrentBusiness)

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'No business associated with user' },
        { status: 400 }
      )
    }

    // Get current month OCR usage from Convex
    let currentUsage = 0
    try {
      const usageData = await client.query(api.functions.ocrUsage.getCurrentUsage, {
        businessId: business._id as Id<"businesses">
      })
      currentUsage = usageData?.creditsUsed ?? 0
    } catch (usageError) {
      console.error('[Billing Subscription] Failed to get OCR usage:', usageError)
      // Continue with 0 usage
    }

    // Normalize plan key - 'free' maps to 'trial'
    const rawPlanKey = business.planName || 'trial'
    const planKey: PlanKey = rawPlanKey === 'free' ? 'trial' : (rawPlanKey as PlanKey)
    // Get plan from Stripe catalog (with caching/fallback)
    const plan = await getPlan(planKey)
    const ocrLimit = getOcrLimitSync(planKey)

    // Build subscription response
    let subscriptionDetails = null

    if (business.stripeSubscriptionId) {
      try {
        // Stripe SDK v20+ type workaround - cast to access properties
        const subscription = (await getStripe().subscriptions.retrieve(
          business.stripeSubscriptionId
        )) as unknown as {
          id: string
          status: string
          current_period_start: number
          current_period_end: number
          cancel_at_period_end: boolean
          cancel_at: number | null
        }

        subscriptionDetails = {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000).toISOString()
            : null,
          currentPeriodEnd: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
          cancelAt: subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toISOString()
            : null,
        }
      } catch (stripeError) {
        console.error('[Billing Subscription] Failed to fetch Stripe subscription:', stripeError)
        // Continue without Stripe details - use database values
      }
    }

    // Calculate trial info
    // Check both plan_name and subscription_status for robustness
    // Stripe sets subscription_status='trialing' which webhook syncs to plan_name='trial'
    const isTrialPlan = planKey === 'trial'
    const isTrialingStatus = business.subscriptionStatus === 'trialing'
    const isPausedStatus = business.subscriptionStatus === 'paused'
    const isOnTrial = isTrialPlan || isTrialingStatus

    let trialInfo: {
      isOnTrial: boolean
      trialStartDate: string | null
      trialEndDate: string | null
      daysRemaining: number | null
      trialExpired: boolean
      isPaused: boolean
    } = {
      isOnTrial: false,
      trialStartDate: null,
      trialEndDate: null,
      daysRemaining: null,
      trialExpired: false,
      isPaused: isPausedStatus,
    }

    if (isOnTrial) {
      const now = new Date()

      // Use explicit trial dates if set, otherwise calculate from created_at (14-day trial)
      let trialStart: Date
      let trialEnd: Date

      if (business.trialEndDate) {
        // Use explicitly set trial dates (Convex stores as timestamp number)
        trialEnd = new Date(business.trialEndDate)
        trialStart = business.trialStartDate
          ? new Date(business.trialStartDate)
          : new Date(trialEnd.getTime() - 14 * 24 * 60 * 60 * 1000)
      } else {
        // Calculate from business creation date (14-day trial period)
        // Convex uses _creationTime for created_at
        trialStart = new Date(business._creationTime)
        trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000)
      }

      const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      trialInfo = {
        isOnTrial: true,
        trialStartDate: trialStart.toISOString(),
        trialEndDate: trialEnd.toISOString(),
        daysRemaining: Math.max(0, daysRemaining),
        trialExpired: daysRemaining < 0,
        isPaused: isPausedStatus,
      }
    }

    // Handle paused status (trial ended without payment method)
    // User needs to upgrade via Checkout to resume
    if (isPausedStatus && !isOnTrial) {
      trialInfo.isPaused = true
      trialInfo.trialExpired = true
    }

    const response = {
      success: true,
      data: {
        plan: {
          name: planKey,
          displayName: plan.name,
          price: plan.price,
          currency: plan.currency,
          features: plan.features,
        },
        subscription: {
          status: business.subscriptionStatus || 'active',
          stripeCustomerId: business.stripeCustomerId,
          stripeSubscriptionId: business.stripeSubscriptionId,
          ...subscriptionDetails,
        },
        usage: {
          ocrUsed: currentUsage,
          ocrLimit: ocrLimit,
          ocrRemaining: ocrLimit === -1 ? -1 : Math.max(0, ocrLimit - currentUsage),
          ocrPercentage: ocrLimit === -1 ? 0 : Math.min(100, Math.round((currentUsage / ocrLimit) * 100)),
          isUnlimited: ocrLimit === -1,
        },
        trial: trialInfo,
        business: {
          id: business._id,
          name: business.name,
        },
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Subscription] Error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch subscription status' },
      { status: 500 }
    )
  }
}
