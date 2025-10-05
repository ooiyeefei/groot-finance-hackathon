/**
 * User Role API
 * Returns current user's role and permission information
 * Also handles role updates for finance administrators
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserContext, updateUserRole } from '@/lib/rbac'

// GET - Get current user role and permissions
export async function GET(request: NextRequest) {
  try {
    const userContext = await getCurrentUserContext()
    
    if (!userContext) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: userContext.userId,
        roles: userContext.roles,
        permissions: userContext.permissions,
        capabilities: {
          canApprove: userContext.canApprove,
          canManageCategories: userContext.canManageCategories,
          canViewAllExpenses: userContext.canViewAllExpenses,
          canManageUsers: userContext.canManageUsers
        },
        profile: {
          membershipId: userContext.profile.id,
          userId: userContext.profile.user_id,
          businessId: userContext.profile.business_id,
          role: userContext.profile.role
        }
      }
    })

  } catch (error) {
    console.error('[User Role API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update user role (admin administrators only)
export async function PUT(request: NextRequest) {
  try {
    const userContext = await getCurrentUserContext()
    
    if (!userContext?.canManageUsers) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to update user roles' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { user_id, role } = body

    if (!user_id || !role) {
      return NextResponse.json(
        { success: false, error: 'user_id and role are required' },
        { status: 400 }
      )
    }

    const validRoles = ['employee', 'manager', 'admin']
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role specified' },
        { status: 400 }
      )
    }

    // Update the user role
    const result = await updateUserRole(user_id, role, userContext.userId)
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: { user_id, role }
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('[User Role API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}