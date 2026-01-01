/**
 * Country and Currency Data Utility
 *
 * Provides comprehensive lists of countries and currencies using
 * i18n-iso-countries and currency-codes libraries.
 */

import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import currencyCodes from 'currency-codes'

// Register English locale for country names
countries.registerLocale(enLocale)

export interface Country {
  code: string // ISO 3166-1 alpha-2
  name: string
  currency: string // ISO 4217 currency code
}

export interface Currency {
  code: string // ISO 4217
  name: string
  symbol?: string
}

// Country to primary currency mapping (for major countries)
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  // Southeast Asia (primary markets)
  SG: 'SGD',
  MY: 'MYR',
  TH: 'THB',
  ID: 'IDR',
  VN: 'VND',
  PH: 'PHP',
  // East Asia
  CN: 'CNY',
  JP: 'JPY',
  KR: 'KRW',
  HK: 'HKD',
  TW: 'TWD',
  // South Asia
  IN: 'INR',
  BD: 'BDT',
  PK: 'PKR',
  LK: 'LKR',
  // Oceania
  AU: 'AUD',
  NZ: 'NZD',
  // Americas
  US: 'USD',
  CA: 'CAD',
  MX: 'MXN',
  BR: 'BRL',
  AR: 'ARS',
  // Europe
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  IE: 'EUR',
  PT: 'EUR',
  GR: 'EUR',
  FI: 'EUR',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  RU: 'RUB',
  UA: 'UAH',
  TR: 'TRY',
  // Middle East
  AE: 'AED',
  SA: 'SAR',
  QA: 'QAR',
  KW: 'KWD',
  BH: 'BHD',
  OM: 'OMR',
  IL: 'ILS',
  // Africa
  ZA: 'ZAR',
  NG: 'NGN',
  EG: 'EGP',
  KE: 'KES',
  MA: 'MAD',
}

/**
 * Get all countries with their details
 * Prioritizes Southeast Asian countries at the top of the list
 */
export function getAllCountries(): Country[] {
  const allCountryObjects = countries.getNames('en', { select: 'official' })

  // Priority countries (Southeast Asia first)
  const priorityOrder = ['SG', 'MY', 'TH', 'ID', 'VN', 'PH']

  const countryList: Country[] = Object.entries(allCountryObjects)
    .map(([code, name]) => ({
      code,
      name: name as string,
      currency: COUNTRY_CURRENCY_MAP[code] || 'USD', // Default to USD if not mapped
    }))
    .sort((a, b) => {
      // Priority countries first
      const aIndex = priorityOrder.indexOf(a.code)
      const bIndex = priorityOrder.indexOf(b.code)

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1

      // Then alphabetically
      return a.name.localeCompare(b.name)
    })

  return countryList
}

/**
 * Get commonly used currencies
 * Prioritizes Southeast Asian and major currencies
 */
export function getCommonCurrencies(): Currency[] {
  // Priority currencies (Southeast Asia + major world currencies)
  const priorityCodes = [
    'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', // SEA
    'USD', 'EUR', 'GBP', 'CNY', 'JPY',        // Major
    'AUD', 'CAD', 'CHF', 'HKD', 'INR',        // Other common
  ]

  const allCurrencies = currencyCodes.data
    .filter(c => c.code) // Filter out entries without code
    .map(c => ({
      code: c.code,
      name: c.currency,
      symbol: undefined, // currency-codes doesn't provide symbols
    }))

  // Sort with priority currencies first
  return allCurrencies.sort((a, b) => {
    const aIndex = priorityCodes.indexOf(a.code)
    const bIndex = priorityCodes.indexOf(b.code)

    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1

    return a.name.localeCompare(b.name)
  })
}

/**
 * Get currency by code
 */
export function getCurrencyByCode(code: string): Currency | undefined {
  const currency = currencyCodes.code(code)
  if (!currency) return undefined

  return {
    code: currency.code,
    name: currency.currency,
  }
}

/**
 * Get country by code
 */
export function getCountryByCode(code: string): Country | undefined {
  const name = countries.getName(code, 'en')
  if (!name) return undefined

  return {
    code,
    name,
    currency: COUNTRY_CURRENCY_MAP[code] || 'USD',
  }
}

/**
 * Get currency for a country code
 */
export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRY_CURRENCY_MAP[countryCode] || 'USD'
}
