/**
 * Utility to ensure an employee profile exists for a user
 * Auto-creates a default profile if none exists
 *
 * Migrated to Convex from Supabase
 */

import { clerkClient } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { syncRoleToClerk } from '@/domains/security/lib/rbac'

export interface UserProfile {
  id: string
  user_id: string
  business_id: string
  role: 'finance_admin' | 'manager' | 'employee' | 'owner'
  role_permissions: {
    employee: boolean
    manager: boolean
    finance_admin: boolean
  }
  home_currency?: string // User's preferred home currency
  created_at: string
  updated_at: string
}

/**
 * Ensure user profile exists with business membership
 * Uses Convex mutation for atomic onboarding flow
 */
export async function ensureUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    // Get user's email and name from Clerk
    const clerk = await clerkClient()
    const clerkUser = await clerk.users.getUser(userId)
    const userEmail = clerkUser.emailAddresses[0]?.emailAddress

    if (!userEmail) {
      console.error('[User Profile] No email found for Clerk user:', userId)
      return null
    }

    const fullName = clerkUser.firstName && clerkUser.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`
      : undefined

    // Use Convex to ensure user exists with business
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error('[User Profile] Failed to get authenticated Convex client')
      return null
    }

    console.log(`[User Profile] Ensuring profile for Clerk ID: ${userId}, email: ${userEmail}`)

    const profile = await client.mutation(api.functions.users.ensureUserWithBusiness, {
      clerkUserId: userId,
      email: userEmail,
      fullName
    })

    if (!profile) {
      console.error('[User Profile] Convex returned null profile')
      return null
    }

    // Sync role to Clerk metadata (if applicable)
    // This is mostly a no-op now but kept for compatibility
    if (profile.role_permissions) {
      await new Promise(resolve => setTimeout(resolve, 300))
      const syncResult = await syncRoleToClerk(userId, profile.role_permissions)
      if (!syncResult.success) {
        console.warn(`[EnsureProfile] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
      }
    }

    console.log(`[User Profile] Successfully ensured profile for ${userEmail} with role ${profile.role}`)

    return {
      id: profile.id as string,
      user_id: profile.user_id as string,
      business_id: profile.business_id as string,
      role: profile.role as 'finance_admin' | 'manager' | 'employee' | 'owner',
      role_permissions: profile.role_permissions,
      created_at: profile.created_at,
      updated_at: profile.updated_at
    }

  } catch (error) {
    console.error('[User Profile] Error ensuring user profile:', error)
    return null
  }
}

export async function getUserProfileWithAutoCreate(userId: string): Promise<{
  profile: UserProfile | null
  error?: string
}> {
  const profile = await ensureUserProfile(userId)

  if (!profile) {
    return {
      profile: null,
      error: 'Failed to create or retrieve user profile'
    }
  }

  return { profile }
}
