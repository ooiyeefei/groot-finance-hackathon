/**
 * Centralized API middleware for authentication, authorization, rate limiting, and audit logging
 * Provides consistent security patterns across all API endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ensureUserProfile, type UserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/db/supabase-server'
import { auditLogger } from '@/domains/security/lib/audit-logger'
import { getClientIdentifier, applyRateLimit } from '@/domains/security/lib/rate-limit'
import type { RolePermissions, UserRole } from '@/domains/security/lib/rbac'

export interface ApiContext {
  userId: string
  businessId: string
  userProfile: UserProfile
  supabase: any
  request: NextRequest
  rateLimitResult: {
    allowed: boolean
    headers: Record<string, string>
  }
}

export interface ApiMiddlewareOptions {
  requireAuth?: boolean
  requiredRole?: keyof RolePermissions
  rateLimiter?: any
  skipBusinessContext?: boolean
  auditAction?: string
}

export class ApiError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Centralized API middleware that handles:
 * - Authentication validation
 * - Role-based authorization
 * - Rate limiting
 * - Business context validation
 * - Audit logging
 */
export async function withApiMiddleware(
  request: NextRequest,
  options: ApiMiddlewareOptions = {}
): Promise<ApiContext> {
  const {
    requireAuth = true,
    requiredRole,
    rateLimiter,
    skipBusinessContext = false,
    auditAction
  } = options

  // Declare variables outside try block for error handling
  let userId: string | null = null

  try {
    // Step 1: Authentication
    if (requireAuth) {
      const authResult = await auth()
      userId = authResult.userId

      if (!userId) {
        // Audit failed authentication
        auditLogger.logAuthEvent(
          null,
          null,
          'clerk_jwt',
          false,
          request,
          undefined,
          undefined,
          'No authentication token provided'
        )
        throw new ApiError('Unauthorized', 401)
      }

      // Audit successful authentication
      auditLogger.logAuthEvent(
        userId,
        null,
        'clerk_jwt',
        true,
        request
      )
    }

    // Step 2: Rate limiting (if specified)
    let rateLimitResult = { allowed: true, headers: {} }
    if (rateLimiter && userId) {
      const clientId = getClientIdentifier(request, userId)
      rateLimitResult = applyRateLimit(rateLimiter, clientId)

      // Audit rate limiting
      auditLogger.logRateLimit(
        userId,
        null, // business_id not known yet
        rateLimiter.constructor.name,
        !rateLimitResult.allowed,
        parseInt((rateLimitResult.headers as any)['X-RateLimit-Remaining'] || '0'),
        parseInt((rateLimitResult.headers as any)['X-RateLimit-Reset'] || '0'),
        request
      )

      if (!rateLimitResult.allowed) {
        throw new ApiError(
          'Too many requests. Please wait before making another request.',
          429,
          { rateLimitExceeded: true, headers: rateLimitResult.headers }
        )
      }
    }

    // Step 3: Business context and user profile (if auth required)
    let userProfile: UserProfile | null = null
    let businessId: string | null = null
    let supabase: any = null

    if (requireAuth && userId) {
      // Get user profile for business context
      userProfile = await ensureUserProfile(userId)
      if (!userProfile) {
        auditLogger.logAuthEvent(
          userId,
          null,
          'user_profile',
          false,
          request,
          undefined,
          undefined,
          'Failed to create or retrieve user profile'
        )
        throw new ApiError('Failed to create or retrieve user profile', 500)
      }

      businessId = userProfile.business_id

      // Create authenticated Supabase client
      supabase = await createAuthenticatedSupabaseClient(userId)

      // Validate business context (if not skipped)
      if (!skipBusinessContext) {
        // Use the already authenticated Supabase client instead of calling getUserData
        // which would fetch JWT token again
        const { data: users, error } = await supabase
          .from('users')
          .select(`
            id,
            business_id,
            email,
            full_name,
            created_at,
            businesses!users_business_id_fkey (
              home_currency
            )
          `)
          .eq('clerk_user_id', userId)
          .order('created_at', { ascending: false })

        if (error || !users || users.length === 0) {
          auditLogger.logAuthEvent(
            userId,
            userProfile.business_id,
            'business_context',
            false,
            request,
            userProfile.role_permissions,
            false,
            'Failed to fetch user data for business context validation'
          )
          throw new ApiError('Failed to validate business context', 500)
        }

        const recordsWithBusiness = users.filter((u: any) => u.business_id)
        const userData = recordsWithBusiness.length > 0 ? recordsWithBusiness[0] : users[0]

        if (userProfile.business_id !== userData.business_id) {
          auditLogger.logAuthEvent(
            userId,
            userProfile.business_id,
            'business_context',
            false,
            request,
            userProfile.role_permissions,
            false,
            'Business context mismatch'
          )
          throw new ApiError('Business context mismatch', 403)
        }
      }

      // Audit business context validation
      auditLogger.logAuthEvent(
        userId,
        businessId,
        'business_context',
        true,
        request,
        userProfile.role_permissions,
        true
      )
    }

    // Step 4: Role-based authorization (if specified)
    if (requiredRole && userProfile) {
      const hasRequiredRole = userProfile.role_permissions[requiredRole]

      if (!hasRequiredRole) {
        auditLogger.logAuthEvent(
          userId!,
          businessId,
          'role_authorization',
          false,
          request,
          userProfile.role_permissions,
          undefined,
          `Insufficient permissions. ${requiredRole} access required.`
        )
        throw new ApiError(
          `Insufficient permissions. ${requiredRole} access required.`,
          403
        )
      }

      // Audit successful role authorization
      auditLogger.logAuthEvent(
        userId!,
        businessId,
        'role_authorization',
        true,
        request,
        userProfile.role_permissions
      )
    }

    // Step 5: Optional action audit logging
    if (auditAction && userId) {
      auditLogger.logAuthEvent(
        userId,
        businessId,
        auditAction,
        true,
        request,
        userProfile?.role_permissions
      )
    }

    // Return the validated context
    return {
      userId: userId!,
      businessId: businessId!,
      userProfile: userProfile!,
      supabase: supabase!,
      request,
      rateLimitResult
    }

  } catch (error) {
    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error
    }

    // Log unexpected errors
    console.error('[API Middleware] Unexpected error:', error)
    auditLogger.logAuthEvent(
      userId,
      null,
      'middleware_error',
      false,
      request,
      undefined,
      undefined,
      error instanceof Error ? error.message : 'Unknown middleware error'
    )

    throw new ApiError('Internal server error', 500)
  }
}

/**
 * Helper function to create error responses with proper headers
 */
export function createApiErrorResponse(error: ApiError): NextResponse {
  const response = NextResponse.json(
    {
      success: false,
      error: error.message,
      ...(error.details || {})
    },
    { status: error.statusCode }
  )

  // Add rate limit headers if available
  if (error.details?.headers) {
    Object.entries(error.details.headers).forEach(([key, value]) => {
      response.headers.set(key, String(value))
    })
  }

  return response
}

/**
 * Helper function to create success responses with rate limit headers
 */
export function createApiSuccessResponse(
  data: any,
  rateLimitHeaders: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { success: true, ...data },
    { headers: rateLimitHeaders }
  )
}

/**
 * Wrapper function that automatically handles middleware errors
 */
export async function withApiHandler<T>(
  request: NextRequest,
  options: ApiMiddlewareOptions,
  handler: (context: ApiContext) => Promise<T>
): Promise<NextResponse> {
  try {
    const context = await withApiMiddleware(request, options)
    const result = await handler(context)

    // If handler returns NextResponse, return as-is
    if (result instanceof NextResponse) {
      return result
    }

    // Otherwise, wrap in success response
    return createApiSuccessResponse(result, context.rateLimitResult.headers)
  } catch (error) {
    if (error instanceof ApiError) {
      return createApiErrorResponse(error)
    }

    console.error('[API Handler] Unexpected error:', error)
    return createApiErrorResponse(
      new ApiError('Internal server error', 500)
    )
  }
}