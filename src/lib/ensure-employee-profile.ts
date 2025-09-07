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

    // First, get the user UUID from the users table using the Clerk user ID
    console.log(`[Employee Profile] Looking up user UUID for Clerk ID: ${userId}`)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error('[Employee Profile] User not found in users table:', userError)
      return null
    }

    const userUuid = user.id
    console.log(`[Employee Profile] Found user UUID: ${userUuid} for Clerk ID: ${userId}`)

    // Try to get existing employee profile using the UUID
    const { data: employeeProfile, error: profileError } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('user_id', userUuid)
      .single()

    // If profile exists, return it
    if (!profileError && employeeProfile) {
      return employeeProfile as EmployeeProfile
    }

    console.log(`[Employee Profile] Creating default employee profile for user ${userId}`)
    
    // Get the default business
    const { data: defaultBusiness } = await supabase
      .from('businesses')
      .select('id')
      .limit(1)
      .single()

    if (!defaultBusiness) {
      console.error('[Employee Profile] No default business found')
      return null
    }

    // Create default employee profile using the UUID
    const { data: newProfile, error: createError } = await supabase
      .from('employee_profiles')
      .insert({
        user_id: userUuid,
        business_id: defaultBusiness.id,
        employee_id: `EMP${Date.now()}`, // Generate unique employee ID
        department: 'General',
        job_title: 'Employee',
        role_permissions: {
          employee: true,
          manager: false,
          admin: false
        }
      })
      .select('*')
      .single()

    if (createError) {
      console.error('[Employee Profile] Failed to create employee profile:', createError)
      return null
    }

    console.log(`[Employee Profile] Created employee profile for user ${userId}`)
    
    // Sync role to Clerk metadata (following Clerk RBAC best practices)
    await syncRoleToClerk(userId, newProfile.role_permissions)
    
    return newProfile as EmployeeProfile

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