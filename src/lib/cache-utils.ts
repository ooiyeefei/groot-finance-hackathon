/**
 * Cache utilities for localStorage management
 */

export const cacheKeys = {
  BUSINESS_PROFILE: 'business-profile',
  USER_ROLE: 'user-role',
  SIDEBAR_EXPANDED: 'sidebar-expanded',
} as const

/**
 * Clear user role cache - use when user roles are updated
 */
export function clearUserRoleCache(): void {
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
 * Get cached user role
 */
export function getCachedUserRole() {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(cacheKeys.USER_ROLE)
      return cached ? JSON.parse(cached) : null
    } catch (error) {
      console.warn('Failed to parse cached user role:', error)
      return null
    }
  }
  return null
}

/**
 * Cache user role
 */
export function cacheUserRole(role: any): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(cacheKeys.USER_ROLE, JSON.stringify(role))
    } catch (error) {
      console.warn('Failed to cache user role:', error)
    }
  }
}