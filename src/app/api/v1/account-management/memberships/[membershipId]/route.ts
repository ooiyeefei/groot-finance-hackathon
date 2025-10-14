/**
 * Business Membership CRUD API V1
 * PUT /api/v1/businesses/memberships/[membershipId] - Update membership
 * DELETE /api/v1/businesses/memberships/[membershipId] - Delete membership
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { updateMembership, deleteMembership } from '@/domains/account-management/lib/account-management.service'
import { getCurrentUserContext } from '@/lib/auth/rbac'
import { csrfProtection } from '@/lib/auth/csrf-protection'
import { rateLimiters } from '@/lib/api/rate-limit'

/**
 * Update membership - handles role changes, status changes (remove/reactivate)
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ membershipId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Apply rate limiting and CSRF protection
    const rateLimitResponse = await rateLimiters.admin(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({
        success: false,
        error: 'Admin permissions required to manage team members'
      }, { status: 403 })
    }

    const { membershipId } = await context.params
    const body = await request.json()

    const result = await updateMembership(
      membershipId,
      body,
      userId,
      userContext.profile.business_id
    )

    return NextResponse.json({
      success: true,
      message: `Membership ${result.changes.action} successfully`,
      ...result
    })

  } catch (error) {
    console.error('[Membership V1 API] Update error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * Hard delete membership (rare operation)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ membershipId: string }> }
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
        error: 'Admin permissions required to delete memberships'
      }, { status: 403 })
    }

    const { membershipId } = await context.params

    await deleteMembership(membershipId, userContext.profile.business_id)

    return NextResponse.json({
      success: true,
      message: 'Membership deleted successfully'
    })

  } catch (error) {
    console.error('[Membership V1 API] Delete error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}
