/**
 * V1 Supported Currencies List API
 *
 * GET /api/v1/utils/currency/list - List supported currencies
 * GET /api/v1/utils/currency/list?region=SEA - Filter by region
 * GET /api/v1/utils/currency/list?popular=true - Filter by popularity
 *
 * Purpose:
 * - Returns list of supported currencies for SEA SMEs
 * - Used by currency selector dropdowns across the application
 * - Supports filtering by region and popularity
 *
 * North Star Architecture:
 * - Thin wrapper delegating to utilities.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { listSupportedCurrencies } from '@/domains/utilities/lib/utilities.service'

// GET - List all supported currencies with filtering
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region') as 'SEA' | 'International' | null
    const popular = searchParams.get('popular') === 'true'

    console.log(`[Currency List V1 API] Listing currencies (region: ${region || 'all'}, popular: ${popular})`)

    // Call service layer
    const result = await listSupportedCurrencies({
      region: region || undefined,
      popular: popular || undefined
    })

    return NextResponse.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Currency List V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to get currency list'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
