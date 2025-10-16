/**
 * CSRF Token API Endpoint
 * GET /api/v1/utils/security/csrf-token - Generate CSRF token for authenticated users
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateCSRFTokenForUser } from '@/domains/security/lib/csrf-protection'
import { createErrorResponse, ERROR_CODES, withErrorSanitization } from '@/domains/security/lib/error-sanitizer'
import { auth } from '@clerk/nextjs/server'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'

export const GET = withErrorSanitization(async (request: NextRequest) => {
  // Apply rate limiting (100 requests per minute for token generation)
  const queryRateLimit = await rateLimit(request, RATE_LIMIT_CONFIGS.QUERY)

  if (queryRateLimit) {
    return queryRateLimit
  }

  const { userId } = await auth()

  if (!userId) {
    return createErrorResponse(
      null,
      401,
      ERROR_CODES.AUTH_REQUIRED,
      'Authentication required to generate CSRF token'
    )
  }

  // Generate CSRF token
  const result = await generateCSRFTokenForUser(request)

  if (!result.token) {
    return createErrorResponse(
      result.error,
      500,
      ERROR_CODES.SYSTEM_ERROR,
      'Failed to generate CSRF token'
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      csrfToken: result.token,
      expiresIn: 60 * 60, // 1 hour in seconds
      usage: 'Include as X-CSRF-Token header in state-changing requests'
    }
  })
}, 'CSRF Token Generation')
