/**
 * Currency Display Helper
 *
 * Converts financial amounts to a display currency using the current exchange rate.
 * Used by all financial tools to add optional multi-currency display.
 * Always uses today's rate for consistency (per spec clarification).
 */

import { currencyService } from '@/lib/services/currency-service'
import type { SupportedCurrency } from '@/lib/types/currency'
import { roundCurrency } from '@/lib/utils/format-number'

export interface CurrencyDisplayResult {
  originalAmount: number
  convertedAmount: number
  displayCurrency: string
  exchangeRate: number
  homeCurrency: string
}

/**
 * Convert a single amount from home currency to display currency.
 * Returns null if conversion fails (unsupported currency, no rate available).
 */
export async function convertForDisplay(
  amount: number,
  homeCurrency: string,
  displayCurrency: string
): Promise<CurrencyDisplayResult | null> {
  if (!displayCurrency || displayCurrency === homeCurrency) return null

  try {
    const conversion = await currencyService.convertAmount(
      amount,
      homeCurrency as SupportedCurrency,
      displayCurrency as SupportedCurrency
    )
    return {
      originalAmount: amount,
      convertedAmount: roundCurrency(conversion.converted_amount),
      displayCurrency,
      exchangeRate: conversion.exchange_rate,
      homeCurrency,
    }
  } catch {
    return null
  }
}

/**
 * Enrich a result object with converted amounts for all numeric fields.
 * Adds a `_converted` suffix field for each converted value.
 */
export async function enrichWithCurrency(
  data: Record<string, any>,
  numericFields: string[],
  homeCurrency: string,
  displayCurrency: string
): Promise<Record<string, any>> {
  if (!displayCurrency || displayCurrency === homeCurrency) return data

  const enriched: Record<string, any> = { ...data, displayCurrency }

  try {
    const rate = await currencyService.getCurrentRate(
      homeCurrency as SupportedCurrency,
      displayCurrency as SupportedCurrency
    )
    enriched.exchangeRate = rate

    for (const field of numericFields) {
      if (typeof data[field] === 'number') {
        enriched[`${field}_converted`] = roundCurrency(data[field] * rate)
      }
    }
  } catch {
    // If conversion fails, return data without conversion
  }

  return enriched
}
