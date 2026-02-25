import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserDataConvex } from '@/lib/convex'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { getStripe } from '@/lib/stripe/client'
import { getPlan } from '@/lib/stripe/plans'

// Lazy-initialized Convex HTTP client for server-side calls
let convexClient: ConvexHttpClient | null = null

function getConvexHttpClient(): ConvexHttpClient {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!url) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL not configured')
    }
    convexClient = new ConvexHttpClient(url)
  }
  return convexClient
}

/**
 * POST /api/v1/onboarding/start-trial
 *
 * Starts a 14-day trial using Stripe's built-in trial feature.
 * Creates a Stripe subscription with trial_period_days=14 (no payment required).
 *
 * Benefits of Stripe-managed trials:
 * - Stripe is single source of truth for trial dates
 * - Automatic trial_will_end webhook for reminder emails
 * - Subscription pauses if no payment method after trial
 */
export async function POST(request: NextRequest) {
  console.log('[Start Trial] Creating Stripe trial subscription')

  try {
    // Authenticate user via Clerk
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user data including business_id (Convex)
    const userData = await getUserDataConvex(userId)

    if (!userData?.business_id) {
      return NextResponse.json(
        { error: 'No business associated with user' },
        { status: 404 }
      )
    }

    const businessId = userData.business_id
    const convex = getConvexHttpClient()

    // Get business details from Convex
    const business = await convex.query(api.functions.businesses.getById, { id: businessId })

    if (!business) {
      console.error('[Start Trial] Business not found')
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // Check if already has subscription
    if (business.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'Business already has an active subscription' },
        { status: 400 }
      )
    }

    const stripe = getStripe()

    // Get or create Stripe customer
    let customerId = business.stripeCustomerId

    if (!customerId) {
      // User email already available from userData
      const customer = await stripe.customers.create({
        email: userData.email ?? undefined,
        name: business.name,
        metadata: {
          business_id: businessId,
        },
      })

      customerId = customer.id
      console.log(`[Start Trial] Created Stripe customer: ${customerId}`)

      // Save customer ID via Convex mutation
      await convex.mutation(api.functions.businesses.updateStripeCustomerFromCheckout, {
        businessId,
        stripeCustomerId: customerId
      })
    }

    // Get Pro plan price (trial gives full Pro access for 14 days)
    const proPlan = await getPlan('pro')

    if (!proPlan.priceId) {
      console.error('[Start Trial] Pro plan has no priceId configured')
      return NextResponse.json(
        { error: 'Billing not configured. Please contact support.' },
        { status: 500 }
      )
    }

    // 019: Use subscribedCurrency to set the subscription currency
    // This ensures the trial uses the correct currency-matched price
    const subscribedCurrency = business.subscribedCurrency as string | undefined

    // Create Stripe subscription with 14-day trial (no payment required)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: proPlan.priceId }],
      ...(subscribedCurrency ? { currency: subscribedCurrency.toLowerCase() } : {}),
      trial_period_days: 14,
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      trial_settings: {
        end_behavior: {
          // Pause subscription if no payment method when trial ends
          // User can then upgrade via Checkout to resume
          missing_payment_method: 'pause',
        },
      },
      metadata: {
        business_id: businessId, // Use the string businessId from user data
        is_trial: 'true',
      },
    })

    console.log(`[Start Trial] Created subscription ${subscription.id} with trial ending ${new Date(subscription.trial_end! * 1000).toISOString()}`)

    // Extract trial dates from Stripe subscription (stored as Unix seconds)
    // Convert to milliseconds for database storage and ISO strings for API response
    const trialStartMs = subscription.trial_start
      ? subscription.trial_start * 1000
      : Date.now()
    const trialEndMs = subscription.trial_end
      ? subscription.trial_end * 1000
      : Date.now() + 14 * 24 * 60 * 60 * 1000

    const trialStart = new Date(trialStartMs).toISOString()
    const trialEnd = new Date(trialEndMs).toISOString()

    try {
      // Update subscription details AND trial dates via Convex
      // CRITICAL: Trial dates must be stored for enforcement
      await convex.mutation(api.functions.businesses.updateSubscriptionFromWebhook, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeProductId: proPlan.productId ?? undefined,
        planName: 'pro',
        subscriptionStatus: 'trialing',
        trialStartDate: trialStartMs,   // Store as Unix timestamp (milliseconds)
        trialEndDate: trialEndMs,       // Store as Unix timestamp (milliseconds)
      })
      console.log(`[Start Trial] Stored trial dates: start=${trialStart}, end=${trialEnd}`)
    } catch (updateError) {
      console.error('[Start Trial] Error updating business:', updateError)
      // Don't fail - subscription was created, webhook will sync
    }

    // Get updated business
    const updatedBusiness = await convex.query(api.functions.businesses.getById, { id: businessId })

    return NextResponse.json({
      success: true,
      business: updatedBusiness,
      trial_start_date: trialStart,
      trial_end_date: trialEnd,
      subscription_id: subscription.id,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Start Trial] Error:', message)
    return NextResponse.json(
      { error: 'Failed to start trial', details: message },
      { status: 500 }
    )
  }
}
