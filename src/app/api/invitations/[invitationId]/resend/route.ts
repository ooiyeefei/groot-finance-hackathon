/**
 * Resend Business Invitation API
 * POST /api/invitations/[invitationId]/resend - Resend existing invitation
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { getCurrentUserContext } from '@/lib/rbac'
import { emailService } from '@/lib/services/email-service'

/**
 * Resend existing business invitation
 */
export async function POST(
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
        error: 'Admin permissions required to resend invitations' 
      }, { status: 403 })
    }

    const { invitationId } = await params
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // Get the invitation record
    const { data: invitation, error: fetchError } = await supabase
      .from('users')
      .select('id, email, created_at, business_id, invited_by')
      .eq('id', invitationId)
      .eq('business_id', userContext.profile.business_id)
      .is('clerk_user_id', null) // Only pending invitations
      .not('invited_by', 'is', null) // Must be an invitation
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invitation not found or already accepted' 
      }, { status: 404 })
    }

    // Check if invitation hasn't expired (7 days)
    const invitedDate = new Date(invitation.created_at)
    const expirationDate = new Date(invitedDate.getTime() + (7 * 24 * 60 * 60 * 1000))
    
    if (new Date() > expirationDate) {
      // Update invitation timestamp using updated_at field
      const { error: updateError } = await supabase
        .from('users')
        .update({
          updated_at: new Date().toISOString() // Use updated_at to refresh invitation
        })
        .eq('id', invitationId)

      if (updateError) {
        console.error('[Resend Invitation API] Update error:', updateError)
        return NextResponse.json({ 
          success: false, 
          error: 'Failed to refresh invitation' 
        }, { status: 500 })
      }
    }

    // Get business name for email
    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', userContext.profile.business_id)
      .single()

    // Get inviter name from Clerk
    const { clerkClient } = await import('@clerk/nextjs/server')
    const inviterUser = await (await clerkClient()).users.getUser(userId)
    const inviterName = inviterUser.firstName && inviterUser.lastName 
      ? `${inviterUser.firstName} ${inviterUser.lastName}`
      : inviterUser.emailAddresses[0]?.emailAddress || 'Team Admin'

    // Send invitation email using user ID as token (with default locale)
    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/en/invitations/accept?token=${invitation.id}`
    
    const emailResult = await emailService.sendInvitation({
      email: invitation.email,
      businessName: business?.name || 'FinanSEAL Business',
      inviterName,
      role: 'team member', // Generic role since not stored in users table anymore
      invitationToken: invitation.id, // Use user ID as token
      invitationUrl
    })

    if (!emailResult.success) {
      console.error('[Resend Invitation API] Email sending failed:', emailResult.error)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to resend invitation email' 
      }, { status: 500 })
    }

    console.log(`[Resend Invitation API] Invitation resent: ${invitation.email} → ${userContext.profile.business_id}`)

    return NextResponse.json({ 
      success: true, 
      message: 'Invitation resent successfully' 
    })

  } catch (error) {
    console.error('[Resend Invitation API] Unexpected error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}