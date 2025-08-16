/**
 * Simple in-memory rate limiter for API endpoints
 * In production, use Redis or another distributed cache
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

class RateLimiter {
  private requests = new Map<string, RateLimitEntry>()
  private windowMs: number
  private maxRequests: number

  constructor(windowMs: number = 60000, maxRequests: number = 10) { // 10 requests per minute by default
    this.windowMs = windowMs
    this.maxRequests = maxRequests
    
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  public isRateLimited(identifier: string): boolean {
    const now = Date.now()
    const entry = this.requests.get(identifier)

    // If no entry exists or window has expired, create new entry
    if (!entry || now >= entry.resetTime) {
      this.requests.set(identifier, {
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
    const entry = this.requests.get(identifier)
    if (!entry || Date.now() >= entry.resetTime) {
      return this.maxRequests
    }
    return Math.max(0, this.maxRequests - entry.count)
  }

  public getResetTime(identifier: string): number {
    const entry = this.requests.get(identifier)
    return entry?.resetTime || Date.now()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.requests.entries()) {
      if (now >= entry.resetTime) {
        this.requests.delete(key)
      }
    }
  }
}

// Rate limiter instances for different endpoints
export const uploadRateLimiter = new RateLimiter(60000, 5) // 5 uploads per minute
export const processRateLimiter = new RateLimiter(60000, 3) // 3 processing requests per minute
export const apiRateLimiter = new RateLimiter(60000, 30) // 30 API requests per minute

// Helper function to get client identifier
export function getClientIdentifier(request: Request, userId?: string): string {
  // Use userId if available (authenticated requests)
  if (userId) {
    return `user:${userId}`
  }
  
  // Fallback to IP address for unauthenticated requests
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = forwardedFor?.split(',')[0] || realIp || 'unknown'
  
  return `ip:${ip}`
}

// Middleware helper for rate limiting
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