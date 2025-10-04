/**
 * Debug endpoint to test team authentication step by step
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { validateDebugAccess, logDebugAccess, createDebugErrorResponse } from '@/lib/debug-auth'

export async function GET(request: NextRequest) {
  try {
    console.log('[Team Auth Debug] Starting debug...')

    // SECURITY: Validate debug access (authentication + environment checks)
    const authResult = await validateDebugAccess()

    if (!authResult.authorized) {
      return authResult.response!
    }

    const userId = authResult.userId!

    // Log access for audit purposes
    logDebugAccess(userId, '/api/debug/team-auth', 'accessed')

    console.log('[Team Auth Debug] Step 1 - Clerk Auth:', { userId })

    // Step 2: Try to create Supabase client
    console.log('[Team Auth Debug] Step 2 - Creating Supabase client...')
    const supabase = await createAuthenticatedSupabaseClient(userId)
    console.log('[Team Auth Debug] Step 2 - Supabase client created successfully')

    // Step 3: Test simple query
    console.log('[Team Auth Debug] Step 3 - Testing simple users query...')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, business_id, role')
      .eq('clerk_user_id', userId)
      .single()

    console.log('[Team Auth Debug] Step 3 - Users query result:', {
      success: !userError,
      userData,
      error: userError
    })

    if (userError) {
      return NextResponse.json({
        step: 3,
        error: `Users query failed: ${userError.message}`,
        userError
      }, { status: 500 })
    }

    // Step 4: Test employee profiles query
    console.log('[Team Auth Debug] Step 4 - Testing employee profiles query...')
    const { data: profileData, error: profileError } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('user_id', userData.id)
      .single()

    console.log('[Team Auth Debug] Step 4 - Employee profile result:', {
      success: !profileError,
      profileData,
      error: profileError
    })

    // Step 5: Test team members query (what the actual API does)
    console.log('[Team Auth Debug] Step 5 - Testing team members query...')
    const { data: teamData, error: teamError } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('business_id', userData.business_id)

    console.log('[Team Auth Debug] Step 5 - Team query result:', {
      success: !teamError,
      teamCount: teamData?.length || 0,
      error: teamError
    })

    return NextResponse.json({
      success: true,
      steps: {
        1: { clerk_auth: true, userId },
        2: { supabase_client: true },
        3: {
          users_query: !userError,
          userData,
          error: userError ? (userError as any).message : null
        },
        4: {
          profile_query: !profileError,
          profileData,
          error: profileError ? (profileError as any).message : null
        },
        5: {
          team_query: !teamError,
          teamCount: teamData?.length || 0,
          teamData,
          error: teamError ? (teamError as any).message : null
        }
      }
    })

  } catch (error) {
    return createDebugErrorResponse(error, 'Team authentication debug')
  }
}