/**
 * Consent Revoke API Route
 *
 * POST /api/v1/consent/revoke - Revoke user consent with IP capture
 *
 * Requires Clerk authentication.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { z } from 'zod'

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  }
  return new ConvexHttpClient(convexUrl)
}

const revokeConsentSchema = z.object({
  policyType: z.enum(['privacy_policy', 'terms_of_service']),
  policyVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Policy version must be YYYY-MM-DD format'),
})

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parsed = revokeConsentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const convex = getConvexClient()

    const result = await convex.mutation(api.functions.consent.revokeConsent, {
      policyType: parsed.data.policyType,
      policyVersion: parsed.data.policyVersion,
    })

    return NextResponse.json({
      success: true,
      data: { revokedRecordId: result.revokedRecordId },
    })
  } catch (error) {
    console.error('[Consent Revoke API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to revoke consent'
    const status = errorMessage.includes('No active consent record') ? 404 : 500

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status }
    )
  }
}
