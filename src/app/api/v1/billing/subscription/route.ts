/**
 * Subscription Status API Route
 *
 * Returns current subscription status for the authenticated user's business.
 *
 * @route GET /api/v1/billing/subscription
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getStripe } from '@/lib/stripe/client'
import { PLANS, PlanName, getOcrLimit } from '@/lib/stripe/plans'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

// Lazy initialization for Supabase client
let supabaseAdmin: ReturnType<typeof createClient<Database>> | null = null

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error('Supabase environment variables not configured')
    }

    supabaseAdmin = createClient<Database>(url, key)
  }
  return supabaseAdmin
}

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

    // Get user's business context
    const supabase = getSupabaseAdmin()
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error('[Billing Subscription] User not found:', userError?.message)
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

    // Get business subscription details
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select(`
        id,
        name,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_product_id,
        plan_name,
        subscription_status
      `)
      .eq('id', user.business_id)
      .single()

    if (businessError || !business) {
      console.error('[Billing Subscription] Business not found:', businessError?.message)
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    // Get current month OCR usage
    const { data: usageData, error: usageError } = await supabase.rpc(
      'get_monthly_ocr_usage',
      { p_business_id: business.id }
    )

    const currentUsage = usageError ? 0 : (usageData ?? 0)
    const planName = (business.plan_name as PlanName) || 'free'
    const plan = PLANS[planName]
    const ocrLimit = getOcrLimit(planName)

    // Build subscription response
    let subscriptionDetails = null

    if (business.stripe_subscription_id) {
      try {
        // Stripe SDK v20+ type workaround - cast to access properties
        const subscription = (await getStripe().subscriptions.retrieve(
          business.stripe_subscription_id
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

    const response = {
      success: true,
      data: {
        plan: {
          name: planName,
          displayName: plan.name,
          price: plan.price,
          currency: plan.currency,
          features: plan.features,
        },
        subscription: {
          status: business.subscription_status || 'active',
          stripeCustomerId: business.stripe_customer_id,
          stripeSubscriptionId: business.stripe_subscription_id,
          ...subscriptionDetails,
        },
        usage: {
          ocrUsed: currentUsage,
          ocrLimit: ocrLimit,
          ocrRemaining: ocrLimit === -1 ? -1 : Math.max(0, ocrLimit - currentUsage),
          ocrPercentage: ocrLimit === -1 ? 0 : Math.min(100, Math.round((currentUsage / ocrLimit) * 100)),
          isUnlimited: ocrLimit === -1,
        },
        business: {
          id: business.id,
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
