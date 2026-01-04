/**
 * Stripe Webhook Handler
 *
 * Handles incoming Stripe webhook events for subscription management.
 * Implements signature verification and idempotency checking.
 *
 * @route POST /api/v1/billing/webhooks
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import Stripe from 'stripe'
import {
  handleCheckoutSessionCompletedConvex,
  handleSubscriptionCreatedConvex,
  handleSubscriptionUpdatedConvex,
  handleSubscriptionDeletedConvex,
  handleInvoicePaymentFailedConvex,
  handleInvoicePaymentSucceededConvex,
} from '@/lib/stripe/webhook-handlers-convex'

// ✅ MIGRATED: Lazy initialization for Convex HTTP client
// Webhooks use HTTP client since they don't have user sessions
let convexClient: ConvexHttpClient | null = null

function getConvexClient() {
  if (!convexClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL
    if (!url) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL not configured')
    }
    convexClient = new ConvexHttpClient(url)
  }
  return convexClient
}

// Events we handle
const RELEVANT_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
])

export async function POST(request: NextRequest) {
  console.log('[Billing Webhook] Received webhook request')

  try {
    // Get raw body for signature verification
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      console.error('[Billing Webhook] Missing stripe-signature header')
      return NextResponse.json(
        { success: false, error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    // Verify webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[Billing Webhook] STRIPE_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { success: false, error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    let event: Stripe.Event
    try {
      event = getStripe().webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[Billing Webhook] Signature verification failed: ${message}`)
      return NextResponse.json(
        { success: false, error: `Webhook signature verification failed: ${message}` },
        { status: 400 }
      )
    }

    console.log(`[Billing Webhook] Verified event: ${event.type} (${event.id})`)

    // Skip events we don't handle
    if (!RELEVANT_EVENTS.has(event.type)) {
      console.log(`[Billing Webhook] Skipping unhandled event type: ${event.type}`)
      return NextResponse.json({ success: true, message: 'Event type not handled' })
    }

    // ✅ MIGRATED: Get Convex client (lazy initialized)
    const convex = getConvexClient()

    // ✅ MIGRATED: Idempotency check - prevent duplicate processing
    const existingEvent = await convex.query(api.functions.stripeEvents.exists, {
      stripeEventId: event.id,
    })

    if (existingEvent) {
      console.log(`[Billing Webhook] Event already processed: ${event.id}`)
      return NextResponse.json({ success: true, message: 'Event already processed' })
    }

    // ✅ MIGRATED: Record event before processing (prevents race conditions)
    try {
      await convex.mutation(api.functions.stripeEvents.create, {
        stripeEventId: event.id,
        eventType: event.type,
        payload: event.data.object,
      })
    } catch (insertError) {
      // If insert fails due to duplicate, another worker got it first
      const message = insertError instanceof Error ? insertError.message : 'Unknown error'
      if (message.includes('duplicate') || message.includes('already exists')) {
        console.log(`[Billing Webhook] Event being processed by another worker: ${event.id}`)
        return NextResponse.json({ success: true, message: 'Event being processed' })
      }
      console.error(`[Billing Webhook] Failed to record event: ${message}`)
      // Continue processing - idempotency is best effort
    }

    // ✅ MIGRATED: Process the event using Convex handlers
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompletedConvex(
            event.data.object as Stripe.Checkout.Session
          )
          break

        case 'customer.subscription.created':
          await handleSubscriptionCreatedConvex(
            event.data.object as Stripe.Subscription
          )
          break

        case 'customer.subscription.updated':
          await handleSubscriptionUpdatedConvex(
            event.data.object as Stripe.Subscription
          )
          break

        case 'customer.subscription.deleted':
          await handleSubscriptionDeletedConvex(
            event.data.object as Stripe.Subscription
          )
          break

        case 'invoice.payment_failed':
          await handleInvoicePaymentFailedConvex(
            event.data.object as Stripe.Invoice
          )
          break

        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceededConvex(
            event.data.object as Stripe.Invoice
          )
          break

        default:
          console.log(`[Billing Webhook] Unhandled event type: ${event.type}`)
      }

      // ✅ MIGRATED: Mark event as processed in Convex
      await convex.mutation(api.functions.stripeEvents.markProcessed, {
        stripeEventId: event.id,
      })

      console.log(`[Billing Webhook] Successfully processed: ${event.type} (${event.id})`)
      return NextResponse.json({ success: true, message: 'Event processed' })
    } catch (handlerError) {
      const message = handlerError instanceof Error ? handlerError.message : 'Unknown error'
      console.error(`[Billing Webhook] Handler error for ${event.type}: ${message}`)

      // ✅ MIGRATED: Mark event as failed in Convex
      try {
        await convex.mutation(api.functions.stripeEvents.markFailed, {
          stripeEventId: event.id,
          error: message,
        })
      } catch (markError) {
        console.error('[Billing Webhook] Failed to mark event as failed:', markError)
      }

      // Return 500 so Stripe retries the webhook
      return NextResponse.json(
        { success: false, error: `Handler error: ${message}` },
        { status: 500 }
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Billing Webhook] Unexpected error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
