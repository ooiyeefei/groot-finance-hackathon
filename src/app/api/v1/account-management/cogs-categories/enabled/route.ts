/**
 * V1 Enabled COGS Categories API (WITH REDIS CACHING)
 *
 * GET /api/v1/account-management/cogs-categories/enabled - Get only enabled categories
 * UPDATED: Migrated to Convex - uses authenticated user's businessId (2025-01-02)
 *
 * Purpose:
 * - Returns only active COGS categories for dropdowns and auto-categorization
 * - Filtered subset of all categories (excludes is_active: false)
 * - Used by invoice processing and transaction creation UIs
 *
 * Architecture:
 * - Convex is the single source of truth for business context
 * - No Supabase dependency - businessId comes from authenticated Convex user
 * - Redis caching by Clerk userId (not business UUID)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getEnabledCOGSCategories } from '@/domains/account-management/lib/account-management.service'
import { redisCategoryCache } from '@/lib/cache/redis-cache'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

// GET - Retrieve only enabled COGS categories for dropdowns
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check cache first (keyed by Clerk userId - Convex resolves businessId internally)
    const cacheKey = `cogs-enabled-${userId}`
    const cached = await redisCategoryCache.get(cacheKey)
    if (cached) {
      console.log(`[Enabled COGS Categories V1 API] Cache hit for user: ${userId}`)
      return withCacheHeaders(NextResponse.json({
        success: true,
        data: cached,
        meta: {
          cached: true,
          source: 'redis-cache'
        }
      }), 'stable')
    }

    console.log(`[Enabled COGS Categories V1 API] Cache miss, fetching from Convex`)

    // Fetch from Convex - businessId is resolved from authenticated user internally
    const categories = await getEnabledCOGSCategories()

    // Cache the result
    await redisCategoryCache.set(cacheKey, categories)

    console.log(`[Enabled COGS Categories V1 API] Found ${categories.length} enabled categories, cached for 30 minutes`)

    return withCacheHeaders(NextResponse.json({
      success: true,
      data: categories,
      meta: {
        cached: false,
        source: 'convex'
      }
    }), 'stable')

  } catch (error) {
    console.error('[Enabled COGS Categories V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
