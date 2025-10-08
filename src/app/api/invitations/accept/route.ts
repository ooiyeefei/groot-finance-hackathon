/**
 * Invitation Acceptance API
 * GET /api/invitations/accept?token=<invitation_token> - Validate and prepare invitation for acceptance
 * POST /api/invitations/accept - Accept invitation and associate user with business
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { syncRoleToClerk } from '@/lib/rbac'
import { validateInvitationToken, isLegacyUuidToken } from '@/lib/invitation-tokens'
import { rateLimiters } from '@/lib/rate-limit'

/**
 * Validate invitation token (for when user clicks invitation link)
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting for invitation validation
    const rateLimitResponse = await rateLimiters.auth(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({
        success: false,
        error: 'Invitation token is required'
      }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    // Check if this is a legacy UUID token or new secure token
    if (isLegacyUuidToken(token)) {
      console.log('[Invitation Validate] Processing legacy UUID token')

      // Handle legacy UUID token (backward compatibility)
      const { data: invitation, error: fetchError } = await supabase
        .from('users')
        .select('id, email, created_at, business_id, invited_by, invited_role, clerk_user_id')
        .eq('id', token)
        .not('invited_by', 'is', null) // Must be an invitation
        .single()

      if (fetchError || !invitation) {
        return NextResponse.json({
          success: false,
          error: 'Invalid invitation'
        }, { status: 404 })
      }

      // Get the role from business_memberships separately
      const { data: membershipData } = await supabase
        .from('business_memberships')
        .select('role')
        .eq('user_id', invitation.id)
        .eq('business_id', invitation.business_id)
        .single()

      // Check if invitation hasn't expired (7 days)
      const invitedDate = new Date(invitation.created_at)
      const expirationDate = new Date(invitedDate.getTime() + (7 * 24 * 60 * 60 * 1000))

      if (new Date() > expirationDate) {
        return NextResponse.json({
          success: false,
          error: 'Invitation has expired'
        }, { status: 410 })
      }

      // Get business information
      const { data: business } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', invitation.business_id)
        .single()

      return NextResponse.json({
        success: true,
        invitation: {
          email: invitation.email,
          role: membershipData?.role || invitation.invited_role || 'employee',
          businessName: business?.name || 'FinanSEAL Business'
        }
      })

    } else {
      console.log('[Invitation Validate] Processing JWT token')

      // Handle JWT token
      const tokenValidation = await validateInvitationToken(token)

      if (!tokenValidation.isValid || !tokenValidation.data) {
        return NextResponse.json({
          success: false,
          error: tokenValidation.error || 'Invalid invitation token'
        }, { status: 404 })
      }

      const { userId, businessId, email, role } = tokenValidation.data

      // Get business information
      const { data: business } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', businessId)
        .single()

      return NextResponse.json({
        success: true,
        invitation: {
          email,
          role,
          businessName: business?.name || 'FinanSEAL Business'
        }
      })
    }

  } catch (error) {
    console.error('[Invitation Accept API] GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * Accept invitation and associate authenticated user with business
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for invitation acceptance
    const rateLimitResponse = await rateLimiters.auth(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    const body = await request.json()
    const { token, fullName } = body

    if (!token) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invitation token is required' 
      }, { status: 400 })
    }

    const supabase = createServiceSupabaseClient()

    let invitation: any
    let invitationBusinessId: string
    let invitationEmail: string
    let invitationRole: string
    let isSecureToken = false

    // Check if this is a legacy UUID token or new secure token
    if (isLegacyUuidToken(token)) {
      console.log('[Invitation Accept] Processing legacy UUID token')

      // Handle legacy UUID token (backward compatibility)
      const { data: legacyInvitation, error: fetchError } = await supabase
        .from('users')
        .select('id, email, created_at, business_id, invited_by, invited_role, clerk_user_id')
        .eq('id', token)
        .not('invited_by', 'is', null) // Must be an invitation
        .single()

      if (fetchError || !legacyInvitation) {
        return NextResponse.json({
          success: false,
          error: 'Invalid invitation'
        }, { status: 404 })
      }

      invitation = legacyInvitation
      invitationBusinessId = invitation.business_id
      invitationEmail = invitation.email
      invitationRole = invitation.invited_role || 'employee'

    } else {
      console.log('[Invitation Accept] Processing JWT token')
      isSecureToken = true

      // Handle JWT token
      const tokenValidation = await validateInvitationToken(token)

      if (!tokenValidation.isValid || !tokenValidation.data) {
        return NextResponse.json({
          success: false,
          error: tokenValidation.error || 'Invalid invitation token'
        }, { status: 404 })
      }

      const { userId, businessId, email, role } = tokenValidation.data

      // Get the user record for this JWT token
      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('id, email, created_at, business_id, invited_by, invited_role, clerk_user_id')
        .eq('id', userId)
        .single()

      if (userError || !userRecord) {
        return NextResponse.json({
          success: false,
          error: 'Invalid invitation - user record not found'
        }, { status: 404 })
      }

      invitation = userRecord
      invitationBusinessId = businessId
      invitationEmail = email
      invitationRole = role
    }

    // Check if invitation is either pending OR already processed by user recovery for current user
    const isPending = invitation.clerk_user_id === null
    const isUserRecoveryProcessed = invitation.clerk_user_id === userId

    if (!isPending && !isUserRecoveryProcessed) {
      return NextResponse.json({
        success: false,
        error: 'Invitation has already been accepted by another user'
      }, { status: 409 })
    }

    // If user recovery already processed this invitation, just return success
    if (isUserRecoveryProcessed) {
      console.log(`[Invitation Accept] User recovery already processed invitation for ${invitation.email}`)

      return NextResponse.json({
        success: true,
        message: 'Invitation already accepted via user recovery',
        alreadyProcessed: true
      })
    }

    // Get the role from business_memberships separately
    const { data: membershipData } = await supabase
      .from('business_memberships')
      .select('role')
      .eq('user_id', invitation.id)
      .eq('business_id', invitation.business_id)
      .single()

    // Check if invitation hasn't expired (7 days)
    const invitedDate = new Date(invitation.created_at)
    const expirationDate = new Date(invitedDate.getTime() + (7 * 24 * 60 * 60 * 1000))
    
    if (new Date() > expirationDate) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invitation has expired' 
      }, { status: 410 })
    }

    // Get user's email from Clerk
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerkUser = await (await clerkClient()).users.getUser(userId)
    const userEmail = clerkUser.emailAddresses[0]?.emailAddress

    // Verify email matches invitation
    if (!userEmail || userEmail.toLowerCase() !== invitationEmail.toLowerCase()) {
      return NextResponse.json({
        success: false,
        error: 'Email address does not match invitation'
      }, { status: 403 })
    }

    // Check if user already has records in Supabase
    const { data: existingUserRecord } = await supabase
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()

    if (existingUserRecord && existingUserRecord.id !== invitation.id) {
      // CRITICAL FIX: Handle cross-business invitations properly
      console.log(`[Invitation Accept] Found existing user ${existingUserRecord.id} for ${userEmail}`)
      console.log(`[Invitation Accept] Invitation for business: ${invitationBusinessId}`)

      // Check if this is a re-invitation to the same business (removed user being re-invited)
      const { data: existingMembership } = await supabase
        .from('business_memberships')
        .select('business_id, status')
        .eq('user_id', existingUserRecord.id)
        .eq('business_id', invitationBusinessId)
        .single()

      if (existingMembership) {
        console.log(`[Invitation Accept] Same-business re-invitation detected - reactivating existing membership`)

        // Get the invited role from business_memberships BEFORE deleting it
        const { data: membershipData } = await supabase
          .from('business_memberships')
          .select('role')
          .eq('user_id', invitation.id)
          .eq('business_id', invitationBusinessId)
          .single()

        const membershipRole = membershipData?.role || invitation.invited_role || 'employee'

        // Reactivate existing inactive business membership for existing user
        const { data: newMembership, error: membershipError } = await supabase
          .from('business_memberships')
          .update({
            role: membershipRole,
            status: 'active',
            joined_at: new Date().toISOString(),
            invited_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', existingUserRecord.id)
          .eq('business_id', invitationBusinessId)
          .select('*')
          .single()

        if (membershipError) {
          console.error('[Invitation Accept] Re-invitation membership reactivation error:', membershipError)
          return NextResponse.json({
            success: false,
            error: 'Failed to reactivate membership'
          }, { status: 500 })
        }

        // Clean up the invitation user record since we're using existing user
        await supabase
          .from('business_memberships')
          .delete()
          .eq('user_id', invitation.id)
          .eq('business_id', invitationBusinessId)

        await supabase
          .from('users')
          .delete()
          .eq('id', invitation.id)

        // Set role permissions and sync to Clerk
        const rolePermissions = {
          employee: true,
          manager: membershipRole === 'manager' || membershipRole === 'admin',
          admin: membershipRole === 'admin'
        }

        const syncResult = await syncRoleToClerk(userId, rolePermissions)
        if (!syncResult.success) {
          console.error(`[Invitation Accept] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
        }

        console.log(`[Invitation Accept API] Same-business re-invitation accepted: ${userEmail} → ${invitationBusinessId}`)

        return NextResponse.json({
          success: true,
          message: 'Re-invitation accepted successfully',
          profile: newMembership
        })

      } else {
        // CRITICAL FIX: Cross-business invitation - don't create duplicate user records
        console.log(`[Invitation Accept] Cross-business invitation detected for existing user ${existingUserRecord.id}`)

        // Get the invited role from the invitation membership record
        const { data: invitationMembershipData } = await supabase
          .from('business_memberships')
          .select('role')
          .eq('user_id', invitation.id)
          .eq('business_id', invitationBusinessId)
          .single()

        const membershipRole = invitationMembershipData?.role || invitation.invited_role || 'employee'

        // Create new business membership for existing user (cross-business)
        const { data: newMembership, error: membershipError } = await supabase
          .from('business_memberships')
          .insert({
            user_id: existingUserRecord.id, // Use existing user record
            business_id: invitationBusinessId,
            role: membershipRole,
            status: 'active',
            joined_at: new Date().toISOString(),
            invited_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('*')
          .single()

        if (membershipError) {
          console.error('[Invitation Accept] Cross-business membership creation error:', membershipError)
          return NextResponse.json({
            success: false,
            error: 'Failed to create cross-business membership'
          }, { status: 500 })
        }

        // Clean up the invitation user record since we're using existing user
        await supabase
          .from('business_memberships')
          .delete()
          .eq('user_id', invitation.id)
          .eq('business_id', invitationBusinessId)

        await supabase
          .from('users')
          .delete()
          .eq('id', invitation.id)

        // Set role permissions and sync to Clerk for new business context
        const rolePermissions = {
          employee: true,
          manager: membershipRole === 'manager' || membershipRole === 'admin',
          admin: membershipRole === 'admin'
        }

        const syncResult = await syncRoleToClerk(userId, rolePermissions)
        if (!syncResult.success) {
          console.error(`[Invitation Accept] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
        }

        // Update active business in Clerk metadata
        try {
          const { clerkClient } = await import('@clerk/nextjs/server')
          const clerkUser = await (await clerkClient()).users.getUser(userId)

          await (await clerkClient()).users.updateUser(userId, {
            publicMetadata: {
              ...(clerkUser.publicMetadata || {}),
              activeBusinessId: invitationBusinessId
            }
          })
        } catch (clerkError) {
          console.error('[Invitation Accept] Warning: Failed to set active business:', clerkError)
        }

        console.log(`[Invitation Accept API] Cross-business invitation accepted: ${userEmail} → ${invitationBusinessId}`)

        return NextResponse.json({
          success: true,
          message: 'Cross-business invitation accepted successfully',
          profile: newMembership,
          crossBusiness: true
        })
      }
    }

    // Determine the full name to save
    let finalFullName = null
    if (fullName && fullName.trim()) {
      // Use provided full name from the form
      finalFullName = fullName.trim()
    } else if (clerkUser.firstName && clerkUser.lastName) {
      // Fall back to Clerk name if available
      finalFullName = `${clerkUser.firstName} ${clerkUser.lastName}`
    }

    // CRITICAL FIX: Update the invitation record to associate with Clerk user
    // Use invitation.id instead of token (which is JWT for secure tokens)
    const invitationUserId = isSecureToken ? invitation.id : token
    const { error: updateError } = await supabase
      .from('users')
      .update({
        clerk_user_id: userId,
        full_name: finalFullName,
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationUserId)

    if (updateError) {
      console.error('[Invitation Accept API] Update error:', updateError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to accept invitation' 
      }, { status: 500 })
    }

    // Update existing business membership with joined_at timestamp
    // The membership record was created during invitation with the correct role
    const membershipRole = membershipData?.role || invitation.invited_role || 'employee'

    const { data: businessMembership, error: profileError } = await supabase
      .from('business_memberships')
      .update({
        status: 'active', // Change from pending to active
        joined_at: new Date().toISOString(), // Mark as officially joined
        updated_at: new Date().toISOString()
      })
      .eq('user_id', invitation.id)
      .eq('business_id', invitation.business_id)
      .select('*')
      .single()

    // Set role permissions based on the actual invited role
    const rolePermissions = {
      employee: membershipRole === 'employee',
      manager: membershipRole === 'manager',
      admin: membershipRole === 'admin'
    }

    if (profileError) {
      console.error('[Invitation Accept API] Profile creation error:', profileError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to create employee profile' 
      }, { status: 500 })
    }

    // Sync role to Clerk metadata
    const syncResult = await syncRoleToClerk(userId, rolePermissions)
    if (!syncResult.success) {
      console.error(`[Invitation Accept] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
    }

    // JWT tokens are stateless - no need to mark as used in database

    console.log(`[Invitation Accept API] Invitation accepted: ${userEmail} → ${invitationBusinessId}`)

    return NextResponse.json({
      success: true,
      message: 'Invitation accepted successfully',
      profile: businessMembership
    })

  } catch (error) {
    console.error('[Invitation Accept API] POST error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}