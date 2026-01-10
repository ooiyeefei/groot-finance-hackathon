/**
 * Number formatting utilities for consistent display across the application.
 * All large numbers should use comma separators for readability.
 */

/**
 * Format a number with comma separators (e.g., 101596428 → "101,596,428")
 * @param value - The number to format
 * @param decimals - Number of decimal places (optional, defaults to no forced decimals)
 * @returns Formatted string with comma separators
 */
export function formatNumber(
  value: number | string | null | undefined,
  decimals?: number
): string {
  if (value === null || value === undefined || value === '') {
    return '0'
  }

  const num = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(num)) {
    return '0'
  }

  // Use toLocaleString for proper comma formatting
  if (decimals !== undefined) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })
  }

  return num.toLocaleString('en-US')
}

/**
 * Currency symbols map for Southeast Asian and common currencies
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  THB: '฿',
  SGD: 'S$',
  MYR: 'RM',
  IDR: 'Rp',
  VND: '₫',
  PHP: '₱',
  CNY: '¥',
  JPY: '¥'
}

/**
 * Format a number as currency with symbol and comma separators
 * @param value - The amount to format
 * @param currency - Currency code (e.g., 'USD', 'THB', 'SGD')
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted currency string (e.g., "$1,234.56" or "฿1,234.56")
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency: string = 'SGD',
  decimals: number = 2
): string {
  const formattedNumber = formatNumber(value, decimals)
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] || currency + ' '

  return `${symbol}${formattedNumber}`
}

/**
 * Format a compact number for large values (e.g., 1.5M, 2.3K)
 * @param value - The number to format
 * @returns Compact formatted string
 */
export function formatCompactNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '0'
  }

  const num = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(num)) {
    return '0'
  }

  return num.toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  })
}
