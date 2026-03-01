/**
 * Verify TIN with LHDN MyInvois API
 *
 * Called during business activation to verify the TIN is real before
 * locking the billing currency. Only applicable for Malaysian businesses.
 *
 * @route POST /api/v1/billing/verify-tin
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { authenticate, validateTin } from '@/lib/lhdn/client'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { tin } = body

    if (!tin || typeof tin !== 'string') {
      return NextResponse.json({ success: false, error: 'TIN is required' }, { status: 400 })
    }

    const cleanTin = tin.trim().toUpperCase()

    // Authenticate with LHDN (intermediary mode, using platform credentials)
    // Use the provided TIN as the tenant TIN for the onbehalfof header
    const token = await authenticate(cleanTin)

    // Validate the TIN exists in LHDN's database
    const isValid = await validateTin(cleanTin, token.access_token)

    if (!isValid) {
      return NextResponse.json({
        success: false,
        error: 'TIN not found in LHDN records. Please check your Tax Identification Number.',
        verified: false,
      }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      verified: true,
      tin: cleanTin,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed'
    console.error(`[Verify TIN] Error: ${message}`)

    // Don't block activation if LHDN API is down — log and allow with warning
    if (message.includes('ECONNREFUSED') || message.includes('timeout') || message.includes('503')) {
      console.warn('[Verify TIN] LHDN API unavailable — allowing activation with warning')
      return NextResponse.json({
        success: true,
        verified: false,
        warning: 'LHDN API temporarily unavailable. TIN verification skipped.',
      })
    }

    return NextResponse.json(
      { success: false, error: `TIN verification failed: ${message}` },
      { status: 500 }
    )
  }
}
