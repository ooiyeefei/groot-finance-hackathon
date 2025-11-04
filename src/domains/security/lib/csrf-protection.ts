/**
 * CSRF Protection for FinanSEAL API
 *
 * Implements CSRF protection using the Synchronizer Token Pattern.
 * For invitation and team management endpoints.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import crypto from 'crypto'

// CSRF token storage - in production, use Redis or database
const csrfTokenStore = new Map<string, { token: string, expires: number }>()

// Token expiration time (1 hour)
const TOKEN_EXPIRES = 60 * 60 * 1000

// Cleanup expired tokens every 30 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of csrfTokenStore.entries()) {
    if (now > value.expires) {
      csrfTokenStore.delete(key)
    }
  }
}, 30 * 60 * 1000)

/**
 * Generate a cryptographically secure CSRF token
 */
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Get user key for CSRF token storage
 * Falls back to a session-based key if user is not authenticated
 */
async function getUserKey(request?: NextRequest): Promise<string | null> {
  try {
    const { userId } = await auth()
    if (userId) return userId

    // Fallback: Create a session-based key from IP and User-Agent for unauthenticated requests
    if (request) {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      const userAgent = request.headers.get('user-agent') || 'unknown'
      return `session-${Buffer.from(`${ip}-${userAgent}`).toString('base64').slice(0, 16)}`
    }

    return null
  } catch {
    // If auth fails, try to create session-based key
    if (request) {
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      const userAgent = request.headers.get('user-agent') || 'unknown'
      return `session-${Buffer.from(`${ip}-${userAgent}`).toString('base64').slice(0, 16)}`
    }
    return null
  }
}

/**
 * Generate and store a new CSRF token for the authenticated user or session
 */
export async function generateCSRFTokenForUser(request?: NextRequest): Promise<{ token: string | null, error?: string }> {
  try {
    const userKey = await getUserKey(request)
    if (!userKey) {
      return { token: null, error: 'Unable to create session key' }
    }

    const token = generateCSRFToken()
    const expires = Date.now() + TOKEN_EXPIRES

    csrfTokenStore.set(userKey, { token, expires })

    return { token }
  } catch (error) {
    console.error('[CSRF] Token generation error:', error)
    return { token: null, error: 'Failed to generate CSRF token' }
  }
}

/**
 * Validate CSRF token for the authenticated user or session
 */
export async function validateCSRFToken(providedToken: string, request?: NextRequest): Promise<{ valid: boolean, error?: string }> {
  try {
    const userKey = await getUserKey(request)
    if (!userKey) {
      return { valid: false, error: 'Unable to create session key' }
    }

    const storedData = csrfTokenStore.get(userKey)
    if (!storedData) {
      return { valid: false, error: 'No CSRF token found for session' }
    }

    // Check if token has expired
    if (Date.now() > storedData.expires) {
      csrfTokenStore.delete(userKey)
      return { valid: false, error: 'CSRF token has expired' }
    }

    // Constant-time comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(storedData.token)
    const providedBuffer = Buffer.from(providedToken)

    if (expectedBuffer.length !== providedBuffer.length) {
      return { valid: false, error: 'Invalid CSRF token' }
    }

    const valid = crypto.timingSafeEqual(expectedBuffer, providedBuffer)

    if (!valid) {
      return { valid: false, error: 'Invalid CSRF token' }
    }

    return { valid: true }
  } catch (error) {
    console.error('[CSRF] Token validation error:', error)
    return { valid: false, error: 'CSRF token validation failed' }
  }
}

/**
 * Endpoints exempted from CSRF protection
 *
 * These are flows where CSRF protection would break legitimate user actions:
 * - Sign-up/invitation flows: User is not yet authenticated
 * - System webhooks: Server-to-server communication with signature verification
 */
const CSRF_EXEMPT_PATHS = [
  '/api/v1/account-management/invitations/accept',  // User accepting invitation (pre-auth)
  '/api/v1/system/webhooks/clerk',                  // Clerk webhook (signature verified)
  '/api/trigger',                                    // Trigger.dev webhook (signature verified)
]

/**
 * Check if a request path is exempted from CSRF protection
 */
function isCSRFExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some(exemptPath =>
    pathname === exemptPath || pathname.startsWith(`${exemptPath}/`)
  )
}

/**
 * CSRF protection middleware for API routes
 *
 * Protects all state-changing operations (POST, PUT, DELETE, PATCH) except:
 * - Sign-up and invitation acceptance flows (pre-authentication)
 * - System webhooks with signature verification
 */
export async function csrfProtection(request: NextRequest): Promise<NextResponse | null> {
  try {
    // Only protect state-changing methods
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
      return null // Allow GET, HEAD, OPTIONS
    }

    // Check if path is exempted (e.g., invitation acceptance, webhooks)
    const { pathname } = new URL(request.url)
    if (isCSRFExempt(pathname)) {
      console.log(`[CSRF] Exempting path from CSRF protection: ${pathname}`)
      return null // Allow exempted paths
    }

    // Get CSRF token from headers
    const csrfToken = request.headers.get('x-csrf-token') ||
      request.headers.get('X-CSRF-Token') ||
      request.headers.get('csrf-token')

    if (!csrfToken) {
      console.warn(`[CSRF] Missing token for protected path: ${pathname}`)
      return NextResponse.json({
        success: false,
        error: 'CSRF token is required',
        message: 'Missing CSRF token. Please include X-CSRF-Token header.'
      }, { status: 403 })
    }

    // Validate the token
    const validation = await validateCSRFToken(csrfToken, request)

    if (!validation.valid) {
      console.warn(`[CSRF] Invalid token for path: ${pathname}`)
      return NextResponse.json({
        success: false,
        error: 'CSRF token validation failed',
        message: validation.error || 'Invalid CSRF token'
      }, { status: 403 })
    }

    return null // Allow request to proceed
  } catch (error) {
    console.error('[CSRF] Protection error - BLOCKING REQUEST:', error)
    // ✅ FAIL-CLOSED: Block request on any CSRF validation error
    return NextResponse.json({
      success: false,
      error: 'Security validation failed',
      message: 'CSRF protection encountered an error and blocked the request'
    }, { status: 403 })
  }
}

/**
 * API endpoint to get CSRF token
 */
export async function handleCSRFTokenRequest(request?: NextRequest): Promise<NextResponse> {
  const result = await generateCSRFTokenForUser(request)

  if (!result.token) {
    return NextResponse.json({
      success: false,
      error: result.error || 'Failed to generate CSRF token'
    }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    csrfToken: result.token,
    expiresIn: TOKEN_EXPIRES / 1000 // Return in seconds
  })
}

/**
 * Convenience function to apply CSRF protection to API handlers
 */
export function withCSRFProtection<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest

    // Apply CSRF protection
    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

    // Continue with original handler
    return handler(...args)
  }
}