/**
 * V1 Currency Conversion API
 *
 * POST /api/v1/utils/currency/convert - Convert amount between currencies
 * GET /api/v1/utils/currency/convert?from=USD&to=SGD - Get exchange rate
 *
 * Purpose:
 * - Real-time currency conversion for transactions
 * - Exchange rate retrieval with caching
 * - Used across domains (invoices, expenses, accounting-entries)
 *
 * North Star Architecture:
 * - Thin wrapper delegating to utilities.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  convertCurrency,
  getExchangeRate,
  formatCurrencyAmount,
  type ConvertCurrencyRequest,
  type ExchangeRateRequest
} from '@/domains/utilities/lib/utilities.service'
import { SupportedCurrency } from '@/lib/types/currency'

// POST - Convert amount between currencies
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body: ConvertCurrencyRequest = await request.json()

    console.log(`[Currency V1 API] Converting ${body.amount} ${body.from_currency} to ${body.to_currency}`)

    // Call service layer
    const conversion = await convertCurrency(body)

    return NextResponse.json({
      success: true,
      data: {
        conversion,
        formatted: {
          original: formatCurrencyAmount(body.amount, body.from_currency as SupportedCurrency),
          converted: formatCurrencyAmount(
            conversion.converted_amount,
            body.to_currency as SupportedCurrency
          )
        }
      }
    })

  } catch (error) {
    console.error('[Currency V1 API] Conversion error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Currency conversion failed'

    // Map specific errors to HTTP status codes
    if (errorMessage.includes('required')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 })
    }

    if (errorMessage.includes('Unsupported')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 })
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

// GET - Get exchange rate between two currencies
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
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json(
        { success: false, error: 'Both from and to currency parameters are required' },
        { status: 400 }
      )
    }

    console.log(`[Currency V1 API] Getting exchange rate ${from} to ${to}`)

    // Call service layer
    const rateData = await getExchangeRate({ from, to } as ExchangeRateRequest)

    return NextResponse.json({
      success: true,
      data: rateData
    })

  } catch (error) {
    console.error('[Currency V1 API] Rate fetch error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to get exchange rate'

    // Map specific errors to HTTP status codes
    if (errorMessage.includes('required')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 })
    }

    if (errorMessage.includes('Unsupported')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 })
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
