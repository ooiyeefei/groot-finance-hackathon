/**
 * V1 Enabled COGS Categories API (WITH REDIS CACHING)
 *
 * GET /api/v1/account-management/cogs-categories/enabled - Get only enabled categories
 * UPDATED: Added Redis-based caching with 30-minute TTL (2025-01-13)
 *
 * Purpose:
 * - Returns only active COGS categories for dropdowns and auto-categorization
 * - Filtered subset of all categories (excludes is_active: false)
 * - Used by invoice processing and transaction creation UIs
 *
 * North Star Architecture:
 * - Thin wrapper delegating to account-management.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserData } from '@/lib/db/supabase-server'
import { getEnabledCOGSCategories } from '@/domains/account-management/lib/account-management.service'
import { redisCategoryCache } from '@/lib/cache/redis-cache'

// GET - Retrieve only enabled COGS categories for dropdowns
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const userData = await getUserData(userId)

    if (!userData.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    const businessId = userData.business_id

    // Check cache first
    const cacheKey = `cogs-enabled-${businessId}`
    const cached = await redisCategoryCache.get(cacheKey)
    if (cached) {
      console.log(`[Enabled COGS Categories V1 API] Cache hit for business: ${businessId}`)
      return NextResponse.json({
        success: true,
        data: cached,
        meta: {
          cached: true,
          source: 'redis-cache'
        }
      })
    }

    console.log(`[Enabled COGS Categories V1 API] Cache miss, fetching from database for business: ${businessId}`)

    // Cache miss - fetch from database
    const categories = await getEnabledCOGSCategories(businessId)

    // Cache the result
    await redisCategoryCache.set(cacheKey, categories)

    console.log(`[Enabled COGS Categories V1 API] Found ${categories.length} enabled categories, cached for 30 minutes`)

    return NextResponse.json({
      success: true,
      data: categories,
      meta: {
        cached: false,
        source: 'database'
      }
    })

  } catch (error) {
    console.error('[Enabled COGS Categories V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
