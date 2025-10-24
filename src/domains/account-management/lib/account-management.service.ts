/**
 * Account Management Service Layer
 * Extracted business logic for business, membership, and invitation operations
 *
 * Functions:
 * Business Operations:
 * - createBusiness() - Create new business with owner membership
 * - getBusinessContext() - Get current business context
 * - getUserBusinessMemberships() - List all user's business memberships
 * - switchActiveBusiness() - Switch user's active business
 *
 * Membership Operations:
 * - updateMembership() - Update membership role/status
 * - deleteMembership() - Hard delete membership
 *
 * Business Profile Operations:
 * - getBusinessProfile() - Get business profile
 * - updateBusinessProfile() - Update business profile
 *
 * Invitation Operations:
 * - createInvitation() - Send invitation to join business
 * - getInvitations() - List invitations for business
 * - resendInvitation() - Resend invitation email
 * - deleteInvitation() - Delete pending invitation
 *
 * COGS Categories Operations:
 * - getCOGSCategories() - Get all COGS categories for business
 * - getEnabledCOGSCategories() - Get only enabled COGS categories
 * - createCOGSCategory() - Create new COGS category
 * - updateCOGSCategory() - Update existing COGS category
 * - deleteCOGSCategory() - Delete COGS category
 */

import { createServiceSupabaseClient, createBusinessContextSupabaseClient, getUserData } from '@/lib/db/supabase-server'
import { syncRoleToClerk } from '@/domains/security/lib/rbac'
import { getCurrentBusinessContext, getUserBusinessMemberships as getBusinessMemberships, switchActiveBusiness as switchBusiness } from '@/lib/db/business-context'
import { emailService } from '@/lib/services/email-service'
import { createInvitationToken } from './invitation-tokens'
import { getDefaultExpenseCategories } from '@/domains/expense-claims/lib/default-expense-categories'
import { getDefaultCOGSCategories } from '@/domains/invoices/lib/default-cogs-categories'
import { SupportedCurrency } from '@/domains/accounting-entries/types'

// ============================================================================
// Types
// ============================================================================

export interface CreateBusinessRequest {
  name: string
  country_code?: string
  home_currency?: SupportedCurrency
}

export interface Business {
  id: string
  name: string
  slug: string
  country_code: string
  home_currency: string
  is_owner: boolean
  owner_id?: string
}

export interface BusinessProfile {
  id: string
  name: string
  logo_url: string | null
  logo_fallback_color: string
}

export interface UpdateMembershipRequest {
  status?: 'active' | 'inactive' | 'pending' | 'suspended'
  role?: 'employee' | 'manager' | 'admin'
  reason?: string
}

export interface CreateInvitationRequest {
  email: string
  role: 'employee' | 'manager' | 'admin'
  employee_id?: string
  department?: string
  job_title?: string
}

export interface Invitation {
  id: string
  email: string
  status: 'pending' | 'accepted'
  invited_at: string
  invited_by: string
  invitation_token: string
  role: string
}

// ============================================================================
// Business Operations
// ============================================================================

/**
 * Create new business with owner membership and default settings
 * Includes atomic rollback on any failure
 */
export async function createBusiness(
  clerkUserId: string,
  request: CreateBusinessRequest
): Promise<Business> {
  const { name, country_code = 'SG', home_currency = 'SGD' } = request

  // Validation
  if (!name || !name.trim() || name.trim().length < 2) {
    throw new Error('Business name must be at least 2 characters')
  }

  const userData = await getUserData(clerkUserId)
  if (!userData) {
    throw new Error('User not found in system')
  }

  const supabase = createServiceSupabaseClient()

  // Generate unique business slug
  const baseSlug = name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const timestamp = Date.now()
  const businessSlug = `${baseSlug}-${timestamp}`

  console.log(`[Business Service] Creating business for user ${userData.email}: "${name}" (${businessSlug})`)

  // Generate default categories (with debug logging)
  const defaultExpenseCategories = getDefaultExpenseCategories()
  const defaultCogsCategories = getDefaultCOGSCategories()

  console.log(`[Business Service] Generated ${defaultExpenseCategories.length} default expense categories`)
  console.log(`[Business Service] Generated ${defaultCogsCategories.length} default COGS categories`)
  console.log(`[Business Service] First COGS category:`, defaultCogsCategories[0]?.category_name || 'NONE')

  // Create the business with user as owner
  const { data: newBusiness, error: businessError } = await supabase
    .from('businesses')
    .insert({
      name: name.trim(),
      slug: businessSlug,
      owner_id: userData.id,
      country_code,
      home_currency,
      custom_expense_categories: defaultExpenseCategories,
      custom_cogs_categories: defaultCogsCategories,
      created_at: new Date().toISOString()
    })
    .select('*')
    .single()

  if (businessError) {
    throw new Error(`Failed to create business: ${businessError.message}`)
  }

  console.log(`[Business Service] Business created with ID: ${newBusiness.id}`)

  // Create owner's business membership with admin role
  const { error: membershipError } = await supabase
    .from('business_memberships')
    .insert({
      user_id: userData.id,
      business_id: newBusiness.id,
      role: 'admin',
      joined_at: new Date().toISOString(),
      status: 'active'
    })

  if (membershipError) {
    console.error('[Business Service] Error creating owner membership:', membershipError)
    // Rollback: Delete the business
    await supabase.from('businesses').delete().eq('id', newBusiness.id)
    throw new Error(`Failed to create owner membership: ${membershipError.message}`)
  }

  console.log(`[Business Service] Owner membership created successfully`)

  // Update user's business_id to point to new business
  await supabase
    .from('users')
    .update({
      business_id: newBusiness.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', userData.id)

  // Sync admin permissions to Clerk metadata
  const adminRolePermissions = {
    employee: true,
    manager: true,
    admin: true
  }

  const syncResult = await syncRoleToClerk(clerkUserId, adminRolePermissions)
  if (!syncResult.success) {
    console.error(`[Business Service] CRITICAL: Failed to sync permissions to Clerk: ${syncResult.error}`)
    // Rollback everything
    await performCompleteRollback(supabase, newBusiness.id, userData.id, 'Clerk permission sync failed')
    throw new Error(`Failed to sync user permissions: ${syncResult.error}`)
  }

  // Set the new business as active business in Clerk metadata
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    await (await clerkClient()).users.updateUser(clerkUserId, {
      publicMetadata: {
        ...((await (await clerkClient()).users.getUser(clerkUserId)).publicMetadata || {}),
        activeBusinessId: newBusiness.id
      }
    })
    console.log(`[Business Service] Successfully set active business in Clerk metadata`)
  } catch (error) {
    console.error('[Business Service] CRITICAL: Failed to set active business in Clerk:', error)
    // Rollback everything
    await performCompleteRollback(supabase, newBusiness.id, userData.id, 'Clerk metadata sync failed')
    throw new Error('Failed to activate business in user profile')
  }

  console.log(`[Business Service] Successfully created business "${name}" for user ${userData.email}`)

  return {
    id: newBusiness.id,
    name: newBusiness.name,
    slug: newBusiness.slug,
    country_code: newBusiness.country_code,
    home_currency: newBusiness.home_currency,
    is_owner: true,
    owner_id: userData.id
  }
}

/**
 * Complete rollback function for atomic business creation
 */
async function performCompleteRollback(supabase: any, businessId: string, userId: string, reason: string) {
  console.log(`[Business Service] ROLLBACK: Performing complete cleanup - ${reason}`)

  try {
    await supabase.from('business_memberships').delete().eq('business_id', businessId)
    console.log(`[Business Service] ROLLBACK: Deleted business membership`)

    await supabase.from('businesses').delete().eq('id', businessId)
    console.log(`[Business Service] ROLLBACK: Deleted business`)

    await supabase
      .from('users')
      .update({
        business_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
    console.log(`[Business Service] ROLLBACK: Reset user business_id`)

    console.log(`[Business Service] ROLLBACK: Complete cleanup successful`)
  } catch (rollbackError) {
    console.error(`[Business Service] ROLLBACK ERROR: Failed to cleanup:`, rollbackError)
  }
}

/**
 * Get current business context from Clerk JWT
 */
export async function getBusinessContext(clerkUserId: string) {
  return await getCurrentBusinessContext(clerkUserId)
}

/**
 * Get all businesses user is member of
 */
export async function getUserBusinessMemberships(clerkUserId: string) {
  return await getBusinessMemberships(clerkUserId)
}

/**
 * Switch user's active business (updates Clerk JWT)
 */
export async function switchActiveBusiness(businessId: string, clerkUserId: string) {
  return await switchBusiness(businessId, clerkUserId)
}

// ============================================================================
// Membership Operations
// ============================================================================

/**
 * Update membership - handles role changes, status changes (remove/reactivate)
 */
export async function updateMembership(
  membershipId: string,
  updates: UpdateMembershipRequest,
  currentUserId: string,
  businessId: string
): Promise<any> {
  const { status, role, reason } = updates

  // Validate required fields
  if (!status && !role) {
    throw new Error('Either status or role must be provided for update')
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
    throw new Error('Membership not found')
  }

  // Verify admin has permission to manage this business
  if (currentMembership.business_id !== businessId) {
    throw new Error('You can only manage memberships in your own business')
  }

  const targetUser = currentMembership.users
  const business = currentMembership.businesses

  // Cannot modify business owner
  if (business.owner_id === targetUser.id) {
    throw new Error('Cannot modify business owner membership')
  }

  // Prevent admin lockout - check if this is the last admin
  if (role && (role === 'employee' || role === 'manager') && currentMembership.role === 'admin') {
    const { data: adminCount } = await supabase
      .from('business_memberships')
      .select('id', { count: 'exact' })
      .eq('business_id', currentMembership.business_id)
      .eq('role', 'admin')
      .eq('status', 'active')

    if (adminCount?.length === 1) {
      throw new Error('Cannot demote the last admin. The business must have at least one admin member.')
    }
  }

  // Prevent admin lockout - check if removing/deactivating the last admin
  if (status && (status === 'inactive' || status === 'suspended') && currentMembership.role === 'admin' && currentMembership.status === 'active') {
    const { data: adminCount } = await supabase
      .from('business_memberships')
      .select('id', { count: 'exact' })
      .eq('business_id', currentMembership.business_id)
      .eq('role', 'admin')
      .eq('status', 'active')

    if (adminCount?.length === 1) {
      throw new Error('Cannot remove the last admin. The business must have at least one active admin member.')
    }
  }

  // Build update object
  const updateData: any = {
    updated_at: new Date().toISOString()
  }

  if (status) {
    updateData.status = status
    if (status === 'active' && currentMembership.status !== 'active') {
      updateData.joined_at = new Date().toISOString()
    }
  }

  if (role) {
    updateData.role = role
  }

  console.log(`[Membership Service] Updating membership ${membershipId}:`, {
    current: { status: currentMembership.status, role: currentMembership.role },
    updates: updateData,
    reason
  })

  // Update membership
  const { data: updatedMembership, error: updateError } = await supabase
    .from('business_memberships')
    .update(updateData)
    .eq('id', membershipId)
    .select('*')
    .single()

  if (updateError) {
    throw new Error(`Failed to update membership: ${updateError.message}`)
  }

  // Clear business context FIRST if user is being removed/deactivated (SECURITY FIX)
  if (status === 'inactive' || status === 'suspended') {
    try {
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

        console.log(`[Membership Service] SECURITY: Cleared business context for removed user: ${targetUser.email} → ${newBusinessId || 'NULL'}`)

        // Clear Clerk metadata if user has Clerk ID
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
      console.error('[Membership Service] CRITICAL: Failed to clear business context:', contextError)
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
      console.error(`[Membership Service] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
    }
  }

  const action = status === 'inactive' ? 'removed' :
                 status === 'active' && (currentMembership.status === 'inactive' || currentMembership.status === 'suspended') ? 'reactivated' :
                 role ? 'role_changed' : 'updated'

  console.log(`[Membership Service] Successfully ${action} user ${targetUser.email}`, {
    membership_id: membershipId,
    business_id: currentMembership.business_id,
    old_status: currentMembership.status,
    new_status: updatedMembership.status,
    old_role: currentMembership.role,
    new_role: updatedMembership.role,
    reason: reason || 'No reason provided'
  })

  return {
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
  }
}

/**
 * Hard delete membership (rare operation)
 */
export async function deleteMembership(
  membershipId: string,
  businessId: string
): Promise<void> {
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
    throw new Error('Membership not found')
  }

  // Verify admin has permission
  if (membership.business_id !== businessId) {
    throw new Error('You can only delete memberships in your own business')
  }

  // Cannot delete business owner
  if (membership.businesses.owner_id === membership.user_id) {
    throw new Error('Cannot delete business owner membership')
  }

  // Hard delete
  const { error: deleteError } = await supabase
    .from('business_memberships')
    .delete()
    .eq('id', membershipId)

  if (deleteError) {
    throw new Error(`Failed to delete membership: ${deleteError.message}`)
  }

  console.log(`[Membership Service] Hard deleted membership: ${membership.users.email} from business ${membership.businesses.name}`)
}

// ============================================================================
// Business Profile Operations
// ============================================================================

/**
 * Get business profile for current user
 */
export async function getBusinessProfile(clerkUserId: string): Promise<BusinessProfile> {
  const user = await getUserData(clerkUserId)

  if (!user.business_id) {
    throw new Error('No business associated with user')
  }

  // ✅ SECURITY FIX: Use business context client for business profile access
  const supabase = await createBusinessContextSupabaseClient()

  const { data: businessProfile, error } = await supabase
    .from('businesses')
    .select('id, name, logo_url, logo_fallback_color')
    .eq('id', user.business_id)
    .single()

  if (error) {
    console.error('[Business Profile] Database error:', error)

    // If it's a no rows error, return a minimal profile with defaults
    if (error.code === 'PGRST116') {
      console.log('[Business Profile] No profile found, returning defaults for business:', user.business_id)
      return {
        id: user.business_id,
        name: 'Business',
        logo_url: null,
        logo_fallback_color: '#3b82f6'
      } as BusinessProfile
    }

    throw new Error(`Failed to fetch business profile: ${error.message}`)
  }

  // Ensure all fields have defaults if null
  return {
    id: businessProfile.id,
    name: businessProfile.name || 'Business',
    logo_url: businessProfile.logo_url || null,
    logo_fallback_color: businessProfile.logo_fallback_color || '#3b82f6'
  } as BusinessProfile
}

/**
 * Update business profile
 */
export async function updateBusinessProfile(
  clerkUserId: string,
  updates: { name?: string; logo_url?: string; logo_fallback_color?: string }
): Promise<BusinessProfile> {
  const { name, logo_url, logo_fallback_color } = updates

  // Validate input
  if (name !== undefined && (!name || name.trim().length === 0)) {
    throw new Error('Business name is required')
  }

  const user = await getUserData(clerkUserId)

  if (!user.business_id) {
    throw new Error('No business associated with user')
  }

  // ✅ SECURITY FIX: Use business context client for business profile updates
  const supabase = await createBusinessContextSupabaseClient()

  const updateData: any = {
    updated_at: new Date().toISOString()
  }

  if (name) {
    updateData.name = name.trim()
  }

  if (logo_url !== undefined) {
    updateData.logo_url = logo_url
  }

  if (logo_fallback_color) {
    updateData.logo_fallback_color = logo_fallback_color
  }

  const { data: updatedProfile, error } = await supabase
    .from('businesses')
    .update(updateData)
    .eq('id', user.business_id)
    .select('id, name, logo_url, logo_fallback_color')
    .single()

  if (error) {
    throw new Error('Failed to update business profile')
  }

  return updatedProfile as BusinessProfile
}

// ============================================================================
// Invitation Operations
// ============================================================================

/**
 * Create and send business invitation
 */
export async function createInvitation(
  request: CreateInvitationRequest,
  inviterUserId: string,
  businessId: string
): Promise<{ invitation: any; emailFailed?: boolean; warning?: string }> {
  const { email, role, employee_id, department, job_title } = request

  // Validate input
  if (!['employee', 'manager', 'admin'].includes(role)) {
    throw new Error('Invalid role specified')
  }

  const supabase = createServiceSupabaseClient()

  console.log(`[Invitation Service] Checking for existing user with email: ${email}`)

  // Check if user already has active membership in current business
  const { data: activeMembership } = await supabase
    .from('business_memberships')
    .select(`
      id,
      user_id,
      role,
      status,
      users!business_memberships_user_id_fkey!inner(email, clerk_user_id, full_name)
    `)
    .eq('business_id', businessId)
    .eq('status', 'active')
    .ilike('users.email', email)
    .single()

  if (activeMembership) {
    throw new Error('User is already an active member of this business')
  }

  // Check for pending invitations in current business
  const { data: pendingMembership } = await supabase
    .from('business_memberships')
    .select(`
      id,
      user_id,
      users!business_memberships_user_id_fkey!inner(email)
    `)
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .ilike('users.email', email)
    .single()

  if (pendingMembership) {
    console.log(`[Invitation Service] Found pending invitation for ${email}, cleaning up for re-invitation`)
    // Delete only business membership, never user records
    await supabase
      .from('business_memberships')
      .delete()
      .eq('id', pendingMembership.id)
      .eq('business_id', businessId)
  }

  // Check for existing user globally
  const { data: globalUser } = await supabase
    .from('users')
    .select('id, clerk_user_id, business_id, full_name, email, status')
    .ilike('email', email)
    .not('clerk_user_id', 'is', null)
    .single()

  let targetUserId = null
  let isExistingUser = false

  if (globalUser) {
    console.log(`[Invitation Service] Found existing user globally: ${email}`)
    targetUserId = globalUser.id
    isExistingUser = true
  } else {
    // Create new user record
    console.log(`[Invitation Service] Creating new user record for invitation`)

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        business_id: businessId,
        invited_by: inviterUserId,
        full_name: null,
        clerk_user_id: null,
        invited_role: role
      })
      .select('*')
      .single()

    if (insertError) {
      throw new Error('Failed to create invitation')
    }

    targetUserId = newUser.id
  }

  // Create business membership record
  const { error: membershipError } = await supabase
    .from('business_memberships')
    .insert({
      user_id: targetUserId,
      business_id: businessId,
      role: role,
      invited_at: new Date().toISOString(),
      status: 'pending',
      joined_at: null
    })

  if (membershipError) {
    // Clean up only if we created a new user record
    if (!isExistingUser && targetUserId) {
      await supabase.from('users').delete().eq('id', targetUserId)
    }
    throw new Error(`Failed to create invitation membership: ${membershipError.message}`)
  }

  // Get business name for email
  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single()

  // Get inviter name from Clerk
  const { clerkClient } = await import('@clerk/nextjs/server')
  const inviterUser = await (await clerkClient()).users.getUser(inviterUserId)
  const inviterName = inviterUser.firstName && inviterUser.lastName
    ? `${inviterUser.firstName} ${inviterUser.lastName}`
    : inviterUser.emailAddresses[0]?.emailAddress || 'Team Admin'

  // Generate secure JWT invitation token
  const secureToken = await createInvitationToken(
    targetUserId!,
    businessId,
    email,
    role,
    7 // 7 days expiration
  )

  // Send invitation email
  const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/en/invitations/accept?token=${secureToken}`

  const emailResult = await emailService.sendInvitation({
    email,
    businessName: business?.name || 'FinanSEAL Business',
    inviterName,
    role,
    invitationToken: secureToken,
    invitationUrl
  })

  if (!emailResult.success) {
    console.error('[Invitation Service] Email sending failed:', emailResult.error)
    return {
      invitation: {
        id: targetUserId,
        email: email.toLowerCase(),
        role: role,
        business_id: businessId,
        invited_by: inviterUserId,
        invitation_type: isExistingUser ? 'cross_business' : 'new_user',
        created_at: new Date().toISOString()
      },
      emailFailed: true,
      warning: `Invitation created but email delivery failed: ${emailResult.error}. Please share the invitation link manually or try resending.`
    }
  }

  console.log(`[Invitation Service] ${isExistingUser ? 'Cross-business' : 'New user'} invitation sent: ${email} → ${businessId}`)

  return {
    invitation: {
      id: targetUserId,
      email: email.toLowerCase(),
      role: role,
      business_id: businessId,
      invited_by: inviterUserId,
      invitation_type: isExistingUser ? 'cross_business' : 'new_user',
      created_at: new Date().toISOString()
    }
  }
}

/**
 * Get invitations for current business
 */
export async function getInvitations(
  businessId: string,
  options: {
    status?: 'pending' | 'accepted'
    limit?: number
    offset?: number
  } = {}
): Promise<{ invitations: Invitation[]; total: number }> {
  const { status, limit = 50, offset = 0 } = options

  const supabase = createServiceSupabaseClient()

  let query = supabase
    .from('users')
    .select(`
      id,
      email,
      created_at,
      invited_by,
      full_name,
      clerk_user_id,
      invited_role,
      business_memberships!business_memberships_user_id_fkey!inner(role)
    `, { count: 'exact' })
    .eq('business_id', businessId)
    .not('invited_by', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Filter by status if provided
  if (status === 'pending') {
    query = query.is('clerk_user_id', null)
  } else if (status === 'accepted') {
    query = query.not('clerk_user_id', 'is', null)
  }

  const { data: invitations, error, count } = await query

  if (error) {
    throw new Error('Failed to fetch invitations')
  }

  // Transform data to match expected format
  const formattedInvitations = invitations?.map(invitation => {
    const membershipRole = invitation.business_memberships?.[0]?.role
    const invitationRole = membershipRole || invitation.invited_role || 'employee'

    return {
      id: invitation.id,
      email: invitation.email,
      status: invitation.clerk_user_id ? 'accepted' : 'pending',
      invited_at: invitation.created_at,
      invited_by: invitation.invited_by,
      invitation_token: invitation.id,
      role: invitationRole
    } as Invitation
  }) || []

  return {
    invitations: formattedInvitations,
    total: count || 0
  }
}

/**
 * Resend invitation email
 * Note: Implementation depends on separate resend endpoint logic
 */
export async function resendInvitation(
  invitationId: string,
  businessId: string
): Promise<void> {
  // This would need the full resend logic from the endpoint
  // For now, throwing not implemented
  throw new Error('Resend invitation logic needs to be implemented in service layer')
}

/**
 * Delete pending invitation
 */
export async function deleteInvitation(
  invitationId: string,
  businessId: string
): Promise<void> {
  const supabase = createServiceSupabaseClient()

  // Get invitation details
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('id, email, business_id, clerk_user_id')
    .eq('id', invitationId)
    .eq('business_id', businessId)
    .single()

  if (fetchError || !user) {
    throw new Error('Invitation not found')
  }

  // Only delete if invitation is still pending (no clerk_user_id)
  if (user.clerk_user_id) {
    throw new Error('Cannot delete accepted invitation')
  }

  // Delete business membership first
  await supabase
    .from('business_memberships')
    .delete()
    .eq('user_id', invitationId)
    .eq('business_id', businessId)

  // Delete user record (only for pending invitations)
  const { error: deleteError } = await supabase
    .from('users')
    .delete()
    .eq('id', invitationId)

  if (deleteError) {
    throw new Error(`Failed to delete invitation: ${deleteError.message}`)
  }

  console.log(`[Invitation Service] Deleted pending invitation: ${user.email}`)
}

// ============================================================================
// COGS Categories Types
// ============================================================================

export interface COGSCategory {
  id: string
  category_name: string
  category_code: string
  description?: string
  cost_type: 'direct' | 'indirect'
  is_active: boolean
  ai_keywords?: string[]
  vendor_patterns?: string[]
  sort_order?: number
  created_at?: string
  updated_at?: string
}

export interface CreateCOGSCategoryRequest {
  category_name: string
  category_code: string
  description?: string
  cost_type: 'direct' | 'indirect'
  ai_keywords?: string[]
  vendor_patterns?: string[]
  sort_order?: number
}

export interface UpdateCOGSCategoryRequest {
  id: string
  category_name?: string
  category_code?: string
  description?: string
  cost_type?: 'direct' | 'indirect'
  ai_keywords?: string[]
  vendor_patterns?: string[]
  sort_order?: number
  is_active?: boolean
}

// ============================================================================
// COGS Categories Operations
// ============================================================================

/**
 * Get all COGS categories for business (including inactive)
 */
export async function getCOGSCategories(businessId: string): Promise<COGSCategory[]> {
  // ✅ SECURITY FIX: Use business context client for business-scoped COGS operations
  const supabase = await createBusinessContextSupabaseClient()

  const { data: businessData, error } = await supabase
    .from('businesses')
    .select('custom_cogs_categories')
    .eq('id', businessId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch COGS categories: ${error.message}`)
  }

  const categories = (businessData?.custom_cogs_categories || [])
    .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))

  return categories as COGSCategory[]
}

/**
 * Get only enabled COGS categories for dropdowns
 */
export async function getEnabledCOGSCategories(businessId: string): Promise<COGSCategory[]> {
  // ✅ SECURITY FIX: Use business context client for business-scoped COGS operations
  const supabase = await createBusinessContextSupabaseClient()

  const { data: businessData, error } = await supabase
    .from('businesses')
    .select('custom_cogs_categories')
    .eq('id', businessId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch COGS categories: ${error.message}`)
  }

  const categories = (businessData?.custom_cogs_categories || [])
    .filter((category: any) => category.is_active !== false)
    .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))

  return categories as COGSCategory[]
}

/**
 * Create new COGS category
 */
export async function createCOGSCategory(
  businessId: string,
  request: CreateCOGSCategoryRequest
): Promise<COGSCategory> {
  const { category_name, category_code, description, cost_type, ai_keywords, vendor_patterns, sort_order } = request

  // Validate required fields
  if (!category_name || !category_code || !cost_type) {
    throw new Error('Category name, code, and cost type are required')
  }

  // Validate cost_type
  if (!['direct', 'indirect'].includes(cost_type)) {
    throw new Error('Cost type must be either "direct" or "indirect"')
  }

  // ✅ SECURITY FIX: Use business context client for business-scoped COGS operations
  const supabase = await createBusinessContextSupabaseClient()

  // Get existing categories to check for duplicates
  const { data: businessData } = await supabase
    .from('businesses')
    .select('custom_cogs_categories')
    .eq('id', businessId)
    .single()

  const existingCategories = businessData?.custom_cogs_categories || []
  const existingCategory = existingCategories.find((cat: any) => cat.category_code === category_code)

  if (existingCategory) {
    throw new Error('Category code already exists')
  }

  // Create new category
  const newCategory: COGSCategory = {
    id: crypto.randomUUID(),
    category_name,
    category_code,
    description: description || '',
    cost_type,
    ai_keywords: ai_keywords || [],
    vendor_patterns: vendor_patterns || [],
    sort_order: sort_order || 99,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Add to existing categories array
  const updatedCategories = [...existingCategories, newCategory]

  // Update the business
  const { error: updateError } = await supabase
    .from('businesses')
    .update({ custom_cogs_categories: updatedCategories })
    .eq('id', businessId)

  if (updateError) {
    throw new Error(`Failed to create COGS category: ${updateError.message}`)
  }

  console.log(`[COGS Service] Created category: ${category_name} (${category_code})`)

  return newCategory
}

/**
 * Update existing COGS category
 */
export async function updateCOGSCategory(
  businessId: string,
  request: UpdateCOGSCategoryRequest
): Promise<COGSCategory> {
  const { id, category_name, category_code, description, cost_type, ai_keywords, vendor_patterns, sort_order, is_active } = request

  if (!id) {
    throw new Error('Category ID is required for updates')
  }

  // Validate cost_type if provided
  if (cost_type && !['direct', 'indirect'].includes(cost_type)) {
    throw new Error('Cost type must be either "direct" or "indirect"')
  }

  // ✅ SECURITY FIX: Use business context client for business-scoped COGS operations
  const supabase = await createBusinessContextSupabaseClient()

  // Get existing categories
  const { data: businessData } = await supabase
    .from('businesses')
    .select('custom_cogs_categories')
    .eq('id', businessId)
    .single()

  const existingCategories = businessData?.custom_cogs_categories || []
  const categoryIndex = existingCategories.findIndex((cat: any) => cat.id === id)

  if (categoryIndex === -1) {
    throw new Error('COGS category not found')
  }

  // Update the category
  const updatedCategories = [...existingCategories]
  updatedCategories[categoryIndex] = {
    ...updatedCategories[categoryIndex],
    ...(category_name && { category_name }),
    ...(category_code && { category_code }),
    ...(description !== undefined && { description }),
    ...(cost_type && { cost_type }),
    ...(ai_keywords && { ai_keywords }),
    ...(vendor_patterns && { vendor_patterns }),
    ...(sort_order !== undefined && { sort_order }),
    ...(is_active !== undefined && { is_active }),
    updated_at: new Date().toISOString()
  }

  // Update the business
  const { error: updateError } = await supabase
    .from('businesses')
    .update({ custom_cogs_categories: updatedCategories })
    .eq('id', businessId)

  if (updateError) {
    throw new Error(`Failed to update COGS category: ${updateError.message}`)
  }

  console.log(`[COGS Service] Updated category: ${id}`)

  return updatedCategories[categoryIndex] as COGSCategory
}

/**
 * Delete COGS category
 */
export async function deleteCOGSCategory(
  businessId: string,
  categoryId: string
): Promise<void> {
  if (!categoryId) {
    throw new Error('Category ID is required for deletion')
  }

  // ✅ SECURITY FIX: Use business context client for business-scoped COGS operations
  const supabase = await createBusinessContextSupabaseClient()

  // Get existing categories
  const { data: businessData } = await supabase
    .from('businesses')
    .select('custom_cogs_categories')
    .eq('id', businessId)
    .single()

  const existingCategories = businessData?.custom_cogs_categories || []
  const categoryExists = existingCategories.find((cat: any) => cat.id === categoryId)

  if (!categoryExists) {
    throw new Error('COGS category not found')
  }

  // Remove the category
  const updatedCategories = existingCategories.filter((cat: any) => cat.id !== categoryId)

  // Update the business
  const { error: updateError } = await supabase
    .from('businesses')
    .update({ custom_cogs_categories: updatedCategories })
    .eq('id', businessId)

  if (updateError) {
    throw new Error(`Failed to delete COGS category: ${updateError.message}`)
  }

  console.log(`[COGS Service] Deleted category: ${categoryId}`)
}
