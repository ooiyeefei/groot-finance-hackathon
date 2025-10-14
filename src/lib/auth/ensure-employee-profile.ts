/**
 * Utility to ensure an employee profile exists for a user
 * Auto-creates a default profile if none exists
 */

import { createAuthenticatedSupabaseClient } from '@/lib/db/supabase-server'
import { syncRoleToClerk } from '@/lib/auth/rbac'
import { getDefaultExpenseCategories } from '@/domains/expense-claims/lib/default-expense-categories'

export interface UserProfile {
  id: string
  user_id: string
  business_id: string
  role: 'admin' | 'manager' | 'employee'
  role_permissions: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
  home_currency?: string // User's preferred home currency
  created_at: string
  updated_at: string
}

export async function ensureUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // First, check if user already exists in users table with Clerk ID
    console.log(`[User Profile] Looking up user for Clerk ID: ${userId}`)
    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', userId)
      .single()

    if (!existingUserError && existingUser) {
      // User exists, check for business membership
      console.log(`[User Profile] Found existing user UUID: ${existingUser.id} for Clerk ID: ${userId}`)

      // FIXED: Handle users with multiple business memberships
      // First try to get membership for user's primary business
      let { data: membership, error: membershipError } = await supabase
        .from('business_memberships')
        .select('id, business_id, role, created_at')
        .eq('user_id', existingUser.id)
        .eq('business_id', existingUser.business_id)
        .single()

      // If user doesn't have membership in their primary business, get any membership
      if (membershipError) {
        const { data: anyMembership, error: anyMembershipError } = await supabase
          .from('business_memberships')
          .select('id, business_id, role, created_at')
          .eq('user_id', existingUser.id)
          .limit(1)
          .single()

        membership = anyMembership
        membershipError = anyMembershipError
      }

      // If membership exists, return profile
      if (!membershipError && membership) {
        const rolePermissions = {
          employee: true,
          manager: membership.role === 'admin' || membership.role === 'manager',
          admin: membership.role === 'admin'
        }

        return {
          id: membership.id,
          user_id: existingUser.id,
          business_id: membership.business_id,
          role: membership.role,
          role_permissions: rolePermissions,
          created_at: membership.created_at,
          updated_at: membership.created_at
        } as UserProfile
      }

      // If user exists but no membership (shouldn't happen, but handle it)
      console.log(`[User Profile] User exists but no business membership, creating one as admin`)
      const { data: newMembership, error: createError } = await supabase
        .from('business_memberships')
        .insert({
          user_id: existingUser.id,
          business_id: existingUser.business_id,
          role: 'admin'
        })
        .select('id, business_id, role, created_at')
        .single()

      if (!createError && newMembership) {
        const rolePermissions = {
          employee: true,
          manager: true,
          admin: true
        }

        // Sync role to Clerk metadata
        await new Promise(resolve => setTimeout(resolve, 300))
        const syncResult = await syncRoleToClerk(userId, rolePermissions)
        if (!syncResult.success) {
          console.error(`[EnsureProfile] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
        }

        return {
          id: newMembership.id,
          user_id: existingUser.id,
          business_id: newMembership.business_id,
          role: newMembership.role,
          role_permissions: rolePermissions,
          created_at: newMembership.created_at,
          updated_at: newMembership.created_at
        } as UserProfile
      }
    }

    // Check if user has a pending invitation (Clerk signup completed but not linked yet)
    console.log(`[User Profile] Checking for pending invitation for Clerk ID: ${userId}`)

    // Get user's email from Clerk
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerkUser = await (await clerkClient()).users.getUser(userId)
    const userEmail = clerkUser.emailAddresses[0]?.emailAddress

    if (userEmail) {
      const { data: invitation, error: invitationError } = await supabase
        .from('users')
        .select('id, business_id, created_at, invited_by')
        .ilike('email', userEmail)
        .is('clerk_user_id', null) // Not yet linked
        .not('invited_by', 'is', null) // Has invitation
        .single()

      if (!invitationError && invitation) {
        console.log(`[User Profile] Found pending invitation for ${userEmail}, linking accounts`)

        // Link Clerk user to invitation
        const { error: linkError } = await supabase
          .from('users')
          .update({
            clerk_user_id: userId,
            full_name: clerkUser.firstName && clerkUser.lastName
              ? `${clerkUser.firstName} ${clerkUser.lastName}`
              : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', invitation.id)

        if (!linkError) {
          // Create business membership (default to employee role for invitations)
          const { data: newMembership, error: membershipCreateError } = await supabase
            .from('business_memberships')
            .insert({
              user_id: invitation.id,
              business_id: invitation.business_id,
              role: 'employee' // Default role for invited users
            })
            .select('id, business_id, role, created_at')
            .single()

          if (!membershipCreateError && newMembership) {
            console.log(`[User Profile] Created business membership from invitation for user ${userId}`)

            const rolePermissions = {
              employee: true,
              manager: false,
              admin: false
            }

            // Sync role to Clerk metadata
            await new Promise(resolve => setTimeout(resolve, 300))
            const syncResult = await syncRoleToClerk(userId, rolePermissions)
            if (!syncResult.success) {
              console.error(`[EnsureProfile] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
            }

            return {
              id: newMembership.id,
              user_id: invitation.id,
              business_id: newMembership.business_id,
              role: newMembership.role,
              role_permissions: rolePermissions,
              created_at: newMembership.created_at,
              updated_at: newMembership.created_at
            } as UserProfile
          }
        }
      }
    }

    // SCENARIO 3: Direct signup (existing Clerk user without Supabase records)
    // Create personal business and user record automatically
    console.log(`[User Profile] No invitation found for user ${userId}, creating personal business for direct signup`)

    try {
      // CRITICAL FIX: Check one more time for existing user to prevent race conditions
      const { data: raceCheckUser, error: raceCheckError } = await supabase
        .from('users')
        .select('id, business_id')
        .eq('clerk_user_id', userId)
        .single()

      if (!raceCheckError && raceCheckUser) {
        console.log(`[User Profile] Race condition avoided - user created by another request`)
        // Recursively call this function to handle the now-existing user
        return ensureUserProfile(userId)
      }

      // CRITICAL FIX: Also check by email to prevent duplicate businesses for same person
      if (userEmail) {
        const { data: existingByEmail, error: emailCheckError } = await supabase
          .from('users')
          .select('id, business_id, clerk_user_id')
          .ilike('email', userEmail)
          .single()

        if (!emailCheckError && existingByEmail && !existingByEmail.clerk_user_id) {
          // Found existing user by email but without clerk_user_id - link them
          console.log(`[User Profile] Found existing user by email, linking Clerk account`)

          const { error: linkError } = await supabase
            .from('users')
            .update({
              clerk_user_id: userId,
              full_name: clerkUser.firstName && clerkUser.lastName
                ? `${clerkUser.firstName} ${clerkUser.lastName}`
                : null,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingByEmail.id)

          if (!linkError) {
            // Recursively call this function to handle the now-linked user
            return ensureUserProfile(userId)
          }
        }
      }

      // Safe to create new business now
      const businessName = clerkUser.firstName && clerkUser.lastName
        ? `${clerkUser.firstName} ${clerkUser.lastName}'s Business`
        : `${userEmail?.split('@')[0]}'s Business`

      const { data: newBusiness, error: businessError } = await supabase
        .from('businesses')
        .insert({
          name: businessName,
          slug: `${userEmail?.split('@')[0]}-business-${Date.now()}`, // Generate unique slug
          country_code: 'SG',
          home_currency: 'SGD',
          custom_expense_categories: getDefaultExpenseCategories(),
          logo_url: 'https://storage.googleapis.com/finanseal-logo/finanseal.png',
          logo_fallback_color: '#3b82f6',
          created_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (businessError) {
        console.error('[User Profile] Error creating personal business:', businessError)
        return null
      }

      // Create user record for direct signup
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          clerk_user_id: userId,
          email: userEmail,
          full_name: clerkUser.firstName && clerkUser.lastName
            ? `${clerkUser.firstName} ${clerkUser.lastName}`
            : null,
          business_id: newBusiness.id,
          home_currency: 'SGD',
          created_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (userError) {
        console.error('[User Profile] Error creating user record:', userError)
        // If user creation fails due to duplicate clerk_user_id, another request beat us
        if (userError.code === '23505') { // Unique constraint violation
          console.log(`[User Profile] Another request created user simultaneously, retrying`)
          return ensureUserProfile(userId)
        }
        return null
      }

      // Create business membership for direct signup (admin of their own business)
      const { data: newMembership, error: membershipError } = await supabase
        .from('business_memberships')
        .insert({
          user_id: newUser.id,
          business_id: newBusiness.id,
          role: 'admin'
        })
        .select('id, business_id, role, created_at')
        .single()

      if (membershipError) {
        console.error('[User Profile] Error creating business membership:', membershipError)
        return null
      }

      const rolePermissions = {
        employee: true,
        manager: true,
        admin: true
      }

      // Sync role to Clerk metadata (add delay to avoid race conditions)
      await new Promise(resolve => setTimeout(resolve, 300))
      const syncResult = await syncRoleToClerk(userId, rolePermissions)
      if (!syncResult.success) {
        console.error(`[EnsureProfile] Warning: Failed to sync permissions to Clerk: ${syncResult.error}`)
      }

      console.log(`[User Profile] Successfully created direct signup: ${userEmail} → Business: ${newBusiness.id}`)

      return {
        id: newMembership.id,
        user_id: newUser.id,
        business_id: newMembership.business_id,
        role: newMembership.role,
        role_permissions: rolePermissions,
        created_at: newMembership.created_at,
        updated_at: newMembership.created_at
      } as UserProfile

    } catch (error) {
      console.error('[User Profile] Error creating direct signup profile:', error)
      return null
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