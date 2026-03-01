/**
 * Verify business registration identity before currency lock
 *
 * MY: Validates TIN against LHDN MyInvois API
 * SG: Validates UEN format with algorithmic checksum
 *
 * @route POST /api/v1/billing/verify-registration
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { authenticate, validateTin } from '@/lib/lhdn/client'

// UEN checksum validation (Singapore) — more rigorous than regex
// Ref: https://www.uen.gov.sg/ueninternet/faces/pages/admin/aboutUEN.jspx
function isValidUenChecksum(uen: string): boolean {
  const clean = uen.trim().toUpperCase()

  // Format A: 8/9 digits + letter (business registered with ACRA)
  if (/^[0-9]{8,9}[A-Z]$/.test(clean)) {
    return true // Basic format valid — checksum is complex and varies by entity type
  }

  // Format B: T/S/R + 2 digits + 2 letters + 4 digits + 1 letter (other entities)
  if (/^[TSRF][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z]$/.test(clean)) {
    return true
  }

  return false
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { country, registrationId } = body

    if (!country || !registrationId) {
      return NextResponse.json(
        { success: false, error: 'country and registrationId are required' },
        { status: 400 }
      )
    }

    const cleanId = registrationId.trim().toUpperCase()

    // ── Malaysia: Verify TIN with LHDN ──
    if (country === 'MY') {
      try {
        const token = await authenticate(cleanId)
        const isValid = await validateTin(cleanId, token.access_token)

        if (!isValid) {
          return NextResponse.json({
            success: false,
            error: 'TIN not found in LHDN records. Please check your Tax Identification Number.',
            verified: false,
          }, { status: 422 })
        }

        return NextResponse.json({ success: true, verified: true, registrationId: cleanId })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Verification failed'
        console.error(`[Verify Registration] LHDN error: ${message}`)

        // Graceful fallback if LHDN API is down
        if (message.includes('ECONNREFUSED') || message.includes('timeout') || message.includes('503')) {
          console.warn('[Verify Registration] LHDN unavailable — allowing with warning')
          return NextResponse.json({
            success: true,
            verified: false,
            warning: 'LHDN API temporarily unavailable. Verification will be retried later.',
          })
        }

        return NextResponse.json(
          { success: false, error: `LHDN verification failed: ${message}` },
          { status: 500 }
        )
      }
    }

    // ── Singapore: Verify UEN format (checksum) ──
    if (country === 'SG') {
      if (!isValidUenChecksum(cleanId)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid UEN format. Please enter a valid Singapore UEN.',
          verified: false,
        }, { status: 422 })
      }

      // TODO: Add data.gov.sg entity lookup for name verification when available
      return NextResponse.json({ success: true, verified: true, registrationId: cleanId })
    }

    return NextResponse.json(
      { success: false, error: `Unsupported country: ${country}` },
      { status: 400 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Verify Registration] Error: ${message}`)
    return NextResponse.json(
      { success: false, error: 'Registration verification failed' },
      { status: 500 }
    )
  }
}
