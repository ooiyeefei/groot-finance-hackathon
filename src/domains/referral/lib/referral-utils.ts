/**
 * Referral utility functions
 *
 * Code generation from Clerk userId and earning calculation.
 */

/**
 * Generate a referral code from a Clerk user ID.
 * Format: GR-FIN-XXXXX where XXXXX = first 5 chars after "user_" prefix.
 *
 * Clerk user IDs have format: user_2abc123def...
 * We take chars after "user_" to get the unique alphanumeric part.
 */
export function generateReferralCode(clerkUserId: string, length = 5): string {
  // Strip the "user_" prefix if present
  const raw = clerkUserId.startsWith('user_')
    ? clerkUserId.slice(5)
    : clerkUserId

  const suffix = raw.slice(0, length).toUpperCase()
  return `GR-FIN-${suffix}`
}

/**
 * Generate referral code with collision avoidance.
 * If the base code collides, extend the suffix by one char at a time.
 */
export function generateUniqueReferralCode(
  clerkUserId: string,
  existingCodes: Set<string>
): string {
  for (let len = 5; len <= 8; len++) {
    const code = generateReferralCode(clerkUserId, len)
    if (!existingCodes.has(code)) return code
  }
  // Fallback: append random chars (extremely unlikely)
  const base = generateReferralCode(clerkUserId, 5)
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `${base}${rand}`
}

/**
 * Tiered commission based on code type and plan.
 * Customer: Starter RM 80, Pro RM 200.
 * Reseller: Starter RM 300, Pro RM 800.
 * Monthly plans are not commissionable (RM 0).
 */
export function calculateEarning(planName: string, isAnnual = true, codeType?: string): number {
  if (!isAnnual) return 0
  if (codeType === 'partner_reseller') {
    return planName === 'pro' ? 800 : 300
  }
  return planName === 'pro' ? 200 : 80
}

/**
 * Get commission range and discount amount by code type.
 */
export function getCommissionRange(codeType?: string): { min: number; max: number; discount: number } {
  if (codeType === 'partner_reseller') {
    return { min: 300, max: 800, discount: 200 }
  }
  return { min: 80, max: 200, discount: 100 }
}

/**
 * Build the full referral URL from a code.
 */
export function buildReferralUrl(code: string): string {
  const baseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || 'https://finance.hellogroot.com')
  return `${baseUrl}/sign-up?ref=${code}`
}

/**
 * Build the pre-composed share message for referral.
 */
export function buildShareMessage(code: string, codeType?: string): string {
  const url = buildReferralUrl(code)
  const discount = codeType === 'partner_reseller' ? 'RM 200' : 'RM 100'
  return `Try Groot Finance for your business! Use my referral code ${code} to get ${discount} off your annual plan. Sign up here: ${url}`
}

/**
 * Referral status display labels and colors.
 */
export const REFERRAL_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  signed_up: { label: 'Signed Up', color: 'text-muted-foreground' },
  trial: { label: 'In Trial', color: 'text-yellow-600' },
  paid: { label: 'Paying', color: 'text-green-600' },
  upgraded: { label: 'Upgraded', color: 'text-blue-600' },
  downgraded: { label: 'Downgraded', color: 'text-orange-500' },
  churned: { label: 'Churned', color: 'text-red-500' },
  cancelled: { label: 'Cancelled', color: 'text-red-600' },
  expired: { label: 'Expired', color: 'text-muted-foreground' },
}

/** Check if attribution window (90 days) has expired */
export function isAttributionExpired(capturedAt: number): boolean {
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
  return Date.now() > capturedAt + NINETY_DAYS_MS
}
