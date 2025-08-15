/**
 * Supported Currencies List API Endpoint
 * Returns list of supported currencies for SEA SMEs
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { CURRENCY_SYMBOLS, CURRENCY_NAMES, SupportedCurrency } from '@/types/transaction'

interface CurrencyInfo {
  code: SupportedCurrency
  name: string
  symbol: string
  region: 'SEA' | 'International'
  popular: boolean
}

const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  // Southeast Asian currencies (most popular for SMEs)
  { code: 'THB', name: 'Thai Baht', symbol: '฿', region: 'SEA', popular: true },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', region: 'SEA', popular: true },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', region: 'SEA', popular: true },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', region: 'SEA', popular: true },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', region: 'SEA', popular: true },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', region: 'SEA', popular: true },
  
  // International currencies (for cross-border trade)
  { code: 'USD', name: 'US Dollar', symbol: '$', region: 'International', popular: true },
  { code: 'EUR', name: 'Euro', symbol: '€', region: 'International', popular: true },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', region: 'International', popular: true },
]

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
    const region = searchParams.get('region') // 'SEA' or 'International'
    const popular = searchParams.get('popular') === 'true'

    let currencies = SUPPORTED_CURRENCIES

    // Filter by region if specified
    if (region === 'SEA' || region === 'International') {
      currencies = currencies.filter(curr => curr.region === region)
    }

    // Filter by popularity if specified
    if (popular) {
      currencies = currencies.filter(curr => curr.popular)
    }

    // Sort: SEA currencies first, then by popularity, then alphabetically
    currencies.sort((a, b) => {
      if (a.region !== b.region) {
        return a.region === 'SEA' ? -1 : 1
      }
      if (a.popular !== b.popular) {
        return a.popular ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({
      success: true,
      data: {
        currencies,
        total: currencies.length,
        regions: {
          SEA: currencies.filter(c => c.region === 'SEA').length,
          International: currencies.filter(c => c.region === 'International').length
        }
      }
    })

  } catch (error) {
    console.error('[Currency List API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get currency list'
      },
      { status: 500 }
    )
  }
}