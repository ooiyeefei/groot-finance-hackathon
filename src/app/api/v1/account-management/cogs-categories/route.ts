/**
 * V1 COGS Categories API (WITH REDIS CACHE INVALIDATION)
 *
 * GET /api/v1/account-management/cogs-categories - List all COGS categories
 * POST /api/v1/account-management/cogs-categories - Create new category (invalidates cache)
 * PUT /api/v1/account-management/cogs-categories - Update existing category (invalidates cache)
 * DELETE /api/v1/account-management/cogs-categories - Delete category (invalidates cache)
 * UPDATED: Added cache invalidation for mutations (2025-01-13)
 *
 * Purpose:
 * - Business configuration for Cost of Goods Sold categories
 * - Stored in businesses.custom_cogs_categories JSONB column
 * - Used by invoices and accounting entries for categorization
 *
 * North Star Architecture:
 * - Thin wrapper delegating to account-management.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import {
  getCOGSCategories,
  createCOGSCategory,
  updateCOGSCategory,
  deleteCOGSCategory,
  type CreateCOGSCategoryRequest,
  type UpdateCOGSCategoryRequest
} from '@/domains/account-management/lib/account-management.service'
import { redisCategoryCache } from '@/lib/cache/redis-cache'
import { withCache, apiCache, CACHE_TTL } from '@/lib/cache/api-cache'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

// GET - Retrieve all COGS categories for the business
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile from Convex (same pattern as expense categories)
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json({ success: false, error: 'Failed to get user profile' }, { status: 400 })
    }

    if (!userProfile.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    console.log('[COGS Categories V1 API] Fetching categories for business:', userProfile.business_id)

    // ✅ PERFORMANCE: Cache COGS categories with in-memory cache + existing Redis cache
    const categories = await withCache(
      userId,
      'cogs-categories',
      () => getCOGSCategories(userProfile.business_id),
      {
        params: { business_id: userProfile.business_id },
        ttlMs: CACHE_TTL.BUSINESS_SETTINGS
      }
    )

    console.log('[COGS Categories V1 API] Found', categories?.length || 0, 'categories')

    // Check management permissions from database (consistent with expense-claims API)
    const canManage = userProfile.role_permissions.manager || userProfile.role_permissions.finance_admin

    return withCacheHeaders(NextResponse.json({
      success: true,
      data: {
        categories,
        can_manage: canManage
      }
    }), 'stable')

  } catch (error) {
    console.error('[COGS Categories V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

// POST - Create a new COGS category
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile from Convex (same pattern as expense categories)
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json({ success: false, error: 'Failed to get user profile' }, { status: 400 })
    }

    if (!userProfile.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // Check management permissions from database (consistent with expense-claims API)
    const canManage = userProfile.role_permissions.manager || userProfile.role_permissions.finance_admin
    if (!canManage) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions to create COGS categories'
      }, { status: 403 })
    }

    const body: CreateCOGSCategoryRequest = await request.json()

    // Call service layer
    const newCategory = await createCOGSCategory(userProfile.business_id, body)

    // Invalidate both in-memory and Redis cache for this business
    apiCache.invalidate(userId, 'cogs-categories')
    await redisCategoryCache.invalidateBusinessCategories(userProfile.business_id)

    return NextResponse.json({
      success: true,
      data: newCategory
    })

  } catch (error) {
    console.error('[COGS Categories V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // Map specific errors to HTTP status codes
    if (errorMessage.includes('already exists')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 409 })
    }

    if (errorMessage.includes('required')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 })
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

// PUT - Update existing COGS category
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile from Convex (same pattern as expense categories)
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json({ success: false, error: 'Failed to get user profile' }, { status: 400 })
    }

    if (!userProfile.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // Check management permissions from database (consistent with expense-claims API)
    const canManage = userProfile.role_permissions.manager || userProfile.role_permissions.finance_admin
    if (!canManage) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions to update COGS categories'
      }, { status: 403 })
    }

    const body: UpdateCOGSCategoryRequest = await request.json()

    if (!body.id) {
      return NextResponse.json({
        success: false,
        error: 'Category ID is required for updates'
      }, { status: 400 })
    }

    // Call service layer
    const updatedCategory = await updateCOGSCategory(userProfile.business_id, body)

    // Invalidate both in-memory and Redis cache for this business
    apiCache.invalidate(userId, 'cogs-categories')
    await redisCategoryCache.invalidateBusinessCategories(userProfile.business_id)

    return NextResponse.json({
      success: true,
      data: updatedCategory
    })

  } catch (error) {
    console.error('[COGS Categories V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // Map specific errors to HTTP status codes
    if (errorMessage.includes('not found')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 })
    }

    if (errorMessage.includes('required')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 })
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

// DELETE - Delete existing COGS category
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile from Convex (same pattern as expense categories)
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json({ success: false, error: 'Failed to get user profile' }, { status: 400 })
    }

    if (!userProfile.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // Check management permissions from database (consistent with expense-claims API)
    const canManage = userProfile.role_permissions.manager || userProfile.role_permissions.finance_admin
    if (!canManage) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient permissions to delete COGS categories'
      }, { status: 403 })
    }

    const body: { id: string } = await request.json()

    if (!body.id) {
      return NextResponse.json({
        success: false,
        error: 'Category ID is required for deletion'
      }, { status: 400 })
    }

    // Call service layer
    await deleteCOGSCategory(userProfile.business_id, body.id)

    // Invalidate both in-memory and Redis cache for this business
    apiCache.invalidate(userId, 'cogs-categories')
    await redisCategoryCache.invalidateBusinessCategories(userProfile.business_id)

    return NextResponse.json({
      success: true,
      data: { deleted_id: body.id }
    })

  } catch (error) {
    console.error('[COGS Categories V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // Map specific errors to HTTP status codes
    if (errorMessage.includes('not found')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 404 })
    }

    if (errorMessage.includes('required')) {
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 })
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
