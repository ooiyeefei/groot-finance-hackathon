/**
 * User Role V1 API (OPTIMIZED with caching)
 * GET - Returns current user's role and permission information
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { getUserRole } from '@/domains/users/lib/user.service'

// In-memory cache with 5-minute TTL
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const roleCache = new Map<string, { data: any; timestamp: number }>()

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

    // PERFORMANCE FIX: Check cache first to avoid repeated API calls on navigation
    const cached = roleCache.get(userId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[Role API] Cache hit for user:', userId)
      return NextResponse.json({
        success: true,
        data: cached.data,
        meta: {
          cached: true,
          duration_ms: 0
        }
      })
    }

    const startTime = Date.now()
    console.log('[Role API] Cache miss, fetching role data for user:', userId)

    const roleInfo = await getUserRole()

    // Cache the result
    roleCache.set(userId, {
      data: roleInfo,
      timestamp: Date.now()
    })

    const duration = Date.now() - startTime
    console.log(`[Role API] Role data fetched and cached in ${duration}ms`)

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
 */
function clearRoleCache(userId: string) {
  roleCache.delete(userId)
  console.log('[Role API] Cache cleared for user:', userId)
}
