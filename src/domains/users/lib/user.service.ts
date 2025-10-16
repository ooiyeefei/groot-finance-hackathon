/**
 * User Service Layer
 * Extracted business logic for user management operations
 *
 * Functions:
 * - getUserProfile() - Get user profile with home currency
 * - updateUserProfile() - Update user profile settings
 * - getTeamMembers() - Get team members with RPC optimization
 * - getUserRole() - Get user role and permissions
 * - updateUserRole() - Update user role (unified role management)
 * - assignManager() - Assign/update manager for employee
 * - updateUserName() - Update user's full name
 */

import { createServiceSupabaseClient, getUserData, createBusinessContextSupabaseClient } from '@/lib/db/supabase-server'
import { requirePermission, getCurrentUserContextWithBusiness, updateUserRole as rbacUpdateUserRole } from '@/domains/security/lib/rbac'
import { clerkClient } from '@clerk/nextjs/server'
import { SupportedCurrency } from '@/domains/accounting-entries/types'

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  home_currency: SupportedCurrency
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
    admin: boolean
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
 * Get user profile data including home currency
 */
export async function getUserProfile(clerkUserId: string): Promise<UserProfile> {
  const userData = await getUserData(clerkUserId)

  const completeProfile: UserProfile = {
    id: userData.id,
    email: userData.email,
    full_name: userData.full_name,
    home_currency: userData.home_currency as SupportedCurrency,
    language_preference: (userData as any).language_preference || 'en',
    timezone: (userData as any).timezone || 'Asia/Singapore',
    created_at: (userData as any).created_at || null,
    updated_at: (userData as any).updated_at || null
  }

  return completeProfile
}

/**
 * Update user profile settings
 */
export async function updateUserProfile(
  clerkUserId: string,
  updates: Partial<Pick<UserProfile, 'home_currency' | 'full_name' | 'language_preference' | 'timezone'>>
): Promise<UserProfile> {
  const userData = await getUserData(clerkUserId)
  const supabase = createServiceSupabaseClient()

  // Validate home_currency if provided
  if (updates.home_currency) {
    const supportedCurrencies: SupportedCurrency[] = ['THB', 'IDR', 'MYR', 'SGD', 'USD', 'EUR', 'CNY', 'VND', 'PHP', 'INR']
    if (!supportedCurrencies.includes(updates.home_currency)) {
      throw new Error(`Unsupported currency: ${updates.home_currency}`)
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('No valid fields to update')
  }

  // Add updated timestamp
  const updateData = {
    ...updates,
    updated_at: new Date().toISOString()
  }

  const { data: updatedProfile, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userData.id)
    .select('id, email, full_name, home_currency, language_preference, timezone, created_at, updated_at')
    .single()

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`)
  }

  return updatedProfile as UserProfile
}

/**
 * Get team members with RPC optimization
 * Requires admin permission
 */
export async function getTeamMembers(
  clerkUserId: string,
  businessId: string
): Promise<{ users: TeamMember[]; business_id: string }> {
  // Create authenticated client
  const supabase = await createBusinessContextSupabaseClient()

  // Use optimized RPC function with proper status filtering
  console.log('[User Service] Using get_manager_team_employees RPC for business:', businessId)

  const { data: rpcTeamData, error: rpcError } = await supabase
    .rpc('get_manager_team_employees', {
      manager_user_id: clerkUserId,
      business_id_param: businessId
    })

  let enrichedProfiles: TeamMember[] = []

  if (rpcError) {
    console.error('[User Service] RPC function error:', rpcError)
    // Fallback to manual approach if RPC fails
    const { data: memberships, error: fallbackError } = await supabase
      .from('business_memberships')
      .select(`
        id,
        user_id,
        business_id,
        role,
        created_at,
        users!business_memberships_user_id_fkey(
          id,
          email,
          full_name,
          home_currency,
          clerk_user_id
        )
      `)
      .eq('business_id', businessId)
      .eq('status', 'active')
      .not('users.clerk_user_id', 'is', null)
      .order('created_at', { ascending: false })

    if (fallbackError) {
      throw new Error(`Failed to fetch team members: ${fallbackError.message}`)
    }

    enrichedProfiles = (memberships || []).map(membership => {
      const user = Array.isArray(membership.users) ? membership.users[0] : membership.users

      return {
        id: membership.id,
        user_id: membership.user_id,
        business_id: membership.business_id,
        full_name: user?.full_name || null,
        email: user?.email || null,
        role_permissions: {
          employee: true,
          manager: membership.role === 'admin' || membership.role === 'manager',
          admin: membership.role === 'admin'
        },
        home_currency: user?.home_currency || null,
        manager_id: null,
        manager_name: null,
        manager_user_id: null,
        created_at: membership.created_at,
        updated_at: membership.created_at,
        clerk_user: null
      }
    })
  } else {
    // RPC returns pre-joined data
    enrichedProfiles = (rpcTeamData || []).map((member: any) => ({
      id: member.membership_id || member.employee_id, // Use membership_id if available, fallback to employee_id
      user_id: member.user_id,
      business_id: businessId,
      full_name: member.full_name,
      email: member.email,
      role_permissions: member.role_permissions || {
        employee: true,
        manager: false,
        admin: false
      },
      home_currency: member.home_currency || 'SGD',
      manager_id: member.manager_id,
      manager_name: member.manager_name,
      manager_user_id: member.manager_user_id_field,
      created_at: member.created_at,
      updated_at: member.updated_at,
      clerk_user: null
    }))
  }

  // Batch fetch Clerk user data
  if (enrichedProfiles.length > 0) {
    const clerkUserIds: string[] = []
    const profileClerkIdMap = new Map<string, TeamMember>()

    enrichedProfiles.forEach((profile) => {
      const memberData = rpcTeamData ? rpcTeamData.find((member: any) => member.user_id === profile.user_id) : null
      const clerkId = memberData?.manager_user_id_field || memberData?.clerk_user_id

      if (clerkId) {
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

        enrichedProfiles = enrichedProfiles.map((profile) => {
          const memberData = rpcTeamData ? rpcTeamData.find((member: any) => member.user_id === profile.user_id) : null
          const clerkId = memberData?.clerk_user_id

          if (clerkId && clerkUsersMap.has(clerkId)) {
            profile.clerk_user = clerkUsersMap.get(clerkId)
          }
          return profile
        }).filter(profile => profile.clerk_user !== null || profile.user_id)
      } catch (error) {
        console.error('[User Service] Batch Clerk fetch failed:', error)
      }
    }
  }

  return {
    users: enrichedProfiles,
    business_id: businessId
  }
}

/**
 * Get user role and permissions
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
 * Supports: employee, manager, admin
 */
export async function updateUserRole(
  targetUserId: string,
  role: 'employee' | 'manager' | 'admin',
  currentUserId: string
): Promise<{ success: boolean; error?: string }> {
  const validRoles = ['employee', 'manager', 'admin']
  if (!validRoles.includes(role)) {
    return { success: false, error: 'Invalid role specified' }
  }

  return await rbacUpdateUserRole(targetUserId, role, currentUserId)
}

/**
 * Assign or update manager for an employee
 * Requires admin permission
 */
export async function assignManager(
  employeeId: string,
  managerId: string | null,
  currentUserId: string,
  businessId: string
): Promise<void> {
  const supabase = createServiceSupabaseClient()

  // Validate employee exists in same business
  const { data: employee, error: employeeError } = await supabase
    .from('business_memberships')
    .select('id, user_id, business_id, role')
    .eq('user_id', employeeId)
    .eq('business_id', businessId)
    .eq('status', 'active')
    .single()

  if (employeeError || !employee) {
    throw new Error('Employee not found or access denied')
  }

  // Validate manager if provided
  let managerMembershipId = null
  if (managerId) {
    const { data: manager, error: managerError } = await supabase
      .from('business_memberships')
      .select('id, user_id, role, business_id')
      .eq('user_id', managerId)
      .eq('business_id', businessId)
      .eq('status', 'active')
      .single()

    if (managerError || !manager) {
      throw new Error('Manager not found or access denied')
    }

    if (manager.role !== 'manager' && manager.role !== 'admin') {
      throw new Error('Assigned user must have manager or admin role')
    }

    managerMembershipId = manager.user_id
  }

  // Update manager assignment
  const { error: updateError } = await supabase
    .from('business_memberships')
    .update({
      manager_id: managerMembershipId,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', employeeId)
    .eq('business_id', businessId)

  if (updateError) {
    throw new Error(`Failed to update manager assignment: ${updateError.message}`)
  }

  console.log(`[User Service] Manager assignment updated: ${employeeId} → ${managerMembershipId || 'none'}`)
}

/**
 * Update user's full name
 * Can be used by user themselves or by admin for other users
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

  const supabase = createServiceSupabaseClient()

  // If updating someone else, verify permission
  if (targetUserId !== currentUserId) {
    if (!canManageUsers) {
      throw new Error('Admin permissions required to update other users')
    }

    // Verify target user exists in same business
    const { data: targetUser, error: targetUserError } = await supabase
      .from('employee_profiles')
      .select('user_id, business_id')
      .eq('user_id', targetUserId)
      .eq('business_id', businessId)
      .single()

    if (targetUserError || !targetUser) {
      throw new Error('Target user not found or access denied')
    }
  }

  // Update user's full name
  const { error: updateError } = await supabase
    .from('users')
    .update({
      full_name: fullName.trim(),
      updated_at: new Date().toISOString()
    })
    .eq('id', targetUserId)

  if (updateError) {
    throw new Error(`Failed to update name: ${updateError.message}`)
  }

  console.log(`[User Service] Name updated: ${targetUserId} → ${fullName.trim()}`)
}

/**
 * Remove user from business (set membership status to inactive)
 * Requires admin permission
 */
export async function removeUserFromBusiness(
  targetUserId: string,
  currentUserId: string,
  businessId: string
): Promise<void> {
  const supabase = createServiceSupabaseClient()

  // Validate target user exists in same business
  const { data: targetMembership, error: membershipError } = await supabase
    .from('business_memberships')
    .select('id, user_id, business_id, role, status')
    .eq('user_id', targetUserId)
    .eq('business_id', businessId)
    .eq('status', 'active')
    .single()

  if (membershipError || !targetMembership) {
    throw new Error('User membership not found or access denied')
  }

  // Update membership status to inactive
  const { error: updateError } = await supabase
    .from('business_memberships')
    .update({
      status: 'inactive',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', targetUserId)
    .eq('business_id', businessId)

  if (updateError) {
    throw new Error(`Failed to remove user from business: ${updateError.message}`)
  }

  console.log(`[User Service] User removed from business: ${targetUserId} from business ${businessId}`)
}
