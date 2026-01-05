/**
 * Stripe Customer Portal API Route
 *
 * Creates a Stripe Customer Portal session for subscription management.
 * Users can cancel, update payment method, and view invoices.
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 *
 * @route POST /api/v1/billing/portal
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getStripe } from '@/lib/stripe/client'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

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

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[Billing Portal] Failed to get Convex client')
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

    if (!business.stripeCustomerId) {
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
      customer: business.stripeCustomerId,
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
