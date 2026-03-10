/**
 * Business Context Service - Multi-Tenant RBAC System
 * Handles business membership, ownership, and context switching
 *
 * Migrated to Convex from Supabase
 */

import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

export interface BusinessMembership {
  id: string
  user_id: string
  business_id: string
  role: 'owner' | 'finance_admin' | 'manager' | 'employee'
  invited_at?: string
  joined_at: string
  last_accessed_at?: string
  status: 'active' | 'suspended' | 'inactive'
  created_at: string
  updated_at: string
}

export interface BusinessWithOwnership {
  id: string
  name: string
  slug: string
  owner_id: string
  country_code: string
  home_currency: string
  logo_url?: string
  logo_fallback_color: string
  // Membership info if user is member
  membership?: BusinessMembership
  isOwner: boolean
}

export interface BusinessContext {
  businessId: string
  businessName: string
  role: 'owner' | 'finance_admin' | 'manager' | 'employee'
  isOwner: boolean
  permissions: {
    canDeleteBusiness: boolean
    canManageSubscription: boolean
    canTransferOwnership: boolean
    canInviteMembers: boolean
    canRemoveMembers: boolean
    canChangeSettings: boolean
    canApproveExpenses: boolean
    canManageCategories: boolean
    canViewAllData: boolean
  }
}

/**
 * Get all businesses a user is member of (with ownership info)
 * Migrated to Convex
 */
export async function getUserBusinessMemberships(userId?: string): Promise<BusinessWithOwnership[]> {
  const clerkUserId = userId || (await auth()).userId
  if (!clerkUserId) throw new Error('Authentication required')

  try {
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      throw new Error('Failed to get authenticated Convex client')
    }

    // Call Convex query for businesses with memberships
    const businesses = await client.query(api.functions.businesses.getMyBusinessesWithMemberships, {})

    if (!businesses || !Array.isArray(businesses)) {
      return []
    }

    // Map Convex response to expected interface
    return businesses.map((b: any) => ({
      id: b.id,
      name: b.name,
      slug: b.slug || '',
      owner_id: b.ownerId,
      country_code: b.countryCode || 'MY',
      home_currency: b.homeCurrency || 'MYR',
      logo_url: b.logoUrl,
      logo_fallback_color: b.logoFallbackColor || '#4F46E5',
      membership: b.membership ? {
        id: b.membership.id,
        user_id: b.membership.userId,
        business_id: b.membership.businessId,
        role: b.membership.role,
        invited_at: b.membership.invitedAt ? new Date(b.membership.invitedAt).toISOString() : undefined,
        joined_at: b.membership.joinedAt ? new Date(b.membership.joinedAt).toISOString() : new Date(b.membership.createdAt).toISOString(),
        last_accessed_at: b.membership.lastAccessedAt ? new Date(b.membership.lastAccessedAt).toISOString() : undefined,
        status: b.membership.status,
        created_at: new Date(b.membership.createdAt).toISOString(),
        updated_at: b.membership.updatedAt ? new Date(b.membership.updatedAt).toISOString() : new Date(b.membership.createdAt).toISOString()
      } : undefined,
      isOwner: b.isOwner
    }))

  } catch (error) {
    console.error('[BusinessContext] Error fetching memberships:', error)
    throw new Error('Failed to fetch business memberships')
  }
}

/**
 * Check if user is owner of a specific business
 * Migrated to Convex
 */
export async function checkBusinessOwnership(businessId: string, userId?: string): Promise<boolean> {
  const clerkUserId = userId || (await auth()).userId
  if (!clerkUserId) return false

  try {
    const { client } = await getAuthenticatedConvex()
    if (!client) return false

    const isOwner = await client.query(api.functions.businesses.checkOwnership, {
      businessId
    })

    return isOwner === true
  } catch (error) {
    console.error('[BusinessContext] Error checking ownership:', error)
    return false
  }
}

/**
 * Verify user has membership in a business and return membership details
 * Migrated to Convex
 */
export async function verifyBusinessMembership(
  businessId: string,
  userId?: string
): Promise<BusinessMembership | null> {
  const clerkUserId = userId || (await auth()).userId

  if (!clerkUserId) {
    return null
  }

  try {
    const { client } = await getAuthenticatedConvex()
    if (!client) return null

    const membership = await client.query(api.functions.memberships.verifyMembership, {
      businessId
    })

    if (!membership) {
      return null
    }

    // Response is already in snake_case format from Convex
    return membership as BusinessMembership

  } catch (error) {
    console.error('[BusinessContext] Exception in verifyBusinessMembership:', error)
    return null
  }
}

/**
 * Get current business context (OPTIMIZED - single query approach)
 * Migrated to Convex
 */
export async function getCurrentBusinessContext(userId?: string): Promise<BusinessContext | null> {
  const clerkUserId = userId || (await auth()).userId
  if (!clerkUserId) return null

  try {
    const { client, userId: authUserId } = await getAuthenticatedConvex()
    if (!client) {
      console.warn('[BusinessContext] DEBUG: getAuthenticatedConvex returned null client for', clerkUserId)
      return null
    }
    console.log('[BusinessContext] DEBUG: Authenticated client obtained for', clerkUserId, 'authUserId=', authUserId)

    const context = await client.query(api.functions.businesses.getBusinessContext, {})

    if (!context) {
      console.warn('[BusinessContext] DEBUG: getBusinessContext returned null for', clerkUserId)
      return null
    }
    console.log('[BusinessContext] DEBUG: Context found for', clerkUserId, 'businessId=', context.businessId, 'role=', context.role)

    // Map Convex response to expected interface
    return {
      businessId: context.businessId,
      businessName: context.businessName,
      role: context.role as 'owner' | 'finance_admin' | 'manager' | 'employee',
      isOwner: context.isOwner,
      permissions: context.permissions
    }

  } catch (error) {
    console.error('[BusinessContext] Error getting current context:', error)
    return null
  }
}

/**
 * Switch user's active business
 * Migrated to Convex
 */
export async function switchActiveBusiness(businessId: string, userId?: string): Promise<{
  success: boolean
  error?: string
  context?: BusinessContext
}> {
  const clerkUserId = userId || (await auth()).userId

  if (!clerkUserId) {
    return { success: false, error: 'Authentication required' }
  }

  try {
    // Single authenticated client for all operations (avoids redundant auth() + getToken() calls)
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return { success: false, error: 'Failed to get authenticated client' }
    }

    // The Convex switchBusiness mutation already verifies membership internally
    // (checks business_memberships table for active membership), so no need
    // for a separate verifyBusinessMembership round trip.
    await client.mutation(api.functions.users.switchBusiness, {
      businessId: businessId as any // The Convex function handles ID resolution
    })

    // Invalidate cache when business context changes
    try {
      const { invalidateUserCache } = await import('./business-context-cache')
      invalidateUserCache(clerkUserId)
    } catch (cacheError) {
      // Cache invalidation is non-critical
      console.warn('[BusinessContext] Cache invalidation failed:', cacheError)
    }

    // Skip getCurrentBusinessContext — the client does window.location.reload()
    // after a successful switch, so fetching the new context here is a wasted
    // Convex round trip (~200ms). The reloaded page will fetch fresh context.
    return { success: true }

  } catch (error) {
    console.error('[BusinessContext] Error switching business:', error)
    // Map Convex mutation errors to user-friendly messages
    const errorMsg = error instanceof Error ? error.message : 'Failed to switch business'
    const isAccessDenied = errorMsg.includes('Not a member') || errorMsg.includes('not found')
    return { success: false, error: isAccessDenied ? 'Access denied to business' : 'Failed to switch business' }
  }
}

/**
 * Compute permissions based on role and ownership
 * Role hierarchy: owner > finance_admin > manager > employee
 * Note: Owner role has all permissions, finance_admin has admin-level permissions
 */
function computePermissions(role: 'owner' | 'finance_admin' | 'manager' | 'employee', isOwner: boolean) {
  const isFinanceAdminOrAbove = role === 'owner' || role === 'finance_admin'
  const isManagerOrAbove = isFinanceAdminOrAbove || role === 'manager'

  const basePermissions = {
    // Owner-only permissions (business-level)
    canDeleteBusiness: isOwner,
    canManageSubscription: isOwner,
    canTransferOwnership: isOwner,

    // Operational permissions based on role
    canInviteMembers: isManagerOrAbove,
    canRemoveMembers: isManagerOrAbove, // Manager can only remove employees
    canChangeSettings: isFinanceAdminOrAbove,
    canApproveExpenses: isManagerOrAbove,
    canManageCategories: isManagerOrAbove,
    canViewAllData: isManagerOrAbove
  }

  return basePermissions
}

/**
 * Initialize first business for new user (called during signup)
 * Migrated to Convex
 */
export async function createUserFirstBusiness(
  clerkUserId: string,
  userData: { full_name: string; email: string }
): Promise<{ businessId: string; userId: string }> {
  try {
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      throw new Error('Failed to get authenticated Convex client')
    }

    // 1. Create or update user in Convex (upsert handles both cases)
    const userId = await client.mutation(api.functions.users.upsertFromClerk, {
      clerkUserId,
      email: userData.email,
      fullName: userData.full_name
    })

    // 2. Create business (user becomes owner via Convex mutation)
    const businessName = `${userData.full_name}'s Business`

    const businessId = await client.mutation(api.functions.businesses.create, {
      name: businessName,
      homeCurrency: 'SGD'
    })

    console.log(`[BusinessContext] Created first business ${businessId} for user ${userId}`)

    return { businessId: businessId as string, userId: userId as string }

  } catch (error) {
    console.error('[BusinessContext] Error creating first business:', error)
    throw new Error('Failed to create business for new user')
  }
}
