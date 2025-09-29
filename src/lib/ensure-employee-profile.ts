/**
 * Utility to ensure an employee profile exists for a user
 * Auto-creates a default profile if none exists
 */

import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { syncRoleToClerk } from '@/lib/rbac'
import { getDefaultExpenseCategories } from '@/lib/default-expense-categories'

export interface EmployeeProfile {
  id: string
  user_id: string
  business_id: string
  employee_id: string
  department: string | null
  job_title: string | null
  manager_id: string | null
  role_permissions: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
  home_currency?: string // User's preferred home currency
  created_at: string
  updated_at: string
}

export async function ensureEmployeeProfile(userId: string): Promise<EmployeeProfile | null> {
  try {
    const supabase = await createAuthenticatedSupabaseClient(userId)

    // First, check if user already exists in users table with Clerk ID (invitation already accepted)
    console.log(`[Employee Profile] Looking up user for Clerk ID: ${userId}`)
    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, business_id, role')
      .eq('clerk_user_id', userId)
      .single()

    if (!existingUserError && existingUser) {
      // User exists (invitation was accepted), check for employee profile
      console.log(`[Employee Profile] Found existing user UUID: ${existingUser.id} for Clerk ID: ${userId}`)
      
      const { data: employeeProfile, error: profileError } = await supabase
        .from('employee_profiles')
        .select('*')
        .eq('user_id', existingUser.id)
        .single()

      // If profile exists, return it
      if (!profileError && employeeProfile) {
        return employeeProfile as EmployeeProfile
      }

      // If user exists but no employee profile (shouldn't happen, but handle it)
      console.log(`[Employee Profile] User exists but no employee profile, creating one`)
      const rolePermissions = {
        employee: true,
        manager: existingUser.role === 'admin' || existingUser.role === 'manager',
        admin: existingUser.role === 'admin'
      }

      const { data: newProfile, error: createError } = await supabase
        .from('employee_profiles')
        .insert({
          user_id: existingUser.id,
          business_id: existingUser.business_id,
          employee_id: `EMP-${crypto.randomUUID()}`,
          department: 'General',
          job_title: existingUser.role === 'admin' ? 'Administrator' : 
                     existingUser.role === 'manager' ? 'Manager' : 'Employee',
          role_permissions: rolePermissions
        })
        .select('*')
        .single()

      if (!createError && newProfile) {
        await syncRoleToClerk(userId, rolePermissions)
        return newProfile as EmployeeProfile
      }
    }

    // Check if user has a pending invitation (Clerk signup completed but not linked yet)
    console.log(`[Employee Profile] Checking for pending invitation for Clerk ID: ${userId}`)
    
    // Get user's email from Clerk
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerkUser = await (await clerkClient()).users.getUser(userId)
    const userEmail = clerkUser.emailAddresses[0]?.emailAddress

    if (userEmail) {
      const { data: invitation, error: invitationError } = await supabase
        .from('users')
        .select('id, business_id, role, created_at, invited_by')
        .ilike('email', userEmail)
        .is('clerk_user_id', null) // Not yet linked
        .not('invited_by', 'is', null) // Has invitation
        .single()

      if (!invitationError && invitation) {
        console.log(`[Employee Profile] Found pending invitation for ${userEmail}, linking accounts`)
        
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
          // Create employee profile with invitation's business and role
          const rolePermissions = {
            employee: true,
            manager: invitation.role === 'admin' || invitation.role === 'manager',
            admin: invitation.role === 'admin'
          }

          const { data: newProfile, error: profileCreateError } = await supabase
            .from('employee_profiles')
            .insert({
              user_id: invitation.id, // Use invitation user UUID
              business_id: invitation.business_id,
              employee_id: `EMP-${crypto.randomUUID()}`,
              department: 'General',
              job_title: invitation.role === 'admin' ? 'Administrator' : 
                       invitation.role === 'manager' ? 'Manager' : 'Employee',
              role_permissions: rolePermissions
            })
            .select('*')
            .single()

          if (!profileCreateError && newProfile) {
            console.log(`[Employee Profile] Created employee profile from invitation for user ${userId}`)
            await syncRoleToClerk(userId, rolePermissions)
            return newProfile as EmployeeProfile
          }
        }
      }
    }

    // SCENARIO 3: Direct signup (existing Clerk user without Supabase records)
    // Create personal business and user record automatically
    console.log(`[Employee Profile] No invitation found for user ${userId}, creating personal business for direct signup`)

    try {
      // CRITICAL FIX: Check one more time for existing user to prevent race conditions
      const { data: raceCheckUser, error: raceCheckError } = await supabase
        .from('users')
        .select('id, business_id, role')
        .eq('clerk_user_id', userId)
        .single()

      if (!raceCheckError && raceCheckUser) {
        console.log(`[Employee Profile] Race condition avoided - user created by another request`)
        // Recursively call this function to handle the now-existing user
        return ensureEmployeeProfile(userId)
      }

      // CRITICAL FIX: Also check by email to prevent duplicate businesses for same person
      if (userEmail) {
        const { data: existingByEmail, error: emailCheckError } = await supabase
          .from('users')
          .select('id, business_id, role, clerk_user_id')
          .ilike('email', userEmail)
          .single()

        if (!emailCheckError && existingByEmail && !existingByEmail.clerk_user_id) {
          // Found existing user by email but without clerk_user_id - link them
          console.log(`[Employee Profile] Found existing user by email, linking Clerk account`)

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
            return ensureEmployeeProfile(userId)
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
          country_code: 'SG', // Use correct column name
          home_currency: 'SGD', // Use correct column name
          custom_expense_categories: getDefaultExpenseCategories(), // Add default expense categories
          logo_url: 'https://storage.googleapis.com/finanseal-logo/finanseal.png', // Default logo prevents hydration errors
          logo_fallback_color: '#3b82f6', // Consistent fallback color
          created_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (businessError) {
        console.error('[Employee Profile] Error creating personal business:', businessError)
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
          role: 'admin', // Direct signups are admins of their personal business
          home_currency: 'SGD',
          created_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (userError) {
        console.error('[Employee Profile] Error creating user record:', userError)
        // If user creation fails due to duplicate clerk_user_id, another request beat us
        if (userError.code === '23505') { // Unique constraint violation
          console.log(`[Employee Profile] Another request created user simultaneously, retrying`)
          return ensureEmployeeProfile(userId)
        }
        return null
      }

      // Create employee profile for direct signup (admin of their own business)
      const rolePermissions = {
        employee: true,
        manager: true,
        admin: true
      }

      const { data: newProfile, error: profileError } = await supabase
        .from('employee_profiles')
        .insert({
          user_id: newUser.id,
          business_id: newBusiness.id,
          employee_id: `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          department: 'General',
          job_title: 'Administrator',
          role_permissions: rolePermissions
        })
        .select('*')
        .single()

      if (profileError) {
        console.error('[Employee Profile] Error creating employee profile:', profileError)
        return null
      }

      // Sync role to Clerk metadata
      await syncRoleToClerk(userId, rolePermissions)

      console.log(`[Employee Profile] Successfully created direct signup: ${userEmail} → Business: ${newBusiness.id}`)
      return newProfile as EmployeeProfile

    } catch (error) {
      console.error('[Employee Profile] Error creating direct signup profile:', error)
      return null
    }

  } catch (error) {
    console.error('[Employee Profile] Error ensuring employee profile:', error)
    return null
  }
}

export async function getEmployeeProfileWithAutoCreate(userId: string): Promise<{
  profile: EmployeeProfile | null
  error?: string
}> {
  const profile = await ensureEmployeeProfile(userId)
  
  if (!profile) {
    return {
      profile: null,
      error: 'Failed to create or retrieve employee profile'
    }
  }

  return { profile }
}