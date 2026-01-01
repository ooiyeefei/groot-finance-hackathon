/**
 * Stripe Webhook Event Handlers
 *
 * Individual handlers for each Stripe webhook event type.
 * All handlers receive the event object and a Supabase admin client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getPlanFromPriceId } from './plans'

/**
 * Handle checkout.session.completed
 *
 * Called when a customer completes Stripe Checkout.
 * Creates/updates the Stripe customer ID on the business.
 */
export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[Webhook Handler] checkout.session.completed: ${session.id}`)

  const businessId = session.metadata?.business_id
  if (!businessId) {
    console.error('[Webhook Handler] No business_id in session metadata')
    throw new Error('Missing business_id in checkout session metadata')
  }

  const customerId = session.customer as string
  const subscriptionId = session.subscription as string

  if (!customerId) {
    console.error('[Webhook Handler] No customer ID in checkout session')
    throw new Error('Missing customer ID in checkout session')
  }

  // Update business with Stripe customer ID
  // Subscription details will be updated by subscription.created webhook
  const { error } = await supabase
    .from('businesses')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    })
    .eq('id', businessId)

  if (error) {
    console.error(`[Webhook Handler] Failed to update business: ${error.message}`)
    throw error
  }

  console.log(`[Webhook Handler] Updated business ${businessId} with customer ${customerId}`)
}

/**
 * Handle customer.subscription.created
 *
 * Called when a new subscription is created.
 * Updates the business with subscription details and plan.
 */
export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[Webhook Handler] subscription.created: ${subscription.id}`)

  await updateBusinessSubscription(subscription, supabase)
}

/**
 * Handle customer.subscription.updated
 *
 * Called when a subscription is updated (plan change, status change, etc).
 * Updates the business with new subscription details.
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[Webhook Handler] subscription.updated: ${subscription.id}`)

  await updateBusinessSubscription(subscription, supabase)
}

/**
 * Handle customer.subscription.deleted
 *
 * Called when a subscription is cancelled/deleted.
 * Downgrades the business to the free plan.
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[Webhook Handler] subscription.deleted: ${subscription.id}`)

  const customerId = subscription.customer as string

  // Find business by Stripe customer ID
  const { data: business, error: findError } = await supabase
    .from('businesses')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (findError || !business) {
    console.error(`[Webhook Handler] Business not found for customer: ${customerId}`)
    throw new Error(`Business not found for customer: ${customerId}`)
  }

  // Downgrade to trial plan (user can upgrade again)
  const { error: updateError } = await supabase
    .from('businesses')
    .update({
      stripe_subscription_id: null,
      stripe_product_id: null,
      plan_name: 'trial',
      subscription_status: 'canceled',
    })
    .eq('id', business.id)

  if (updateError) {
    console.error(`[Webhook Handler] Failed to downgrade business: ${updateError.message}`)
    throw updateError
  }

  console.log(`[Webhook Handler] Downgraded business ${business.id} to trial plan`)
}

/**
 * Handle invoice.payment_failed
 *
 * Called when a payment fails.
 * Marks the subscription as past_due.
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[Webhook Handler] invoice.payment_failed: ${invoice.id}`)

  const customerId = invoice.customer as string

  // Find business by Stripe customer ID
  const { data: business, error: findError } = await supabase
    .from('businesses')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (findError || !business) {
    // Business might not exist yet if this is during checkout
    console.warn(`[Webhook Handler] Business not found for customer: ${customerId}`)
    return
  }

  // Mark subscription as past_due
  const { error: updateError } = await supabase
    .from('businesses')
    .update({
      subscription_status: 'past_due',
    })
    .eq('id', business.id)

  if (updateError) {
    console.error(`[Webhook Handler] Failed to update status: ${updateError.message}`)
    throw updateError
  }

  console.log(`[Webhook Handler] Marked business ${business.id} as past_due`)
}

/**
 * Handle invoice.payment_succeeded
 *
 * Called when a payment succeeds.
 * Clears any past_due status.
 */
export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[Webhook Handler] invoice.payment_succeeded: ${invoice.id}`)

  const customerId = invoice.customer as string

  // Find business by Stripe customer ID
  const { data: business, error: findError } = await supabase
    .from('businesses')
    .select('id, subscription_status')
    .eq('stripe_customer_id', customerId)
    .single()

  if (findError || !business) {
    // Business might not exist yet if this is during checkout
    console.warn(`[Webhook Handler] Business not found for customer: ${customerId}`)
    return
  }

  // Only update if currently past_due
  if (business.subscription_status === 'past_due') {
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        subscription_status: 'active',
      })
      .eq('id', business.id)

    if (updateError) {
      console.error(`[Webhook Handler] Failed to clear past_due: ${updateError.message}`)
      throw updateError
    }

    console.log(`[Webhook Handler] Cleared past_due status for business ${business.id}`)
  }
}

/**
 * Handle customer.subscription.trial_will_end
 *
 * Called 3 days before trial ends.
 * Use this to send reminder emails or in-app notifications.
 */
export async function handleSubscriptionTrialWillEnd(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient
): Promise<void> {
  console.log(`[Webhook Handler] subscription.trial_will_end: ${subscription.id}`)

  const customerId = subscription.customer as string

  // Find business by Stripe customer ID
  const { data: business, error: findError } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('stripe_customer_id', customerId)
    .single()

  if (findError || !business) {
    console.error(`[Webhook Handler] Business not found for customer: ${customerId}`)
    throw new Error(`Business not found for customer: ${customerId}`)
  }

  const trialEndDate = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null

  console.log(
    `[Webhook Handler] Trial ending soon for business ${business.id} (${business.name}). ` +
    `Trial ends: ${trialEndDate?.toISOString() ?? 'unknown'}`
  )

  // TODO: Send reminder email to business owner
  // This is a placeholder for future email integration
  // Options:
  // 1. Use Resend/SendGrid/Postmark to send email
  // 2. Create an in-app notification in a notifications table
  // 3. Trigger a background job for email delivery

  // For now, just log that we received the event
  // The business can be notified via the UpgradeBanner in the UI
}

/**
 * Helper: Update business with subscription details
 * Syncs subscription status and trial dates from Stripe (single source of truth)
 */
async function updateBusinessSubscription(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient
): Promise<void> {
  const customerId = subscription.customer as string

  // Find business by Stripe customer ID
  const { data: business, error: findError } = await supabase
    .from('businesses')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (findError || !business) {
    console.error(`[Webhook Handler] Business not found for customer: ${customerId}`)
    throw new Error(`Business not found for customer: ${customerId}`)
  }

  // Get plan details from subscription
  const priceId = subscription.items.data[0]?.price?.id
  const productId = subscription.items.data[0]?.price?.product as string
  const planName = priceId ? getPlanFromPriceId(priceId) : 'trial'

  // Map Stripe subscription status to our status
  const subscriptionStatus = mapStripeStatus(subscription.status)

  // Determine plan_name: 'trial' while trialing, actual plan name after
  const effectivePlanName = subscriptionStatus === 'trialing' ? 'trial' : planName

  // Build update object with trial dates from Stripe
  const updateData: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    stripe_product_id: productId,
    plan_name: effectivePlanName,
    subscription_status: subscriptionStatus,
  }

  // Sync trial dates from Stripe (single source of truth)
  if (subscription.trial_start) {
    updateData.trial_start_date = new Date(subscription.trial_start * 1000).toISOString()
  }
  if (subscription.trial_end) {
    updateData.trial_end_date = new Date(subscription.trial_end * 1000).toISOString()
  }

  const { error: updateError } = await supabase
    .from('businesses')
    .update(updateData)
    .eq('id', business.id)

  if (updateError) {
    console.error(`[Webhook Handler] Failed to update subscription: ${updateError.message}`)
    throw updateError
  }

  console.log(
    `[Webhook Handler] Updated business ${business.id}: plan=${effectivePlanName}, status=${subscriptionStatus}` +
    (subscription.trial_end ? `, trial_end=${new Date(subscription.trial_end * 1000).toISOString()}` : '')
  )
}

/**
 * Map Stripe subscription status to our simplified status
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
      // Subscription is paused (trial ended without payment method)
      // User needs to add payment via Checkout to resume
      return 'paused'
    case 'incomplete':
    case 'incomplete_expired':
    default:
      return 'canceled'
  }
}
