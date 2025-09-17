/**
 * User Name Update API
 * PUT /api/user/update-name - Update user's full name
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { getCurrentUserContext } from '@/lib/rbac'

interface UpdateNameRequest {
  user_id?: string // For admin updating other users
  full_name: string
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const userContext = await getCurrentUserContext()
    if (!userContext) {
      return NextResponse.json({ success: false, error: 'User context not found' }, { status: 404 })
    }

    const body = await request.json() as UpdateNameRequest
    const { user_id, full_name } = body

    if (!full_name || !full_name.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Full name is required'
      }, { status: 400 })
    }

    if (full_name.trim().length < 2) {
      return NextResponse.json({
        success: false,
        error: 'Name must be at least 2 characters long'
      }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Determine which user to update
    let targetUserId = userContext.profile.user_id // Default to current user

    if (user_id) {
      // Admin updating another user's name
      if (!userContext.canManageUsers) {
        return NextResponse.json({
          success: false,
          error: 'Admin permissions required to update other users'
        }, { status: 403 })
      }

      // Verify the target user exists in the same business
      const { data: targetUser, error: targetUserError } = await supabase
        .from('employee_profiles')
        .select('user_id, business_id')
        .eq('user_id', user_id)
        .eq('business_id', userContext.profile.business_id)
        .single()

      if (targetUserError || !targetUser) {
        return NextResponse.json({
          success: false,
          error: 'Target user not found or access denied'
        }, { status: 404 })
      }

      targetUserId = user_id
    }

    // Update the user's full name
    const { error: updateError } = await supabase
      .from('users')
      .update({
        full_name: full_name.trim(),
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId)

    if (updateError) {
      console.error('[UpdateName API] Update error:', updateError)
      return NextResponse.json({
        success: false,
        error: 'Failed to update name'
      }, { status: 500 })
    }

    console.log(`[UpdateName API] Name updated: ${targetUserId} → ${full_name.trim()}`)

    return NextResponse.json({
      success: true,
      message: 'Name updated successfully'
    })

  } catch (error) {
    console.error('[UpdateName API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}