/**
 * Team Management API
 * Handles team member listing for admin administrators
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { clerkClient } from '@clerk/nextjs/server'

// GET - Get all team members for the business
export async function GET(request: NextRequest) {
  try {
    // Require admin permission for team management
    const userContext = await requirePermission('admin')
    const supabase = await createAuthenticatedSupabaseClient(userContext.userId)

    // Get all employee profiles for this business
    const { data: profiles, error } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('business_id', userContext.profile.business_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Team API] Error fetching team members:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch team members' },
        { status: 500 }
      )
    }

    // Enrich with Clerk user data and manager information
    const enrichedProfiles = await Promise.all(
      profiles.map(async (profile) => {
        try {
          // Get Clerk user data
          const { data: userData } = await supabase
            .from('users')
            .select('clerk_user_id, full_name, email')
            .eq('id', profile.user_id)
            .single()

          let clerkUser = null
          if (userData?.clerk_user_id) {
            try {
              clerkUser = await (await clerkClient()).users.getUser(userData.clerk_user_id)
            } catch (error) {
              console.warn(`Failed to fetch Clerk data for user ${userData.clerk_user_id}:`, error)
            }
          }

          // Get manager information if assigned
          let managerName = null
          let managerUserId = null
          if (profile.manager_id) {
            // First get the manager's employee profile to get the user_id
            const { data: managerProfile } = await supabase
              .from('employee_profiles')
              .select('user_id')
              .eq('id', profile.manager_id)
              .single()

            if (managerProfile) {
              managerUserId = managerProfile.user_id

              // Then get the user data for the manager
              const { data: managerData } = await supabase
                .from('users')
                .select('full_name, clerk_user_id')
                .eq('id', managerProfile.user_id)
                .single()

              if (managerData) {
                if (managerData.clerk_user_id) {
                  try {
                    const managerClerk = await (await clerkClient()).users.getUser(managerData.clerk_user_id)
                    managerName = managerClerk.firstName && managerClerk.lastName
                      ? `${managerClerk.firstName} ${managerClerk.lastName}`
                      : managerData.full_name
                  } catch (error) {
                    console.warn(`Failed to fetch manager Clerk data:`, error)
                    managerName = managerData.full_name
                  }
                } else {
                  managerName = managerData.full_name
                }
              }
            }
          }

          return {
            ...profile,
            full_name: userData?.full_name,
            email: userData?.email,
            clerk_user: clerkUser,
            manager_name: managerName,
            manager_user_id: managerUserId
          }
        } catch (error) {
          console.warn(`Failed to enrich profile ${profile.id}:`, error)
          return profile
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: {
        users: enrichedProfiles,
        business_id: userContext.profile.business_id
      }
    })

  } catch (error) {
    console.error('[Team API] Unexpected error:', error)
    
    if (error instanceof Error && error.message.includes('Permission required')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Admin access required.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}