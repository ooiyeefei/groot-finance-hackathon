/**
 * User Role V1 API (OPTIMIZED with Redis-based caching)
 * GET - Returns current user's role and permission information
 * MIGRATION: Switched from in-memory to Redis-based caching (2025-01-13)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { getUserRole } from '@/domains/users/lib/user.service'
import { redisRoleCache } from '@/lib/cache/redis-cache'

// Cache TTL for reference (actual implementation in Redis cache)
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// GET /api/v1/users/role - Get current user role and permissions
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await rateLimiters.query(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Check Redis cache first to avoid repeated API calls on navigation
    const cached = await redisRoleCache.get(userId)
    if (cached) {
      return NextResponse.json({
        success: true,
        data: cached,
        meta: {
          cached: true,
          duration_ms: 0,
          source: 'redis-cache'
        }
      })
    }

    const startTime = Date.now()
    console.log('[User Role V1 API] DEBUG: Fetching role for clerkUserId=', userId)
    const roleInfo = await getUserRole()
    console.log('[User Role V1 API] DEBUG: Role fetched successfully for', userId, 'role=', roleInfo?.profile?.role)

    // Cache the result in Redis
    await redisRoleCache.set(userId, roleInfo)

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      data: roleInfo,
      meta: {
        cached: false,
        duration_ms: duration
      }
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Handle authentication errors
    console.error('[User Role V1 API] DEBUG: Error:', errorMessage)
    if (errorMessage.includes('not authenticated')) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Handle pre-onboarding state gracefully (user has no business/role yet)
    // These are expected errors for users who haven't completed onboarding
    const isPreOnboardingError =
      errorMessage.includes('No business found') ||
      errorMessage.includes('User has no business') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('No role found') ||
      errorMessage.includes('membership')

    if (isPreOnboardingError) {
      // Return 404 with clear code - expected for pre-onboarding users
      console.log('[User Role V1 API] User has no role/business - expected for pre-onboarding')
      return NextResponse.json(
        {
          success: false,
          error: 'No role found',
          code: 'NO_BUSINESS',
          message: 'Please complete onboarding to set up your business'
        },
        { status: 404 }
      )
    }

    // Unexpected errors - log and return 500
    console.error('[User Role V1 API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Clear role cache for a specific user (call when roles change)
 * Note: This function is available internally within this module
 * UPDATED: Now uses Redis-based cache invalidation
 *
 * NOT EXPORTED - Internal helper only (Next.js route files can only export HTTP methods)
 * If you need to clear cache from external modules, import redisRoleCache directly:
 * import { redisRoleCache } from '@/lib/cache/redis-cache'
 * await redisRoleCache.invalidate(userId)
 */
async function clearRoleCache(userId: string): Promise<void> {
  await redisRoleCache.invalidate(userId)
}
