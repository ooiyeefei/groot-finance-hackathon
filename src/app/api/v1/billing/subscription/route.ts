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
import {
  getPlan,
  PlanKey,
  getOcrLimitSync,
  getAiMessageLimitSync,
  getInvoiceLimitSync,
  getEinvoiceLimitSync,
} from '@/lib/stripe/plans'
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

    // Get current month usage from Convex (parallel queries, fail-open)
    const businessIdTyped = business._id as Id<"businesses">

    let currentUsage = 0
    let aiMessagesUsed = 0
    let aiMessagesPlanLimit = 0
    let salesInvoicesUsed = 0
    let salesInvoicesPlanLimit = 0
    let einvoicesUsed = 0
    let einvoicesPlanLimit = 0
    let creditPacksList: Array<{
      id: string
      packType: string
      packName: string
      totalCredits: number
      creditsUsed: number
      creditsRemaining: number
      purchasedAt: number
      expiresAt: number
      status: string
    }> = []

    try {
      const [ocrData, aiData, salesData, einvoiceData, activePacks] = await Promise.all([
        client.query(api.functions.ocrUsage.getCurrentUsage, { businessId: businessIdTyped })
          .catch(() => null),
        client.query(api.functions.aiMessageUsage.getCurrentUsage, { businessId: businessIdTyped })
          .catch(() => null),
        client.query(api.functions.salesInvoiceUsage.getCurrentCount, { businessId: businessIdTyped })
          .catch(() => null),
        client.query(api.functions.einvoiceUsage.getCurrentUsage, { businessId: businessIdTyped })
          .catch(() => null),
        client.query(api.functions.creditPacks.getActivePacks, { businessId: businessIdTyped })
          .catch(() => []),
      ])

      currentUsage = ocrData?.creditsUsed ?? 0
      aiMessagesUsed = aiData?.messagesUsed ?? 0
      aiMessagesPlanLimit = aiData?.planLimit ?? 0
      salesInvoicesUsed = salesData?.count ?? 0
      salesInvoicesPlanLimit = salesData?.planLimit ?? 0
      einvoicesUsed = einvoiceData?.submissionsUsed ?? 0
      einvoicesPlanLimit = einvoiceData?.planLimit ?? 0
      creditPacksList = (activePacks ?? []).map((p: any) => ({
        id: p._id,
        packType: p.packType,
        packName: p.packName,
        totalCredits: p.totalCredits,
        creditsUsed: p.creditsUsed,
        creditsRemaining: p.creditsRemaining,
        purchasedAt: p.purchasedAt,
        expiresAt: p.expiresAt,
        status: p.status,
      }))
    } catch (usageError) {
      console.error('[Billing Subscription] Failed to get usage data:', usageError)
      // Continue with 0 defaults (fail-open)
    }

    // Normalize plan key - 'free' maps to 'trial'
    const rawPlanKey = business.planName || 'trial'
    const planKey: PlanKey = rawPlanKey === 'free' ? 'trial' : (rawPlanKey as PlanKey)
    // Get plan from Stripe catalog (with caching/fallback)
    const plan = await getPlan(planKey)
    const ocrLimit = getOcrLimitSync(planKey)
    const aiMessageLimit = aiMessagesPlanLimit || getAiMessageLimitSync(planKey)
    const invoiceLimit = salesInvoicesPlanLimit || getInvoiceLimitSync(planKey)
    const einvoiceLimit = einvoicesPlanLimit || getEinvoiceLimitSync(planKey)

    // Build subscription response
    let subscriptionDetails = null

    // Skip Stripe API call for manual subscriptions (not real Stripe IDs)
    const isManualSubscription = business.stripeSubscriptionId?.startsWith('manual_')

    if (business.stripeSubscriptionId && !isManualSubscription) {
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

    // Calculate renewal info for paid subscriptions
    let renewalInfo: {
      periodEnd: string | null
      daysUntilRenewal: number | null
      needsAttention: boolean
      urgencyLevel: 'none' | 'low' | 'medium' | 'high'
    } = {
      periodEnd: null,
      daysUntilRenewal: null,
      needsAttention: false,
      urgencyLevel: 'none',
    }

    // Use period end from database (set by webhook) or from Stripe API
    const periodEndTimestamp = business.subscriptionPeriodEnd ||
      (subscriptionDetails?.currentPeriodEnd ? new Date(subscriptionDetails.currentPeriodEnd).getTime() : null)

    if (periodEndTimestamp && planKey !== 'trial') {
      const periodEnd = new Date(periodEndTimestamp)
      const now = new Date()
      const daysUntilRenewal = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      renewalInfo = {
        periodEnd: periodEnd.toISOString(),
        daysUntilRenewal: Math.max(0, daysUntilRenewal),
        needsAttention: daysUntilRenewal <= 30,
        urgencyLevel: daysUntilRenewal <= 7 ? 'high' :
                      daysUntilRenewal <= 14 ? 'medium' :
                      daysUntilRenewal <= 30 ? 'low' : 'none',
      }
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
          aiMessagesUsed,
          aiMessagesLimit: aiMessageLimit,
          aiMessagesRemaining: aiMessageLimit === -1 ? -1 : Math.max(0, aiMessageLimit - aiMessagesUsed),
          aiMessagesPercentage: aiMessageLimit === -1 ? 0 : Math.min(100, Math.round((aiMessagesUsed / aiMessageLimit) * 100)),
          aiMessagesIsUnlimited: aiMessageLimit === -1,
          salesInvoicesUsed,
          salesInvoicesLimit: invoiceLimit,
          salesInvoicesRemaining: invoiceLimit === -1 ? -1 : Math.max(0, invoiceLimit - salesInvoicesUsed),
          salesInvoicesPercentage: invoiceLimit === -1 ? 0 : Math.min(100, Math.round((salesInvoicesUsed / invoiceLimit) * 100)),
          salesInvoicesIsUnlimited: invoiceLimit === -1,
          einvoicesUsed,
          einvoicesLimit: einvoiceLimit,
          einvoicesRemaining: einvoiceLimit === -1 ? -1 : Math.max(0, einvoiceLimit - einvoicesUsed),
          einvoicesPercentage: einvoiceLimit === -1 ? 0 : Math.min(100, Math.round((einvoicesUsed / einvoiceLimit) * 100)),
          einvoicesIsUnlimited: einvoiceLimit === -1,
        },
        creditPacks: creditPacksList,
        trial: trialInfo,
        renewal: renewalInfo,
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
