/**
 * Resend Business Invitation V1 API
 * POST /api/v1/invitations/[invitationId]/resend - Resend existing invitation
 *
 * North Star Architecture: Thin API wrapper calling service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { csrfProtection } from '@/domains/security/lib/csrf-protection'
import { getCurrentUserContext } from '@/domains/security/lib/rbac'
import { resendInvitation } from '@/domains/account-management/lib/invitation.service'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ invitationId: string }> }
) {
  try {
    // Apply rate limiting (admin operation)
    const rateLimitResponse = await rateLimiters.admin(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Apply CSRF protection
    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json(
        { success: false, error: 'Admin permissions required to resend invitations' },
        { status: 403 }
      )
    }

    // Extract invitation ID from params
    const { invitationId } = await context.params

    // Call service layer
    const result = await resendInvitation(
      invitationId,
      userContext.profile.business_id,
      userId
    )

    console.log(`[Resend Invitation V1 API] Invitation resent: ${invitationId}`)

    return NextResponse.json(result)

  } catch (error) {
    console.error('[Resend Invitation V1 API] Error:', error)

    // Handle specific error types with appropriate HTTP status codes
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // 404 Not Found - Invitation not found or already accepted
    if (errorMessage.includes('not found') || errorMessage.includes('already accepted')) {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 404 }
      )
    }

    // 400 Bad Request - Failed to refresh or send email
    if (errorMessage.includes('Failed to')) {
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
