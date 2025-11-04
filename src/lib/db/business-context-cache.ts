/**
 * Business Context & JWT Token Caching Layer
 * Redis-based distributed cache with in-memory fallback
 * Part of the hybrid architecture: Database as source of truth + Application layer caching
 *
 * MIGRATION: Switched from in-memory-only to Redis-based caching (2025-01-13)
 * - Provides distributed caching across serverless functions
 * - Automatic fallback to in-memory cache if Redis unavailable
 * - Maintains same external interface for backward compatibility
 */

import { createLogger } from '@/lib/utils/logger';
import { redisBusinessContextCache, redisJWTTokenCache } from '@/lib/cache/redis-cache';

const log = createLogger('Cache:BusinessContext');
const jwtLog = createLogger('Cache:JWT');

interface CacheEntry {
  data: {
    id: string
    business_id: string | null
    home_currency: string
    email: string
    full_name: string | null
  }
  timestamp: number
  ttl: number
}

/**
 * LEGACY: Old in-memory implementation (kept for reference)
 * Now using Redis-based implementation with automatic fallback
 */
// class BusinessContextCache { ... }

// Export Redis-based cache instance (maintains same interface)
export const businessContextCache = redisBusinessContextCache

/**
 * Cached version of getUserData with invalidation on business changes
 * UPDATED: Now async to support Redis operations
 */
export async function getCachedUserData(clerkUserId: string): Promise<{
  id: string
  business_id: string | null
  home_currency: string
  email: string
  full_name: string | null
}> {
  // Try cache first (Redis is async)
  const cached = await businessContextCache.get(clerkUserId)
  if (cached) {
    return cached
  }

  // Cache miss - get from database
  log.debug('Fetching from database');

  // Import here to avoid circular dependency
  const { getUserData } = await import('./supabase-server')
  const userData = await getUserData(clerkUserId)

  // Cache the result (Redis is async)
  await businessContextCache.set(clerkUserId, userData)

  return userData
}

/**
 * Invalidate cache when user switches business
 * UPDATED: Now async to support Redis operations
 */
export async function invalidateUserCache(clerkUserId: string): Promise<void> {
  await businessContextCache.invalidate(clerkUserId)
}

/**
 * JWT Token Cache Interface and Implementation
 * UPDATED: Now uses Redis-based caching with actual JWT expiration awareness
 * MIGRATION: Switched from in-memory-only to Redis-based caching (2025-01-13)
 */
interface JWTCacheEntry {
  token: string
  timestamp: number
  ttl: number // Calculated from actual JWT expiration
}

/**
 * LEGACY: Old in-memory implementation (kept for reference)
 * Now using Redis-based implementation with automatic fallback
 */
// class JWTTokenCache { ... }

// Export Redis-based JWT cache instance (maintains same interface)
export const jwtTokenCache = redisJWTTokenCache

/**
 * Get cached JWT token or fetch new one from Clerk
 * UPDATED: Now async to support Redis operations
 */
export async function getCachedJWTToken(clerkUserId: string): Promise<string | null> {
  // Try cache first (Redis is async)
  const cached = await jwtTokenCache.get(clerkUserId)
  if (cached) {
    return cached
  }

  // Cache miss - get from Clerk
  jwtLog.debug('Fetching from Clerk');

  try {
    // Import here to avoid circular dependency
    const { auth } = await import('@clerk/nextjs/server')
    const { getToken } = await auth()

    // Get default Clerk JWT for native Supabase integration
    // Supabase is configured to trust Clerk's JWT issuer directly
    // See: https://clerk.com/docs/guides/development/integrations/databases/supabase
    const jwtToken = await getToken()

    if (jwtToken) {
      // Validate JWT structure before caching
      const tokenParts = jwtToken.split('.')
      if (tokenParts.length === 3) {
        // Cache the token (Redis is async)
        await jwtTokenCache.set(clerkUserId, jwtToken)
        jwtLog.debug('Token cached successfully');
        return jwtToken
      } else {
        jwtLog.warn('Invalid JWT token structure');
      }
    }

    return jwtToken
  } catch (error) {
    jwtLog.error('Failed to get JWT token', error);
    return null
  }
}

/**
 * Invalidate JWT token cache when needed
 * UPDATED: Now async to support Redis operations
 */
export async function invalidateJWTTokenCache(clerkUserId: string): Promise<void> {
  await jwtTokenCache.invalidate(clerkUserId)
}