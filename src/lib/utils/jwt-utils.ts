/**
 * JWT Utility Functions
 * Provides safe JWT decoding and expiration checking without verification
 * Used for cache TTL calculation in native Clerk integration
 */

export interface JWTPayload {
  sub: string
  iss: string
  aud: string | string[]
  exp: number
  iat: number
  [key: string]: any
}

/**
 * Safely decode JWT payload without verification
 * Used only for extracting expiration time for caching purposes
 */
export function decodeJWTPayload(token: string): JWTPayload | null {
  try {
    if (!token || typeof token !== 'string') {
      return null
    }

    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    // Decode the payload (second part of JWT)
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')

    // Add padding if necessary
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)

    // Decode base64
    const jsonPayload = Buffer.from(padded, 'base64').toString('utf-8')

    return JSON.parse(jsonPayload) as JWTPayload
  } catch (error) {
    console.warn('[JWT Utils] Failed to decode JWT payload:', error)
    return null
  }
}

/**
 * Get JWT expiration time in milliseconds from Unix timestamp
 */
export function getJWTExpirationMs(token: string): number | null {
  const payload = decodeJWTPayload(token)
  if (!payload || !payload.exp) {
    return null
  }

  // Convert Unix timestamp to milliseconds
  return payload.exp * 1000
}

/**
 * Check if JWT token is expired or will expire within buffer time
 */
export function isJWTExpiredOrNearExpiry(token: string, bufferMs: number = 30000): boolean {
  const expirationMs = getJWTExpirationMs(token)
  if (!expirationMs) {
    // If we can't determine expiration, consider it expired for safety
    return true
  }

  const now = Date.now()
  const timeUntilExpiryMs = expirationMs - now

  return timeUntilExpiryMs <= bufferMs
}

/**
 * Calculate appropriate TTL for JWT token based on its actual expiration
 */
export function calculateJWTCacheTTL(token: string, bufferMs: number = 30000): number | null {
  const expirationMs = getJWTExpirationMs(token)
  if (!expirationMs) {
    return null
  }

  const now = Date.now()
  const timeUntilExpiryMs = expirationMs - now

  // Return TTL that respects the actual expiration minus buffer
  return Math.max(0, timeUntilExpiryMs - bufferMs)
}

/**
 * Get human-readable expiration info for debugging
 */
export function getJWTExpirationInfo(token: string): {
  expirationMs: number | null
  expirationDate: Date | null
  isExpired: boolean
  timeUntilExpiryMs: number | null
  timeUntilExpirySeconds: number | null
} {
  const expirationMs = getJWTExpirationMs(token)
  const now = Date.now()

  if (!expirationMs) {
    return {
      expirationMs: null,
      expirationDate: null,
      isExpired: true,
      timeUntilExpiryMs: null,
      timeUntilExpirySeconds: null
    }
  }

  const timeUntilExpiryMs = expirationMs - now

  return {
    expirationMs,
    expirationDate: new Date(expirationMs),
    isExpired: timeUntilExpiryMs <= 0,
    timeUntilExpiryMs,
    timeUntilExpirySeconds: Math.floor(timeUntilExpiryMs / 1000)
  }
}