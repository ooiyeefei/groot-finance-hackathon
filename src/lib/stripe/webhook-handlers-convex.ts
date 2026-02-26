/**
 * Stripe Webhook Event Handlers (Convex Version)
 *
 * Individual handlers for each Stripe webhook event type.
 * All handlers use Convex internal mutations (no auth required).
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 */

import type Stripe from 'stripe'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { getPlanFromPriceId } from './plans'

// Initialize Convex HTTP client for internal mutations
// Webhooks use HTTP client since they don't have user sessions
function getConvexInternalClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL not configured')
  }
  return new ConvexHttpClient(url)
}

/**
 * Handle checkout.session.completed
 *
 * Called when a customer completes Stripe Checkout.
 * Creates/updates the Stripe customer ID on the business.
 */
export async function handleCheckoutSessionCompletedConvex(
  session: Stripe.Checkout.Session
): Promise<void> {
  console.log(`[Webhook Handler Convex] checkout.session.completed: ${session.id}`)

  const businessId = session.metadata?.business_id
  if (!businessId) {
    console.error('[Webhook Handler Convex] No business_id in session metadata')
    throw new Error('Missing business_id in checkout session metadata')
  }

  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  if (!customerId) {
    console.error('[Webhook Handler Convex] No customer ID in checkout session')
    throw new Error('Missing customer ID in checkout session')
  }

  const convex = getConvexInternalClient()

  // Update business with Stripe customer ID
  await convex.mutation(api.functions.businesses.updateStripeCustomerFromCheckout, {
    businessId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId || undefined,
  })

  console.log(`[Webhook Handler Convex] Updated business ${businessId} with customer ${customerId}`)
}

/**
 * Handle customer.subscription.created
 *
 * Called when a new subscription is created.
 * Updates the business with subscription details and plan.
 */
export async function handleSubscriptionCreatedConvex(
  subscription: Stripe.Subscription
): Promise<void> {
  console.log(`[Webhook Handler Convex] subscription.created: ${subscription.id}`)

  await updateBusinessSubscriptionConvex(subscription)
}

/**
 * Handle customer.subscription.updated
 *
 * Called when a subscription is updated (plan change, status change, etc).
 * Updates the business with new subscription details.
 */
export async function handleSubscriptionUpdatedConvex(
  subscription: Stripe.Subscription
): Promise<void> {
  console.log(`[Webhook Handler Convex] subscription.updated: ${subscription.id}`)

  await updateBusinessSubscriptionConvex(subscription)
}

/**
 * Handle customer.subscription.deleted
 *
 * Called when a subscription is cancelled/deleted.
 * Downgrades the business to the free plan.
 */
export async function handleSubscriptionDeletedConvex(
  subscription: Stripe.Subscription
): Promise<void> {
  console.log(`[Webhook Handler Convex] subscription.deleted: ${subscription.id}`)

  const customerId = subscription.customer as string
  const convex = getConvexInternalClient()

  await convex.mutation(api.functions.businesses.downgradeToFreeFromWebhook, {
    stripeCustomerId: customerId,
  })

  console.log(`[Webhook Handler Convex] Downgraded business for customer ${customerId} to free plan`)
}

/**
 * Handle invoice.payment_failed
 *
 * Called when a payment fails.
 * Marks the subscription as past_due.
 */
export async function handleInvoicePaymentFailedConvex(
  invoice: Stripe.Invoice
): Promise<void> {
  console.log(`[Webhook Handler Convex] invoice.payment_failed: ${invoice.id}`)

  const customerId = invoice.customer as string
  const convex = getConvexInternalClient()

  const result = await convex.mutation(api.functions.businesses.updateSubscriptionStatusFromWebhook, {
    stripeCustomerId: customerId,
    subscriptionStatus: 'past_due',
  })

  if (result) {
    console.log(`[Webhook Handler Convex] Marked business as past_due for customer ${customerId}`)
  } else {
    console.warn(`[Webhook Handler Convex] Business not found for customer ${customerId} - may be during checkout`)
  }
}

/**
 * Handle invoice.payment_succeeded
 *
 * Called when a payment succeeds.
 * Clears any past_due status.
 */
export async function handleInvoicePaymentSucceededConvex(
  invoice: Stripe.Invoice
): Promise<void> {
  console.log(`[Webhook Handler Convex] invoice.payment_succeeded: ${invoice.id}`)

  const customerId = invoice.customer as string
  const convex = getConvexInternalClient()

  // Get current business state to check if past_due
  const business = await convex.query(api.functions.businesses.getByStripeCustomerIdInternal, {
    stripeCustomerId: customerId,
  })

  if (!business) {
    console.warn(`[Webhook Handler Convex] Business not found for customer ${customerId} - may be during checkout`)
    return
  }

  // Only update if currently past_due
  if (business.subscriptionStatus === 'past_due') {
    await convex.mutation(api.functions.businesses.updateSubscriptionStatusFromWebhook, {
      stripeCustomerId: customerId,
      subscriptionStatus: 'active',
    })

    console.log(`[Webhook Handler Convex] Cleared past_due status for customer ${customerId}`)
  }
}

/**
 * Helper: Update business with subscription details
 *
 * Uses fallback logic:
 * 1. Try to find business by stripeCustomerId
 * 2. If not found, use business_id from subscription metadata (handles case where
 *    checkout.session.completed webhook failed and stripeCustomerId isn't linked yet)
 *
 * CRITICAL: Extracts and stores trial dates from Stripe subscription for enforcement
 * Also stores current_period_end for renewal reminders
 */
async function updateBusinessSubscriptionConvex(
  subscription: Stripe.Subscription
): Promise<void> {
  const customerId = subscription.customer as string
  const convex = getConvexInternalClient()

  // Get plan details from subscription
  const priceId = subscription.items.data[0]?.price?.id
  const productId = subscription.items.data[0]?.price?.product as string
  const rawPlanName = priceId ? await getPlanFromPriceId(priceId) : 'free'

  // Map Stripe subscription status to our status
  const subscriptionStatus = mapStripeStatus(subscription.status)

  // All trials are Pro trials — override plan name for trialing subscriptions
  // This handles legacy subscriptions created with Starter price before the fix
  const planName = subscriptionStatus === 'trialing' ? 'pro' : rawPlanName

  // Stripe SDK v20+ type workaround - cast to access timestamp properties
  const subscriptionData = subscription as unknown as {
    trial_start: number | null
    trial_end: number | null
    current_period_end: number
    cancel_at_period_end: boolean
    cancel_at: number | null
  }

  // Extract trial dates from Stripe subscription (CRITICAL for enforcement)
  // Stripe stores dates as Unix timestamps (seconds)
  const trialStartDate = subscriptionData.trial_start
    ? subscriptionData.trial_start * 1000  // Convert to milliseconds
    : undefined
  const trialEndDate = subscriptionData.trial_end
    ? subscriptionData.trial_end * 1000    // Convert to milliseconds
    : undefined

  // Extract current_period_end for renewal tracking
  // This is when the current billing period ends (and renewal is due)
  const subscriptionPeriodEnd = subscriptionData.current_period_end
    ? subscriptionData.current_period_end * 1000  // Convert to milliseconds
    : undefined

  // Extract cancellation scheduling
  const cancelAtPeriodEnd = subscriptionData.cancel_at_period_end ?? false
  const cancelAt = subscriptionData.cancel_at
    ? subscriptionData.cancel_at * 1000  // Convert to milliseconds
    : undefined

  console.log(
    `[Webhook Handler Convex] Subscription ${subscription.id}: status=${subscriptionStatus}, ` +
    `trialEnd=${trialEndDate ? new Date(trialEndDate).toISOString() : 'none'}, ` +
    `periodEnd=${subscriptionPeriodEnd ? new Date(subscriptionPeriodEnd).toISOString() : 'none'}`
  )

  // Try to update using stripeCustomerId first
  try {
    await convex.mutation(api.functions.businesses.updateSubscriptionFromWebhook, {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripeProductId: productId || undefined,
      planName,
      subscriptionStatus,
      trialStartDate,
      trialEndDate,
      subscriptionPeriodEnd,
      cancelAtPeriodEnd,
      cancelAt,
    })

    console.log(
      `[Webhook Handler Convex] Updated business for customer ${customerId}: plan=${planName}, status=${subscriptionStatus}`
    )
    return
  } catch (error) {
    // If business not found by stripeCustomerId, try metadata fallback
    const businessId = subscription.metadata?.business_id
    if (!businessId) {
      console.error(`[Webhook Handler Convex] No business found for customer ${customerId} and no business_id in metadata`)
      throw error
    }

    console.log(`[Webhook Handler Convex] Business not found by customer ID, trying metadata business_id: ${businessId}`)

    // Use the fallback mutation that accepts businessId and also links stripeCustomerId
    await convex.mutation(api.functions.businesses.updateSubscriptionFromWebhookWithBusinessId, {
      businessId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripeProductId: productId || undefined,
      planName,
      subscriptionStatus,
      trialStartDate,
      trialEndDate,
      subscriptionPeriodEnd,
      cancelAtPeriodEnd,
      cancelAt,
    })

    console.log(
      `[Webhook Handler Convex] Updated business ${businessId} (linked customer ${customerId}): plan=${planName}, status=${subscriptionStatus}`
    )
  }
}

/**
 * Handle credit pack purchase from checkout.session.completed
 *
 * Detects credit pack purchases via addon_type in session metadata.
 * Maps metadata to pack type/name/credits and creates the credit pack record.
 */
export async function handleCreditPackPurchaseConvex(
  session: Stripe.Checkout.Session
): Promise<void> {
  console.log(`[Webhook Handler Convex] Credit pack purchase: ${session.id}`)

  const businessId = session.metadata?.business_id
  const addonType = session.metadata?.addon_type
  const messageCount = session.metadata?.message_count
  const scanCount = session.metadata?.scan_count

  if (!businessId) {
    console.error('[Webhook Handler Convex] No business_id in credit pack session metadata')
    throw new Error('Missing business_id in credit pack checkout session metadata')
  }

  // Map addon_type to pack configuration
  let packType: string
  let packName: string
  let totalCredits: number

  switch (addonType) {
    case 'ai_chat_boost':
      packType = 'ai_credits'
      packName = 'boost'
      totalCredits = messageCount ? parseInt(messageCount, 10) : 50
      break
    case 'ai_chat_power':
      packType = 'ai_credits'
      packName = 'power'
      totalCredits = messageCount ? parseInt(messageCount, 10) : 150
      break
    case 'extra_ocr':
      packType = 'ocr_credits'
      packName = 'extra_ocr'
      totalCredits = scanCount ? parseInt(scanCount, 10) : 100
      break
    default:
      console.error(`[Webhook Handler Convex] Unknown addon_type: ${addonType}`)
      throw new Error(`Unknown addon_type: ${addonType}`)
  }

  const convex = getConvexInternalClient()

  const paymentIntentId = session.payment_intent
    ? (typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent.id)
    : undefined

  await convex.mutation(api.functions.creditPacks.createFromWebhook, {
    businessId: businessId as any, // Convex ID type from string
    packType,
    packName,
    totalCredits,
    stripePaymentIntentId: paymentIntentId,
    stripeSessionId: session.id,
  })

  console.log(
    `[Webhook Handler Convex] Created ${packName} credit pack (${totalCredits} ${packType}) for business ${businessId}`
  )
}

/**
 * Map Stripe subscription status to our simplified status
 * CRITICAL: 'paused' must be preserved for trial expiration enforcement
 */
function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): 'active' | 'past_due' | 'canceled' | 'trialing' | 'unpaid' | 'paused' {
  switch (stripeStatus) {
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'trialing':
      return 'trialing'
    case 'unpaid':
      return 'unpaid'
    case 'paused':
      // CRITICAL: Preserve 'paused' status for trial expiration enforcement
      // When trial ends without payment method, Stripe pauses the subscription
      return 'paused'
    case 'incomplete':
    case 'incomplete_expired':
    default:
      return 'canceled'
  }
}
