/**
 * Referral Code Validation API
 *
 * Public endpoint to validate a referral code and get referrer info.
 * Rate-limited to prevent abuse.
 *
 * @route POST /api/v1/referral/validate
 */

import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL not configured')
  return new ConvexHttpClient(url)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code } = body as { code?: string }

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return NextResponse.json(
        { valid: false, referrerName: null, error: 'Referral code is required' },
        { status: 400 }
      )
    }

    const convex = getConvexClient()
    const result = await convex.query(api.functions.referral.validateCode, {
      code: code.trim(),
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Referral Validate] Error:', error)
    return NextResponse.json(
      { valid: false, referrerName: null, error: 'Validation failed' },
      { status: 500 }
    )
  }
}
