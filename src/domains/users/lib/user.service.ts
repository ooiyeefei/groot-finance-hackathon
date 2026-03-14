/**
 * User Service Layer
 * Extracted business logic for user management operations
 *
 * Migrated to Convex from Supabase
 *
 * Functions:
 * - getUserProfile() - Get user profile with home currency
 * - updateUserProfile() - Update user profile settings
 * - getTeamMembers() - Get team members with manager info
 * - getUserRole() - Get user role and permissions
 * - updateUserRole() - Update user role (unified role management)
 * - assignManager() - Assign/update manager for employee
 * - updateUserName() - Update user's full name
 * - removeUserFromBusiness() - Remove user from business
 */

import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { getCurrentUserContextWithBusiness, updateUserRole as rbacUpdateUserRole } from '@/domains/security/lib/rbac'
import { clerkClient } from '@clerk/nextjs/server'
import { SupportedCurrency } from '@/lib/types/currency'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  preferred_currency: SupportedCurrency
  language_preference: string
  timezone: string
  created_at: string | null
  updated_at: string | null
}

export interface TeamMember {
  id: string
  user_id: string
  business_id: string
  full_name: string | null
  email: string | null
  role_permissions: {
    employee: boolean
    manager: boolean
    finance_admin: boolean
  }
  home_currency: string | null
  manager_id: string | null
  manager_name: string | null
  manager_user_id: string | null
  created_at: string
  updated_at: string
  clerk_user: any
}

export interface UserRoleInfo {
  userId: string
  roles: string[]
  permissions: any
  capabilities: {
    canApprove: boolean
    canManageCategories: boolean
    canViewAllExpenses: boolean
    canManageUsers: boolean
  }
  profile: {
    membershipId: string
    userId: string
    businessId: string
    role: string
  }
  businessContext: {
    businessId: string
    businessName: string
    role: string
    isOwner: boolean
  } | null
}

/**
 * Get user profile data including preferred currency
 * Uses Convex to fetch user by Clerk ID
 */
export async function getUserProfile(clerkUserId: string): Promise<UserProfile> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  const user = await client.query(api.functions.users.getByClerkId, {
    clerkUserId
  })

  if (!user) {
    throw new Error('User not found')
  }

  const completeProfile: UserProfile = {
    id: user._id,
    email: user.email,
    full_name: user.fullName || null,
    preferred_currency: (user.homeCurrency || 'MYR') as SupportedCurrency,
    language_preference: user.preferences?.language || 'en',
    timezone: user.preferences?.timezone || 'Asia/Singapore',
    created_at: user._creationTime ? new Date(user._creationTime).toISOString() : null,
    updated_at: user.updatedAt ? new Date(user.updatedAt).toISOString() : null
  }

  return completeProfile
}

/**
 * Update user profile settings
 * Uses Convex mutations for profile and preferences
 */
export async function updateUserProfile(
  clerkUserId: string,
  updates: Partial<Pick<UserProfile, 'preferred_currency' | 'full_name' | 'language_preference' | 'timezone'>>
): Promise<UserProfile> {
  // Validate preferred_currency if provided
  if (updates.preferred_currency) {
    const supportedCurrencies: SupportedCurrency[] = ['THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP', 'INR']
    if (!supportedCurrencies.includes(updates.preferred_currency)) {
      throw new Error(`Unsupported currency: ${updates.preferred_currency}`)
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('No valid fields to update')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // If name is changing, sync to Clerk first (identity-first pattern)
  if (updates.full_name !== undefined && updates.full_name !== null) {
    await syncNameToClerk(clerkUserId, updates.full_name)
  }

  // Update profile fields (fullName, homeCurrency) in Convex for immediate UI feedback
  if (updates.full_name !== undefined || updates.preferred_currency !== undefined) {
    await client.mutation(api.functions.users.updateProfile, {
      fullName: updates.full_name ?? undefined,
      homeCurrency: updates.preferred_currency
    })
  }

  // Update preferences fields (timezone, language)
  if (updates.timezone !== undefined || updates.language_preference !== undefined) {
    await client.mutation(api.functions.users.updatePreferences, {
      timezone: updates.timezone,
      language: updates.language_preference
    })
  }

  // Fetch and return updated profile
  return await getUserProfile(clerkUserId)
}

/**
 * Get team members with manager info
 * Uses Convex query that replaces the Supabase RPC
 */
export async function getTeamMembers(
  clerkUserId: string,
  businessId: string
): Promise<{ users: TeamMember[]; business_id: string }> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  console.log('[User Service] Using Convex getTeamMembersWithManagers for business:', businessId)

  const teamData = await client.query(api.functions.memberships.getTeamMembersWithManagers, {
    businessId
  })

  console.log('[User Service] Convex returned data count:', teamData?.length || 0)

  let enrichedProfiles: TeamMember[] = (teamData || []).map((member: any) => ({
    id: member.id,
    user_id: member.user_id,
    business_id: member.business_id,
    full_name: member.full_name,
    email: member.email,
    role_permissions: member.role_permissions || {
      employee: true,
      manager: false,
      finance_admin: false
    },
    home_currency: member.home_currency || 'MYR',
    manager_id: member.manager_id,
    manager_name: member.manager_name,
    manager_user_id: member.manager_user_id,
    created_at: member.created_at,
    updated_at: member.updated_at,
    clerk_user: null
  }))

  console.log('[User Service] Profiles before Clerk enrichment:', enrichedProfiles.length)

  // Batch fetch Clerk user data
  if (enrichedProfiles.length > 0) {
    const clerkUserIds: string[] = []
    const profileClerkIdMap = new Map<string, TeamMember>()

    // Get clerk_user_id from the Convex response
    enrichedProfiles.forEach((profile, index) => {
      const memberData = teamData ? teamData[index] : null
      const clerkId = memberData?.clerk_user_id

      if (clerkId && !clerkId.startsWith('migrated_') && !clerkId.startsWith('pending_')) {
        clerkUserIds.push(clerkId)
        profileClerkIdMap.set(clerkId, profile)
      }
    })

    if (clerkUserIds.length > 0) {
      try {
        const clerkUsers = await (await clerkClient()).users.getUserList({
          userId: clerkUserIds,
          limit: 100
        })

        const clerkUsersMap = new Map<string, any>()
        clerkUsers.data.forEach(user => {
          clerkUsersMap.set(user.id, user)
        })

        enrichedProfiles = enrichedProfiles.map((profile, index) => {
          const memberData = teamData ? teamData[index] : null
          const clerkId = memberData?.clerk_user_id

          if (clerkId && clerkUsersMap.has(clerkId)) {
            profile.clerk_user = clerkUsersMap.get(clerkId)
          }
          return profile
        })
      } catch (error) {
        console.error('[User Service] Batch Clerk fetch failed:', error)
      }
    }
  }

  console.log('[User Service] Final profiles returned:', enrichedProfiles.length)

  return {
    users: enrichedProfiles,
    business_id: businessId
  }
}

/**
 * Get direct reports (employees assigned to current manager)
 * Uses Convex query that returns only team members where managerId matches caller
 */
export async function getDirectReports(
  clerkUserId: string,
  businessId: string
): Promise<{ users: TeamMember[]; business_id: string }> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  console.log('[User Service] Fetching direct reports for business:', businessId)

  const directReportsData = await client.query(api.functions.memberships.getDirectReports, {
    businessId
  })

  console.log('[User Service] Direct reports count:', directReportsData?.length || 0)

  const enrichedProfiles: TeamMember[] = (directReportsData || []).map((member: any) => ({
    id: member.id,
    user_id: member.user_id,
    business_id: member.business_id,
    full_name: member.full_name,
    email: member.email,
    role_permissions: member.role_permissions || {
      employee: true,
      manager: false,
      finance_admin: false
    },
    home_currency: member.home_currency || 'MYR',
    manager_id: member.manager_id,
    manager_name: null,
    manager_user_id: null,
    created_at: member.created_at,
    updated_at: member.updated_at,
    clerk_user: null
  }))

  return {
    users: enrichedProfiles,
    business_id: businessId
  }
}

/**
 * Get user role and permissions
 * Uses already-migrated RBAC functions
 */
export async function getUserRole(): Promise<UserRoleInfo> {
  const userContext = await getCurrentUserContextWithBusiness()

  if (!userContext) {
    throw new Error('User not authenticated')
  }

  return {
    userId: userContext.userId,
    roles: userContext.roles,
    permissions: userContext.permissions,
    capabilities: {
      canApprove: userContext.canApprove,
      canManageCategories: userContext.canManageCategories,
      canViewAllExpenses: userContext.canViewAllExpenses,
      canManageUsers: userContext.canManageUsers
    },
    profile: {
      membershipId: userContext.profile.id,
      userId: userContext.profile.user_id,
      businessId: userContext.profile.business_id,
      role: userContext.profile.role
    },
    businessContext: userContext.businessContext ? {
      businessId: userContext.businessContext.businessId,
      businessName: userContext.businessContext.businessName,
      role: userContext.businessContext.role,
      isOwner: userContext.isBusinessOwner || false
    } : null
  }
}

/**
 * Update user role (unified role management)
 * Supports: employee, manager only (owner role is assigned at business creation)
 */
export async function updateUserRole(
  targetUserId: string,
  role: 'employee' | 'manager',
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  const validRoles = ['employee', 'manager']  // Note: 'owner' cannot be assigned via API
  if (!validRoles.includes(role)) {
    return { success: false, error: 'Invalid role specified' }
  }

  return await rbacUpdateUserRole(targetUserId, role, currentUserId)
}

/**
 * Assign or update manager for an employee
 * Uses Convex mutation
 */
export async function assignManager(
  employeeId: string,
  managerId: string | null,
  currentUserId: string,
  businessId: string
): Promise<void> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  await client.mutation(api.functions.memberships.assignManager, {
    businessId,
    employeeUserId: employeeId,
    managerUserId: managerId || undefined
  })

  console.log(`[User Service] Manager assignment updated: ${employeeId} → ${managerId || 'none'}`)
}

/**
 * Sync a name change to Clerk (identity provider) using the SDK directly.
 * Clerk is source of truth for identity — the existing user.updated webhook
 * syncs the change back to Convex automatically.
 */
async function syncNameToClerk(
  clerkUserId: string,
  fullName: string
): Promise<void> {
  const trimmed = fullName.trim()
  const spaceIndex = trimmed.indexOf(' ')
  const firstName = spaceIndex > 0 ? trimmed.slice(0, spaceIndex) : trimmed
  const lastName = spaceIndex > 0 ? trimmed.slice(spaceIndex + 1) : ''

  try {
    const clerk = await clerkClient()
    await clerk.users.updateUser(clerkUserId, {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
    })
    console.log(`[User Service] Clerk profile synced: ${clerkUserId} → ${trimmed}`)
  } catch (error: unknown) {
    console.error(`[User Service] Clerk update failed for ${clerkUserId}:`, error)
    const clerkError = error as { status?: number; errors?: Array<{ message: string }> }
    if (clerkError.status === 404) {
      throw new Error('User not found in identity provider')
    }
    throw new Error(clerkError.errors?.[0]?.message || 'Failed to update identity provider profile')
  }
}

/**
 * Update user's full name
 * Can be used by user themselves or by admin for other users.
 * Updates Clerk first (identity-first pattern), then Convex for immediate UI feedback.
 * The Clerk webhook will also sync to Convex for consistency.
 */
export async function updateUserName(
  targetUserId: string,
  fullName: string,
  currentUserId: string,
  businessId: string,
  canManageUsers: boolean
): Promise<void> {
  if (!fullName || !fullName.trim()) {
    throw new Error('Full name is required')
  }

  if (fullName.trim().length < 2) {
    throw new Error('Name must be at least 2 characters long')
  }

  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // Resolve the target user's Clerk ID for the Clerk API call
  let targetClerkUserId: string | undefined

  if (targetUserId === currentUserId) {
    // Self-edit via profile settings: targetUserId IS the Clerk ID
    targetClerkUserId = currentUserId
  } else {
    // Admin editing another user: targetUserId is a Convex user _id
    if (!canManageUsers) {
      throw new Error('Admin permissions required to update other users')
    }
    // Look up the user by Convex ID to get their Clerk ID
    const user = await client.query(api.functions.users.getById, {
      id: targetUserId
    })
    targetClerkUserId = user?.clerkUserId
  }

  if (!targetClerkUserId) {
    throw new Error('Target user not found')
  }

  // Step 1: Update Clerk FIRST (identity provider = source of truth)
  await syncNameToClerk(targetClerkUserId, fullName)

  // Step 2: Also update Convex directly for immediate UI feedback
  // (The webhook will fire shortly and confirm the same data)
  if (targetUserId === currentUserId) {
    await client.mutation(api.functions.users.updateProfile, {
      fullName: fullName.trim()
    })
  } else {
    await client.mutation(api.functions.users.updateFullNameByAdmin, {
      targetUserId,
      fullName: fullName.trim(),
      businessId
    })
  }

  console.log(`[User Service] Name synced to Clerk and Convex: ${targetUserId} → ${fullName.trim()}`)
}

/**
 * Remove user from business (set membership status to inactive)
 * Uses Convex mutation
 */
export async function removeUserFromBusiness(
  targetUserId: string,
  currentUserId: string,
  businessId: string
): Promise<void> {
  const { client } = await getAuthenticatedConvex()
  if (!client) {
    throw new Error('Failed to get authenticated Convex client')
  }

  // The Convex removeMember function requires the membership ID
  // We need to find it first
  const teamMembers = await client.query(api.functions.memberships.getTeamMembersWithManagers, {
    businessId
  })

  const targetMembership = teamMembers?.find((m: any) =>
    m.user_id === targetUserId || String(m.user_id) === targetUserId
  )

  if (!targetMembership) {
    throw new Error('User membership not found or access denied')
  }

  await client.mutation(api.functions.memberships.removeMember, {
    membershipId: targetMembership.id
  })

  console.log(`[User Service] User removed from business: ${targetUserId} from business ${businessId}`)
}
