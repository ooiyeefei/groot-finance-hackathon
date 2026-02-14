import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { deleteSSMParameter } from '@/lib/aws-ssm'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

/**
 * POST /api/v1/stripe-integration/disconnect
 *
 * Deletes the Stripe secret key from SSM Parameter Store
 * and updates the integration status in Convex.
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

    // Delete key from SSM Parameter Store
    const ssmPath = `/finanseal/stripe/${businessId}/secret-key`
    await deleteSSMParameter(ssmPath)

    // Update Convex status
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to authenticate with database' },
        { status: 500 }
      )
    }

    await client.mutation(api.functions.stripeIntegrations.disconnect, {
      businessId: businessId as Id<'businesses'>,
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
