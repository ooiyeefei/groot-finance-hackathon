/**
 * Consent Record API Route
 *
 * POST /api/v1/consent/record - Record user consent with IP capture
 *
 * Requires Clerk authentication.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { z } from 'zod'

async function getAuthenticatedConvexClient() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  }
  const convex = new ConvexHttpClient(convexUrl)
  const clerkAuth = await auth()
  const token = await clerkAuth.getToken({ template: 'convex' })
  if (token) {
    convex.setAuth(token)
  }
  return convex
}

const recordConsentSchema = z.object({
  policyType: z.enum(['privacy_policy', 'terms_of_service']),
  policyVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Policy version must be YYYY-MM-DD format'),
  source: z.enum(['onboarding', 'invitation', 'banner', 'settings']),
})

function extractIpAddress(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-client-ip') ||
    undefined
  )
}

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
    const parsed = recordConsentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const convex = await getAuthenticatedConvexClient()
    const ipAddress = extractIpAddress(request)
    const userAgent = request.headers.get('user-agent') || undefined

    const result = await convex.mutation(api.functions.consent.recordConsent, {
      policyType: parsed.data.policyType,
      policyVersion: parsed.data.policyVersion,
      source: parsed.data.source,
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      success: true,
      data: { consentRecordId: result.consentRecordId },
    })
  } catch (error) {
    console.error('[Consent Record API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to record consent' },
      { status: 500 }
    )
  }
}
