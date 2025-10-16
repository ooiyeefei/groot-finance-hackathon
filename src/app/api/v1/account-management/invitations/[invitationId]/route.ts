/**
 * Invitation Management API V1
 * DELETE /api/v1/invitations/[invitationId] - Delete pending invitation
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { deleteInvitation } from '@/domains/account-management/lib/account-management.service'
import { getCurrentUserContext } from '@/domains/security/lib/rbac'
import { csrfProtection } from '@/domains/security/lib/csrf-protection'

/**
 * Delete pending invitation
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ invitationId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Apply CSRF protection
    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({
        success: false,
        error: 'Admin permissions required to delete invitations'
      }, { status: 403 })
    }

    const { invitationId } = await context.params

    await deleteInvitation(invitationId, userContext.profile.business_id)

    return NextResponse.json({
      success: true,
      message: 'Invitation deleted successfully'
    })

  } catch (error) {
    console.error('[Invitation V1 API] DELETE error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
