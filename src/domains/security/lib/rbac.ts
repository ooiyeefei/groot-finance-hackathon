/**
 * Role-Based Access Control (RBAC) System
 * Integrates Clerk authentication with employee profile permissions
 */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createBusinessContextSupabaseClient, createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { ensureUserProfile, UserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { getCurrentBusinessContext, checkBusinessOwnership, type BusinessContext } from '@/lib/db/business-context'

export type UserRole = 'employee' | 'manager' | 'admin'

export interface RolePermissions {
  employee: boolean
  manager: boolean
  admin: boolean
}

export interface UserContext {
  userId: string
  profile: UserProfile
  roles: UserRole[]
  permissions: RolePermissions
  canApprove: boolean
  canManageCategories: boolean
  canViewAllExpenses: boolean
  canManageUsers: boolean
  // NEW: Multi-tenant context
  businessContext?: BusinessContext
  isBusinessOwner?: boolean
}

/**
 * Get current user context with role information (LEGACY - single business)
 */
export async function getCurrentUserContext(): Promise<UserContext | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null

    const profile = await ensureUserProfile(userId)
    if (!profile) return null

    const roles = determineUserRoles(profile.role_permissions)

    return {
      userId,
      profile,
      roles,
      permissions: profile.role_permissions,
      canApprove: profile.role_permissions.manager || profile.role_permissions.admin,
      canManageCategories: profile.role_permissions.manager || profile.role_permissions.admin,
      canViewAllExpenses: profile.role_permissions.manager || profile.role_permissions.admin,
      canManageUsers: profile.role_permissions.admin
    }
  } catch (error) {
    console.error('[RBAC] Error getting user context:', error)
    return null
  }
}

/**
 * Get current user context with multi-tenant business context (OPTIMIZED)
 */
export async function getCurrentUserContextWithBusiness(): Promise<UserContext | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null

    // PERFORMANCE FIX: Get business context with ownership info (no duplicate calls)
    const businessContext = await getCurrentBusinessContext(userId)
    if (!businessContext) {
      console.warn('[RBAC] No active business context for user')
      return null
    }

    // PERFORMANCE FIX: Skip ensureUserProfile on every call - only needed once at login/switch
    // Business membership already provides the profile data we need
    const profile = {
      id: `membership_${businessContext.businessId}`,
      user_id: userId,
      business_id: businessContext.businessId,
      role: businessContext.role,
      role_permissions: {
        employee: true,
        manager: businessContext.role === 'manager' || businessContext.role === 'admin',
        admin: businessContext.role === 'admin'
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Use business context permissions from business_memberships
    const permissions: RolePermissions = {
      employee: true,
      manager: businessContext.role === 'manager' || businessContext.role === 'admin',
      admin: businessContext.role === 'admin'
    }

    const roles = determineUserRoles(permissions)

    return {
      userId,
      profile,
      roles,
      permissions,
      canApprove: permissions.manager || permissions.admin,
      canManageCategories: permissions.manager || permissions.admin,
      canViewAllExpenses: permissions.manager || permissions.admin,
      canManageUsers: permissions.admin,
      // OPTIMIZED: Business context already includes ownership info
      businessContext,
      isBusinessOwner: businessContext.isOwner
    }
  } catch (error) {
    console.error('[RBAC] Error getting user context with business:', error)
    return null
  }
}

/**
 * Determine user roles from permissions
 */
function determineUserRoles(permissions: RolePermissions): UserRole[] {
  const roles: UserRole[] = []
  
  if (permissions.employee) roles.push('employee')
  if (permissions.manager) roles.push('manager')
  if (permissions.admin) roles.push('admin')
  
  return roles
}

/**
 * Update user role in Clerk and sync with employee profile
 */
export async function updateUserRole(
  targetUserId: string, 
  role: UserRole,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Special case: SaaS owner can bypass permission checks (master key validation done in API)
    if (updatedBy !== 'saas_owner') {
      const updaterContext = await getCurrentUserContext()
      
      // Only admin users can update roles
      if (!updaterContext?.canManageUsers) {
        return { success: false, error: 'Insufficient permissions to update user roles' }
      }
    }

    // Ensure employee profile exists first (creates if missing)
    const employeeProfile = await ensureUserProfile(targetUserId)
    if (!employeeProfile) {
      return { success: false, error: 'Failed to create or access employee profile' }
    }

    // ✅ SECURITY FIX: Use business context client with proper RLS enforcement
    const supabase = await createBusinessContextSupabaseClient()
    
    // Update employee profile permissions using the correct UUID
    const permissions = roleToPermissions(role)
    
    const { error: updateError } = await supabase
      .from('business_memberships')
      .update({
        role: role,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', employeeProfile.user_id) // Update business membership role

    if (updateError) {
      console.error('[RBAC] Error updating employee profile:', updateError)
      return { success: false, error: 'Failed to update employee profile' }
    }

    // DEPRECATED: No longer syncing to Clerk metadata (using native integration)
    // Role is stored in Supabase business_memberships table only
    console.log(`[RBAC] Role updated in database: ${targetUserId} → ${role} by ${updatedBy}`)
    return { success: true }

  } catch (error) {
    console.error('[RBAC] Error updating user role:', error)
    return { success: false, error: 'Internal error updating role' }
  }
}

/**
 * @deprecated No longer needed with native Clerk integration
 * Roles are now stored only in Supabase business_memberships table
 * Keeping for backward compatibility during migration
 */
export async function syncRoleToClerk(userId: string, permissions: RolePermissions): Promise<{ success: boolean; error?: string }> {
  console.log(`[RBAC] syncRoleToClerk called but skipped - using native integration`)
  // Return success to not break existing code
  return { success: true }
}

/**
 * Convert role to permission structure
 */
function roleToPermissions(role: UserRole): RolePermissions {
  switch (role) {
    case 'employee':
      return { employee: true, manager: false, admin: false }
    case 'manager':
      return { employee: true, manager: true, admin: false }
    case 'admin':
      return { employee: true, manager: true, admin: true }
    default:
      return { employee: true, manager: false, admin: false }
  }
}

/**
 * Check if user has specific permission (LEGACY)
 */
export async function hasPermission(permission: keyof RolePermissions): Promise<boolean> {
  const context = await getCurrentUserContext()
  return context?.permissions[permission] ?? false
}

/**
 * Check if user has specific permission in current business context (NEW)
 */
export async function hasBusinessPermission(permission: keyof RolePermissions): Promise<boolean> {
  const context = await getCurrentUserContextWithBusiness()
  return context?.permissions[permission] ?? false
}

/**
 * Check if user is owner of the current active business
 */
export async function isCurrentBusinessOwner(): Promise<boolean> {
  const context = await getCurrentUserContextWithBusiness()
  return context?.isBusinessOwner ?? false
}

/**
 * Check if user can delete the current business (owner-only permission)
 */
export async function canDeleteCurrentBusiness(): Promise<boolean> {
  return await isCurrentBusinessOwner()
}

/**
 * Check if user can manage subscription for current business (owner-only)
 */
export async function canManageSubscription(): Promise<boolean> {
  return await isCurrentBusinessOwner()
}

/**
 * Check if user can transfer ownership of current business (owner-only)
 */
export async function canTransferOwnership(): Promise<boolean> {
  return await isCurrentBusinessOwner()
}

/**
 * Check if user can submit their own expense claims
 * All roles (employee, manager, admin) can submit their own claims
 */
export async function canSubmitOwnClaim(): Promise<boolean> {
  const context = await getCurrentUserContextWithBusiness()
  // All authenticated users with business context can submit their own claims
  return context?.permissions.employee ?? false
}

/**
 * Check if user can approve expense claims (manager and admin only)
 */
export async function canApproveExpenseClaims(): Promise<boolean> {
  const context = await getCurrentUserContextWithBusiness()
  return context?.permissions.manager || context?.permissions.admin || false
}

/**
 * Check if user can process reimbursements (admin only)
 */
export async function canProcessReimbursements(): Promise<boolean> {
  const context = await getCurrentUserContextWithBusiness()
  return context?.permissions.admin ?? false
}

/**
 * Check if user can recall submitted expense claims (any role can recall their own)
 */
export async function canRecallOwnClaim(): Promise<boolean> {
  const context = await getCurrentUserContextWithBusiness()
  // All authenticated users can recall their own submitted claims
  return context?.permissions.employee ?? false
}

/**
 * Check if user can revise rejected expense claims (any role can revise their own)
 */
export async function canReviseOwnClaim(): Promise<boolean> {
  const context = await getCurrentUserContextWithBusiness()
  // All authenticated users can revise their own rejected claims
  return context?.permissions.employee ?? false
}

/**
 * Check if user can filter expense claims by user_id (managers and admins only)
 */
export async function canFilterByUserId(): Promise<boolean> {
  const context = await getCurrentUserContextWithBusiness()
  return context?.permissions.manager || context?.permissions.admin || false
}

/**
 * Require specific permission (throws if not authorized)
 */
export async function requirePermission(permission: keyof RolePermissions): Promise<UserContext> {
  const context = await getCurrentUserContextWithBusiness()
  
  if (!context) {
    throw new Error('User not authenticated')
  }
  
  if (!context.permissions[permission]) {
    throw new Error(`Permission required: ${permission}`)
  }
  
  return context
}

/**
 * Get all users in the business with their roles
 */
export async function getBusinessUsers(businessId: string): Promise<{
  success: boolean
  users?: Array<UserProfile & { clerk_user?: any }>
  error?: string
}> {
  try {
    const context = await getCurrentUserContext()
    
    if (!context?.canManageUsers) {
      return { success: false, error: 'Insufficient permissions' }
    }

    // ✅ SECURITY FIX: Use business context client with proper RLS enforcement
    const supabase = await createBusinessContextSupabaseClient()
    
    const { data: profiles, error } = await supabase
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
          business_id,
          businesses!users_business_id_fkey(home_currency)
        )
      `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: 'Failed to fetch users' }
    }

    // Transform business memberships to UserProfile format and enrich with Clerk user data
    const enrichedUsers = await Promise.all(
      profiles.map(async (membership) => {
        try {
          const clerkUser = await (await clerkClient()).users.getUser(membership.user_id)

          // Transform business membership to UserProfile format
          const userProfile: UserProfile & { clerk_user?: any } = {
            id: membership.id,
            user_id: membership.user_id,
            business_id: membership.business_id,
            role: membership.role,
            role_permissions: {
              employee: true,
              manager: membership.role === 'admin' || membership.role === 'manager',
              admin: membership.role === 'admin'
            },
            home_currency: (membership.users?.[0] as any)?.businesses?.home_currency,
            created_at: membership.created_at,
            updated_at: membership.created_at, // Use created_at as fallback for updated_at
            clerk_user: clerkUser
          }

          return userProfile
        } catch {
          // Transform without Clerk data if fetch fails
          const userProfile: UserProfile = {
            id: membership.id,
            user_id: membership.user_id,
            business_id: membership.business_id,
            role: membership.role,
            role_permissions: {
              employee: true,
              manager: membership.role === 'admin' || membership.role === 'manager',
              admin: membership.role === 'admin'
            },
            home_currency: (membership.users?.[0] as any)?.businesses?.home_currency,
            created_at: membership.created_at,
            updated_at: membership.created_at
          }

          return userProfile
        }
      })
    )

    return { success: true, users: enrichedUsers }
    
  } catch (error) {
    console.error('[RBAC] Error fetching business users:', error)
    return { success: false, error: 'Internal server error' }
  }
}