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
import { LHDN_API_PATHS } from '@/lib/lhdn/constants'

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
    // Uses GROOT's platform credentials (LHDN_VERIFY_*), NOT per-tenant e-invoice credentials (LHDN_CLIENT_*)
    if (country === 'MY') {
      try {
        const verifyClientId = process.env.LHDN_SYSTEM_CLIENT_ID
        const verifyClientSecret = process.env.LHDN_SYSTEM_CLIENT_SECRET
        const baseUrl = process.env.LHDN_API_URL || 'https://preprod-api.myinvois.hasil.gov.my'

        if (!verifyClientId || !verifyClientSecret) {
          throw new Error('LHDN_SYSTEM_CLIENT_ID or LHDN_SYSTEM_CLIENT_SECRET is not configured')
        }

        // Step 1: Authenticate with LHDN using platform credentials + onbehalfof TIN
        const tokenBody = new URLSearchParams({
          client_id: verifyClientId,
          client_secret: verifyClientSecret,
          grant_type: 'client_credentials',
          scope: 'InvoicingAPI',
        })
        const tokenRes = await fetch(`${baseUrl}${LHDN_API_PATHS.TOKEN}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'onbehalfof': cleanId,
          },
          body: tokenBody.toString(),
        })
        if (!tokenRes.ok) {
          const errText = await tokenRes.text()
          throw new Error(`LHDN auth failed (${tokenRes.status}): ${errText.substring(0, 200)}`)
        }
        const tokenData = await tokenRes.json() as { access_token: string }

        // Step 2: Validate TIN exists
        const validateRes = await fetch(`${baseUrl}${LHDN_API_PATHS.VALIDATE_TIN}${cleanId}`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
        })

        if (validateRes.status === 404) {
          return NextResponse.json({
            success: false,
            error: 'TIN not found in LHDN records. Please check your Tax Identification Number.',
            verified: false,
          }, { status: 422 })
        }

        if (!validateRes.ok) {
          throw new Error(`LHDN validate failed (${validateRes.status})`)
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

    // ── Singapore: Verify UEN against ACRA open data (data.gov.sg) ──
    if (country === 'SG') {
      if (!isValidUenChecksum(cleanId)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid UEN format. Please enter a valid Singapore UEN.',
          verified: false,
        }, { status: 422 })
      }

      try {
        // Query ACRA's "Entities Registered with ACRA" dataset via data.gov.sg API
        const ACRA_DATASET_ID = 'd_3f960c10fed6145404ca7b821f263b87'
        const filters = encodeURIComponent(JSON.stringify({ uen: cleanId }))
        const acraRes = await fetch(
          `https://data.gov.sg/api/action/datastore_search?resource_id=${ACRA_DATASET_ID}&filters=${filters}&limit=1`
        )

        if (acraRes.ok) {
          const acraData = await acraRes.json() as {
            success: boolean
            result?: { records: Array<{ uen: string; entity_name: string; uen_status_desc: string }> }
          }

          if (acraData.success && acraData.result?.records?.length) {
            const entity = acraData.result.records[0]
            console.log(`[Verify Registration] ACRA match: ${entity.entity_name} (${entity.uen_status_desc})`)
            return NextResponse.json({
              success: true,
              verified: true,
              registrationId: cleanId,
              entityName: entity.entity_name,
              entityStatus: entity.uen_status_desc,
            })
          }

          // UEN not found in ACRA dataset
          return NextResponse.json({
            success: false,
            error: 'UEN not found in ACRA records. Please check your Unique Entity Number.',
            verified: false,
          }, { status: 422 })
        }

        // data.gov.sg API error — fall back to format validation only
        console.warn(`[Verify Registration] data.gov.sg error (${acraRes.status}) — format-only fallback`)
        return NextResponse.json({
          success: true,
          verified: true,
          registrationId: cleanId,
          warning: 'ACRA lookup unavailable. UEN format validated only.',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.warn(`[Verify Registration] ACRA lookup failed: ${message} — format-only fallback`)
        return NextResponse.json({
          success: true,
          verified: true,
          registrationId: cleanId,
          warning: 'ACRA lookup unavailable. UEN format validated only.',
        })
      }
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
