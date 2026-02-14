import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getPublicConvex } from '@/lib/convex'
import { getSSMParameter } from '@/lib/aws-ssm'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * POST /api/v1/stripe-integration/webhooks/[businessId]
 *
 * Receives Stripe webhook events for real-time product catalog sync.
 * No Clerk auth — verified via Stripe webhook signature.
 *
 * Events handled:
 * - product.created / product.updated → upsert catalog item
 * - product.deleted → deactivate catalog item
 * - price.created / price.updated → update catalog item price
 * - price.deleted → (no-op, product still exists)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await params

  if (!businessId) {
    return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
  }

  // Read raw body for signature verification
  const rawBody = await request.text()

  // Get webhook secret from SSM
  const webhookSecretPath = `/finanseal/stripe/${businessId}/webhook-secret`
  const webhookSecret = await getSSMParameter(webhookSecretPath)
  if (!webhookSecret) {
    console.error('[Stripe Webhook] No webhook secret found for business:', businessId)
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 })
  }

  // Verify Stripe signature
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Stripe Webhook] Signature verification failed:', msg)
    return NextResponse.json({ error: `Webhook signature verification failed: ${msg}` }, { status: 400 })
  }

  const typedBusinessId = businessId as Id<'businesses'>
  const convex = getPublicConvex()

  try {
    switch (event.type) {
      case 'product.created':
      case 'product.updated': {
        const product = event.data.object as Stripe.Product

        // Skip archived/inactive products — treat as delete
        if (!product.active) {
          await convex.mutation(api.functions.catalogItems.webhookDeactivateItem, {
            businessId: typedBusinessId,
            stripeProductId: product.id,
          })
          console.log('[Stripe Webhook] Deactivated inactive product:', product.id)
          break
        }

        // Resolve default price
        let unitPrice = 0
        let currency = 'usd'
        let priceId: string | undefined

        if (product.default_price && typeof product.default_price === 'string') {
          // default_price is just an ID — fetch from Stripe to get amount
          const stripeSecretKey = await getSSMParameter(`/finanseal/stripe/${businessId}/secret-key`)
          if (stripeSecretKey) {
            const stripe = new Stripe(stripeSecretKey)
            try {
              const price = await stripe.prices.retrieve(product.default_price)
              unitPrice = (price.unit_amount ?? 0) / 100
              currency = price.currency ?? 'usd'
              priceId = price.id
            } catch {
              console.warn('[Stripe Webhook] Failed to fetch price:', product.default_price)
            }
          }
        } else if (product.default_price && typeof product.default_price === 'object') {
          const price = product.default_price as Stripe.Price
          unitPrice = (price.unit_amount ?? 0) / 100
          currency = price.currency ?? 'usd'
          priceId = price.id
        }

        const result = await convex.mutation(api.functions.catalogItems.webhookUpsertItem, {
          businessId: typedBusinessId,
          stripeProductId: product.id,
          stripePriceId: priceId,
          name: product.name,
          description: product.description ?? undefined,
          unitPrice,
          currency: currency.toLowerCase(),
        })

        console.log('[Stripe Webhook] Product', event.type, ':', product.id, '->', result)
        break
      }

      case 'product.deleted': {
        const product = event.data.object as Stripe.Product
        await convex.mutation(api.functions.catalogItems.webhookDeactivateItem, {
          businessId: typedBusinessId,
          stripeProductId: product.id,
        })
        console.log('[Stripe Webhook] Product deleted:', product.id)
        break
      }

      case 'price.created':
      case 'price.updated': {
        const price = event.data.object as Stripe.Price

        // Only process if this price is the default for its product
        if (!price.product) break

        const productId = typeof price.product === 'string' ? price.product : price.product.id

        // Fetch the product to check if this is the default price
        const stripeSecretKey = await getSSMParameter(`/finanseal/stripe/${businessId}/secret-key`)
        if (!stripeSecretKey) break

        const stripe = new Stripe(stripeSecretKey)
        try {
          const product = await stripe.products.retrieve(productId)
          if (!product.active) break

          const defaultPriceId = typeof product.default_price === 'string'
            ? product.default_price
            : product.default_price?.id

          // Only update if this price is the product's default price
          if (defaultPriceId !== price.id) break

          await convex.mutation(api.functions.catalogItems.webhookUpsertItem, {
            businessId: typedBusinessId,
            stripeProductId: product.id,
            stripePriceId: price.id,
            name: product.name,
            description: product.description ?? undefined,
            unitPrice: (price.unit_amount ?? 0) / 100,
            currency: (price.currency ?? 'usd').toLowerCase(),
          })

          console.log('[Stripe Webhook] Price', event.type, 'for product:', productId)
        } catch {
          console.warn('[Stripe Webhook] Failed to process price event for product:', productId)
        }
        break
      }

      case 'price.deleted': {
        // No-op: product still exists, will be updated on next sync or product event
        console.log('[Stripe Webhook] Price deleted (no-op)')
        break
      }

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type)
    }
  } catch (error) {
    console.error('[Stripe Webhook] Error processing event:', event.type, error)
    // Return 200 to prevent Stripe from retrying — log the error for investigation
    return NextResponse.json({ received: true, error: 'Processing error logged' })
  }

  return NextResponse.json({ received: true })
}
