/**
 * Stripe Webhook Handler
 *
 * Handles incoming Stripe webhook events for subscription management.
 * Implements signature verification and idempotency checking.
 *
 * @route POST /api/v1/billing/webhooks
 */

import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import Stripe from 'stripe'
import {
  handleCheckoutSessionCompleted,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
} from '@/lib/stripe/webhook-handlers'

// Lazy initialization for Supabase client
// Webhooks bypass RLS since they come from Stripe, not authenticated users
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

    // Get Supabase client (lazy initialized)
    const supabase = getSupabaseAdmin()

    // Idempotency check - prevent duplicate processing
    const { data: existingEvent } = await supabase
      .from('stripe_events')
      .select('event_id')
      .eq('event_id', event.id)
      .single()

    if (existingEvent) {
      console.log(`[Billing Webhook] Event already processed: ${event.id}`)
      return NextResponse.json({ success: true, message: 'Event already processed' })
    }

    // Record event before processing (prevents race conditions)
    const { error: insertError } = await supabase
      .from('stripe_events')
      .insert({
        event_id: event.id,
        event_type: event.type,
      })

    if (insertError) {
      // If insert fails due to duplicate, another worker got it first
      if (insertError.code === '23505') {
        console.log(`[Billing Webhook] Event being processed by another worker: ${event.id}`)
        return NextResponse.json({ success: true, message: 'Event being processed' })
      }
      console.error(`[Billing Webhook] Failed to record event: ${insertError.message}`)
      // Continue processing - idempotency is best effort
    }

    // Process the event
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(
            event.data.object as Stripe.Checkout.Session,
            supabase
          )
          break

        case 'customer.subscription.created':
          await handleSubscriptionCreated(
            event.data.object as Stripe.Subscription,
            supabase
          )
          break

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(
            event.data.object as Stripe.Subscription,
            supabase
          )
          break

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(
            event.data.object as Stripe.Subscription,
            supabase
          )
          break

        case 'invoice.payment_failed':
          await handleInvoicePaymentFailed(
            event.data.object as Stripe.Invoice,
            supabase
          )
          break

        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(
            event.data.object as Stripe.Invoice,
            supabase
          )
          break

        default:
          console.log(`[Billing Webhook] Unhandled event type: ${event.type}`)
      }

      console.log(`[Billing Webhook] Successfully processed: ${event.type} (${event.id})`)
      return NextResponse.json({ success: true, message: 'Event processed' })
    } catch (handlerError) {
      const message = handlerError instanceof Error ? handlerError.message : 'Unknown error'
      console.error(`[Billing Webhook] Handler error for ${event.type}: ${message}`)

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
