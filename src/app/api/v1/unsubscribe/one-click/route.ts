/**
 * One-Click Unsubscribe API Route (RFC 8058)
 *
 * POST /api/v1/unsubscribe/one-click?token=xxx
 *
 * Implements RFC 8058 one-click unsubscribe for email clients.
 * Email clients (Gmail, Yahoo, etc.) send POST requests automatically
 * when users click "Unsubscribe" in the email header.
 *
 * Required email headers for this to work:
 * - List-Unsubscribe: <https://finance.hellogroot.com/api/v1/unsubscribe?token=xxx>
 * - List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *
 * The POST body will contain: List-Unsubscribe=One-Click
 */

import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { verifyUnsubscribeToken } from '@/lib/services/unsubscribe-token'

// ===== CONVEX CLIENT =====

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  }
  return new ConvexHttpClient(convexUrl)
}

/**
 * POST - RFC 8058 One-Click Unsubscribe Handler
 *
 * Email clients send POST with body: List-Unsubscribe=One-Click
 * Token is passed as query parameter.
 *
 * Response:
 * - 200: Unsubscribe successful
 * - 400: Invalid or expired token
 * - 500: Server error
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  console.log('[One-Click Unsubscribe] Received request')

  if (!token) {
    console.error('[One-Click Unsubscribe] Missing token')
    return NextResponse.json(
      { success: false, error: 'Missing token' },
      { status: 400 }
    )
  }

  try {
    // Log body for debugging (RFC 8058 specifies List-Unsubscribe=One-Click)
    const contentType = req.headers.get('content-type') || ''
    let body = ''

    if (contentType.includes('application/x-www-form-urlencoded')) {
      body = await req.text()
      console.log('[One-Click Unsubscribe] Body:', body)
    }

    // Verify token
    const result = await verifyUnsubscribeToken(token)

    if (!result.success || !result.payload) {
      console.error('[One-Click Unsubscribe] Token verification failed:', result.error)
      return NextResponse.json(
        { success: false, error: result.error || 'Invalid token' },
        { status: 400 }
      )
    }

    const { userId, email, type } = result.payload

    // Update email preferences in Convex
    const convex = getConvexClient()

    // Map unsubscribe type to preference fields
    const updates: Record<string, boolean> = {}

    switch (type) {
      case 'marketing':
        updates.marketingEnabled = false
        break
      case 'onboarding':
        updates.onboardingTipsEnabled = false
        break
      case 'product_updates':
        updates.productUpdatesEnabled = false
        break
      case 'all':
        updates.globalUnsubscribe = true
        updates.marketingEnabled = false
        updates.onboardingTipsEnabled = false
        updates.productUpdatesEnabled = false
        break
    }

    await convex.mutation(api.functions.emails.updateEmailPreferences, {
      userId: userId as Id<'users'>,
      ...updates
    })

    console.log(`[One-Click Unsubscribe] Successfully unsubscribed ${email}, type: ${type}`)

    // RFC 8058 recommends 200 OK for successful unsubscribe
    return NextResponse.json({
      success: true,
      message: 'Successfully unsubscribed'
    })

  } catch (error) {
    console.error('[One-Click Unsubscribe] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET - Redirect to main unsubscribe page
 *
 * Some email clients may send GET instead of POST.
 * Redirect to the main unsubscribe page with confirmation.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/api/v1/unsubscribe', req.url))
  }

  // Redirect to main unsubscribe page with token
  return NextResponse.redirect(new URL(`/api/v1/unsubscribe?token=${encodeURIComponent(token)}`, req.url))
}
