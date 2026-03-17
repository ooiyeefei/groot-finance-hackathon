/**
 * LHDN Credential Validation (023-einv-buyer-rejection-flow)
 *
 * POST /api/v1/account-management/businesses/lhdn-validate
 *   - Tests LHDN Client ID + Client Secret against the OAuth token endpoint
 *   - Returns success if credentials are valid, error details if not
 *   - Does NOT store anything — just validates
 *
 * Security:
 * - Requires Clerk authentication
 * - Only owners/managers can validate credentials
 * - The secret is sent in the request body (not stored here)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

const LHDN_PREPROD_URL = 'https://preprod-api.myinvois.hasil.gov.my'
const LHDN_PROD_URL = 'https://api.myinvois.hasil.gov.my'

export async function POST(request: NextRequest) {
  try {
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { client_id, client_secret, tin } = body

    if (!client_id || !client_secret) {
      return NextResponse.json(
        { success: false, error: 'Client ID and Client Secret are required' },
        { status: 400 }
      )
    }

    // Get business context for role check
    const context = await client.query(api.functions.businesses.getBusinessContext, {})
    if (!context || !context.businessId) {
      return NextResponse.json(
        { success: false, error: 'No active business context' },
        { status: 400 }
      )
    }

    if (context.role !== 'owner' && context.role !== 'manager') {
      return NextResponse.json(
        { success: false, error: 'Only owners/managers can validate LHDN credentials' },
        { status: 403 }
      )
    }

    // Determine environment — try preprod first, then prod
    // In production, we'd use the configured environment
    const lhdnEnv = process.env.LHDN_ENVIRONMENT || 'sandbox'
    const baseUrl = lhdnEnv === 'production' ? LHDN_PROD_URL : LHDN_PREPROD_URL

    // Attempt OAuth token request
    const tokenUrl = `${baseUrl}/connect/token`
    const params = new URLSearchParams({
      client_id: client_id.trim(),
      client_secret: client_secret.trim(),
      grant_type: 'client_credentials',
      scope: 'InvoicingAPI',
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    // If TIN provided, use intermediary mode
    if (tin) {
      headers.onbehalfof = tin.trim()
    }

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString(),
      signal: AbortSignal.timeout(15000), // 15s timeout
    })

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json()
      return NextResponse.json({
        success: true,
        data: {
          valid: true,
          environment: lhdnEnv,
          tokenType: tokenData.token_type,
          expiresIn: tokenData.expires_in,
        },
      })
    }

    // Auth failed — parse error details
    let errorDetail = ''
    try {
      const errorBody = await tokenResponse.json()
      errorDetail = errorBody.error_description || errorBody.error || JSON.stringify(errorBody)
    } catch {
      errorDetail = `HTTP ${tokenResponse.status}: ${tokenResponse.statusText}`
    }

    return NextResponse.json({
      success: true,
      data: {
        valid: false,
        error: errorDetail,
        httpStatus: tokenResponse.status,
      },
    })
  } catch (error) {
    console.error('[LHDN Validate] Error:', error)

    // Network/timeout errors
    const message = error instanceof Error ? error.message : 'Failed to validate credentials'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
