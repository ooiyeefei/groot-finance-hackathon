/**
 * User Roles Management V1 API
 * POST - Update user role and manager assignment (consolidated endpoint)
 * Replaces: /api/user/assign-admin, /api/user/assign-manager
 *
 * Handles:
 * - Role updates (employee/manager/admin)
 * - Manager assignment (via manager_id parameter)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { rateLimiters } from '@/lib/api/rate-limit'
import { getCurrentUserContextWithBusiness } from '@/lib/auth/rbac'
import { updateUserRole, assignManager, removeUserFromBusiness } from '@/domains/users/lib/user.service'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Apply rate limiting
    const rateLimitResponse = await rateLimiters.admin(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Skip CSRF protection for this endpoint as it's marked public in middleware
    // This endpoint has other security measures:
    // 1. Clerk authentication required
    // 2. Business context and permissions validation
    // 3. Rate limiting
    // 4. Master key validation for admin assignments

    const userContext = await getCurrentUserContextWithBusiness()

    if (!userContext?.canManageUsers) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to manage user roles' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id: targetUserId } = await context.params
    const { role, manager_id, admin_key, remove_from_business } = body

    // SPECIAL CASE: SaaS owner admin assignment via master key
    if (admin_key && role === 'admin') {
      const validAdminKey = process.env.MASTER_ADMIN_KEY

      if (!validAdminKey || admin_key !== validAdminKey) {
        return NextResponse.json(
          { success: false, error: 'Invalid master admin key' },
          { status: 403 }
        )
      }

      const result = await updateUserRole(targetUserId, 'admin', 'saas_owner')

      if (result.success) {
        console.log(`[User Roles V1 API] Business admin assigned by SaaS owner: ${targetUserId}`)
        return NextResponse.json({
          success: true,
          data: { user_id: targetUserId, role: 'admin', method: 'saas_owner_assignment' }
        })
      } else {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        )
      }
    }

    // HANDLE: Role update
    if (role) {
      const validRoles = ['employee', 'manager', 'admin']
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { success: false, error: 'Invalid role specified' },
          { status: 400 }
        )
      }

      const result = await updateUserRole(targetUserId, role as 'employee' | 'manager' | 'admin', userId)

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        )
      }

      console.log(`[User Roles V1 API] Role updated: ${targetUserId} → ${role}`)
    }

    // HANDLE: Manager assignment
    if ('manager_id' in body) {
      try {
        await assignManager(
          targetUserId,
          manager_id,
          userId,
          userContext.profile.business_id
        )
        console.log(`[User Roles V1 API] Manager assigned: ${targetUserId} → ${manager_id || 'none'}`)
      } catch (serviceError) {
        const errorMessage = serviceError instanceof Error ? serviceError.message : 'Failed to assign manager'
        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 400 }
        )
      }
    }

    // HANDLE: Remove user from business
    if (remove_from_business === true) {
      try {
        await removeUserFromBusiness(
          targetUserId,
          userId,
          userContext.profile.business_id
        )
        console.log(`[User Roles V1 API] User removed from business: ${targetUserId}`)

        return NextResponse.json({
          success: true,
          data: { user_id: targetUserId, action: 'removed_from_business' },
          message: 'User removed from business successfully'
        })
      } catch (serviceError) {
        const errorMessage = serviceError instanceof Error ? serviceError.message : 'Failed to remove user from business'
        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: { user_id: targetUserId, role, manager_id },
      message: 'User role updated successfully'
    })

  } catch (error) {
    console.error('[User Roles V1 API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
