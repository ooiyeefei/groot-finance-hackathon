/**
 * Invitation Service Layer
 * Handles business logic for invitation acceptance and management
 *
 * Functions:
 * - validateInvitation() - Validate invitation token and return invitation details
 * - acceptInvitation() - Accept invitation and associate user with business
 * - resendInvitation() - Resend invitation email with new token
 */

import { createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { validateInvitationToken, isLegacyUuidToken, createInvitationToken } from './invitation-tokens'
import { syncRoleToClerk } from '@/domains/security/lib/rbac'
import { emailService } from '@/lib/services/email-service'

/**
 * Validate invitation token and return invitation details
 * Used for frontend validation before user signs up/in
 */
export async function validateInvitation(
  token: string
): Promise<{ success: boolean; invitation: { email: string; role: string; businessName: string }; error?: string }> {
  try {
    // Step 1: Validate token format and decode
    const tokenData = await _validateInvitationToken(token)

    // Step 2: Get business name for display
    const supabase = createServiceSupabaseClient()
    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', tokenData.businessId)
      .single()

    // Step 3: Return invitation details for frontend display
    return {
      success: true,
      invitation: {
        email: tokenData.email,
        role: tokenData.role,
        businessName: business?.name || 'FinanSEAL Business'
      }
    }
  } catch (error) {
    console.error('[Invitation Service] Validation error:', error)
    return {
      success: false,
      invitation: { email: '', role: '', businessName: '' },
      error: error instanceof Error ? error.message : 'Invalid invitation'
    }
  }
}

/**
 * Accept invitation and associate authenticated user with business
 * Primary entry point for invitation acceptance workflow
 */
export async function acceptInvitation(
  token: string,
  clerkUserId: string,
  fullName?: string
): Promise<{ success: boolean; message: string; profile?: any; alreadyProcessed?: boolean; crossBusiness?: boolean }> {
  // Step 1: Validate token
  const tokenData = await _validateInvitationToken(token)

  // Step 2: Get and validate invitation record
  const invitationRecord = await _getAndValidateInvitation(tokenData, clerkUserId)

  // Check if already processed by user recovery
  if (invitationRecord.alreadyProcessed) {
    return {
      success: true,
      message: 'Invitation already accepted via user recovery',
      alreadyProcessed: true
    }
  }

  // Step 3: Get Clerk user and verify email match
  const { clerkUser, existingUserRecord } = await _getUserAndCheckExisting(
    clerkUserId,
    tokenData.email
  )

  // Step 4: Update user and membership records
  const { membership, crossBusiness } = await _updateUserAndMembership(
    invitationRecord.invitation,
    tokenData,
    clerkUser,
    clerkUserId,
    existingUserRecord,
    invitationRecord.membershipRole,
    fullName
  )

  return {
    success: true,
    message: crossBusiness
      ? 'Cross-business invitation accepted successfully'
      : 'Invitation accepted successfully',
    profile: membership,
    crossBusiness
  }
}

/**
 * Private helper: Validate invitation token (JWT or legacy UUID)
 * Returns decoded token data with invitation details
 */
async function _validateInvitationToken(token: string): Promise<{
  userId: string
  businessId: string
  email: string
  role: string
  isLegacyToken: boolean
}> {
  // Check if this is a legacy UUID token or new secure token
  if (isLegacyUuidToken(token)) {
    console.log('[Invitation Service] Processing legacy UUID token')

    const supabase = createServiceSupabaseClient()

    // Handle legacy UUID token (backward compatibility)
    const { data: invitation, error: fetchError } = await supabase
      .from('users')
      .select('id, email, created_at, business_id, invited_by, invited_role, clerk_user_id')
      .eq('id', token)
      .not('invited_by', 'is', null) // Must be an invitation
      .single()

    if (fetchError || !invitation) {
      throw new Error('Invalid invitation')
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
      throw new Error('Invitation has expired')
    }

    return {
      userId: invitation.id,
      businessId: invitation.business_id,
      email: invitation.email,
      role: membershipData?.role || invitation.invited_role || 'employee',
      isLegacyToken: true
    }

  } else {
    console.log('[Invitation Service] Processing JWT token')

    // Handle JWT token
    const tokenValidation = await validateInvitationToken(token)

    if (!tokenValidation.isValid || !tokenValidation.data) {
      throw new Error(tokenValidation.error || 'Invalid invitation token')
    }

    const { userId, businessId, email, role } = tokenValidation.data

    // Get the user record for this JWT token
    const supabase = createServiceSupabaseClient()
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id, email, created_at, business_id, invited_by, invited_role, clerk_user_id')
      .eq('id', userId)
      .single()

    if (userError || !userRecord) {
      throw new Error('Invalid invitation - user record not found')
    }

    return {
      userId,
      businessId,
      email,
      role,
      isLegacyToken: false
    }
  }
}

/**
 * Private helper: Get and validate invitation record from database
 * Checks invitation status and whether it's already been accepted
 */
async function _getAndValidateInvitation(
  tokenData: { userId: string; businessId: string; email: string; role: string; isLegacyToken: boolean },
  clerkUserId: string
): Promise<{
  invitation: any
  membershipRole: string
  alreadyProcessed?: boolean
}> {
  const supabase = createServiceSupabaseClient()

  // Fetch the invitation user record
  const { data: invitation, error: fetchError } = await supabase
    .from('users')
    .select('id, email, created_at, business_id, invited_by, invited_role, clerk_user_id')
    .eq('id', tokenData.userId)
    .single()

  if (fetchError || !invitation) {
    throw new Error('Invitation record not found')
  }

  // Check if invitation is either pending OR already processed by user recovery for current user
  const isPending = invitation.clerk_user_id === null
  const isUserRecoveryProcessed = invitation.clerk_user_id === clerkUserId

  if (!isPending && !isUserRecoveryProcessed) {
    throw new Error('Invitation has already been accepted by another user')
  }

  // If user recovery already processed this invitation, return early
  if (isUserRecoveryProcessed) {
    console.log(`[Invitation Service] User recovery already processed invitation for ${invitation.email}`)
    return {
      invitation,
      membershipRole: 'employee',
      alreadyProcessed: true
    }
  }

  // Get the role from business_memberships
  const { data: membershipData } = await supabase
    .from('business_memberships')
    .select('role')
    .eq('user_id', invitation.id)
    .eq('business_id', tokenData.businessId)
    .single()

  const membershipRole = membershipData?.role || invitation.invited_role || tokenData.role || 'employee'

  // Check if invitation hasn't expired (7 days)
  const invitedDate = new Date(invitation.created_at)
  const expirationDate = new Date(invitedDate.getTime() + (7 * 24 * 60 * 60 * 1000))

  if (new Date() > expirationDate) {
    throw new Error('Invitation has expired')
  }

  return {
    invitation,
    membershipRole
  }
}

/**
 * Private helper: Get Clerk user and check for existing Supabase user record
 * Verifies email matches invitation and looks up existing user
 */
async function _getUserAndCheckExisting(
  clerkUserId: string,
  invitationEmail: string
): Promise<{
  clerkUser: any
  existingUserRecord: any | null
}> {
  // Get user's email from Clerk
  const { clerkClient } = await import('@clerk/nextjs/server')
  const clerkUser = await (await clerkClient()).users.getUser(clerkUserId)
  const userEmail = clerkUser.emailAddresses[0]?.emailAddress

  // Verify email matches invitation
  if (!userEmail || userEmail.toLowerCase() !== invitationEmail.toLowerCase()) {
    throw new Error('Email address does not match invitation')
  }

  // Check if user already has records in Supabase
  const supabase = createServiceSupabaseClient()
  const { data: existingUserRecord } = await supabase
    .from('users')
    .select('id, business_id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  return {
    clerkUser,
    existingUserRecord
  }
}

/**
 * Private helper: Update user and membership records
 * Handles three flows: new user, cross-business invitation, same-business re-invitation
 */
async function _updateUserAndMembership(
  invitation: any,
  tokenData: { userId: string; businessId: string; email: string; role: string; isLegacyToken: boolean },
  clerkUser: any,
  clerkUserId: string,
  existingUserRecord: any | null,
  membershipRole: string,
  fullName?: string
): Promise<{
  membership: any
  crossBusiness?: boolean
}> {
  const supabase = createServiceSupabaseClient()

  // FLOW 1 & 2: Existing user (cross-business or re-invitation)
  if (existingUserRecord && existingUserRecord.id !== invitation.id) {
    console.log(`[Invitation Service] Found existing user ${existingUserRecord.id} for ${tokenData.email}`)

    // Check if this is a re-invitation to the same business
    const { data: existingMembership } = await supabase
      .from('business_memberships')
      .select('business_id, status')
      .eq('user_id', existingUserRecord.id)
      .eq('business_id', tokenData.businessId)
      .single()

    if (existingMembership) {
      // FLOW 1: Same-business re-invitation - reactivate existing membership
      console.log('[Invitation Service] Same-business re-invitation detected - reactivating existing membership')

      const { data: membership, error: membershipError } = await supabase
        .from('business_memberships')
        .update({
          role: membershipRole,
          status: 'active',
          joined_at: new Date().toISOString(),
          invited_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', existingUserRecord.id)
        .eq('business_id', tokenData.businessId)
        .select('*')
        .single()

      if (membershipError) {
        throw new Error('Failed to reactivate membership')
      }

      // Clean up invitation records
      await supabase.from('business_memberships').delete()
        .eq('user_id', invitation.id)
        .eq('business_id', tokenData.businessId)
      await supabase.from('users').delete()
        .eq('id', invitation.id)

      // Sync role to Clerk
      const rolePermissions = {
        employee: true,
        manager: membershipRole === 'manager' || membershipRole === 'admin',
        admin: membershipRole === 'admin'
      }

      const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)
      if (!syncResult.success) {
        console.error(`[Invitation Service] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
      }

      return { membership, crossBusiness: false }

    } else {
      // FLOW 2: Cross-business invitation - create new membership for existing user
      console.log(`[Invitation Service] Cross-business invitation detected for existing user ${existingUserRecord.id}`)

      const { data: membership, error: membershipError } = await supabase
        .from('business_memberships')
        .insert({
          user_id: existingUserRecord.id,
          business_id: tokenData.businessId,
          role: membershipRole,
          status: 'active',
          joined_at: new Date().toISOString(),
          invited_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single()

      if (membershipError) {
        throw new Error('Failed to create cross-business membership')
      }

      // Clean up invitation records
      await supabase.from('business_memberships').delete()
        .eq('user_id', invitation.id)
        .eq('business_id', tokenData.businessId)
      await supabase.from('users').delete()
        .eq('id', invitation.id)

      // Sync role to Clerk and update active business
      const rolePermissions = {
        employee: true,
        manager: membershipRole === 'manager' || membershipRole === 'admin',
        admin: membershipRole === 'admin'
      }

      const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)
      if (!syncResult.success) {
        console.error(`[Invitation Service] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
      }

      // Update active business in Clerk metadata
      try {
        const { clerkClient } = await import('@clerk/nextjs/server')
        await (await clerkClient()).users.updateUser(clerkUserId, {
          publicMetadata: {
            ...(clerkUser.publicMetadata || {}),
            activeBusinessId: tokenData.businessId
          }
        })
      } catch (clerkError) {
        console.error('[Invitation Service] Warning: Failed to set active business:', clerkError)
      }

      return { membership, crossBusiness: true }
    }
  }

  // FLOW 3: New user - update invitation record and activate membership
  console.log('[Invitation Service] Processing new user invitation')

  // Determine full name
  let finalFullName = null
  if (fullName && fullName.trim()) {
    finalFullName = fullName.trim()
  } else if (clerkUser.firstName && clerkUser.lastName) {
    finalFullName = `${clerkUser.firstName} ${clerkUser.lastName}`
  }

  // Update invitation user record to associate with Clerk user
  const invitationUserId = tokenData.isLegacyToken ? tokenData.userId : invitation.id
  const { error: updateError } = await supabase
    .from('users')
    .update({
      clerk_user_id: clerkUserId,
      full_name: finalFullName,
      updated_at: new Date().toISOString()
    })
    .eq('id', invitationUserId)

  if (updateError) {
    throw new Error('Failed to update user record')
  }

  // Activate business membership
  const { data: membership, error: membershipError } = await supabase
    .from('business_memberships')
    .update({
      status: 'active',
      joined_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', invitation.id)
    .eq('business_id', invitation.business_id)
    .select('*')
    .single()

  if (membershipError) {
    throw new Error('Failed to activate membership')
  }

  // Sync role to Clerk
  const rolePermissions = {
    employee: membershipRole === 'employee',
    manager: membershipRole === 'manager',
    admin: membershipRole === 'admin'
  }

  const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)
  if (!syncResult.success) {
    console.error(`[Invitation Service] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
  }

  return { membership, crossBusiness: false }
}

/**
 * Resend invitation email with new token
 * Primary entry point for invitation resend workflow
 */
export async function resendInvitation(
  invitationId: string,
  businessId: string,
  inviterClerkUserId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createServiceSupabaseClient()

  // Get the invitation record
  const { data: invitation, error: fetchError } = await supabase
    .from('users')
    .select('id, email, created_at, business_id, invited_by, invited_role')
    .eq('id', invitationId)
    .eq('business_id', businessId)
    .is('clerk_user_id', null) // Only pending invitations
    .not('invited_by', 'is', null) // Must be an invitation
    .single()

  if (fetchError || !invitation) {
    throw new Error('Invitation not found or already accepted')
  }

  // Get the role from business_memberships
  const { data: membershipData } = await supabase
    .from('business_memberships')
    .select('role')
    .eq('user_id', invitation.id)
    .eq('business_id', invitation.business_id)
    .single()

  // Check if invitation has expired (7 days)
  const invitedDate = new Date(invitation.created_at)
  const expirationDate = new Date(invitedDate.getTime() + (7 * 24 * 60 * 60 * 1000))

  if (new Date() > expirationDate) {
    // Refresh invitation timestamp
    const { error: updateError } = await supabase
      .from('users')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId)

    if (updateError) {
      throw new Error('Failed to refresh invitation')
    }
  }

  // Get business name for email
  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single()

  // Get inviter name from Clerk
  const { clerkClient } = await import('@clerk/nextjs/server')
  const inviterUser = await (await clerkClient()).users.getUser(inviterClerkUserId)
  const inviterName = inviterUser.firstName && inviterUser.lastName
    ? `${inviterUser.firstName} ${inviterUser.lastName}`
    : inviterUser.emailAddresses[0]?.emailAddress || 'Team Admin'

  // Generate new JWT invitation token with 7-day expiration
  const role = membershipData?.role || invitation.invited_role || 'employee'
  const secureToken = await createInvitationToken(
    invitation.id,
    businessId,
    invitation.email,
    role,
    7 // 7 days expiration
  )

  // Send invitation email using JWT token
  const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/en/invitations/accept?token=${secureToken}`

  const emailResult = await emailService.sendInvitation({
    email: invitation.email,
    businessName: business?.name || 'FinanSEAL Business',
    inviterName,
    role,
    invitationToken: secureToken,
    invitationUrl
  })

  if (!emailResult.success) {
    throw new Error('Failed to send invitation email')
  }

  console.log(`[Invitation Service] Invitation resent: ${invitation.email} → ${businessId}`)

  return {
    success: true,
    message: 'Invitation resent successfully'
  }
}
