/**
 * Admin Assignment API
 * Handles initial admin assignment for new businesses
 * Should only be used during business setup or by existing admins
 */

import { NextRequest, NextResponse } from 'next/server'
import { updateUserRole, getCurrentUserContext } from '@/lib/rbac'

// POST - Assign admin role to user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, admin_key } = body

    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'user_id is required' },
        { status: 400 }
      )
    }

    // Method 1: Master admin key (only for you as SaaS owner)
    if (admin_key) {
      const validAdminKey = process.env.MASTER_ADMIN_KEY
      console.log('[Admin Assignment] Debug - Received key:', admin_key ? `${admin_key.substring(0, 10)}...` : 'NO KEY')
      console.log('[Admin Assignment] Debug - Expected key:', validAdminKey ? `${validAdminKey.substring(0, 10)}...` : 'NO ENV KEY')
      console.log('[Admin Assignment] Debug - Keys match:', admin_key === validAdminKey)
      
      if (!validAdminKey || admin_key !== validAdminKey) {
        return NextResponse.json(
          { success: false, error: 'Invalid master admin key' },
          { status: 403 }
        )
      }

      // Assign admin role (highest permissions) - Only SaaS owner can do this
      const result = await updateUserRole(user_id, 'admin', 'saas_owner')
      
      if (result.success) {
        console.log(`[Admin Assignment] Business admin assigned by SaaS owner: ${user_id}`)
        return NextResponse.json({
          success: true,
          data: { user_id, role: 'admin', method: 'saas_owner_assignment' }
        })
      } else {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        )
      }
    }

    // Method 2: Existing business admin promotes user to manager (standard workflow)
    const currentUser = await getCurrentUserContext()
    
    if (!currentUser?.canManageUsers) {
      return NextResponse.json(
        { success: false, error: 'Only business admins can promote users to manager roles.' },
        { status: 403 }
      )
    }

    // Business admins can only promote to manager, not admin
    const result = await updateUserRole(user_id, 'manager', currentUser.userId)
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: { user_id, role: 'manager', method: 'business_admin_promotion' }
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('[Admin Assignment] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}