/**
 * Currency Conversion Service for FinanSEAL MVP
 * Handles exchange rates for Southeast Asian SME transactions
 */

import { SupportedCurrency, CurrencyConversion, ExchangeRateService, CURRENCY_SYMBOLS } from '@/domains/accounting-entries/types'

// Exchange rate cache interface
interface CachedRate {
  rate: number
  timestamp: number
  date: string
}

// Rate cache with 5-minute TTL for real-time rates
class ExchangeRateCache {
  private cache: Map<string, CachedRate> = new Map()
  private readonly TTL = 5 * 60 * 1000 // 5 minutes

  private getCacheKey(from: SupportedCurrency, to: SupportedCurrency, date?: string): string {
    return `${from}_${to}_${date || 'current'}`
  }

  get(from: SupportedCurrency, to: SupportedCurrency, date?: string): number | null {
    const key = this.getCacheKey(from, to, date)
    const cached = this.cache.get(key)
    
    if (!cached) return null
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key)
      return null
    }
    
    return cached.rate
  }

  set(from: SupportedCurrency, to: SupportedCurrency, rate: number, date?: string): void {
    const key = this.getCacheKey(from, to, date)
    this.cache.set(key, {
      rate,
      timestamp: Date.now(),
      date: date || new Date().toISOString().split('T')[0]
    })
  }

  clear(): void {
    this.cache.clear()
  }
}

// Exchange rate providers
interface ExchangeRateProvider {
  name: string
  getCurrentRate(from: SupportedCurrency, to: SupportedCurrency): Promise<number>
  getHistoricalRate?(from: SupportedCurrency, to: SupportedCurrency, date: string): Promise<number>
  isAvailable(): boolean
}

// Free tier ExchangeRate-API provider (backup)
class ExchangeRateAPIProvider implements ExchangeRateProvider {
  name = 'ExchangeRate-API'
  private baseUrl = 'https://api.exchangerate-api.com/v4/latest'

  isAvailable(): boolean {
    return true // Free tier, always available
  }

  async getCurrentRate(from: SupportedCurrency, to: SupportedCurrency): Promise<number> {
    if (from === to) return 1

    try {
      const response = await fetch(`${this.baseUrl}/${from}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const rate = data.rates[to]
      
      if (!rate) {
        throw new Error(`Exchange rate from ${from} to ${to} not found`)
      }

      return Number(rate)
    } catch (error) {
      console.error(`[${this.name}] Failed to get exchange rate:`, error)
      throw error
    }
  }
}

// Fixer.io provider (paid but more reliable for production)
class FixerProvider implements ExchangeRateProvider {
  name = 'Fixer'
  private baseUrl = 'https://api.fixer.io/v1'
  private apiKey = process.env.FIXER_API_KEY

  isAvailable(): boolean {
    return !!this.apiKey
  }

  async getCurrentRate(from: SupportedCurrency, to: SupportedCurrency): Promise<number> {
    if (from === to) return 1
    if (!this.apiKey) throw new Error('Fixer API key not configured')

    try {
      const response = await fetch(
        `${this.baseUrl}/latest?base=${from}&symbols=${to}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error?.info || 'API request failed')
      }

      const rate = data.rates[to]
      if (!rate) {
        throw new Error(`Exchange rate from ${from} to ${to} not found`)
      }

      return Number(rate)
    } catch (error) {
      console.error(`[${this.name}] Failed to get exchange rate:`, error)
      throw error
    }
  }

  async getHistoricalRate(from: SupportedCurrency, to: SupportedCurrency, date: string): Promise<number> {
    if (from === to) return 1
    if (!this.apiKey) throw new Error('Fixer API key not configured')

    try {
      const response = await fetch(
        `${this.baseUrl}/${date}?base=${from}&symbols=${to}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error?.info || 'API request failed')
      }

      const rate = data.rates[to]
      if (!rate) {
        throw new Error(`Historical rate from ${from} to ${to} for ${date} not found`)
      }

      return Number(rate)
    } catch (error) {
      console.error(`[${this.name}] Failed to get historical rate:`, error)
      throw error
    }
  }
}

// Fallback exchange rates for SEA currencies (approximate)
const FALLBACK_RATES: Record<string, number> = {
  'USD_THB': 35.5,
  'USD_IDR': 15800,
  'USD_MYR': 4.65,
  'USD_SGD': 1.35,
  'USD_VND': 24000,
  'USD_PHP': 56.5,
  'USD_CNY': 7.25,
  'USD_EUR': 0.85,
  'USD_INR': 83.5,
  'THB_USD': 0.028,
  'IDR_USD': 0.000063,
  'MYR_USD': 0.215,
  'SGD_USD': 0.74,
  'VND_USD': 0.000042,
  'PHP_USD': 0.018,
  'CNY_USD': 0.138,
  'EUR_USD': 1.18,
  'INR_USD': 0.012
}

function getFallbackRate(from: SupportedCurrency, to: SupportedCurrency): number {
  if (from === to) return 1
  
  const directKey = `${from}_${to}`
  if (FALLBACK_RATES[directKey]) {
    return FALLBACK_RATES[directKey]
  }
  
  // Try reverse rate
  const reverseKey = `${to}_${from}`
  if (FALLBACK_RATES[reverseKey]) {
    return 1 / FALLBACK_RATES[reverseKey]
  }
  
  // Cross-conversion via USD
  const fromToUsd = FALLBACK_RATES[`${from}_USD`] || (from === 'USD' ? 1 : null)
  const usdToTarget = FALLBACK_RATES[`USD_${to}`] || (to === 'USD' ? 1 : null)
  
  if (fromToUsd && usdToTarget) {
    return fromToUsd * usdToTarget
  }
  
  console.warn(`No fallback rate available for ${from} to ${to}`)
  return 1 // Return 1:1 as last resort
}

// Main Currency Service
export class CurrencyService implements ExchangeRateService {
  private cache = new ExchangeRateCache()
  private providers: ExchangeRateProvider[] = []

  constructor() {
    // Initialize providers in order of preference
    this.providers = [
      new FixerProvider(),
      new ExchangeRateAPIProvider()
    ].filter(provider => provider.isAvailable())

    if (this.providers.length === 0) {
      console.warn('[CurrencyService] No exchange rate providers available, using fallback rates')
    }
  }

  async getCurrentRate(from: SupportedCurrency, to: SupportedCurrency): Promise<number> {
    if (from === to) return 1

    // Check cache first
    const cachedRate = this.cache.get(from, to)
    if (cachedRate !== null) {
      console.log(`[CurrencyService] Using cached rate ${from}→${to}: ${cachedRate}`)
      return cachedRate
    }

    // Try providers in order
    for (const provider of this.providers) {
      try {
        console.log(`[CurrencyService] Fetching ${from}→${to} from ${provider.name}`)
        const rate = await provider.getCurrentRate(from, to)
        
        // Cache the successful result
        this.cache.set(from, to, rate)
        console.log(`[CurrencyService] Got rate ${from}→${to}: ${rate} from ${provider.name}`)
        return rate
      } catch (error) {
        console.warn(`[CurrencyService] Provider ${provider.name} failed:`, error)
        continue
      }
    }

    // Fall back to static rates
    console.warn(`[CurrencyService] All providers failed, using fallback rate for ${from}→${to}`)
    const fallbackRate = getFallbackRate(from, to)
    this.cache.set(from, to, fallbackRate)
    return fallbackRate
  }

  async convertAmount(
    amount: number, 
    from: SupportedCurrency, 
    to: SupportedCurrency
  ): Promise<CurrencyConversion> {
    const rate = await this.getCurrentRate(from, to)
    const convertedAmount = Number((amount * rate).toFixed(2))
    
    return {
      from_currency: from,
      to_currency: to,
      amount,
      converted_amount: convertedAmount,
      exchange_rate: rate,
      rate_date: new Date().toISOString().split('T')[0],
      rate_source: this.providers.length > 0 ? this.providers[0].name : 'fallback'
    }
  }

  async getHistoricalRate(
    from: SupportedCurrency, 
    to: SupportedCurrency, 
    date: string
  ): Promise<number> {
    if (from === to) return 1

    // Check cache first
    const cachedRate = this.cache.get(from, to, date)
    if (cachedRate !== null) {
      return cachedRate
    }

    // Try providers that support historical rates
    for (const provider of this.providers) {
      if (provider.getHistoricalRate) {
        try {
          const rate = await provider.getHistoricalRate(from, to, date)
          this.cache.set(from, to, rate, date)
          return rate
        } catch (error) {
          console.warn(`[CurrencyService] Historical rate from ${provider.name} failed:`, error)
          continue
        }
      }
    }

    // Fall back to current rate for historical queries
    console.warn(`[CurrencyService] No historical rate available, using current rate for ${from}→${to}`)
    return this.getCurrentRate(from, to)
  }

  // Utility methods
  clearCache(): void {
    this.cache.clear()
  }

  // Get user's home currency from their profile
  async getUserHomeCurrency(userId: string): Promise<SupportedCurrency> {
    // TODO: Implement user preference lookup from database
    // For now, default to USD
    return 'USD'
  }

  // Format currency amount for display
  formatCurrency(amount: number, currency: SupportedCurrency): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    
    return formatter.format(amount)
  }

  // Validate currency code using centralized currency definitions
  isSupportedCurrency(currency: string): currency is SupportedCurrency {
    return currency in CURRENCY_SYMBOLS
  }
}

// Export singleton instance
export const currencyService = new CurrencyService()

// Export utility functions
export {
  FALLBACK_RATES,
  ExchangeRateCache
}