/**
 * Vendor Name Normalizer
 * Feature: 007-duplicate-expense-detection
 *
 * Normalizes vendor names for comparison in duplicate detection.
 * Handles SE Asian business suffixes and common variations.
 */

/**
 * Normalize a vendor name for comparison
 * - Lowercase
 * - Trim whitespace
 * - Remove punctuation
 * - Remove common business suffixes (Sdn Bhd, Pte Ltd, etc.)
 */
export function normalizeVendorName(name: string | null | undefined): string {
  if (!name) return ''

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[.,\-_'"]/g, '') // Remove punctuation
    // Remove SE Asian and common business suffixes
    .replace(
      /\b(sdn bhd|sendirian berhad|bhd|berhad|pte ltd|pte|pt|co ltd|ltd|llc|inc|corp|corporation|company|co)\b/gi,
      ''
    )
    .trim()
}

/**
 * Check if two vendor names match (fuzzy comparison)
 */
export function vendorNamesMatch(
  name1: string | null | undefined,
  name2: string | null | undefined
): boolean {
  const normalized1 = normalizeVendorName(name1)
  const normalized2 = normalizeVendorName(name2)

  if (!normalized1 || !normalized2) return false

  return normalized1 === normalized2
}

/**
 * Check if amounts match within tolerance
 * Tolerance: +/-1% OR +/-1 unit (whichever is larger)
 */
export function amountsMatch(amount1: number, amount2: number): boolean {
  if (amount1 === amount2) return true

  const maxAmount = Math.max(amount1, amount2)
  const diff = Math.abs(amount1 - amount2)

  // +/-1% tolerance
  const percentTolerance = maxAmount * 0.01
  // +/-1 unit tolerance (for small amounts)
  const absoluteTolerance = 1

  return diff <= Math.max(percentTolerance, absoluteTolerance)
}

/**
 * Check if dates match within tolerance
 * For exact tier: same day only
 * For fuzzy tier: +/-1 day
 */
export function datesMatch(
  date1: string,
  date2: string,
  fuzzy: boolean = false
): boolean {
  if (date1 === date2) return true
  if (!fuzzy) return false

  // Parse YYYY-MM-DD format
  const d1 = new Date(date1 + 'T00:00:00Z')
  const d2 = new Date(date2 + 'T00:00:00Z')

  const diffDays = Math.abs(
    (d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)
  )

  return diffDays <= 1
}
