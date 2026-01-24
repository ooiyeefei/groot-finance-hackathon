/**
 * Invitation Acceptance V1 API
 * GET /api/v1/invitations/accept?token=xxx - Validate invitation without accepting
 * POST /api/v1/invitations/accept - Accept invitation and associate user with business
 *
 * North Star Architecture: Thin API wrapper calling service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { acceptInvitation, validateInvitation } from '@/domains/account-management/lib/invitation.service'
import { validateBody, acceptInvitationSchema } from '@/lib/validations'

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting - use 'mutation' instead of 'auth' since invitation
    // acceptance is a legitimate business operation (not a brute-force target)
    // AUTH limiter (5 req/15min) is too strict for invitation flows
    const rateLimitResponse = await rateLimiters.mutation(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // ✅ Validate request body with Zod
    const validated = await validateBody(request, acceptInvitationSchema)
    if (!validated.success) {
      return validated.error
    }

    const { token, fullName } = validated.data

    // Call service layer
    const result = await acceptInvitation(token, userId, fullName)

    console.log(`[Invitation Accept V1 API] Invitation accepted: ${userId}`)

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Invitation Accept V1 API] Error:', error)

    // Handle specific error types with appropriate HTTP status codes
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // 409 Conflict - Already accepted by another user
    if (errorMessage.includes('already been accepted by another user')) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 409 }
      )
    }

    // 410 Gone - Invitation expired
    if (errorMessage.includes('expired')) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 410 }
      )
    }

    // 403 Forbidden - Email mismatch
    if (errorMessage.includes('does not match invitation')) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 403 }
      )
    }

    // 404 Not Found - Invalid invitation or record not found
    if (errorMessage.includes('Invalid invitation') || errorMessage.includes('not found')) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 404 }
      )
    }

    // 400 Bad Request - Other validation errors
    if (
      errorMessage.includes('Failed to') ||
      errorMessage.includes('Invalid') ||
      errorMessage.includes('required')
    ) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 400 }
      )
    }

    // 500 Internal Server Error - Everything else
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting - use 'query' since validation is a read operation
    // and doesn't expose sensitive data (token is already required)
    // AUTH limiter (5 req/15min) is too strict for invitation flows
    const rateLimitResponse = await rateLimiters.query(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Get token from query parameters
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Invitation token is required' },
        { status: 400 }
      )
    }

    // Call service layer to validate invitation
    const result = await validateInvitation(token)

    console.log(`[Invitation Validate V1 API] Invitation validated for token`)

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Invitation Validate V1 API] Error:', error)

    // Handle specific error types with appropriate HTTP status codes
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // 410 Gone - Invitation expired
    if (errorMessage.includes('expired')) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 410 }
      )
    }

    // 404 Not Found - Invalid invitation or record not found
    if (errorMessage.includes('Invalid invitation') || errorMessage.includes('not found')) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 404 }
      )
    }

    // 400 Bad Request - Other validation errors
    if (
      errorMessage.includes('Failed to') ||
      errorMessage.includes('Invalid') ||
      errorMessage.includes('required')
    ) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 400 }
      )
    }

    // 500 Internal Server Error - Everything else
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
