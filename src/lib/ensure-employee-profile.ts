/**
 * Utility to ensure an employee profile exists for a user
 * Auto-creates a default profile if none exists
 */

import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { syncRoleToClerk } from '@/lib/rbac'

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

    console.log(`[Employee Profile] No invitation found for user ${userId}, cannot create profile without business assignment`)
    
    // DO NOT create random business assignments
    // Users must be invited to join a business or have admin create them manually
    console.error('[Employee Profile] User has no invitation and no existing business - profile creation requires invitation')
    return null

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