import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'
import { getAuthenticatedConvex } from '@/lib/convex'
import { putSSMParameter } from '@/lib/aws-ssm'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * POST /api/v1/stripe-integration/connect
 *
 * Validates a Stripe secret key, stores it in AWS SSM Parameter Store,
 * registers a webhook endpoint for real-time product sync,
 * and saves connection metadata (account ID, name, webhook ID) to Convex.
 * The secret key never touches Convex.
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
    const { businessId, stripeSecretKey } = body as {
      businessId: string
      stripeSecretKey: string
    }

    if (!businessId || !stripeSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Missing businessId or stripeSecretKey' },
        { status: 400 }
      )
    }

    // Validate key format
    if (!stripeSecretKey.startsWith('sk_test_') && !stripeSecretKey.startsWith('sk_live_')) {
      return NextResponse.json(
        { success: false, error: 'Invalid Stripe secret key format. Key must start with sk_test_ or sk_live_.' },
        { status: 400 }
      )
    }

    // Validate against Stripe API
    let stripe: Stripe
    let accountId: string
    let accountName: string
    try {
      stripe = new Stripe(stripeSecretKey)
      const account = await stripe.accounts.retrieve()
      accountId = account.id
      accountName =
        account.settings?.dashboard?.display_name ||
        account.business_profile?.name ||
        account.email ||
        'Stripe Account'
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to validate Stripe key'
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 }
      )
    }

    // Store key in SSM Parameter Store (encrypted SecureString)
    const ssmPath = `/finanseal/stripe/${businessId}/secret-key`
    const stored = await putSSMParameter(ssmPath, stripeSecretKey)
    if (!stored) {
      return NextResponse.json(
        { success: false, error: 'Failed to store Stripe key securely' },
        { status: 502 }
      )
    }

    // Register webhook endpoint for real-time product/price sync
    let webhookEndpointId: string | undefined
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl) {
      try {
        const webhookUrl = `${appUrl}/api/v1/stripe-integration/webhooks/${businessId}`
        const webhookEndpoint = await stripe.webhookEndpoints.create({
          url: webhookUrl,
          enabled_events: [
            'product.created',
            'product.updated',
            'product.deleted',
            'price.created',
            'price.updated',
            'price.deleted',
          ],
          description: `FinanSEAL catalog sync for business ${businessId}`,
        })

        webhookEndpointId = webhookEndpoint.id

        // Store webhook signing secret in SSM
        if (webhookEndpoint.secret) {
          const webhookSecretPath = `/finanseal/stripe/${businessId}/webhook-secret`
          await putSSMParameter(webhookSecretPath, webhookEndpoint.secret)
        }

        console.log('[Stripe Integration] Webhook registered:', webhookEndpointId, 'for business:', businessId)
      } catch (webhookError) {
        // Webhook registration failure is non-blocking — manual sync still works
        console.error('[Stripe Integration] Webhook registration failed (non-blocking):', webhookError)
      }
    } else {
      console.warn('[Stripe Integration] NEXT_PUBLIC_APP_URL not set — skipping webhook registration')
    }

    // Update Convex metadata (no secret key stored in Convex)
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to authenticate with database' },
        { status: 500 }
      )
    }

    await client.mutation(api.functions.stripeIntegrations.updateConnection, {
      businessId: businessId as Id<'businesses'>,
      stripeAccountId: accountId,
      stripeAccountName: accountName,
      stripeWebhookEndpointId: webhookEndpointId,
    })

    console.log('[Stripe Integration] Connected:', accountName, 'for business:', businessId)

    return NextResponse.json({
      success: true,
      data: { accountName, accountId },
    })
  } catch (error) {
    console.error('[Stripe Integration] Connect error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
