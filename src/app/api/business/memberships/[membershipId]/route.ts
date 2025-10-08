/**
 * Business Membership CRUD API
 * Standard RESTful operations for business membership management
 * PUT /api/business/memberships/[membershipId] - Update membership (role, status, etc.)
 * DELETE /api/business/memberships/[membershipId] - Hard delete membership (rare)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { getCurrentUserContext } from '@/lib/rbac'
import { syncRoleToClerk } from '@/lib/rbac'

interface UpdateMembershipRequest {
  status?: 'active' | 'inactive' | 'pending' | 'suspended'
  role?: 'employee' | 'manager' | 'admin'
  reason?: string // Optional reason for logging
}

/**
 * Update membership - handles role changes, status changes (remove/reactivate), etc.
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

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({
        success: false,
        error: 'Admin permissions required to manage team members'
      }, { status: 403 })
    }

    const { membershipId } = await context.params
    const body = await request.json() as UpdateMembershipRequest
    const { status, role, reason } = body

    // Validate required fields
    if (!membershipId) {
      return NextResponse.json({
        success: false,
        error: 'Membership ID is required'
      }, { status: 400 })
    }

    // Validate at least one field to update
    if (!status && !role) {
      return NextResponse.json({
        success: false,
        error: 'Either status or role must be provided for update'
      }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Get current membership details
    const { data: currentMembership, error: fetchError } = await supabase
      .from('business_memberships')
      .select(`
        *,
        users!inner(id, email, full_name, clerk_user_id),
        businesses!inner(id, name, owner_id)
      `)
      .eq('id', membershipId)
      .single()

    if (fetchError || !currentMembership) {
      return NextResponse.json({
        success: false,
        error: 'Membership not found'
      }, { status: 404 })
    }

    // Verify admin has permission to manage this business
    if (currentMembership.business_id !== userContext.profile.business_id) {
      return NextResponse.json({
        success: false,
        error: 'You can only manage memberships in your own business'
      }, { status: 403 })
    }

    // Business logic validations
    const targetUser = currentMembership.users
    const business = currentMembership.businesses

    // Cannot modify business owner
    if (business.owner_id === targetUser.id) {
      return NextResponse.json({
        success: false,
        error: 'Cannot modify business owner membership'
      }, { status: 403 })
    }

    // Cannot modify your own membership
    if (targetUser.id === userContext.profile.user_id) {
      return NextResponse.json({
        success: false,
        error: 'Cannot modify your own membership'
      }, { status: 403 })
    }

    // CRITICAL FIX: Prevent admin lockout - check if this is the last admin
    if (role && (role === 'employee' || role === 'manager') && currentMembership.role === 'admin') {
      // This is an admin demotion - check if it would leave the business without admins
      const { data: adminCount, error: adminCountError } = await supabase
        .from('business_memberships')
        .select('id', { count: 'exact' })
        .eq('business_id', currentMembership.business_id)
        .eq('role', 'admin')
        .eq('status', 'active')

      if (adminCountError) {
        console.error('[Membership Update] Error counting admins:', adminCountError)
        return NextResponse.json({
          success: false,
          error: 'Failed to validate admin requirements'
        }, { status: 500 })
      }

      // If there's only 1 active admin (the one being demoted), prevent the action
      if (adminCount?.length === 1) {
        return NextResponse.json({
          success: false,
          error: 'Cannot demote the last admin. The business must have at least one admin member.'
        }, { status: 403 })
      }

      console.log(`[Membership Update] Admin demotion validated - ${adminCount?.length || 0} admins total, safe to demote`)
    }

    // CRITICAL FIX: Prevent admin lockout - also check if removing/deactivating the last admin
    if (status && (status === 'inactive' || status === 'suspended') && currentMembership.role === 'admin' && currentMembership.status === 'active') {
      // This admin is being removed/deactivated - check if it would leave the business without admins
      const { data: adminCount, error: adminCountError } = await supabase
        .from('business_memberships')
        .select('id', { count: 'exact' })
        .eq('business_id', currentMembership.business_id)
        .eq('role', 'admin')
        .eq('status', 'active')

      if (adminCountError) {
        console.error('[Membership Update] Error counting admins for removal:', adminCountError)
        return NextResponse.json({
          success: false,
          error: 'Failed to validate admin requirements'
        }, { status: 500 })
      }

      // If there's only 1 active admin (the one being removed), prevent the action
      if (adminCount?.length === 1) {
        return NextResponse.json({
          success: false,
          error: 'Cannot remove the last admin. The business must have at least one active admin member.'
        }, { status: 403 })
      }

      console.log(`[Membership Update] Admin removal validated - ${adminCount?.length || 0} admins total, safe to remove`)
    }

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (status) {
      updates.status = status

      // Set joined_at when reactivating
      if (status === 'active' && currentMembership.status !== 'active') {
        updates.joined_at = new Date().toISOString()
      }
    }

    if (role) {
      updates.role = role
    }

    console.log(`[Membership Update] Admin ${userContext.profile.user_id} updating membership ${membershipId}:`, {
      current: { status: currentMembership.status, role: currentMembership.role },
      updates,
      reason
    })

    // Update membership
    const { data: updatedMembership, error: updateError } = await supabase
      .from('business_memberships')
      .update(updates)
      .eq('id', membershipId)
      .select('*')
      .single()

    if (updateError) {
      console.error('[Membership Update] Update error:', updateError)
      return NextResponse.json({
        success: false,
        error: `Failed to update membership: ${updateError.message}`
      }, { status: 500 })
    }

    // CRITICAL: Clear business context FIRST if user is being removed/deactivated (SECURITY FIX)
    if (status === 'inactive' || status === 'suspended') {
      try {
        // 1. Clear user's business_id in Supabase if this was their active business
        const { data: currentUser } = await supabase
          .from('users')
          .select('business_id')
          .eq('id', targetUser.id)
          .single()

        if (currentUser?.business_id === currentMembership.business_id) {
          // Check if user has other active business memberships
          const { data: otherMemberships } = await supabase
            .from('business_memberships')
            .select('business_id, businesses!inner(name)')
            .eq('user_id', targetUser.id)
            .eq('status', 'active')
            .neq('business_id', currentMembership.business_id)
            .limit(1)

          const newBusinessId = (otherMemberships && otherMemberships.length > 0) ? otherMemberships[0].business_id : null

          // Update user's business_id
          await supabase
            .from('users')
            .update({
              business_id: newBusinessId,
              updated_at: new Date().toISOString()
            })
            .eq('id', targetUser.id)

          console.log(`[Membership Update] SECURITY: Cleared business context for removed user: ${targetUser.email} → ${newBusinessId || 'NULL'}`)

          // 2. Clear Clerk metadata if user has Clerk ID
          if (targetUser.clerk_user_id) {
            const { clerkClient } = await import('@clerk/nextjs/server')
            await (await clerkClient()).users.updateUser(targetUser.clerk_user_id, {
              publicMetadata: {
                activeBusinessId: newBusinessId
              }
            })
          }
        }
      } catch (contextError) {
        console.error('[Membership Update] CRITICAL: Failed to clear business context:', contextError)
        // This is critical for security - the operation should still succeed but log prominently
      }
    }

    // Sync role permissions to Clerk if role changed or user reactivated
    if ((role || (status === 'active' && currentMembership.status !== 'active')) && targetUser.clerk_user_id) {
      const finalRole = role || currentMembership.role
      const rolePermissions = {
        employee: true,
        manager: finalRole === 'manager' || finalRole === 'admin',
        admin: finalRole === 'admin'
      }

      const syncResult = await syncRoleToClerk(targetUser.clerk_user_id, rolePermissions)
      if (!syncResult.success) {
        console.error(`[Membership Update] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
      }
    }

    // Log the action (simple logging instead of audit table)
    const action = status === 'inactive' ? 'removed' :
                   status === 'active' && (currentMembership.status === 'inactive' || currentMembership.status === 'suspended') ? 'reactivated' :
                   role ? 'role_changed' : 'updated'

    console.log(`[Membership Update] Successfully ${action} user ${targetUser.email} (${targetUser.full_name || 'N/A'})`, {
      membership_id: membershipId,
      business_id: currentMembership.business_id,
      old_status: currentMembership.status,
      new_status: updatedMembership.status,
      old_role: currentMembership.role,
      new_role: updatedMembership.role,
      reason: reason || 'No reason provided'
    })

    return NextResponse.json({
      success: true,
      message: `Membership ${action} successfully`,
      membership: {
        id: updatedMembership.id,
        user_id: updatedMembership.user_id,
        business_id: updatedMembership.business_id,
        role: updatedMembership.role,
        status: updatedMembership.status,
        updated_at: updatedMembership.updated_at
      },
      user: {
        email: targetUser.email,
        name: targetUser.full_name || targetUser.email
      },
      changes: {
        action,
        from: {
          status: currentMembership.status,
          role: currentMembership.role
        },
        to: {
          status: updatedMembership.status,
          role: updatedMembership.role
        }
      }
    })

  } catch (error) {
    console.error('[Membership Update] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error while updating membership'
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

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({
        success: false,
        error: 'Admin permissions required to delete memberships'
      }, { status: 403 })
    }

    const { membershipId } = await context.params
    const supabase = createServiceSupabaseClient()

    // Get membership details before deletion
    const { data: membership, error: fetchError } = await supabase
      .from('business_memberships')
      .select(`
        *,
        users!inner(email, full_name),
        businesses!inner(name, owner_id)
      `)
      .eq('id', membershipId)
      .single()

    if (fetchError || !membership) {
      return NextResponse.json({
        success: false,
        error: 'Membership not found'
      }, { status: 404 })
    }

    // Business logic validations
    if (membership.business_id !== userContext.profile.business_id) {
      return NextResponse.json({
        success: false,
        error: 'You can only delete memberships in your own business'
      }, { status: 403 })
    }

    // Cannot delete business owner
    if (membership.businesses.owner_id === membership.user_id) {
      return NextResponse.json({
        success: false,
        error: 'Cannot delete business owner membership'
      }, { status: 403 })
    }

    // Hard delete (rare operation)
    const { error: deleteError } = await supabase
      .from('business_memberships')
      .delete()
      .eq('id', membershipId)

    if (deleteError) {
      console.error('[Membership Delete] Delete error:', deleteError)
      return NextResponse.json({
        success: false,
        error: `Failed to delete membership: ${deleteError.message}`
      }, { status: 500 })
    }

    console.log(`[Membership Delete] Hard deleted membership: ${membership.users.email} from business ${membership.businesses.name}`)

    return NextResponse.json({
      success: true,
      message: 'Membership deleted successfully'
    })

  } catch (error) {
    console.error('[Membership Delete] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error while deleting membership'
    }, { status: 500 })
  }
}