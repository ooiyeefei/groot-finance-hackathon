/**
 * LHDN Decimal Formatting — e-Invoice Compliance
 *
 * LHDN requires specific decimal formatting for monetary values:
 * - At least 1 decimal place
 * - No trailing zeros beyond what's meaningful
 * - Maximum precision: no requirement specified, but 2 decimal places is standard
 *
 * Reference: GitHub #218
 */

/**
 * Format a number to LHDN decimal format.
 *
 * Rules:
 * - At least 2 decimal places for monetary values
 * - No trailing zeros beyond 2 decimal places
 * - Examples: 100 → "100.00", 10.5 → "10.50", 10.123 → "10.12"
 */
export function formatLhdnDecimal(value: number, minDecimals = 2): string {
  // Round to 2 decimal places for monetary values
  const rounded = Math.round(value * 100) / 100
  return rounded.toFixed(minDecimals)
}

/**
 * Format a tax percentage to LHDN decimal format.
 *
 * Tax rates can have more precision:
 * - 6 → "6.00", 10 → "10.00", 0 → "0.00"
 */
export function formatLhdnTaxRate(rate: number): string {
  return rate.toFixed(2)
}

/**
 * Format a quantity to LHDN decimal format.
 *
 * Quantities use 2 decimal places minimum.
 */
export function formatLhdnQuantity(qty: number): string {
  return qty.toFixed(2)
}
