/**
 * Business Switching API V1
 * POST /api/v1/businesses/switch - Switch user's active business (updates Clerk JWT)
 * Rate limited for mutation operations (30 requests per minute)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { switchActiveBusiness } from '@/domains/account-management/lib/account-management.service'
import { csrfProtection } from '@/domains/security/lib/csrf-protection'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'
import { createErrorResponse, createValidationErrorResponse, ERROR_CODES, withErrorSanitization } from '@/domains/security/lib/error-sanitizer'
import { z } from 'zod'

const SwitchBusinessSchema = z.object({
  businessId: z.string().uuid('Invalid business ID format')
})

export const POST = withErrorSanitization(async (request: NextRequest) => {
  // Apply rate limiting for mutation operations (30 requests per minute)
  const mutationRateLimit = await rateLimit(request, RATE_LIMIT_CONFIGS.MUTATION)

  if (mutationRateLimit) {
    return mutationRateLimit // Return rate limit error response
  }

  const { userId } = await auth()

  if (!userId) {
    return createErrorResponse(
      null,
      401,
      ERROR_CODES.AUTH_REQUIRED,
      'Authentication required'
    )
  }

  // Apply CSRF protection
  const csrfResponse = await csrfProtection(request)
  if (csrfResponse) {
    return csrfResponse
  }

  // Parse and validate request body
  const body = await request.json()
  const validation = SwitchBusinessSchema.safeParse(body)

  if (!validation.success) {
    return createValidationErrorResponse(
      validation.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message
      }))
    )
  }

  const { businessId } = validation.data

  // Switch active business
  const result = await switchActiveBusiness(businessId, userId)

  if (!result.success) {
    return createErrorResponse(
      result.error,
      403,
      ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      'Cannot switch to this business'
    )
  }

  return NextResponse.json({
    success: true,
    message: 'Business switched successfully',
    data: {
      context: result.context
    }
  })
}, 'Business Switch API')
