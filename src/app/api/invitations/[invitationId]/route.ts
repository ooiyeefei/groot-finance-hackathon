/**
 * Individual Invitation API
 * DELETE /api/invitations/[invitationId] - Delete/expire invitation
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { getCurrentUserContext } from '@/lib/rbac'

/**
 * Delete invitation (remove pending invitation record)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({
        success: false,
        error: 'Admin permissions required to delete invitations'
      }, { status: 403 })
    }

    const { invitationId } = await params
    if (!invitationId) {
      return NextResponse.json({
        success: false,
        error: 'Invitation ID is required'
      }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Verify invitation exists and belongs to the same business
    const { data: invitation, error: fetchError } = await supabase
      .from('users')
      .select('id, email, business_id, clerk_user_id, invited_by')
      .eq('id', invitationId)
      .eq('business_id', userContext.profile.business_id)
      .is('clerk_user_id', null) // Only allow deletion of pending invitations
      .not('invited_by', 'is', null) // Must be an invitation
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json({
        success: false,
        error: 'Invitation not found or access denied'
      }, { status: 404 })
    }

    // Delete the invitation record (since it's a pending invitation with null clerk_user_id)
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', invitationId)
      .eq('business_id', userContext.profile.business_id)
      .is('clerk_user_id', null) // Safety check - only delete pending invitations

    if (deleteError) {
      console.error('[Delete Invitation API] Delete error:', deleteError)
      return NextResponse.json({
        success: false,
        error: 'Failed to delete invitation'
      }, { status: 500 })
    }

    console.log(`[Delete Invitation API] Invitation deleted: ${invitation.email}`)

    return NextResponse.json({
      success: true,
      message: 'Invitation deleted successfully'
    })

  } catch (error) {
    console.error('[Delete Invitation API] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}