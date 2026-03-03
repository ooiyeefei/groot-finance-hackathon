/**
 * Personal Data Export API Route
 *
 * GET /api/v1/users/data-export - Generate JSON export of all personal data
 *
 * Requires Clerk authentication. Available to all roles.
 */

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  }
  return new ConvexHttpClient(convexUrl)
}

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

    // Get user profile
    const user = await convex.query(api.functions.users.getByClerkId, {
      clerkUserId,
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Get consent history
    const consentData = await convex.query(api.functions.consent.getConsentHistory, {})

    const exportDate = new Date().toISOString()
    const dateStr = exportDate.split('T')[0]

    const exportData = {
      exportDate,
      exportVersion: '1.0',
      user: {
        email: user.email,
        fullName: user.fullName || null,
        createdAt: user._creationTime ? new Date(user._creationTime).toISOString() : null,
        emailPreferences: user.emailPreferences || null,
        notificationPreferences: user.notificationPreferences || null,
      },
      consentHistory: consentData.records,
      activitySummary: {
        note: 'For detailed business data exports, use the Export tab in /reporting.',
      },
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="groot-my-data-${dateStr}.json"`,
      },
    })
  } catch (error) {
    console.error('[Data Export API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate data export' },
      { status: 500 }
    )
  }
}
