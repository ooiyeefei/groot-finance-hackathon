/**
 * Rate Limiting System for FinanSEAL API
 *
 * Simple in-memory rate limiter with configurable limits per endpoint.
 * For production, consider Redis-based solution for distributed environments.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  keyGenerator?: (request: NextRequest) => Promise<string> // Custom key generator
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store - for production, use Redis
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Default rate limit configurations for different endpoint types
 */
export const RATE_LIMIT_CONFIGS = {
  // Strict limits for auth-related endpoints
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5 // 5 attempts per 15 minutes
  },

  // Medium limits for state-changing operations
  MUTATION: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30 // 30 requests per minute
  },

  // More lenient for read operations
  QUERY: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100 // 100 requests per minute
  },

  // Strict limits for expensive operations (document processing, etc.)
  EXPENSIVE: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10 // 10 requests per minute
  },

  // Very strict for admin operations
  ADMIN: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20 // 20 requests per minute
  }
} as const

/**
 * Generate unified rate limit key combining user ID and IP address
 * This prevents rate limit bypass by switching between authenticated/unauthenticated requests
 */
async function generateDefaultKey(request: NextRequest): Promise<string> {
  const { userId } = await auth()
  const ip = getClientIP(request)

  // SECURITY FIX: Use combined key to prevent bypass attacks
  // Both authenticated and unauthenticated requests from same IP share limits
  if (userId) {
    return `combined:user:${userId}:ip:${ip}`
  } else {
    return `combined:ip:${ip}`
  }
}

/**
 * Extract client IP address with proper header precedence and validation
 */
function getClientIP(request: NextRequest): string {
  // Trust proxy headers in order of reliability
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfIp = request.headers.get('cf-connecting-ip')

  let ip = 'unknown'

  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, get the leftmost (original client)
    ip = forwardedFor.split(',')[0].trim()
  } else if (realIp) {
    ip = realIp.trim()
  } else if (cfIp) {
    ip = cfIp.trim()
  }

  // Validate IP format to prevent injection
  if (ip !== 'unknown' && !isValidIP(ip)) {
    console.warn('[Rate Limit] Invalid IP detected, using fallback:', ip)
    ip = 'unknown'
  }

  return ip
}

/**
 * Validate IP address format (IPv4 and IPv6)
 */
function isValidIP(ip: string): boolean {
  // IPv4 regex
  const ipv4Regex = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/

  // IPv6 regex (simplified)
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/

  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

/**
 * Rate limiting middleware
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  try {
    const key = config.keyGenerator
      ? await config.keyGenerator(request)
      : await generateDefaultKey(request)

    const now = Date.now()
    const windowStart = now - config.windowMs

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key)

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + config.windowMs
      }
      rateLimitStore.set(key, entry)
      return null // Allow request
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      const remainingTime = Math.ceil((entry.resetTime - now) / 1000)

      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded',
          message: `Too many requests. Try again in ${remainingTime} seconds.`,
          retryAfter: remainingTime
        },
        {
          status: 429,
          headers: {
            'Retry-After': remainingTime.toString(),
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(entry.resetTime / 1000).toString()
          }
        }
      )
    }

    // Increment counter
    entry.count++
    rateLimitStore.set(key, entry)

    return null // Allow request
  } catch (error) {
    // ✅ FAIL-CLOSED: Block request on any rate limiting error
    console.error('[Rate Limit] Error - BLOCKING REQUEST:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Rate limiting system error',
        message: 'Request blocked due to rate limiting system failure'
      },
      { status: 503 } // Service Unavailable
    )
  }
}

/**
 * Convenience wrapper for common rate limiting patterns
 */
export const createRateLimiter = (config: RateLimitConfig) => {
  return (request: NextRequest) => rateLimit(request, config)
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  auth: createRateLimiter(RATE_LIMIT_CONFIGS.AUTH),
  mutation: createRateLimiter(RATE_LIMIT_CONFIGS.MUTATION),
  query: createRateLimiter(RATE_LIMIT_CONFIGS.QUERY),
  expensive: createRateLimiter(RATE_LIMIT_CONFIGS.EXPENSIVE),
  admin: createRateLimiter(RATE_LIMIT_CONFIGS.ADMIN)
}

/**
 * Business-specific rate limiting (per business context)
 */
export const createBusinessRateLimiter = (config: RateLimitConfig) => {
  return createRateLimiter({
    ...config,
    keyGenerator: async (request: NextRequest) => {
      const { userId } = await auth()
      const businessId = request.headers.get('x-business-id') ||
        request.nextUrl.searchParams.get('businessId') || 'default'

      return userId ? `business:${businessId}:user:${userId}` : await generateDefaultKey(request)
    }
  })
}

/**
 * Rate limiting decorator for API routes
 */
export function withRateLimit<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
  rateLimiter: (request: NextRequest) => Promise<NextResponse | null>
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest

    // Apply rate limiting
    const rateLimitResponse = await rateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Continue with original handler
    return handler(...args)
  }
}

/**
 * BACKWARDS COMPATIBILITY HELPERS
 * For smooth migration from rate-limiter.ts
 */

/**
 * Get client identifier for rate limiting (combined userId and IP)
 * SECURITY FIX: Use unified approach to prevent bypass attacks
 */
export function getClientIdentifier(request: NextRequest | Request, userId?: string): string {
  const ip = getClientIPFromRequest(request)

  // SECURITY FIX: Use combined key to prevent bypass attacks
  // Both authenticated and unauthenticated requests from same IP share limits
  if (userId) {
    return `combined:user:${userId}:ip:${ip}`
  } else {
    return `combined:ip:${ip}`
  }
}

/**
 * Extract client IP from request (helper for backwards compatibility)
 */
function getClientIPFromRequest(request: NextRequest | Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfIp = request.headers.get('cf-connecting-ip')

  let ip = 'unknown'

  if (forwardedFor) {
    ip = forwardedFor.split(',')[0].trim()
  } else if (realIp) {
    ip = realIp.trim()
  } else if (cfIp) {
    ip = cfIp.trim()
  }

  // Validate IP format to prevent injection
  if (ip !== 'unknown' && !isValidIP(ip)) {
    console.warn('[Rate Limit] Invalid IP detected in backwards compatibility helper, using fallback:', ip)
    ip = 'unknown'
  }

  return ip
}

/**
 * Class-based rate limiter for backwards compatibility
 * Migrates old RateLimiter class usage to new rate-limit.ts system
 */
export class RateLimiter {
  private windowMs: number
  private maxRequests: number
  private store = new Map<string, RateLimitEntry>()

  constructor(windowMs: number = 60000, maxRequests: number = 10) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests

    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  public isRateLimited(identifier: string): boolean {
    const now = Date.now()
    const entry = this.store.get(identifier)

    // If no entry exists or window has expired, create new entry
    if (!entry || now >= entry.resetTime) {
      this.store.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      })
      return false
    }

    // If within window, increment count
    entry.count++

    // Check if limit exceeded
    return entry.count > this.maxRequests
  }

  public getRemainingRequests(identifier: string): number {
    const entry = this.store.get(identifier)
    if (!entry || Date.now() >= entry.resetTime) {
      return this.maxRequests
    }
    return Math.max(0, this.maxRequests - entry.count)
  }

  public getResetTime(identifier: string): number {
    const entry = this.store.get(identifier)
    return entry?.resetTime || Date.now()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        this.store.delete(key)
      }
    }
  }
}

/**
 * Apply rate limiting and return result with headers
 * Backwards compatibility helper for old api-middleware.ts pattern
 */
export function applyRateLimit(
  rateLimiter: RateLimiter,
  identifier: string
): { allowed: boolean; headers: Record<string, string> } {
  const isLimited = rateLimiter.isRateLimited(identifier)
  const remaining = rateLimiter.getRemainingRequests(identifier)
  const resetTime = rateLimiter.getResetTime(identifier)

  return {
    allowed: !isLimited,
    headers: {
      'X-RateLimit-Limit': rateLimiter['maxRequests'].toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString()
    }
  }
}

/**
 * Pre-configured rate limiter instances (migrated from rate-limiter.ts)
 */
export const uploadRateLimiter = new RateLimiter(60000, 5) // 5 uploads per minute
export const processRateLimiter = new RateLimiter(60000, 3) // 3 processing requests per minute
export const apiRateLimiter = new RateLimiter(60000, 30) // 30 API requests per minute
export const analyticsRateLimiter = new RateLimiter(60000, 10) // 10 analytics requests per minute
export const dashboardRateLimiter = new RateLimiter(60000, 15) // 15 dashboard requests per minute
export const reportsRateLimiter = new RateLimiter(300000, 5) // 5 reports per 5 minutes (expensive)
export const teamManagementRateLimiter = new RateLimiter(60000, 20) // 20 team requests per minute
export const realtimeRateLimiter = new RateLimiter(60000, 30) // 30 real-time requests per minute