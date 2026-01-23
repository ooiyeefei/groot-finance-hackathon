/**
 * Resend Business Invitation V1 API
 * POST /api/v1/invitations/[invitationId]/resend - Resend existing invitation
 *
 * North Star Architecture: Thin API wrapper calling service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
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

    // Note: CSRF protection removed - not needed with JWT auth + admin permission validation

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

    // Return success with optional email failure warning
    // The invitation is still valid even if email failed - user can share link manually
    if (result.emailFailed) {
      return NextResponse.json({
        success: true,
        message: result.message,
        emailFailed: true,
        warning: result.warning,
        invitationUrl: result.invitationUrl
      })
    }

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

    // 500 Internal Server Error - Everything else
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
