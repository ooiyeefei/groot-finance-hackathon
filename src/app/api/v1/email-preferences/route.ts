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
  console.log('[Email Preferences API] DEBUG: CONVEX_URL =', convexUrl)
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
    console.log('[Email Preferences API] DEBUG: Looking up user with clerkUserId:', clerkUserId)
    const user = await convex.query(api.functions.users.getByClerkId, {
      clerkUserId
    })
    console.log('[Email Preferences API] DEBUG: Found user:', user?._id, 'email:', user?.email)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Update preferences
    const mutationArgs = { userId: user._id, ...updates }
    console.log('[Email Preferences API] DEBUG: Calling mutation with args:', JSON.stringify(mutationArgs))

    const mutationResult = await convex.mutation(api.functions.emails.updateEmailPreferences, mutationArgs)
    console.log('[Email Preferences API] DEBUG: Mutation result:', mutationResult)

    console.log(`[Email Preferences API] Updated preferences for user ${user._id}:`, updates)

    // Return updated preferences
    console.log('[Email Preferences API] DEBUG: Querying updated preferences...')
    const preferences = await convex.query(api.functions.emails.getEmailPreferences, {
      userId: user._id
    })
    console.log('[Email Preferences API] DEBUG: Query result:', JSON.stringify(preferences))

    return NextResponse.json({
      success: true,
      data: {
        marketingEnabled: preferences.marketingEnabled,
        onboardingTipsEnabled: preferences.onboardingTipsEnabled,
        productUpdatesEnabled: preferences.productUpdatesEnabled,
        globalUnsubscribe: preferences.globalUnsubscribe,
      },
      message: 'Email preferences updated successfully',
      // DEBUG: Remove after investigation
      _debug: {
        convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
        userId: user._id,
        requestedUpdates: updates,
        mutationResult,
        queriedPrefs: preferences,
      }
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
