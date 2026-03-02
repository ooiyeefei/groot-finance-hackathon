/**
 * SES Email Verification API Route (019-lhdn-einv-flow-2)
 *
 * POST - Send branded verification email via SES custom template
 * GET  - Check verification status via SES and update Convex if verified
 *
 * SES sandbox mode requires verified TO addresses. This lets users
 * verify their email so e-invoice forwarding uses SES (free) instead of Resend.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'
import {
  sendBrandedVerificationEmail,
  checkVerificationStatus,
} from '@/lib/aws/ses-verification'

// ===== CONVEX CLIENT =====

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  return new ConvexHttpClient(convexUrl)
}

// ===== ROUTES =====

/**
 * POST - Send branded SES verification email to the authenticated user's email
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await rateLimit(request, RATE_LIMIT_CONFIGS.MUTATION)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const convex = getConvexClient()
    const user = await convex.query(api.functions.users.getByClerkId, {
      clerkUserId: userId,
    })

    if (!user?.email) {
      return NextResponse.json(
        { success: false, error: 'User email not found' },
        { status: 404 }
      )
    }

    if (user.sesEmailVerified) {
      return NextResponse.json({
        success: true,
        data: { status: 'already_verified', email: user.email },
      })
    }

    await sendBrandedVerificationEmail(user.email)

    return NextResponse.json({
      success: true,
      data: { status: 'verification_sent', email: user.email },
    })
  } catch (error) {
    console.error('[Verify Email] POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send verification email. Please contact support.' },
      { status: 500 }
    )
  }
}

/**
 * GET - Check SES verification status for the authenticated user's email.
 *       If verified, updates Convex sesEmailVerified = true.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await rateLimit(request, RATE_LIMIT_CONFIGS.QUERY)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const convex = getConvexClient()
    const user = await convex.query(api.functions.users.getByClerkId, {
      clerkUserId: userId,
    })

    if (!user?.email) {
      return NextResponse.json(
        { success: false, error: 'User email not found' },
        { status: 404 }
      )
    }

    if (user.sesEmailVerified) {
      return NextResponse.json({
        success: true,
        data: { status: 'verified', email: user.email },
      })
    }

    const status = await checkVerificationStatus(user.email)

    if (status === 'verified') {
      await convex.mutation(api.functions.system.markSesEmailVerified, {
        email: user.email,
        verified: true,
      })
    }

    return NextResponse.json({
      success: true,
      data: { status, email: user.email },
    })
  } catch (error) {
    console.error('[Verify Email] GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to check verification status' },
      { status: 500 }
    )
  }
}
