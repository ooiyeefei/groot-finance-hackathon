import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'
import { getAuthenticatedConvex } from '@/lib/convex'
import { getSSMParameter, deleteSSMParameter } from '@/lib/aws-ssm'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * POST /api/v1/stripe-integration/disconnect
 *
 * Deletes the Stripe webhook endpoint, removes both the secret key
 * and webhook secret from SSM, and updates integration status in Convex.
 * Synced catalog items are preserved.
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

    // Get authenticated Convex client to read webhook endpoint ID
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to authenticate with database' },
        { status: 500 }
      )
    }

    // Read connection to get webhook endpoint ID before disconnecting
    const connection = await client.query(api.functions.stripeIntegrations.getConnection, {
      businessId: typedBusinessId,
    })

    // Delete webhook endpoint from Stripe (best-effort)
    if (connection?.stripeWebhookEndpointId) {
      const stripeSecretKey = await getSSMParameter(`/finanseal/stripe/${businessId}/secret-key`)
      if (stripeSecretKey) {
        try {
          const stripe = new Stripe(stripeSecretKey)
          await stripe.webhookEndpoints.del(connection.stripeWebhookEndpointId)
          console.log('[Stripe Integration] Webhook endpoint deleted:', connection.stripeWebhookEndpointId)
        } catch (webhookError) {
          // Non-blocking — endpoint may already be deleted on Stripe side
          console.warn('[Stripe Integration] Failed to delete webhook endpoint (non-blocking):', webhookError)
        }
      }
    }

    // Delete secrets from SSM
    await Promise.all([
      deleteSSMParameter(`/finanseal/stripe/${businessId}/secret-key`),
      deleteSSMParameter(`/finanseal/stripe/${businessId}/webhook-secret`),
    ])

    // Update Convex status
    await client.mutation(api.functions.stripeIntegrations.disconnect, {
      businessId: typedBusinessId,
    })

    console.log('[Stripe Integration] Disconnected for business:', businessId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Stripe Integration] Disconnect error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
