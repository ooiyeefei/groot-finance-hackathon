/**
 * Utilities Service Layer
 * Extracted business logic for currency conversion and other utilities
 *
 * Functions:
 * Currency Operations:
 * - convertCurrency() - Convert amount between currencies
 * - getExchangeRate() - Get current exchange rate
 * - listSupportedCurrencies() - List all supported currencies
 */

import { currencyService } from '@/lib/services/currency-service'
import { SupportedCurrency, CurrencyConversion } from '@/domains/accounting-entries/types'
import { CURRENCY_SYMBOLS, CURRENCY_NAMES } from '@/domains/accounting-entries/types'

// ============================================================================
// Types
// ============================================================================

export interface CurrencyInfo {
  code: SupportedCurrency
  name: string
  symbol: string
  region: 'SEA' | 'International'
  popular: boolean
}

export interface ConvertCurrencyRequest {
  amount: number
  from_currency: string
  to_currency: string
}

export interface ExchangeRateRequest {
  from: string
  to: string
}

// ============================================================================
// Currency Operations
// ============================================================================

/**
 * Convert amount between currencies with validation
 */
export async function convertCurrency(
  request: ConvertCurrencyRequest
): Promise<CurrencyConversion> {
  const { amount, from_currency, to_currency } = request

  // Validate input
  if (!amount || !from_currency || !to_currency) {
    throw new Error('Amount, from_currency, and to_currency are required')
  }

  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('Amount must be a positive number')
  }

  // Validate currency codes
  if (!currencyService.isSupportedCurrency(from_currency)) {
    throw new Error(`Unsupported source currency: ${from_currency}`)
  }

  if (!currencyService.isSupportedCurrency(to_currency)) {
    throw new Error(`Unsupported target currency: ${to_currency}`)
  }

  console.log(`[Utilities Service] Converting ${amount} ${from_currency} to ${to_currency}`)

  // Perform conversion
  const conversion = await currencyService.convertAmount(
    amount,
    from_currency as SupportedCurrency,
    to_currency as SupportedCurrency
  )

  return conversion
}

/**
 * Get current exchange rate between two currencies
 */
export async function getExchangeRate(
  request: ExchangeRateRequest
): Promise<{
  from_currency: string
  to_currency: string
  exchange_rate: number
  rate_date: string
  formatted_rate: string
}> {
  const { from, to } = request

  if (!from || !to) {
    throw new Error('Both from and to currency parameters are required')
  }

  // Validate currency codes
  if (!currencyService.isSupportedCurrency(from)) {
    throw new Error(`Unsupported source currency: ${from}`)
  }

  if (!currencyService.isSupportedCurrency(to)) {
    throw new Error(`Unsupported target currency: ${to}`)
  }

  console.log(`[Utilities Service] Getting exchange rate ${from} to ${to}`)

  // Get exchange rate
  const rate = await currencyService.getCurrentRate(
    from as SupportedCurrency,
    to as SupportedCurrency
  )

  return {
    from_currency: from,
    to_currency: to,
    exchange_rate: rate,
    rate_date: new Date().toISOString().split('T')[0],
    formatted_rate: `1 ${from} = ${rate.toFixed(6)} ${to}`
  }
}

/**
 * List all supported currencies with filtering
 */
export async function listSupportedCurrencies(options: {
  region?: 'SEA' | 'International'
  popular?: boolean
} = {}): Promise<{
  currencies: CurrencyInfo[]
  total: number
  regions: {
    SEA: number
    International: number
  }
}> {
  const { region, popular } = options

  // Define supported currencies
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

  return {
    currencies,
    total: currencies.length,
    regions: {
      SEA: currencies.filter(c => c.region === 'SEA').length,
      International: currencies.filter(c => c.region === 'International').length
    }
  }
}

/**
 * Format currency amount for display
 */
export function formatCurrencyAmount(amount: number, currency: SupportedCurrency): string {
  return currencyService.formatCurrency(amount, currency)
}
