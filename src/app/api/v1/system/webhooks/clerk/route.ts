/**
 * Clerk Webhook API Route
 *
 * POST /api/v1/system/webhooks/clerk
 *
 * Handles Clerk user sync events:
 * - user.created: Links to invitation or creates new business
 * - user.updated: Syncs name and email changes
 * - user.deleted: Soft deletes user data
 *
 * Authentication: Svix signature verification
 * Use Case: Automatic user synchronization between Clerk and Supabase
 *
 * IMPORTANT: After migration, update webhook URL in Clerk dashboard to:
 * https://your-domain.com/api/v1/system/webhooks/clerk
 */

import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  verifyClerkWebhook,
  handleClerkUserCreated,
  handleClerkUserUpdated,
  handleClerkUserDeleted
} from '@/domains/system/lib/webhook.service'

/**
 * POST - Clerk Webhook Handler
 *
 * Verifies webhook signature and routes to appropriate handler.
 */
export async function POST(req: NextRequest) {
  console.log('[Clerk Webhook API] Received webhook request')

  // Get headers for signature verification
  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  // Check for required headers
  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[Clerk Webhook API] Missing required svix headers')
    return NextResponse.json(
      {
        success: false,
        error: 'Missing required webhook headers'
      },
      { status: 400 }
    )
  }

  // Get webhook secret from environment
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Clerk Webhook API] CLERK_WEBHOOK_SECRET not configured')
    return NextResponse.json(
      {
        success: false,
        error: 'Webhook secret not configured'
      },
      { status: 500 }
    )
  }

  // Get the request body
  const body = await req.text()

  try {
    // Verify webhook signature
    const verificationResult = verifyClerkWebhook(
      body,
      {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature
      },
      webhookSecret
    )

    if (!verificationResult.success || !verificationResult.event) {
      console.error('[Clerk Webhook API] Signature verification failed:', verificationResult.error)
      return NextResponse.json(
        {
          success: false,
          error: verificationResult.error || 'Invalid webhook signature'
        },
        { status: 400 }
      )
    }

    const evt = verificationResult.event

    // Route to appropriate handler
    switch (evt.type) {
      case 'user.created':
        await handleClerkUserCreated(evt.data)
        break
      case 'user.updated':
        await handleClerkUserUpdated(evt.data)
        break
      case 'user.deleted':
        await handleClerkUserDeleted(evt.data)
        break
      default:
        console.log(`[Clerk Webhook API] Unhandled event type: ${evt.type}`)
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${evt.type} event`
    })

  } catch (err) {
    console.error('[Clerk Webhook API] Error processing webhook:', err)
    console.error('[Clerk Webhook API] Request details:', {
      bodyLength: body.length,
      hasHeaders: { svixId: !!svixId, svixTimestamp: !!svixTimestamp, svixSignature: !!svixSignature },
      errorType: err instanceof Error ? err.constructor.name : typeof err
    })
    return NextResponse.json(
      {
        success: false,
        error: 'Webhook processing error',
        details: err instanceof Error ? err.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
