import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'
import { getAuthenticatedConvex } from '@/lib/convex'
import { getSSMParameter } from '@/lib/aws-ssm'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * POST /api/v1/stripe-integration/sync
 *
 * Fetches the Stripe secret key from SSM, retrieves all active products
 * from Stripe, and upserts them into the catalog via Convex mutations.
 * Tracks progress in sync_logs for real-time UI updates.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { businessId } = body as { businessId: string }

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'Missing businessId' },
        { status: 400 }
      )
    }

    const typedBusinessId = businessId as Id<'businesses'>

    // Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to authenticate with database' },
        { status: 500 }
      )
    }

    // Check for concurrent sync
    const isRunning = await client.query(api.functions.catalogItems.hasRunningSync, {
      businessId: typedBusinessId,
    })
    if (isRunning) {
      return NextResponse.json(
        { success: false, error: 'A sync is already in progress for this business' },
        { status: 409 }
      )
    }

    // Fetch Stripe key from SSM
    const ssmPath = `/finanseal/stripe/${businessId}/secret-key`
    const stripeSecretKey = await getSSMParameter(ssmPath)
    if (!stripeSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Stripe is not connected or key not found. Please reconnect.' },
        { status: 400 }
      )
    }

    // Create Stripe client and fetch products
    const stripe = new Stripe(stripeSecretKey)
    let products: Stripe.Product[]
    try {
      products = await stripe.products
        .list({
          active: true,
          expand: ['data.default_price'],
          limit: 100,
        })
        .autoPagingToArray({ limit: 10000 })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch products from Stripe'
      return NextResponse.json(
        { success: false, error: `Stripe API error: ${msg}` },
        { status: 502 }
      )
    }

    // Create sync log
    const syncLogId = await client.mutation(api.functions.catalogItems.createSyncLog, {
      businessId: typedBusinessId,
      triggeredBy: userId,
      totalStripeProducts: products.length,
    })

    let created = 0
    let updated = 0
    let skipped = 0
    let deactivated = 0
    const errors: string[] = []
    const syncedStripeProductIds = new Set<string>()

    // Process each product
    for (let i = 0; i < products.length; i++) {
      const product = products[i]

      try {
        // Resolve price
        let unitPrice = 0
        let currency = 'usd'
        let priceId: string | undefined

        const defaultPrice = product.default_price
        if (defaultPrice && typeof defaultPrice === 'object' && 'unit_amount' in defaultPrice) {
          unitPrice = (defaultPrice.unit_amount ?? 0) / 100
          currency = defaultPrice.currency ?? 'usd'
          priceId = defaultPrice.id
        }

        const result = await client.mutation(api.functions.catalogItems.upsertSyncedItem, {
          businessId: typedBusinessId,
          stripeProductId: product.id,
          stripePriceId: priceId,
          name: product.name,
          description: product.description ?? undefined,
          unitPrice,
          currency: currency.toLowerCase(),
        })

        syncedStripeProductIds.add(product.id)

        if (result === 'created') created++
        else if (result === 'updated') updated++
        else if (result === 'skipped') skipped++

        // Update progress every 20 products
        if ((i + 1) % 20 === 0 || i === products.length - 1) {
          await client.mutation(api.functions.catalogItems.updateSyncLog, {
            syncLogId: syncLogId as Id<'sync_logs'>,
            businessId: typedBusinessId,
            productsCreated: created,
            productsUpdated: updated,
            productsSkipped: skipped,
          })
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Product ${product.id}: ${msg}`)
      }
    }

    // Deactivate items no longer in Stripe
    const existingSyncedItems = await client.query(
      api.functions.catalogItems.getStripeSyncedItems,
      { businessId: typedBusinessId }
    )

    for (const item of existingSyncedItems) {
      if (
        item.stripeProductId &&
        !syncedStripeProductIds.has(item.stripeProductId) &&
        item.status === 'active' &&
        !item.locallyDeactivated
      ) {
        await client.mutation(api.functions.catalogItems.deactivateSyncedItem, {
          itemId: item._id as Id<'catalog_items'>,
          businessId: typedBusinessId,
        })
        deactivated++
      }
    }

    // Finalize sync log
    const finalStatus = errors.length > 0 ? 'partial' : 'completed'
    await client.mutation(api.functions.catalogItems.updateSyncLog, {
      syncLogId: syncLogId as Id<'sync_logs'>,
      businessId: typedBusinessId,
      productsCreated: created,
      productsUpdated: updated,
      productsDeactivated: deactivated,
      productsSkipped: skipped,
      status: finalStatus,
      completedAt: Date.now(),
      errors: errors.length > 0 ? errors : undefined,
    })

    // Update integration lastSyncAt
    await client.mutation(api.functions.stripeIntegrations.updateLastSync, {
      businessId: typedBusinessId,
    })

    console.log(
      '[Stripe Integration] Sync complete for business:',
      businessId,
      `created=${created} updated=${updated} deactivated=${deactivated} skipped=${skipped}`
    )

    return NextResponse.json({
      success: true,
      data: { syncLogId, created, updated, deactivated, skipped, errors },
    })
  } catch (error) {
    console.error('[Stripe Integration] Sync error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
