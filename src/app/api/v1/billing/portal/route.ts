/**
 * Stripe Customer Portal API Route
 *
 * Creates a Stripe Customer Portal session for subscription management.
 * Users can cancel, update payment method, and view invoices.
 *
 * @route POST /api/v1/billing/portal
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getStripe } from '@/lib/stripe/client'
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

export async function POST(request: NextRequest) {
  console.log('[Billing Portal] Creating portal session')

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
    const { data: user, error: userError } = await getSupabaseAdmin()
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error('[Billing Portal] User not found:', userError?.message)
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

    // Get business Stripe customer ID
    const { data: business, error: businessError } = await getSupabaseAdmin()
      .from('businesses')
      .select('id, stripe_customer_id')
      .eq('id', user.business_id)
      .single()

    if (businessError || !business) {
      console.error('[Billing Portal] Business not found:', businessError?.message)
      return NextResponse.json(
        { success: false, error: 'Business not found' },
        { status: 404 }
      )
    }

    if (!business.stripe_customer_id) {
      return NextResponse.json(
        { success: false, error: 'No Stripe customer found. Please subscribe to a plan first.' },
        { status: 400 }
      )
    }

    // Build return URL
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL
    const returnUrl = `${origin}/settings/billing`

    // Create Stripe Customer Portal session
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: business.stripe_customer_id,
      return_url: returnUrl,
    })

    console.log('[Billing Portal] Portal session created:', portalSession.id)

    return NextResponse.json({
      success: true,
      data: {
        url: portalSession.url,
        sessionId: portalSession.id,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Portal] Error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
