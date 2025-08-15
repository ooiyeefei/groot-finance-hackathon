/**
 * Currency Conversion API Endpoint
 * Handles real-time currency conversion for transactions
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { currencyService } from '@/lib/currency-service'
import { SupportedCurrency } from '@/types/transaction'

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

    const body = await request.json()
    const { amount, from_currency, to_currency } = body

    // Validate input
    if (!amount || !from_currency || !to_currency) {
      return NextResponse.json(
        { success: false, error: 'Amount, from_currency, and to_currency are required' },
        { status: 400 }
      )
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    // Validate currency codes
    if (!currencyService.isSupportedCurrency(from_currency)) {
      return NextResponse.json(
        { success: false, error: `Unsupported source currency: ${from_currency}` },
        { status: 400 }
      )
    }

    if (!currencyService.isSupportedCurrency(to_currency)) {
      return NextResponse.json(
        { success: false, error: `Unsupported target currency: ${to_currency}` },
        { status: 400 }
      )
    }

    console.log(`[Currency API] Converting ${amount} ${from_currency} to ${to_currency}`)

    // Perform conversion
    const conversion = await currencyService.convertAmount(
      amount,
      from_currency as SupportedCurrency,
      to_currency as SupportedCurrency
    )

    return NextResponse.json({
      success: true,
      data: {
        conversion,
        formatted: {
          original: currencyService.formatCurrency(amount, from_currency as SupportedCurrency),
          converted: currencyService.formatCurrency(
            conversion.converted_amount,
            to_currency as SupportedCurrency
          )
        }
      }
    })

  } catch (error) {
    console.error('[Currency API] Conversion error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Currency conversion failed'
      },
      { status: 500 }
    )
  }
}

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

    // Validate currency codes
    if (!currencyService.isSupportedCurrency(from)) {
      return NextResponse.json(
        { success: false, error: `Unsupported source currency: ${from}` },
        { status: 400 }
      )
    }

    if (!currencyService.isSupportedCurrency(to)) {
      return NextResponse.json(
        { success: false, error: `Unsupported target currency: ${to}` },
        { status: 400 }
      )
    }

    console.log(`[Currency API] Getting exchange rate ${from} to ${to}`)

    // Get exchange rate
    const rate = await currencyService.getCurrentRate(
      from as SupportedCurrency,
      to as SupportedCurrency
    )

    return NextResponse.json({
      success: true,
      data: {
        from_currency: from,
        to_currency: to,
        exchange_rate: rate,
        rate_date: new Date().toISOString().split('T')[0],
        formatted_rate: `1 ${from} = ${rate.toFixed(6)} ${to}`
      }
    })

  } catch (error) {
    console.error('[Currency API] Rate fetch error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get exchange rate'
      },
      { status: 500 }
    )
  }
}