/**
 * Role-Based Access Control (RBAC) System
 * Integrates Clerk authentication with employee profile permissions
 */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile, EmployeeProfile } from '@/lib/ensure-employee-profile'

export type UserRole = 'employee' | 'manager' | 'admin'

export interface RolePermissions {
  employee: boolean
  manager: boolean
  admin: boolean
}

export interface UserContext {
  userId: string
  profile: EmployeeProfile
  roles: UserRole[]
  permissions: RolePermissions
  canApprove: boolean
  canManageCategories: boolean
  canViewAllExpenses: boolean
  canManageUsers: boolean
}

/**
 * Get current user context with role information
 */
export async function getCurrentUserContext(): Promise<UserContext | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null

    const profile = await ensureEmployeeProfile(userId)
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
    const employeeProfile = await ensureEmployeeProfile(targetUserId)
    if (!employeeProfile) {
      return { success: false, error: 'Failed to create or access employee profile' }
    }

    // Use service role for SaaS owner operations, regular user client otherwise
    const supabase = updatedBy === 'saas_owner' 
      ? await createAuthenticatedSupabaseClient(targetUserId) // Use target user's ID for SaaS operations
      : await createAuthenticatedSupabaseClient(updatedBy)
    
    // Update employee profile permissions using the correct UUID
    const permissions = roleToPermissions(role)
    
    const { error: updateError } = await supabase
      .from('employee_profiles')
      .update({
        role_permissions: permissions,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', employeeProfile.user_id) // Use the UUID from employee profile

    if (updateError) {
      console.error('[RBAC] Error updating employee profile:', updateError)
      return { success: false, error: 'Failed to update employee profile' }
    }

    // Sync with Clerk metadata (following Clerk best practices)
    await (await clerkClient()).users.updateUser(targetUserId, {
      publicMetadata: {
        role,
        permissions,
        updatedBy,
        updatedAt: new Date().toISOString()
      }
    })

    console.log(`[RBAC] Role updated: ${targetUserId} → ${role} by ${updatedBy}`)
    return { success: true }

  } catch (error) {
    console.error('[RBAC] Error updating user role:', error)
    return { success: false, error: 'Internal error updating role' }
  }
}

/**
 * Sync employee profile permissions to Clerk metadata
 * Call this during profile creation or updates
 * Includes retry logic and better error categorization
 */
export async function syncRoleToClerk(userId: string, permissions: RolePermissions): Promise<{ success: boolean; error?: string }> {
  const maxRetries = 3
  const baseDelay = 1000 // 1 second

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const roles = determineUserRoles(permissions)
      const primaryRole = roles[roles.length - 1] // Highest role

      // Add timeout to Clerk API call
      const updatePromise = (await clerkClient()).users.updateUser(userId, {
        publicMetadata: {
          role: primaryRole,
          permissions,
          syncedAt: new Date().toISOString()
        }
      })

      // 10 second timeout for Clerk API
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Clerk API timeout')), 10000)
      )

      await Promise.race([updatePromise, timeoutPromise])

      console.log(`[RBAC] ✅ Synced role to Clerk: ${userId} → ${primaryRole} (attempt ${attempt})`)
      return { success: true }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[RBAC] ❌ Attempt ${attempt}/${maxRetries} failed:`, errorMessage)

      // Categorize error types for better debugging
      const isRateLimit = errorMessage.includes('rate') || errorMessage.includes('429')
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')
      const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network')
      const isUserNotFound = errorMessage.includes('user') && errorMessage.includes('not found')

      console.error(`[RBAC] 📊 Error analysis: rateLimit=${isRateLimit}, timeout=${isTimeout}, network=${isNetworkError}, userNotFound=${isUserNotFound}`)

      // Don't retry on permanent errors
      if (isUserNotFound) {
        return { success: false, error: `Clerk user not found: ${errorMessage}` }
      }

      // If this was the last attempt, return the error
      if (attempt === maxRetries) {
        return { success: false, error: `Failed after ${maxRetries} attempts: ${errorMessage}` }
      }

      // Exponential backoff with jitter for retry
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000
      console.log(`[RBAC] ⏳ Retrying in ${Math.round(delay)}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return { success: false, error: 'Max retries exceeded' }
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
 * Check if user has specific permission
 */
export async function hasPermission(permission: keyof RolePermissions): Promise<boolean> {
  const context = await getCurrentUserContext()
  return context?.permissions[permission] ?? false
}

/**
 * Require specific permission (throws if not authorized)
 */
export async function requirePermission(permission: keyof RolePermissions): Promise<UserContext> {
  const context = await getCurrentUserContext()
  
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
  users?: Array<EmployeeProfile & { clerk_user?: any }>
  error?: string
}> {
  try {
    const context = await getCurrentUserContext()
    
    if (!context?.canManageUsers) {
      return { success: false, error: 'Insufficient permissions' }
    }

    const supabase = await createAuthenticatedSupabaseClient(context.userId)
    
    const { data: profiles, error } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: 'Failed to fetch users' }
    }

    // Enrich with Clerk user data
    const enrichedUsers = await Promise.all(
      profiles.map(async (profile) => {
        try {
          const clerkUser = await (await clerkClient()).users.getUser(profile.user_id)
          return { ...profile, clerk_user: clerkUser }
        } catch {
          return profile
        }
      })
    )

    return { success: true, users: enrichedUsers }
    
  } catch (error) {
    console.error('[RBAC] Error fetching business users:', error)
    return { success: false, error: 'Internal server error' }
  }
}