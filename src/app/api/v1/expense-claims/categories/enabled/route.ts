/**
 * Enabled Expense Categories API v1 (WITH REDIS CACHING)
 * GET - Get only enabled categories for dropdowns and categorization
 * UPDATED: Added Redis-based caching with 30-minute TTL (2025-01-13)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserContextWithBusiness } from '@/domains/security/lib/rbac'
import { getEnabledCategories } from '@/domains/expense-claims/lib/expense-category.service'
import { redisCategoryCache } from '@/lib/cache/redis-cache'

/**
 * GET /api/v1/expense-claims/categories/enabled
 * Get only enabled categories for dropdowns and auto-categorization
 */
export async function GET(request: NextRequest) {
  try {
    // Get user context for business_id
    const userContext = await getCurrentUserContextWithBusiness()
    if (!userContext || !userContext.businessContext) {
      return NextResponse.json(
        { success: false, error: 'Failed to get user context' },
        { status: 400 }
      )
    }
    const businessId = userContext.businessContext.businessId

    // Check cache first
    const cacheKey = `expense-enabled-${businessId}`
    const cached = await redisCategoryCache.get(cacheKey)
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        meta: {
          cached: true,
          source: 'redis-cache'
        }
      })
    }

    // Cache miss - fetch from database
    const enabledCategories = await getEnabledCategories()

    // Cache the result
    await redisCategoryCache.set(cacheKey, enabledCategories)

    return NextResponse.json({
      success: true,
      data: enabledCategories,
      meta: {
        cached: false,
        source: 'database'
      }
    })
  } catch (error) {
    console.error('[API v1 GET /expense-claims/categories/enabled] Error:', error)

    // Handle authorization errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}
