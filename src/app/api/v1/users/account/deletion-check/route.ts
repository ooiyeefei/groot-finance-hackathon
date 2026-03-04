/**
 * Account Deletion Check API
 * GET /api/v1/users/account/deletion-check
 *
 * Pre-flight check before showing the deletion confirmation dialog.
 * Returns whether deletion is allowed and any blocking conditions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'

export async function GET(request: NextRequest) {
  const rateLimitResponse = await rateLimit(request, RATE_LIMIT_CONFIGS.QUERY)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Resolve Clerk user to Convex user
    const user = await client.query(api.functions.users.getByClerkId, {
      clerkUserId,
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Check deletion eligibility
    const eligibility = await client.action(
      api.functions.users.checkAccountDeletionStatus,
      { userId: user._id as Id<"users"> }
    )

    return NextResponse.json({
      success: true,
      data: {
        canDelete: eligibility.canDelete,
        blockedBusinesses: eligibility.blockedBusinesses,
        hasActiveSubscription: eligibility.hasActiveSubscription,
        pendingItemsCount: eligibility.pendingItemsCount,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/v1/users/account/deletion-check:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
