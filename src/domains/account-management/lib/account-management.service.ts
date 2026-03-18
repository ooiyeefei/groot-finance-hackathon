/**
 * Account Management Service Layer
 * Extracted business logic for business, membership, and invitation operations
 *
 * Migrated to Convex from Supabase
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

import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { syncRoleToClerk } from '@/domains/security/lib/rbac'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { getCurrentBusinessContext, getUserBusinessMemberships as getBusinessMemberships, switchActiveBusiness as switchBusiness } from '@/lib/db/business-context'
import { emailService } from '@/lib/services/email-service'
import { createInvitationToken } from './invitation-tokens'
import { getDefaultExpenseCategories } from '@/domains/expense-claims/lib/default-expense-categories'
import { getDefaultCOGSCategories } from '@/domains/invoices/lib/default-cogs-categories'
import { SupportedCurrency } from '@/lib/types/currency'
import { canAddTeamMember, getTeamLimit, type PlanKey } from '@/lib/stripe/plans'

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
  home_currency: string
  address?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  // e-inv-ui-forms: LHDN compliance fields
  lhdn_tin?: string | null
  business_registration_number?: string | null
  msic_code?: string | null
  msic_description?: string | null
  sst_registration_number?: string | null
  lhdn_client_id?: string | null
  // NOTE: lhdn_client_secret is NOT stored in Convex — goes to AWS SSM Parameter Store
  // via /api/v1/account-management/businesses/lhdn-secret endpoint
  peppol_participant_id?: string | null
  // e-inv-ui-forms: Structured address
  address_line1?: string | null
  address_line2?: string | null
  address_line3?: string | null
  city?: string | null
  state_code?: string | null
  postal_code?: string | null
  country_code?: string | null
  // LHDN self-bill auto-trigger
  auto_self_bill_exempt_vendors?: boolean
  // 001-doc-email-forward
  slug?: string
  emailForwardingEnabled?: boolean
  emailForwardingPrefix?: string
  emailForwardingAllowlist?: string[]
}

export interface UpdateMembershipRequest {
  status?: 'active' | 'inactive' | 'pending' | 'suspended'
  role?: 'employee' | 'manager' | 'finance_admin'  // Note: 'owner' role cannot be changed via API
  reason?: string
}

export interface CreateInvitationRequest {
  email: string
  role: 'employee' | 'manager' | 'finance_admin'  // Note: 'owner' role cannot be invited
  manager_id?: string  // Required for employees, optional for others
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
 * Uses Convex mutation
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

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Generate unique business slug
  const baseSlug = name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const timestamp = Date.now()
  const businessSlug = `${baseSlug}-${timestamp}`

  console.log(`[Business Service] Creating business: "${name}" (${businessSlug})`)

  // Generate default categories
  const defaultExpenseCategories = getDefaultExpenseCategories()
  const defaultCogsCategories = getDefaultCOGSCategories()

  console.log(`[Business Service] Generated ${defaultExpenseCategories.length} default expense categories`)
  console.log(`[Business Service] Generated ${defaultCogsCategories.length} default COGS categories`)

  // Get current user to get their Convex ID
  const user = await client.query(api.functions.users.getByClerkId, { clerkUserId })
  if (!user) {
    throw new Error('User not found in system')
  }

  // Create business with Convex mutation
  // Note: The businesses.create mutation creates the owner membership automatically
  const businessId = await client.mutation(api.functions.businesses.create, {
    name: name.trim(),
    homeCurrency: home_currency,
  })

  console.log(`[Business Service] Business created with ID: ${businessId}`)

  // Get the created business to update with additional fields
  const business = await client.query(api.functions.businesses.getById, { id: businessId })

  // Update with additional fields (slug, country_code, categories)
  // This requires a direct patch - let's add customExpenseCategories and customCogsCategories
  // We'll need to call updateBusinessByStringId for the additional fields
  await client.mutation(api.functions.businesses.updateBusinessByStringId, {
    businessId: businessId,
    country_code,
  })

  // Update categories - we need to patch the business directly
  // For now, we'll store categories via the COGS mutation pattern
  // The categories are stored in the business record

  // Sync admin permissions to Clerk metadata
  const adminRolePermissions = {
    employee: true,
    manager: true,
    finance_admin: true
  }

  const syncResult = await syncRoleToClerk(clerkUserId, adminRolePermissions)
  if (!syncResult.success) {
    console.error(`[Business Service] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
  }

  console.log(`[Business Service] Successfully created business "${name}"`)

  return {
    id: businessId,
    name: name.trim(),
    slug: businessSlug,
    country_code,
    home_currency,
    is_owner: true,
    owner_id: user._id
  }
}

/**
 * Get current business context from Clerk JWT
 * Already migrated to Convex in business-context.ts
 */
export async function getBusinessContext(clerkUserId: string) {
  return await getCurrentBusinessContext(clerkUserId)
}

/**
 * Get all businesses user is member of
 * Already migrated to Convex in business-context.ts
 */
export async function getUserBusinessMemberships(clerkUserId: string) {
  return await getBusinessMemberships(clerkUserId)
}

/**
 * Switch user's active business
 * Already migrated to Convex in business-context.ts
 */
export async function switchActiveBusiness(businessId: string, clerkUserId: string) {
  return await switchBusiness(businessId, clerkUserId)
}

// ============================================================================
// Membership Operations
// ============================================================================

/**
 * Update membership - handles role changes, status changes (remove/reactivate)
 * Uses Convex mutations
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

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Handle role update via existing Convex mutation
  if (role) {
    const validRoles = ['employee', 'manager', 'finance_admin'] as const  // Note: 'owner' cannot be assigned via API
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role specified')
    }

    // Get target membership to find user info
    const teamMembers = await client.query(api.functions.memberships.getTeamMembersWithManagers, {
      businessId
    })

    const targetMember = teamMembers?.find((m: any) => m.id === membershipId || m.membership_id === membershipId)
    if (!targetMember) {
      throw new Error('Membership not found')
    }

    // Use updateRoleByStringIds for role change
    await client.mutation(api.functions.memberships.updateRoleByStringIds, {
      userId: targetMember.user_id,
      businessId,
      newRole: role
    })

    console.log(`[Membership Service] Updated role for membership ${membershipId} to ${role}`)

    // Sync to Clerk if we have clerk_user_id
    if (targetMember.clerk_user_id && !targetMember.clerk_user_id.startsWith('migrated_')) {
      const rolePermissions = {
        employee: true,
        manager: role === 'manager' || role === 'finance_admin',
        finance_admin: role === 'finance_admin'
      }
      await syncRoleToClerk(targetMember.clerk_user_id, rolePermissions)
    }

    return {
      membership: {
        id: membershipId,
        role: role,
        status: targetMember.status
      },
      user: {
        email: targetMember.email,
        name: targetMember.full_name || targetMember.email
      },
      changes: {
        action: 'role_changed',
        to: { role }
      }
    }
  }

  // Handle status update (suspend/reactivate)
  if (status) {
    // Map our status values to Convex membership status
    const statusMap: Record<string, 'active' | 'suspended' | 'pending'> = {
      'active': 'active',
      'inactive': 'suspended',
      'suspended': 'suspended',
      'pending': 'pending'
    }

    const convexStatus = statusMap[status]
    if (!convexStatus) {
      throw new Error('Invalid status specified')
    }

    if (convexStatus === 'suspended') {
      // Use suspendMember mutation
      await client.mutation(api.functions.memberships.suspendMember, {
        membershipId: membershipId as any
      })
    } else if (convexStatus === 'active') {
      // Use reactivateMember mutation
      await client.mutation(api.functions.memberships.reactivateMember, {
        membershipId: membershipId as any
      })
    }

    console.log(`[Membership Service] Updated status for membership ${membershipId} to ${status}`)

    return {
      membership: {
        id: membershipId,
        status: status
      },
      changes: {
        action: status === 'active' ? 'reactivated' : 'suspended'
      }
    }
  }

  throw new Error('No valid update operation specified')
}

/**
 * Hard delete membership (rare operation)
 * Uses Convex mutation
 */
export async function deleteMembership(
  membershipId: string,
  businessId: string
): Promise<void> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  await client.mutation(api.functions.memberships.removeMember, {
    membershipId: membershipId as any
  })

  console.log(`[Membership Service] Deleted membership: ${membershipId}`)
}

// ============================================================================
// Business Profile Operations
// ============================================================================

/**
 * Get business profile for current user
 * Uses Convex query
 */
export async function getBusinessProfile(clerkUserId: string): Promise<BusinessProfile> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Get user to find their business_id
  const user = await client.query(api.functions.users.getByClerkId, { clerkUserId })
  if (!user || !user.businessId) {
    throw new Error('No business associated with user')
  }

  // Get business profile
  const profile = await client.query(api.functions.businesses.getBusinessProfileByStringId, {
    businessId: user.businessId
  })

  if (!profile) {
    // Return defaults if not found
    return {
      id: user.businessId,
      name: 'Business',
      logo_url: null,
      logo_fallback_color: '#3b82f6',
      home_currency: 'SGD',
      address: null,
      contact_email: null,
      contact_phone: null,
    }
  }

  return {
    id: profile.id,
    name: profile.name || 'Business',
    logo_url: profile.logo_url || null,
    logo_fallback_color: profile.logo_fallback_color || '#3b82f6',
    home_currency: profile.home_currency || 'MYR',
    address: profile.address ?? null,
    contact_email: profile.contact_email ?? null,
    contact_phone: profile.contact_phone ?? null,
    // e-inv-ui-forms: LHDN compliance fields
    lhdn_tin: profile.lhdn_tin ?? null,
    business_registration_number: profile.business_registration_number ?? null,
    msic_code: profile.msic_code ?? null,
    msic_description: profile.msic_description ?? null,
    sst_registration_number: profile.sst_registration_number ?? null,
    lhdn_client_id: profile.lhdn_client_id ?? null,
    peppol_participant_id: profile.peppol_participant_id ?? null,
    // e-inv-ui-forms: Structured address
    address_line1: profile.address_line1 ?? null,
    address_line2: profile.address_line2 ?? null,
    address_line3: profile.address_line3 ?? null,
    city: profile.city ?? null,
    state_code: profile.state_code ?? null,
    postal_code: profile.postal_code ?? null,
    country_code: profile.country_code ?? null,
    // 001-doc-email-forward
    slug: profile.slug ?? undefined,
    emailForwardingEnabled: (profile as any).emailForwardingEnabled ?? false,
    emailForwardingPrefix: (profile as any).emailForwardingPrefix ?? undefined,
    emailForwardingAllowlist: (profile as any).emailForwardingAllowlist ?? [],
  }
}

/**
 * Update business profile
 * Uses Convex mutation
 */
export async function updateBusinessProfile(
  clerkUserId: string,
  updates: {
    name?: string; logo_url?: string; logo_fallback_color?: string; home_currency?: string;
    address?: string; contact_email?: string; contact_phone?: string;
    // e-inv-ui-forms: LHDN compliance fields
    lhdn_tin?: string; business_registration_number?: string; msic_code?: string;
    msic_description?: string; sst_registration_number?: string; lhdn_client_id?: string;
    // e-inv-ui-forms: Peppol
    peppol_participant_id?: string;
    // e-inv-ui-forms: Structured address
    address_line1?: string; address_line2?: string; address_line3?: string;
    city?: string; state_code?: string; postal_code?: string; country_code?: string;
    // LHDN self-bill auto-trigger
    auto_self_bill_exempt_vendors?: boolean;
    // 001-doc-email-forward: Email forwarding settings
    email_forwarding_enabled?: boolean;
    email_forwarding_allowlist?: string[];
  }
): Promise<BusinessProfile> {
  const {
    name, logo_url, logo_fallback_color, home_currency, address, contact_email, contact_phone,
    lhdn_tin, business_registration_number, msic_code, msic_description, sst_registration_number,
    lhdn_client_id, peppol_participant_id,
    address_line1, address_line2, address_line3, city, state_code, postal_code, country_code,
    auto_self_bill_exempt_vendors,
    email_forwarding_enabled, email_forwarding_allowlist,
  } = updates

  // Validate input
  if (name !== undefined && (!name || name.trim().length === 0)) {
    throw new Error('Business name is required')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Get user to find their business_id
  const user = await client.query(api.functions.users.getByClerkId, { clerkUserId })
  if (!user || !user.businessId) {
    throw new Error('No business associated with user')
  }

  // Update via Convex mutation
  await client.mutation(api.functions.businesses.updateBusinessByStringId, {
    businessId: user.businessId,
    name: name?.trim(),
    logo_url,
    logo_fallback_color,
    home_currency,
    address,
    contact_email,
    contact_phone,
    // e-inv-ui-forms: LHDN compliance fields
    lhdn_tin,
    business_registration_number,
    msic_code,
    msic_description,
    sst_registration_number,
    lhdn_client_id,
    // NOTE: lhdn_client_secret NOT sent to Convex — stored in AWS SSM Parameter Store
    // e-inv-ui-forms: Peppol
    peppol_participant_id,
    // e-inv-ui-forms: Structured address
    address_line1,
    address_line2,
    address_line3,
    city,
    state_code,
    postal_code,
    country_code,
    auto_self_bill_exempt_vendors,
    // 001-doc-email-forward
    email_forwarding_enabled,
    email_forwarding_allowlist,
  })

  // Fetch updated profile
  const profile = await client.query(api.functions.businesses.getBusinessProfileByStringId, {
    businessId: user.businessId
  })

  return {
    id: profile?.id || user.businessId,
    name: profile?.name || name || 'Business',
    logo_url: profile?.logo_url || logo_url || null,
    logo_fallback_color: profile?.logo_fallback_color || logo_fallback_color || '#3b82f6',
    home_currency: profile?.home_currency || home_currency || 'MYR',
    address: profile?.address ?? address ?? null,
    contact_email: profile?.contact_email ?? contact_email ?? null,
    contact_phone: profile?.contact_phone ?? contact_phone ?? null,
    // e-inv-ui-forms: LHDN compliance fields
    lhdn_tin: profile?.lhdn_tin ?? lhdn_tin ?? null,
    business_registration_number: profile?.business_registration_number ?? business_registration_number ?? null,
    msic_code: profile?.msic_code ?? msic_code ?? null,
    msic_description: profile?.msic_description ?? msic_description ?? null,
    sst_registration_number: profile?.sst_registration_number ?? sst_registration_number ?? null,
    lhdn_client_id: profile?.lhdn_client_id ?? lhdn_client_id ?? null,
    peppol_participant_id: profile?.peppol_participant_id ?? peppol_participant_id ?? null,
    // e-inv-ui-forms: Structured address
    address_line1: profile?.address_line1 ?? address_line1 ?? null,
    address_line2: profile?.address_line2 ?? address_line2 ?? null,
    address_line3: profile?.address_line3 ?? address_line3 ?? null,
    city: profile?.city ?? city ?? null,
    state_code: profile?.state_code ?? state_code ?? null,
    postal_code: profile?.postal_code ?? postal_code ?? null,
    country_code: profile?.country_code ?? country_code ?? null,
    // LHDN self-bill auto-trigger
    auto_self_bill_exempt_vendors: profile?.auto_self_bill_exempt_vendors ?? auto_self_bill_exempt_vendors ?? false,
    // 001-doc-email-forward
    slug: profile?.slug ?? undefined,
    emailForwardingEnabled: (profile as any)?.emailForwardingEnabled ?? email_forwarding_enabled ?? false,
    emailForwardingPrefix: (profile as any)?.emailForwardingPrefix ?? undefined,
    emailForwardingAllowlist: (profile as any)?.emailForwardingAllowlist ?? [],
  }
}

// ============================================================================
// Invitation Operations
// ============================================================================

/**
 * Create and send business invitation
 * Uses Convex mutations
 */
export async function createInvitation(
  request: CreateInvitationRequest,
  inviterUserId: string,
  businessId: string
): Promise<{ invitation: any; emailFailed?: boolean; warning?: string }> {
  const { email, role } = request

  // Validate input - 'employee', 'manager', and 'finance_admin' can be invited (not 'owner')
  if (!['employee', 'manager', 'finance_admin'].includes(role)) {
    throw new Error('Invalid role specified')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  console.log(`[Invitation Service] Creating invitation for ${email} to business ${businessId}`)

  // Use Convex inviteByEmail mutation
  // Only pass managerId if it's a non-empty string (Convex expects undefined, not empty string)
  const membershipId = await client.mutation(api.functions.memberships.inviteByEmail, {
    businessId: businessId as any,
    email: email.toLowerCase(),
    role: role as 'manager' | 'employee' | 'finance_admin',  // Note: 'owner' role cannot be invited
    ...(request.manager_id ? { managerId: request.manager_id as any } : {})  // Required for employees, optional for others
  })

  // Get business name for email
  const business = await client.query(api.functions.businesses.getById, { id: businessId })

  // Get inviter name from Clerk
  const { clerkClient } = await import('@clerk/nextjs/server')
  const inviterUser = await (await clerkClient()).users.getUser(inviterUserId)
  const inviterName = inviterUser.firstName && inviterUser.lastName
    ? `${inviterUser.firstName} ${inviterUser.lastName}`
    : inviterUser.emailAddresses[0]?.emailAddress || 'Team Admin'

  // Generate secure JWT invitation token
  const secureToken = await createInvitationToken(
    membershipId,
    businessId,
    email,
    role,
    7 // 7 days expiration
  )

  // Send invitation email
  const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/en/invitations/accept?token=${secureToken}`

  const emailResult = await emailService.sendInvitation({
    email,
    businessName: business?.name || 'Groot Finance Business',
    inviterName,
    role,
    invitationToken: secureToken,
    invitationUrl
  })

  if (!emailResult.success) {
    console.error('[Invitation Service] Email sending failed:', emailResult.error)
    return {
      invitation: {
        id: membershipId,
        email: email.toLowerCase(),
        role: role,
        business_id: businessId,
        invited_by: inviterUserId,
        created_at: new Date().toISOString()
      },
      emailFailed: true,
      warning: `Invitation created but email delivery failed: ${emailResult.error}. Please share the invitation link manually or try resending.`
    }
  }

  console.log(`[Invitation Service] Invitation sent: ${email} → ${businessId}`)

  return {
    invitation: {
      id: membershipId,
      email: email.toLowerCase(),
      role: role,
      business_id: businessId,
      invited_by: inviterUserId,
      created_at: new Date().toISOString()
    }
  }
}

/**
 * Get invitations for current business
 * Uses Convex query
 */
export async function getInvitations(
  businessId: string,
  options: {
    status?: 'pending' | 'accepted'
    limit?: number
    offset?: number
  } = {}
): Promise<{ invitations: Invitation[]; total: number }> {
  const { status, limit = 50 } = options

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Get pending invitations from Convex
  const pendingInvitations = await client.query(api.functions.memberships.getPendingInvitations, {
    businessId: businessId as any
  })

  // Also get all team members to find accepted ones
  const teamMembers = await client.query(api.functions.memberships.getTeamMembersWithManagers, {
    businessId
  })

  let invitations: Invitation[] = []

  if (!status || status === 'pending') {
    // Add pending invitations
    const pending = (pendingInvitations || []).map((inv: any) => ({
      id: inv._id,
      email: inv.user?.email || '',
      status: 'pending' as const,
      invited_at: inv.invitedAt ? new Date(inv.invitedAt).toISOString() : new Date(inv._creationTime).toISOString(),
      invited_by: '',
      invitation_token: inv._id,
      role: inv.role
    }))
    invitations = [...invitations, ...pending]
  }

  if (!status || status === 'accepted') {
    // Add accepted members (those who joined)
    const accepted = (teamMembers || [])
      .filter((m: any) => m.status === 'active')
      .map((m: any) => ({
        id: m.id,
        email: m.email || '',
        status: 'accepted' as const,
        invited_at: m.created_at,
        invited_by: '',
        invitation_token: m.id,
        role: m.role
      }))

    if (!status) {
      // Only add accepted if we're listing all
      invitations = [...invitations, ...accepted]
    } else {
      invitations = accepted
    }
  }

  // Apply limit
  const limited = invitations.slice(0, limit)

  return {
    invitations: limited,
    total: invitations.length
  }
}

/**
 * Resend invitation email
 */
export async function resendInvitation(
  invitationId: string,
  businessId: string
): Promise<void> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Get the pending invitation
  const pendingInvitations = await client.query(api.functions.memberships.getPendingInvitations, {
    businessId: businessId as any
  })

  const invitation = pendingInvitations?.find((inv: any) => inv._id === invitationId)
  if (!invitation) {
    throw new Error('Pending invitation not found')
  }

  const email = invitation.user?.email
  if (!email) {
    throw new Error('Invitation email not found')
  }

  // Get business for email
  const business = await client.query(api.functions.businesses.getById, { id: businessId })

  // Generate new token
  const secureToken = await createInvitationToken(
    invitationId,
    businessId,
    email,
    invitation.role,
    7
  )

  // Send email
  const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/en/invitations/accept?token=${secureToken}`

  const emailResult = await emailService.sendInvitation({
    email,
    businessName: business?.name || 'Groot Finance Business',
    inviterName: 'Team Admin',
    role: invitation.role,
    invitationToken: secureToken,
    invitationUrl
  })

  if (!emailResult.success) {
    throw new Error(`Failed to resend invitation: ${emailResult.error}`)
  }

  console.log(`[Invitation Service] Resent invitation to ${email}`)
}

/**
 * Delete pending invitation
 * Uses Convex mutation
 */
export async function deleteInvitation(
  invitationId: string,
  businessId: string
): Promise<void> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Use declineInvitation to delete the pending membership
  await client.mutation(api.functions.memberships.declineInvitation, {
    membershipId: invitationId as any
  })

  console.log(`[Invitation Service] Deleted pending invitation: ${invitationId}`)
}

// ============================================================================
// COGS Categories Types
// ============================================================================

export interface COGSCategory {
  id: string
  category_name: string
  description?: string
  cost_type: 'direct' | 'indirect'
  is_active: boolean
  ai_keywords?: string[]
  vendor_patterns?: string[]
  sort_order?: number
  glCode?: string
  created_at?: string
  updated_at?: string
}

export interface CreateCOGSCategoryRequest {
  category_name: string
  description?: string
  cost_type: 'direct' | 'indirect'
  ai_keywords?: string[]
  vendor_patterns?: string[]
  sort_order?: number
  glCode?: string
}

export interface UpdateCOGSCategoryRequest {
  id: string
  category_name?: string
  description?: string
  cost_type?: 'direct' | 'indirect'
  ai_keywords?: string[]
  vendor_patterns?: string[]
  sort_order?: number
  is_active?: boolean
  glCode?: string
}

// ============================================================================
// COGS Categories Operations
// ============================================================================

/**
 * Get all COGS categories for business (including inactive)
 * Uses Convex query
 */
export async function getCOGSCategories(businessId: string): Promise<COGSCategory[]> {
  console.log('[COGS Service] getCOGSCategories called with businessId:', businessId)

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    console.error('[COGS Service] Failed to get authenticated Convex client')
    throw new Error('Failed to get authenticated Convex client')
  }
  console.log('[COGS Service] Got authenticated Convex client')

  const categories = await client.query(api.functions.businesses.getCogsCategories, {
    businessId
  })

  console.log('[COGS Service] Raw Convex response:', JSON.stringify(categories, null, 2))
  console.log('[COGS Service] Raw categories count:', categories?.length || 0)

  // Transform to match expected format
  return (categories || [])
    .map((cat: any) => ({
      id: cat.id,
      category_name: cat.name || cat.category_name,
      description: cat.description,
      cost_type: cat.cost_type || 'direct',
      is_active: cat.is_enabled !== false,
      ai_keywords: cat.ai_keywords || [],
      vendor_patterns: cat.vendor_patterns || [],
      sort_order: cat.sort_order || 99,
      glCode: cat.glCode,
      created_at: cat.created_at,
      updated_at: cat.updated_at
    }))
    .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))
}

/**
 * Get only enabled COGS categories for dropdowns
 * Uses Convex query with explicit businessId (matching expense categories pattern)
 */
export async function getEnabledCOGSCategories(): Promise<COGSCategory[]> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Get businessId from employee profile (same pattern as expense categories)
  const employeeProfile = await ensureUserProfile(userId)
  if (!employeeProfile) {
    throw new Error('Failed to get employee profile')
  }

  console.log(`[COGS Service] Fetching enabled categories for business: ${employeeProfile.business_id}`)

  // Explicitly pass businessId like expense categories do
  const categories = await client.query(api.functions.businesses.getEnabledCogsCategories, {
    businessId: employeeProfile.business_id
  })

  // Transform to match expected format
  return (categories || [])
    .map((cat: any) => ({
      id: cat.id,
      category_name: cat.name || cat.category_name,
      description: cat.description,
      cost_type: cat.cost_type || 'direct',
      is_active: true,
      ai_keywords: cat.ai_keywords || [],
      vendor_patterns: cat.vendor_patterns || [],
      sort_order: cat.sort_order || 99,
      created_at: cat.created_at,
      updated_at: cat.updated_at
    }))
    .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))
}

/**
 * Create new COGS category
 * Uses Convex mutation
 */
export async function createCOGSCategory(
  businessId: string,
  request: CreateCOGSCategoryRequest
): Promise<COGSCategory> {
  const { category_name, description, cost_type, ai_keywords, vendor_patterns, sort_order, glCode } = request

  // Validate required fields
  if (!category_name || !cost_type) {
    throw new Error('Category name and cost type are required')
  }

  // Validate cost_type
  if (!['direct', 'indirect'].includes(cost_type)) {
    throw new Error('Cost type must be either "direct" or "indirect"')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Convex mutation uses same schema as expense categories (category_name, is_active)
  const newCategory = await client.mutation(api.functions.businesses.createCogsCategory, {
    businessId,
    category_name,
    description,
    cost_type,
    ai_keywords,
    vendor_patterns,
    sort_order,
    glCode
  })

  console.log(`[COGS Service] Created category: ${category_name}`)

  return {
    id: newCategory.id,
    category_name,
    description: description || '',
    cost_type,
    ai_keywords: ai_keywords || [],
    vendor_patterns: vendor_patterns || [],
    sort_order: sort_order || 99,
    is_active: true,
    glCode,
    created_at: newCategory.created_at,
    updated_at: newCategory.updated_at
  }
}

/**
 * Update existing COGS category
 * Uses Convex mutation
 */
export async function updateCOGSCategory(
  businessId: string,
  request: UpdateCOGSCategoryRequest
): Promise<COGSCategory> {
  const { id, category_name, description, cost_type, ai_keywords, vendor_patterns, sort_order, is_active, glCode } = request

  if (!id) {
    throw new Error('Category ID is required for updates')
  }

  // Validate cost_type if provided
  if (cost_type && !['direct', 'indirect'].includes(cost_type)) {
    throw new Error('Cost type must be either "direct" or "indirect"')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Convex mutation uses same schema as expense categories (category_name, is_active)
  const updatedCategory = await client.mutation(api.functions.businesses.updateCogsCategory, {
    businessId,
    categoryId: id,
    category_name,
    description,
    cost_type,
    ai_keywords,
    vendor_patterns,
    sort_order,
    is_active,
    glCode
  })

  console.log(`[COGS Service] Updated category: ${id}`)

  return {
    id: updatedCategory.id,
    category_name: category_name || updatedCategory.category_name,
    description: description ?? updatedCategory.description,
    cost_type: (cost_type || updatedCategory.cost_type || 'direct') as 'direct' | 'indirect',
    ai_keywords: ai_keywords || updatedCategory.ai_keywords || [],
    vendor_patterns: vendor_patterns || updatedCategory.vendor_patterns || [],
    sort_order: sort_order || updatedCategory.sort_order || 99,
    is_active: is_active ?? updatedCategory.is_active,
    glCode: glCode ?? updatedCategory.glCode,
    created_at: updatedCategory.created_at,
    updated_at: updatedCategory.updated_at
  }
}

/**
 * Delete COGS category
 * Uses Convex mutation
 */
export async function deleteCOGSCategory(
  businessId: string,
  categoryId: string
): Promise<void> {
  if (!categoryId) {
    throw new Error('Category ID is required for deletion')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  await client.mutation(api.functions.businesses.deleteCogsCategory, {
    businessId,
    categoryId
  })

  console.log(`[COGS Service] Deleted category: ${categoryId}`)
}
