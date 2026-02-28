/**
 * SES Email Verification API Route (019-lhdn-einv-flow-2)
 *
 * POST - Trigger SES VerifyEmailIdentity for the authenticated user's email
 * GET  - Check verification status via SES GetIdentityVerificationAttributes
 *        and update Convex if verified
 *
 * SES sandbox mode requires verified TO addresses. This lets users
 * verify their email so e-invoice forwarding uses SES (free) instead of Resend.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import {
  SESClient,
  VerifyEmailIdentityCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses'
import { fromWebToken } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentityProvider } from '@smithy/types'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'

// ===== AWS SES CLIENT =====

const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN

function createVercelOidcCredentialProvider(
  roleArn: string
): AwsCredentialIdentityProvider {
  return async () => {
    const { getVercelOidcToken } = await import('@vercel/oidc')
    const token = await getVercelOidcToken()
    const provider = fromWebToken({
      roleArn,
      webIdentityToken: token,
      roleSessionName: `finanseal-ses-verify-${Date.now()}`,
      durationSeconds: 3600,
    })
    return provider()
  }
}

function getSESClient(): SESClient {
  const config: ConstructorParameters<typeof SESClient>[0] = { region: AWS_REGION }
  if (AWS_ROLE_ARN) {
    config.credentials = createVercelOidcCredentialProvider(AWS_ROLE_ARN)
  }
  return new SESClient(config)
}

// ===== CONVEX CLIENT =====

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  return new ConvexHttpClient(convexUrl)
}

// ===== ROUTES =====

/**
 * POST - Send SES verification email to the authenticated user's email
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await rateLimit(request, RATE_LIMIT_CONFIGS.MUTATION)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's email from Convex (public query, takes clerkUserId)
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

    // Already verified — no need to re-send
    if (user.sesEmailVerified) {
      return NextResponse.json({
        success: true,
        data: { status: 'already_verified', email: user.email },
      })
    }

    // Trigger SES verification email
    const ses = getSESClient()
    await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: user.email }))

    console.log(`[Verify Email] Sent SES verification to ${user.email}`)

    return NextResponse.json({
      success: true,
      data: { status: 'verification_sent', email: user.email },
    })
  } catch (error) {
    console.error('[Verify Email] POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send verification email' },
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

    // Get user's email from Convex
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

    // If already marked verified in Convex, skip SES check
    if (user.sesEmailVerified) {
      return NextResponse.json({
        success: true,
        data: { status: 'verified', email: user.email },
      })
    }

    // Check SES verification status
    const ses = getSESClient()
    const result = await ses.send(
      new GetIdentityVerificationAttributesCommand({
        Identities: [user.email],
      })
    )

    const attrs = result.VerificationAttributes?.[user.email]
    const sesStatus = attrs?.VerificationStatus // "Pending" | "Success" | "Failed" | "TemporaryFailure" | "NotStarted"

    if (sesStatus === 'Success') {
      // Update Convex to reflect verified status
      await convex.mutation(api.functions.system.markSesEmailVerified, {
        email: user.email,
        verified: true,
      })

      return NextResponse.json({
        success: true,
        data: { status: 'verified', email: user.email },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        status: sesStatus === 'Pending' ? 'pending' : 'unverified',
        email: user.email,
      },
    })
  } catch (error) {
    console.error('[Verify Email] GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to check verification status' },
      { status: 500 }
    )
  }
}
