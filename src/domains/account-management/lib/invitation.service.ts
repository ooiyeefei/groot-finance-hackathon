/**
 * Invitation Service Layer
 * Handles invitation validation, acceptance, and management
 *
 * Migrated to Convex from Supabase
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { validateInvitationToken, isLegacyUuidToken, createInvitationToken } from './invitation-tokens'
import { syncRoleToClerk } from '@/domains/security/lib/rbac'
import { emailService } from '@/lib/services/email-service'

/**
 * Validate invitation token and return details for frontend display
 * Uses Convex to fetch business details
 */
export async function validateInvitation(
  token: string
): Promise<{ success: boolean; invitation: { email: string; role: string; businessName: string }; error?: string }> {
  try {
    // Validate token and decode
    const tokenData = await _validateInvitationToken(token)

    // Get business name for display
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      throw new Error('Failed to get authenticated Convex client')
    }

    const business = await client.query(api.functions.businesses.getById, {
      id: tokenData.businessId
    })

    // Return invitation details
    return {
      success: true,
      invitation: {
        email: tokenData.email,
        role: tokenData.role,
        businessName: business?.name || 'Groot Finance Business'
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
 * Accept invitation and associate user with business
 * Uses Convex mutations for all database operations
 */
export async function acceptInvitation(
  token: string,
  clerkUserId: string,
  fullName?: string
): Promise<{ success: boolean; message: string; profile?: any; alreadyProcessed?: boolean; crossBusiness?: boolean }> {
  // Validate token
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
  membershipId: string
  userId: string
  businessId: string
  email: string
  role: string
  isLegacyToken: boolean
}> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Check if this is a legacy UUID token or new secure token
  if (isLegacyUuidToken(token)) {
    // Processing legacy UUID token
    // For legacy tokens, the token IS the membership ID or user ID
    // We need to look up the pending membership

    const pendingMemberships = await client.query(api.functions.memberships.getPendingInvitations, {
      businessId: token as any // Legacy token might be membership ID directly
    })

    // Try to find a matching pending invitation
    // This is complex because legacy tokens could be user IDs or membership IDs
    // For simplicity, we'll attempt to find by the token value
    const invitation = pendingMemberships?.find((m: any) =>
      String(m._id) === token || String(m.userId) === token
    )

    if (!invitation) {
      throw new Error('Invalid invitation - legacy token not found')
    }

    // Check expiration (7 days from creation)
    const createdDate = new Date(invitation._creationTime)
    const expirationDate = new Date(createdDate.getTime() + (7 * 24 * 60 * 60 * 1000))

    if (new Date() > expirationDate) {
      throw new Error('Invitation has expired')
    }

    return {
      membershipId: invitation._id,
      userId: invitation.userId,
      businessId: invitation.businessId,
      email: invitation.user?.email || '',
      role: invitation.role || 'employee',
      isLegacyToken: true
    }
  } else {
    // Processing JWT token
    const tokenValidation = await validateInvitationToken(token)

    if (!tokenValidation.isValid || !tokenValidation.data) {
      throw new Error(tokenValidation.error || 'Invalid invitation token')
    }

    const { userId, businessId, email, role } = tokenValidation.data

    // Verify user exists in Convex
    const user = await client.query(api.functions.users.getById, { id: userId })

    if (!user) {
      throw new Error('Invalid invitation - user record not found')
    }

    // Find the pending membership for this user/business combination
    const membership = await client.query(api.functions.memberships.verifyMembership, {
      businessId
    })

    return {
      membershipId: membership?.id || userId, // Fall back to userId if no membership found yet
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
  tokenData: { membershipId: string; userId: string; businessId: string; email: string; role: string; isLegacyToken: boolean },
  clerkUserId: string
): Promise<{
  invitation: any
  membershipRole: string
  alreadyProcessed?: boolean
}> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Fetch the user record
  const user = await client.query(api.functions.users.getById, {
    id: tokenData.userId
  })

  if (!user) {
    throw new Error('Invitation record not found')
  }

  // Check if invitation is either pending OR already processed by user recovery for current user
  const isPending = !user.clerkUserId || user.clerkUserId.startsWith('pending_')
  const isUserRecoveryProcessed = user.clerkUserId === clerkUserId

  if (!isPending && !isUserRecoveryProcessed) {
    throw new Error('Invitation has already been accepted by another user')
  }

  // If user recovery already processed this invitation, return early
  if (isUserRecoveryProcessed) {
    return {
      invitation: user,
      membershipRole: 'employee',
      alreadyProcessed: true
    }
  }

  // Get the membership record to check role
  const membership = await client.query(api.functions.memberships.verifyMembership, {
    businessId: tokenData.businessId
  })

  const membershipRole = membership?.role || tokenData.role || 'employee'

  // Check expiration (7 days from creation)
  const createdDate = new Date(user._creationTime)
  const expirationDate = new Date(createdDate.getTime() + (7 * 24 * 60 * 60 * 1000))

  if (new Date() > expirationDate) {
    throw new Error('Invitation has expired')
  }

  return {
    invitation: user,
    membershipRole
  }
}

/**
 * Private helper: Get Clerk user and check for existing Convex user record
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

  // Check if user already has records in Convex
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  const existingUserRecord = await client.query(api.functions.users.getByClerkId, {
    clerkUserId
  })

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
  tokenData: { membershipId: string; userId: string; businessId: string; email: string; role: string; isLegacyToken: boolean },
  clerkUser: any,
  clerkUserId: string,
  existingUserRecord: any | null,
  membershipRole: string,
  fullName?: string
): Promise<{
  membership: any
  crossBusiness?: boolean
}> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // FLOW 1 & 2: Existing user (cross-business or re-invitation)
  if (existingUserRecord && existingUserRecord._id !== invitation._id) {
    // Found existing user for cross-business invitation

    // Check if this is a re-invitation to the same business
    const existingMembership = await client.query(api.functions.memberships.verifyMembership, {
      businessId: tokenData.businessId
    })

    if (existingMembership) {
      // FLOW 1: Same-business re-invitation - use Convex mutation to reactivate
      console.log('[Invitation Service] Same-business re-invitation detected - reactivating existing membership')

      // Reactivate the membership via Convex mutation
      await client.mutation(api.functions.memberships.reactivateMember, {
        membershipId: existingMembership.id as any
      })

      // Update role if different
      if (membershipRole !== existingMembership.role) {
        await client.mutation(api.functions.memberships.updateRoleByStringIds, {
          userId: String(existingUserRecord._id),
          businessId: tokenData.businessId,
          newRole: membershipRole as 'manager' | 'employee'  // Note: 'owner' cannot be assigned via invitation
        })
      }

      // Switch to this business
      await client.mutation(api.functions.users.switchBusiness, {
        businessId: tokenData.businessId as any
      })

      // Clean up invitation placeholder user if different from existing user
      if (invitation._id && invitation._id !== existingUserRecord._id) {
        // Delete the placeholder membership and user
        // Note: We use a try-catch as the placeholder might not have a membership
        try {
          await client.mutation(api.functions.memberships.declineInvitation, {
            membershipId: tokenData.membershipId as any
          })
        } catch (e) {
          console.log('[Invitation Service] No placeholder membership to clean up')
        }
      }

      // Sync role to Clerk - invited users can only be employee or manager (not owner)
      const rolePermissions = {
        employee: true,
        manager: membershipRole === 'manager',
        finance_admin: false  // finance_admin permissions are for owners only
      }

      const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)
      if (!syncResult.success) {
        console.error(`[Invitation Service] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
      }

      return { membership: existingMembership, crossBusiness: false }

    } else {
      // FLOW 2: Cross-business invitation - create new membership for existing user
      console.log('[Invitation Service] Cross-business invitation detected for existing user')

      // Use inviteByEmail then acceptInvitation pattern is already handled
      // We need to accept the pending invitation and transfer it to the existing user
      // For cross-business, we accept the invitation (which activates the membership)

      await client.mutation(api.functions.memberships.acceptInvitation, {
        membershipId: tokenData.membershipId as any
      })

      // Update Clerk metadata with new business option
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

      // Sync role to Clerk - invited users can only be employee or manager (not owner)
      const rolePermissions = {
        employee: true,
        manager: membershipRole === 'manager',
        finance_admin: false  // finance_admin permissions are for owners only
      }

      const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)
      if (!syncResult.success) {
        console.error(`[Invitation Service] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
      }

      // Fetch the updated membership
      const updatedMembership = await client.query(api.functions.memberships.verifyMembership, {
        businessId: tokenData.businessId
      })

      return { membership: updatedMembership, crossBusiness: true }
    }
  }

  // FLOW 3: New user - update invitation record and activate membership
  console.log('[Invitation Service] Processing new user invitation')

  // Determine full name
  let finalFullName: string | undefined
  if (fullName && fullName.trim()) {
    finalFullName = fullName.trim()
  } else if (clerkUser.firstName && clerkUser.lastName) {
    finalFullName = `${clerkUser.firstName} ${clerkUser.lastName}`
  }

  // Use the acceptInvitation mutation which properly links Clerk account
  // to the invitation placeholder and activates the membership
  const profile = await client.mutation(api.functions.users.acceptInvitation, {
    clerkUserId,
    email: tokenData.email,
    fullName: finalFullName,
    businessId: tokenData.businessId as any
  })

  // Sync role to Clerk - invited users can only be employee or manager (not owner)
  const rolePermissions = {
    employee: membershipRole === 'employee',
    manager: membershipRole === 'manager',
    finance_admin: false  // finance_admin permissions are for owners only
  }

  const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)
  if (!syncResult.success) {
    console.error(`[Invitation Service] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
  }

  return { membership: profile, crossBusiness: false }
}

/**
 * Resend invitation email with new token
 * Primary entry point for invitation resend workflow
 * Uses Convex queries for data access
 *
 * Note: Returns success even if email fails (graceful degradation)
 * The invitation is still valid; user can share the link manually
 */
export async function resendInvitation(
  invitationId: string,
  businessId: string,
  inviterClerkUserId: string
): Promise<{ success: boolean; message: string; emailFailed?: boolean; warning?: string; invitationUrl?: string }> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Get pending invitations for this business
  const pendingInvitations = await client.query(api.functions.memberships.getPendingInvitations, {
    businessId: businessId as any
  })

  // Find the specific invitation
  const invitation = pendingInvitations?.find((inv: any) =>
    String(inv._id) === invitationId || String(inv.userId) === invitationId
  )

  if (!invitation) {
    throw new Error('Invitation not found or already accepted')
  }

  const email = invitation.user?.email
  if (!email) {
    throw new Error('Invitation email not found')
  }

  // Check if invitation has expired (7 days)
  const invitedDate = new Date(invitation._creationTime)
  const expirationDate = new Date(invitedDate.getTime() + (7 * 24 * 60 * 60 * 1000))

  if (new Date() > expirationDate) {
    console.log('[Invitation Service] Invitation expired, but can still resend with new token')
  }

  // Get business name for email
  const business = await client.query(api.functions.businesses.getById, {
    id: businessId
  })

  // Get inviter name from Clerk
  const { clerkClient } = await import('@clerk/nextjs/server')
  const inviterUser = await (await clerkClient()).users.getUser(inviterClerkUserId)
  const inviterName = inviterUser.firstName && inviterUser.lastName
    ? `${inviterUser.firstName} ${inviterUser.lastName}`
    : inviterUser.emailAddresses[0]?.emailAddress || 'Team Admin'

  // Generate new JWT invitation token with 7-day expiration
  const role = invitation.role || 'employee'
  const secureToken = await createInvitationToken(
    invitationId,
    businessId,
    email,
    role,
    7 // 7 days expiration
  )

  // Build invitation URL
  const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/en/invitations/accept?token=${secureToken}`

  // Send invitation email using JWT token
  const emailResult = await emailService.sendInvitation({
    email,
    businessName: business?.name || 'Groot Finance Business',
    inviterName,
    role,
    invitationToken: secureToken,
    invitationUrl
  })

  // Handle email failure gracefully - invitation is still valid
  if (!emailResult.success) {
    console.error('[Invitation Service] Email sending failed:', emailResult.error)
    return {
      success: true,
      message: 'Invitation refreshed but email delivery failed',
      emailFailed: true,
      warning: `Email delivery failed: ${emailResult.error}. Please share the invitation link manually with the invitee.`,
      invitationUrl // Include URL so user can share manually
    }
  }

  console.log(`[Invitation Service] Invitation resent to ${email}`)

  return {
    success: true,
    message: 'Invitation resent successfully'
  }
}
