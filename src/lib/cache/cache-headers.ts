/**
 * HTTP Cache-Control header utilities for API routes
 *
 * Adds browser-level caching to reduce network requests.
 * Works alongside the server-side ApiCache (api-cache.ts) which reduces DB load.
 *
 * Cache strategy:
 * - private: Only cached in the user's browser (not CDN/proxy), since all data is auth-gated
 * - max-age: How long the browser considers the response fresh
 * - stale-while-revalidate: Serve stale data while fetching fresh copy in background
 *
 * When NOT to cache (mutations, real-time data, sensitive operations):
 * - POST/PUT/DELETE responses
 * - Auth token endpoints
 * - Webhook handlers
 * - File downloads (already handled by CloudFront)
 */

import { NextResponse } from 'next/server'

type CacheTier = 'volatile' | 'standard' | 'stable' | 'static' | 'none'

const CACHE_TIERS: Record<CacheTier, string> = {
  // Data that changes frequently (expense claims, invoices during approval flows)
  volatile: 'private, max-age=60, stale-while-revalidate=120',
  // Standard data (list endpoints, dashboard analytics)
  standard: 'private, max-age=180, stale-while-revalidate=300',
  // Rarely changing data (categories, business settings, user profile)
  stable: 'private, max-age=900, stale-while-revalidate=1800',
  // Almost never changes (currency list, schemas, holiday lists)
  static: 'private, max-age=1800, stale-while-revalidate=3600',
  // Never cache (mutations, auth, sensitive)
  none: 'no-store, no-cache, must-revalidate',
}

/**
 * Add Cache-Control header to a NextResponse based on data volatility tier.
 * Call this on successful GET responses only.
 */
export function withCacheHeaders(response: NextResponse, tier: CacheTier): NextResponse {
  response.headers.set('Cache-Control', CACHE_TIERS[tier])
  return response
}

/**
 * Create a cached JSON response in one call.
 * Convenience wrapper for the common pattern:
 *   return cachedJsonResponse({ success: true, data }, 'standard')
 */
export function cachedJsonResponse(
  body: unknown,
  tier: CacheTier,
  status: number = 200
): NextResponse {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', CACHE_TIERS[tier])
  return response
}

/**
 * Endpoint-to-tier mapping for reference.
 * Use this as a guide when adding cache headers to routes.
 */
export const ENDPOINT_CACHE_MAP: Record<string, CacheTier> = {
  // Volatile (1 min) - actively changing data
  'expense-claims/list': 'volatile',
  'expense-claims/detail': 'volatile',
  'expense-submissions': 'volatile',
  'accounting-entries': 'volatile',
  'analytics/dashboards': 'volatile',
  'analytics/monitoring': 'volatile',
  'billing/subscription': 'volatile',
  'billing/usage': 'volatile',
  'users/role': 'volatile',
  'users/team': 'volatile',

  // Standard (3 min) - moderate change frequency
  'invoices/list': 'standard',
  'invoices/detail': 'standard',
  'expense-claims/analytics': 'standard',
  'expense-claims/reports': 'standard',
  'expense-claims/duplicate-report': 'standard',
  'users/profile': 'standard',
  'billing/invoices': 'standard',
  'account-management/businesses': 'standard',
  'account-management/businesses/context': 'standard',

  // Stable (15 min) - rarely changes
  'expense-claims/categories': 'stable',
  'account-management/cogs-categories': 'stable',
  'account-management/businesses/profile': 'stable',
  'billing/catalog': 'stable',
  'email-preferences': 'stable',

  // Static (30 min) - almost never changes
  'utils/currency/list': 'static',
  'shared/schemas': 'static',
  'leave-management/holidays': 'static',
  'onboarding/trial-status': 'stable',
}
