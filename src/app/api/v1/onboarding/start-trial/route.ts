import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData, createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { getStripe } from '@/lib/stripe/client'
import { getPlan } from '@/lib/stripe/plans'

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

    // Get user data including business_id
    const userData = await getUserData(userId)

    if (!userData?.business_id) {
      return NextResponse.json(
        { error: 'No business associated with user' },
        { status: 404 }
      )
    }

    const businessId = userData.business_id
    const supabase = createServiceSupabaseClient()

    // Get business details
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, stripe_customer_id, stripe_subscription_id')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      console.error('[Start Trial] Business not found:', businessError?.message)
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // Check if already has subscription
    if (business.stripe_subscription_id) {
      return NextResponse.json(
        { error: 'Business already has an active subscription' },
        { status: 400 }
      )
    }

    const stripe = getStripe()

    // Get or create Stripe customer
    let customerId = business.stripe_customer_id

    if (!customerId) {
      // Get user email for customer creation
      const { data: user } = await supabase
        .from('users')
        .select('email')
        .eq('clerk_user_id', userId)
        .single()

      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        name: business.name,
        metadata: {
          business_id: business.id,
        },
      })

      customerId = customer.id
      console.log(`[Start Trial] Created Stripe customer: ${customerId}`)

      // Save customer ID
      await supabase
        .from('businesses')
        .update({ stripe_customer_id: customerId })
        .eq('id', business.id)
    }

    // Get Starter plan price (trial gives access to Starter features)
    const starterPlan = await getPlan('starter')

    if (!starterPlan.priceId) {
      console.error('[Start Trial] Starter plan has no priceId configured')
      return NextResponse.json(
        { error: 'Billing not configured. Please contact support.' },
        { status: 500 }
      )
    }

    // Create Stripe subscription with 14-day trial (no payment required)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: starterPlan.priceId }],
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
        business_id: business.id,
        is_trial: 'true',
      },
    })

    console.log(`[Start Trial] Created subscription ${subscription.id} with trial ending ${new Date(subscription.trial_end! * 1000).toISOString()}`)

    // Update business with subscription details
    // Trial dates come from Stripe subscription
    const trialStart = subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : new Date().toISOString()
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

    const { data: updatedBusiness, error: updateError } = await supabase
      .from('businesses')
      .update({
        stripe_subscription_id: subscription.id,
        stripe_product_id: starterPlan.productId,
        trial_start_date: trialStart,
        trial_end_date: trialEnd,
        plan_name: 'trial',
        subscription_status: 'trialing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', businessId)
      .select()
      .single()

    if (updateError) {
      console.error('[Start Trial] Error updating business:', updateError)
      // Don't fail - subscription was created, webhook will sync
    }

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
