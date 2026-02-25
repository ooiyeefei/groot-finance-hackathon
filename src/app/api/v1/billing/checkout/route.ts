/**
 * Stripe Checkout API Route
 *
 * Creates Stripe Checkout sessions for subscription purchases.
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 *
 * @route POST /api/v1/billing/checkout
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getStripe } from '@/lib/stripe/client'
import { getPlan, PlanKey } from '@/lib/stripe/plans'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

export async function POST(request: NextRequest) {
  console.log('[Billing Checkout] Creating checkout session')

  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { planName, successUrl, isOnboarding, currency } = body as {
      planName: PlanKey
      successUrl?: string
      isOnboarding?: boolean
      currency?: string
    }

    // Validate plan key
    const validPlanKeys: PlanKey[] = ['starter', 'pro', 'enterprise']
    if (!planName || !validPlanKeys.includes(planName)) {
      return NextResponse.json(
        { success: false, error: 'Invalid plan name' },
        { status: 400 }
      )
    }

    // Get plan from Stripe catalog (with fallback)
    const plan = await getPlan(planName)

    // Free plan doesn't need checkout
    if (!plan.priceId) {
      return NextResponse.json(
        { success: false, error: 'Free plan does not require checkout' },
        { status: 400 }
      )
    }

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Billing Checkout] Failed to get Convex client')
      return NextResponse.json(
        { success: false, error: 'Database connection failed' },
        { status: 500 }
      )
    }

    // Get current business via authenticated query
    // @ts-ignore - Convex API types cause "Type instantiation is excessively deep" error
    const getCurrentBusinessFn = api.functions.businesses.getCurrentBusiness
    const business = await client.query(getCurrentBusinessFn)

    if (!business) {
      return NextResponse.json(
        { success: false, error: 'No business associated with user' },
        { status: 400 }
      )
    }

    // 019: Currency mismatch validation — reject if business is locked to a different currency
    const subscribedCurrency = business.subscribedCurrency as string | undefined
    if (subscribedCurrency) {
      // Determine effective checkout currency from request or plan default
      const effectiveCurrency = currency?.toUpperCase() || plan.currency
      if (effectiveCurrency !== subscribedCurrency) {
        console.warn(
          `[Billing Checkout] Currency mismatch: business ${business._id} locked to ${subscribedCurrency}, attempted ${effectiveCurrency}`
        )
        return NextResponse.json(
          {
            success: false,
            error: `This account is configured for ${subscribedCurrency} billing. Cannot checkout with ${effectiveCurrency} pricing.`,
          },
          { status: 403 }
        )
      }
    }

    // Check if already has ACTIVE paid subscription
    // Allow checkout for: no subscription, paused trials, canceled subscriptions
    const hasActiveSubscription =
      business.stripeSubscriptionId &&
      business.subscriptionStatus === 'active'

    if (hasActiveSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: 'Business already has an active subscription. Use the billing portal to change plans.',
        },
        { status: 400 }
      )
    }

    // If user has a paused/expired subscription, cancel it before creating new one.
    // IMPORTANT: Do NOT cancel 'trialing' subscriptions here. Canceling an active trial
    // triggers subscription.deleted webhook → sets subscriptionStatus="canceled" → locks
    // user out if they click browser Back without completing checkout. Stripe handles the
    // transition automatically when the new subscription activates.
    if (business.stripeSubscriptionId &&
        (business.subscriptionStatus === 'paused' ||
         business.subscriptionStatus === 'canceled')) {
      try {
        console.log(`[Billing Checkout] Canceling expired subscription: ${business.stripeSubscriptionId}`)
        await getStripe().subscriptions.cancel(business.stripeSubscriptionId)
      } catch (cancelError) {
        // Subscription may already be canceled, continue with checkout
        console.warn(`[Billing Checkout] Could not cancel subscription (may already be canceled):`, cancelError)
      }
    }

    // Get user info from Clerk for email
    const clerkUser = await currentUser()
    const userEmail = clerkUser?.emailAddresses?.[0]?.emailAddress

    // Get or create Stripe customer
    let customerId = business.stripeCustomerId

    if (!customerId) {
      // Create new Stripe customer
      const customer = await getStripe().customers.create({
        email: userEmail ?? undefined,
        name: business.name,
        metadata: {
          business_id: business._id,
        },
      })

      customerId = customer.id

      // Update business with customer ID via Convex mutation
      // @ts-ignore - Convex API types cause deep type error
      const updateStripeSubFn = api.functions.businesses.updateStripeSubscription
      await client.mutation(updateStripeSubFn, {
        businessId: business._id,
        stripeCustomerId: customerId,
      })

      console.log(`[Billing Checkout] Created Stripe customer: ${customerId}`)
    }

    // Build checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Build dynamic URLs based on isOnboarding flag
    let finalSuccessUrl: string
    let finalCancelUrl: string

    if (isOnboarding) {
      // Onboarding flow: use provided successUrl or default to business setup
      finalSuccessUrl = successUrl || `${baseUrl}/en/onboarding/business?plan=${planName}`
      finalCancelUrl = `${baseUrl}/en/onboarding/plan-selection?canceled=true`
    } else {
      // Normal billing flow: existing behavior
      finalSuccessUrl = `${baseUrl}/en/business-settings?tab=billing&success=true&session_id={CHECKOUT_SESSION_ID}`
      finalCancelUrl = `${baseUrl}/en/pricing?canceled=true`
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(currency ? { currency: currency.toLowerCase() } : {}),
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
      metadata: {
        business_id: business._id,
        plan_name: planName,
        is_onboarding: isOnboarding ? 'true' : 'false',
      },
      subscription_data: {
        metadata: {
          business_id: business._id,
        },
      },
      // Enable automatic tax calculation if needed
      // automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
    })

    console.log(`[Billing Checkout] Created session: ${session.id} for plan: ${planName}`)

    // 019: First-checkout currency lock — permanently set subscribedCurrency if not already locked
    if (!subscribedCurrency) {
      const checkoutCurrency = currency?.toUpperCase() || plan.currency
      try {
        // @ts-ignore - Convex API types cause deep type error
        const updateStripeFn = api.functions.businesses.updateStripeSubscription
        await client.mutation(updateStripeFn, {
          businessId: business._id,
          subscribedCurrency: checkoutCurrency,
        })
        console.log(`[Billing Checkout] Locked currency to ${checkoutCurrency} for business ${business._id}`)
      } catch (lockError) {
        // Non-fatal: currency lock failure shouldn't block checkout
        console.warn(`[Billing Checkout] Failed to lock currency:`, lockError)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Checkout] Error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
