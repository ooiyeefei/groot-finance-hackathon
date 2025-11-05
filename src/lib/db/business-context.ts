/**
 * Business Context Service - Multi-Tenant RBAC System
 * Handles business membership, ownership, and context switching
 */

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createServiceSupabaseClient, getUserData } from '@/lib/db/supabase-server'

export interface BusinessMembership {
  id: string
  user_id: string
  business_id: string
  role: 'admin' | 'manager' | 'employee'
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
  role: 'admin' | 'manager' | 'employee'
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
 */
export async function getUserBusinessMemberships(userId?: string): Promise<BusinessWithOwnership[]> {
  const clerkUserId = userId || (await auth()).userId
  if (!clerkUserId) throw new Error('Authentication required')

  // Get Supabase user ID
  const userData = await getUserData(clerkUserId)
  const supabaseUserId = userData.id

  const supabase = createServiceSupabaseClient()

  // Get all businesses user is member of
  const { data: memberships, error: membershipsError } = await supabase
    .from('business_memberships')
    .select(`
      *,
      business:businesses (
        id,
        name,
        slug,
        owner_id,
        country_code,
        home_currency,
        logo_url,
        logo_fallback_color
      )
    `)
    .eq('user_id', supabaseUserId)
    .eq('status', 'active')
    .order('last_accessed_at', { ascending: false })

  if (membershipsError) {
    console.error('[BusinessContext] Error fetching memberships:', membershipsError)
    throw new Error('Failed to fetch business memberships')
  }

  return (memberships || []).map((membership: any) => ({
    ...membership.business,
    membership: {
      id: membership.id,
      user_id: membership.user_id,
      business_id: membership.business_id,
      role: membership.role,
      invited_at: membership.invited_at,
      joined_at: membership.joined_at,
      last_accessed_at: membership.last_accessed_at,
      status: membership.status,
      created_at: membership.created_at,
      updated_at: membership.updated_at
    },
    isOwner: membership.business.owner_id === supabaseUserId
  }))
}

/**
 * Check if user is owner of a specific business
 */
export async function checkBusinessOwnership(businessId: string, userId?: string): Promise<boolean> {
  const clerkUserId = userId || (await auth()).userId
  if (!clerkUserId) return false

  try {
    const userData = await getUserData(clerkUserId)
    const supabase = createServiceSupabaseClient()

    const { data: business, error } = await supabase
      .from('businesses')
      .select('owner_id')
      .eq('id', businessId)
      .single()

    if (error || !business) return false
    return business.owner_id === userData.id
  } catch (error) {
    console.error('[BusinessContext] Error checking ownership:', error)
    return false
  }
}

/**
 * Verify user has membership in a business and return membership details
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
    const userData = await getUserData(clerkUserId)
    const supabase = createServiceSupabaseClient()

    const { data: membership, error } = await supabase
      .from('business_memberships')
      .select('*')
      .eq('user_id', userData.id)
      .eq('business_id', businessId)
      .eq('status', 'active')
      .single()

    if (error) {
      console.error('[BusinessContext] Query error from business_memberships:', error)
      return null
    }

    if (!membership) {
      return null
    }

    return membership
  } catch (error) {
    console.error('[BusinessContext] Exception in verifyBusinessMembership:', error)
    return null
  }
}

/**
 * Get current business context (OPTIMIZED - single query approach)
 */
export async function getCurrentBusinessContext(userId?: string): Promise<BusinessContext | null> {
  const clerkUserId = userId || (await auth()).userId
  if (!clerkUserId) return null

  try {
    // PERFORMANCE FIX: Single getUserData call instead of 3 duplicate calls
    const userData = await getUserData(clerkUserId)
    const businessId = userData.business_id

    if (!businessId) {
      // No business associated with user
      return null
    }

    // PERFORMANCE FIX: Single optimized query to get all needed data
    const supabase = createServiceSupabaseClient()
    const { data: businessData, error } = await supabase
      .from('business_memberships')
      .select(`
        id,
        user_id,
        business_id,
        role,
        status,
        businesses!business_memberships_business_id_fkey(
          id,
          name,
          owner_id
        )
      `)
      .eq('user_id', userData.id)
      .eq('business_id', businessId)
      .eq('status', 'active')
      .single()

    if (error || !businessData) {
      console.warn('[BusinessContext] Business context not available - possible auth propagation delay or expired membership:', {
        businessId,
        userId: userData.id,
        error: error?.message || 'No active membership found'
      })
      return null
    }

    const business = Array.isArray(businessData.businesses)
      ? businessData.businesses[0]
      : businessData.businesses
    const isOwner = business?.owner_id === userData.id

    return {
      businessId: businessId,
      businessName: business?.name || 'Unknown Business',
      role: businessData.role,
      isOwner,
      permissions: computePermissions(businessData.role, isOwner)
    }
  } catch (error) {
    console.error('[BusinessContext] Error getting current context:', error)
    return null
  }
}

/**
 * Switch user's active business (updates Clerk JWT)
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
    // Verify user has access to this business
    const membership = await verifyBusinessMembership(businessId, clerkUserId)

    if (!membership) {
      return { success: false, error: 'Access denied to business' }
    }

    // Update database only (single source of truth)
    const userData = await getUserData(clerkUserId)
    const supabase = createServiceSupabaseClient()
    const { error: updateUserError } = await supabase
      .from('users')
      .update({
        business_id: businessId,
        updated_at: new Date().toISOString()
      })
      .eq('id', userData.id)

    if (updateUserError) {
      console.error('[BusinessContext] Failed to update users table:', updateUserError)
      throw updateUserError
    }

    // Update last accessed time in business_memberships
    const { error: updateMembershipError } = await supabase
      .from('business_memberships')
      .update({
        last_accessed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userData.id)
      .eq('business_id', businessId)

    if (updateMembershipError) {
      console.error('[BusinessContext] Failed to update business_memberships (non-critical):', updateMembershipError)
    }

    // Invalidate cache when business context changes
    const { invalidateUserCache } = await import('./business-context-cache')
    invalidateUserCache(clerkUserId)

    // Return the new context
    const context = await getCurrentBusinessContext(clerkUserId)

    if (!context) {
      return { success: false, error: 'Failed to load new business context' }
    }

    return { success: true, context: context || undefined }

  } catch (error) {
    console.error('[BusinessContext] Error switching business:', error)
    return { success: false, error: 'Failed to switch business' }
  }
}

/**
 * Compute permissions based on role and ownership
 */
function computePermissions(role: 'admin' | 'manager' | 'employee', isOwner: boolean) {
  const basePermissions = {
    // Owner-only permissions (business-level)
    canDeleteBusiness: isOwner,
    canManageSubscription: isOwner,
    canTransferOwnership: isOwner,

    // Operational permissions based on role
    canInviteMembers: role === 'admin' || role === 'manager',
    canRemoveMembers: role === 'admin' || (role === 'manager'), // Manager can only remove employees
    canChangeSettings: role === 'admin',
    canApproveExpenses: role === 'admin' || role === 'manager',
    canManageCategories: role === 'admin' || role === 'manager',
    canViewAllData: role === 'admin' || role === 'manager'
  }

  return basePermissions
}

/**
 * Initialize first business for new user (called during signup)
 */
export async function createUserFirstBusiness(
  clerkUserId: string,
  userData: { full_name: string; email: string }
): Promise<{ businessId: string; userId: string }> {
  const supabase = createServiceSupabaseClient()

  try {
    // 1. Create user in our database
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        clerk_user_id: clerkUserId,
        email: userData.email,
        full_name: userData.full_name
      })
      .select()
      .single()

    if (userError) throw userError

    // 2. Create business (user becomes owner)
    const businessName = `${userData.full_name}'s Business`
    const businessSlug = businessName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now()

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: businessName,
        slug: businessSlug,
        owner_id: user.id, // User is owner
        country_code: 'SG',
        home_currency: 'SGD'
      })
      .select()
      .single()

    if (businessError) throw businessError

    // 3. Add user as Admin in business_memberships
    const { error: membershipError } = await supabase
      .from('business_memberships')
      .insert({
        user_id: user.id,
        business_id: business.id,
        role: 'admin',
        status: 'active',
        joined_at: new Date().toISOString()
      })

    if (membershipError) throw membershipError

    // 4. Update user's business_id in database
    await supabase
      .from('users')
      .update({
        business_id: business.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    // Database is single source of truth - no JWT metadata needed
    return { businessId: business.id, userId: user.id }

  } catch (error) {
    console.error('[BusinessContext] Error creating first business:', error)
    throw new Error('Failed to create business for new user')
  }
}