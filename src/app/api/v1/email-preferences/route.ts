/**
 * Email Preferences API Route
 *
 * GET /api/v1/email-preferences - Get current user's email preferences
 * PATCH /api/v1/email-preferences - Update email preferences
 *
 * Requires Clerk authentication.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

// ===== CONVEX CLIENT =====

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  }
  return new ConvexHttpClient(convexUrl)
}

/**
 * GET - Get email preferences for authenticated user
 */
export async function GET() {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const convex = getConvexClient()

    // Get user by Clerk ID
    const user = await convex.query(api.functions.users.getByClerkId, {
      clerkUserId
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Get email preferences (returns defaults if none set)
    const preferences = await convex.query(api.functions.emails.getEmailPreferences, {
      userId: user._id
    })

    return NextResponse.json({
      success: true,
      data: {
        marketingEnabled: preferences.marketingEnabled,
        onboardingTipsEnabled: preferences.onboardingTipsEnabled,
        productUpdatesEnabled: preferences.productUpdatesEnabled,
        globalUnsubscribe: preferences.globalUnsubscribe,
      }
    })

  } catch (error) {
    console.error('[Email Preferences API] GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Update email preferences for authenticated user
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()

    // Validate input
    const validFields = ['marketingEnabled', 'onboardingTipsEnabled', 'productUpdatesEnabled', 'globalUnsubscribe']
    const updates: Record<string, boolean> = {}

    for (const field of validFields) {
      if (typeof body[field] === 'boolean') {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const convex = getConvexClient()

    // Get user by Clerk ID
    const user = await convex.query(api.functions.users.getByClerkId, {
      clerkUserId
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Update preferences
    await convex.mutation(api.functions.emails.updateEmailPreferences, {
      userId: user._id,
      ...updates
    })

    console.log(`[Email Preferences API] Updated preferences for user ${user._id}:`, updates)

    // Return updated preferences
    const preferences = await convex.query(api.functions.emails.getEmailPreferences, {
      userId: user._id
    })

    return NextResponse.json({
      success: true,
      data: {
        marketingEnabled: preferences.marketingEnabled,
        onboardingTipsEnabled: preferences.onboardingTipsEnabled,
        productUpdatesEnabled: preferences.productUpdatesEnabled,
        globalUnsubscribe: preferences.globalUnsubscribe,
      },
      message: 'Email preferences updated successfully'
    })

  } catch (error) {
    console.error('[Email Preferences API] PATCH error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
