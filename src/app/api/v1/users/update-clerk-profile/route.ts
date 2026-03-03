/**
 * Update Clerk Profile API Route
 * POST - Sync user name changes to Clerk (identity provider)
 *
 * Ensures Clerk is always source of truth for identity fields.
 * After Clerk update, the existing user.updated webhook syncs back to Convex.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'
import { getCurrentUserContextWithBusiness } from '@/domains/security/lib/rbac'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

export async function POST(request: NextRequest) {
  const mutationRateLimit = await rateLimit(request, RATE_LIMIT_CONFIGS.MUTATION)
  if (mutationRateLimit) {
    return mutationRateLimit
  }

  try {
    const { userId: currentClerkUserId } = await auth()
    if (!currentClerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { clerk_user_id, first_name, last_name } = body

    if (!clerk_user_id) {
      return NextResponse.json(
        { success: false, error: 'clerk_user_id is required' },
        { status: 400 }
      )
    }

    // Validate name
    const fullName = [first_name, last_name].filter(Boolean).join(' ').trim()
    if (!fullName || fullName.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Name must be at least 2 characters' },
        { status: 400 }
      )
    }

    // If editing another user, verify admin/owner permissions
    const isEditingSelf = clerk_user_id === currentClerkUserId
    if (!isEditingSelf) {
      const context = await getCurrentUserContextWithBusiness()
      if (!context) {
        return NextResponse.json(
          { success: false, error: 'Business context not found' },
          { status: 403 }
        )
      }
      const canManage = context.canManageUsers ?? false
      if (!canManage) {
        return NextResponse.json(
          { success: false, error: 'Admin permissions required to update other users' },
          { status: 403 }
        )
      }

      // Check if target user is soft-deleted
      const { client } = await getAuthenticatedConvex()
      if (client) {
        const targetUser = await client.query(api.functions.users.getByClerkId, {
          clerkUserId: clerk_user_id
        })
        if (targetUser && targetUser.fullName === 'Deleted User') {
          return NextResponse.json(
            { success: false, error: 'Cannot edit a deleted user' },
            { status: 400 }
          )
        }
      }
    }

    // Update Clerk profile — this is the source of truth
    const clerk = await clerkClient()
    await clerk.users.updateUser(clerk_user_id, {
      firstName: first_name || undefined,
      lastName: last_name || undefined,
    })

    return NextResponse.json({
      success: true,
      clerk_user_id,
    })
  } catch (error: unknown) {
    console.error('Error in POST /api/v1/users/update-clerk-profile:', error)

    // Handle Clerk-specific errors
    const clerkError = error as { status?: number; errors?: Array<{ message: string }> }
    if (clerkError.status === 404) {
      return NextResponse.json(
        { success: false, error: 'User not found in identity provider' },
        { status: 404 }
      )
    }
    if (clerkError.status === 429) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again shortly.' },
        { status: 429 }
      )
    }

    const message = clerkError.errors?.[0]?.message || 'Failed to update identity provider profile'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
