/**
 * Stripe Checkout API Route
 *
 * Creates Stripe Checkout sessions for subscription purchases.
 *
 * @route POST /api/v1/billing/checkout
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getStripe } from '@/lib/stripe/client'
import { PLANS, PlanName } from '@/lib/stripe/plans'
import { createClient } from '@supabase/supabase-js'

// Supabase client with service role for server-side operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    const { planName } = body as { planName: PlanName }

    if (!planName || !PLANS[planName]) {
      return NextResponse.json(
        { success: false, error: 'Invalid plan name' },
        { status: 400 }
      )
    }

    const plan = PLANS[planName]

    // Free plan doesn't need checkout
    if (!plan.priceId) {
      return NextResponse.json(
        { success: false, error: 'Free plan does not require checkout' },
        { status: 400 }
      )
    }

    // Get user's business context
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, business_id, email, full_name')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error('[Billing Checkout] User not found:', userError?.message)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    if (!user.business_id) {
      return NextResponse.json(
        { success: false, error: 'No business associated with user' },
        { status: 400 }
      )
    }

    // Get business details
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, name, stripe_customer_id, stripe_subscription_id')
      .eq('id', user.business_id)
      .single()

    if (businessError || !business) {
      console.error('[Billing Checkout] Business not found:', businessError?.message)
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    // Check if already has active subscription
    if (business.stripe_subscription_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Business already has an active subscription. Use the billing portal to change plans.',
        },
        { status: 400 }
      )
    }

    // Get or create Stripe customer
    let customerId = business.stripe_customer_id

    if (!customerId) {
      // Create new Stripe customer
      const customer = await getStripe().customers.create({
        email: user.email ?? undefined,
        name: business.name,
        metadata: {
          business_id: business.id,
          user_id: user.id,
        },
      })

      customerId = customer.id

      // Update business with customer ID
      await supabaseAdmin
        .from('businesses')
        .update({ stripe_customer_id: customerId })
        .eq('id', business.id)

      console.log(`[Billing Checkout] Created Stripe customer: ${customerId}`)
    }

    // Build checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/en/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/en/pricing?canceled=true`,
      metadata: {
        business_id: business.id,
        user_id: user.id,
        plan_name: planName,
      },
      subscription_data: {
        metadata: {
          business_id: business.id,
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
