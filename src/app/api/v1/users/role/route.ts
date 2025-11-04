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
    const roleInfo = await getUserRole()

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
    console.error('[User Role V1 API] Unexpected error:', error)

    if (error instanceof Error && error.message.includes('not authenticated')) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

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
