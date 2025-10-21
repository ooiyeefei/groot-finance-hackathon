/**
 * Enhanced Cache utilities for localStorage management with TTL and app-wide optimization
 */

export const cacheKeys = {
  BUSINESS_PROFILE: 'business-profile',
  USER_ROLE: 'user-role',
  SIDEBAR_EXPANDED: 'sidebar-expanded',
} as const

// Cache TTL: 5 minutes (matches server-side cache)
const CACHE_TTL = 5 * 60 * 1000

interface CacheEntry {
  data: any
  timestamp: number
  ttl?: number
}

/**
 * Enhanced cache storage with TTL support
 */
function setCacheWithTTL(key: string, data: any, ttl: number = CACHE_TTL): void {
  if (typeof window !== 'undefined') {
    try {
      const cacheEntry: CacheEntry = {
        data,
        timestamp: Date.now(),
        ttl
      }
      localStorage.setItem(key, JSON.stringify(cacheEntry))
    } catch (error) {
      console.warn(`Failed to cache ${key}:`, error)
    }
  }
}

/**
 * Enhanced cache retrieval with TTL validation
 */
function getCacheWithTTL(key: string): any | null {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(key)
      if (!cached) return null

      const cacheEntry: CacheEntry = JSON.parse(cached)
      const age = Date.now() - cacheEntry.timestamp
      const ttl = cacheEntry.ttl || CACHE_TTL

      // Check if cache is still valid
      if (age < ttl) {
        return cacheEntry.data
      }

      // Clear expired cache
      localStorage.removeItem(key)
      return null
    } catch (error) {
      console.warn(`Failed to parse cached ${key}:`, error)
      return null
    }
  }
  return null
}

/**
 * Clear user role cache - use when user roles are updated
 */
export function clearUserRoleCache(): void {
  if (typeof __PRIVATE_CLEAR_ROLE_CACHE_GLOBALLY !== 'undefined') {
    __PRIVATE_CLEAR_ROLE_CACHE_GLOBALLY()
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(cacheKeys.USER_ROLE)
      console.log('User role cache cleared')
    } catch (error) {
      console.warn('Failed to clear user role cache:', error)
    }
  }
}

/**
 * Clear business profile cache - use when business profile is updated
 */
export function clearBusinessProfileCache(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(cacheKeys.BUSINESS_PROFILE)
      console.log('Business profile cache cleared')
    } catch (error) {
      console.warn('Failed to clear business profile cache:', error)
    }
  }
}

/**
 * Clear all app caches
 */
export function clearAllAppCaches(): void {
  if (typeof window !== 'undefined') {
    try {
      Object.values(cacheKeys).forEach(key => {
        localStorage.removeItem(key)
      })
      console.log('All app caches cleared')
    } catch (error) {
      console.warn('Failed to clear app caches:', error)
    }
  }
}

/**
 * Get cached user role with TTL validation
 */
export function getCachedUserRole() {
  return getCacheWithTTL(cacheKeys.USER_ROLE)
}

/**
 * Cache user role with TTL
 */
export function cacheUserRole(role: any): void {
  setCacheWithTTL(cacheKeys.USER_ROLE, role)
}

/**
 * Enhanced role fetching with app-wide caching
 * Returns cached data if valid, otherwise fetches from API
 */
export async function fetchUserRoleWithCache(): Promise<any> {
  // Check cache first
  const cached = getCachedUserRole()
  if (cached) {
    console.log('[CacheUtils] Using cached user role data')
    return cached
  }

  console.log('[CacheUtils] Cache miss, fetching from API...')

  try {
    const response = await fetch('/api/v1/users/role')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()
    if (result.success) {
      // Cache the result with TTL
      cacheUserRole(result.data)
      console.log(`[CacheUtils] Role data cached (${result.meta?.duration_ms}ms, server cached: ${result.meta?.cached})`)
      return result.data
    } else {
      throw new Error(result.error || 'Failed to fetch role data')
    }
  } catch (error) {
    console.error('[CacheUtils] Error fetching role data:', error)
    throw error
  }
}