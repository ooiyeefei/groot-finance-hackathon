/**
 * Team Management API
 * Handles team member listing for admin administrators
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { clerkClient } from '@clerk/nextjs/server'
import { teamManagementRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/rate-limiter'
import { auditLogger } from '@/lib/audit-logger'

// GET - Get all team members for the business
export async function GET(request: NextRequest) {
  try {
    // Require admin permission for team management
    const userContext = await requirePermission('admin')

    // SECURITY: Apply rate limiting for team management operations
    const clientId = getClientIdentifier(request, userContext.userId)
    const rateLimitResult = applyRateLimit(teamManagementRateLimiter, clientId)

    if (!rateLimitResult.allowed) {
      console.log(`[Team API] Rate limit exceeded for user: ${userContext.userId}`)
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please wait before making another request.',
          rateLimitExceeded: true
        },
        {
          status: 429,
          headers: rateLimitResult.headers
        }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userContext.userId)

    // PERFORMANCE: Use optimized RPC function instead of complex manual queries
    console.log('[Team API] Using get_manager_team_employees RPC for business:', userContext.profile.business_id)

    // AUDIT: Log RPC call start for team management
    const teamRpcStartTime = Date.now()
    const teamRpcParameters = { manager_business_id: userContext.profile.business_id }

    const { data: rpcTeamData, error: rpcError } = await supabase
      .rpc('get_manager_team_employees', teamRpcParameters)

    // AUDIT: Log RPC call completion for team management
    const teamExecutionTime = Date.now() - teamRpcStartTime
    auditLogger.logRPCCall(
      userContext.userId,
      userContext.profile.business_id,
      'get_manager_team_employees',
      teamRpcParameters,
      !rpcError,
      request,
      teamExecutionTime,
      rpcTeamData?.length || 0,
      rpcError?.message
    )

    let enrichedProfiles: any[] = []

    if (rpcError) {
      console.error('[Team API] RPC function error:', rpcError)
      // Fallback to manual approach if RPC fails
      const { data: profiles, error: fallbackError } = await supabase
        .from('employee_profiles')
        .select('*')
        .eq('business_id', userContext.profile.business_id)
        .order('created_at', { ascending: false })

      if (fallbackError) {
        console.error('[Team API] Fallback query error:', fallbackError)
        return NextResponse.json(
          { success: false, error: 'Failed to fetch team members' },
          { status: 500 }
        )
      }

      enrichedProfiles = profiles || []
    } else {
      console.log('[Team API] RPC function completed successfully, got', rpcTeamData?.length || 0, 'team members')

      // RPC returns pre-joined data with optimized structure
      enrichedProfiles = (rpcTeamData || []).map((member: any) => ({
        // Map RPC result to expected profile structure
        id: member.employee_id,
        user_id: member.user_id,
        business_id: member.business_id,
        full_name: member.full_name,
        email: member.email,
        role_permissions: member.role_permissions || { employee: true, manager: false, admin: false },
        home_currency: member.home_currency,
        manager_id: member.manager_id,
        manager_name: member.manager_name,
        manager_user_id: member.manager_user_id,
        created_at: member.created_at,
        updated_at: member.updated_at,
        // Keep clerk_user as null for now since RPC doesn't include Clerk data
        clerk_user: null
      }))
    }

    // Optional: Still enrich with Clerk data if needed (can be optimized further later)
    if (enrichedProfiles.length > 0 && enrichedProfiles[0].clerk_user === null) {
      console.log('[Team API] Enriching with Clerk data...')
      enrichedProfiles = await Promise.all(
        enrichedProfiles.map(async (profile) => {
          try {
            // Get Clerk user data if we don't have it from RPC
            if (!profile.clerk_user) {
              const { data: userData } = await supabase
                .from('users')
                .select('clerk_user_id')
                .eq('id', profile.user_id)
                .single()

              if (userData?.clerk_user_id) {
                try {
                  const clerkUser = await (await clerkClient()).users.getUser(userData.clerk_user_id)
                  profile.clerk_user = clerkUser
                } catch (error) {
                  console.warn(`Failed to fetch Clerk data for user ${userData.clerk_user_id}:`, error)
                }
              }
            }
            return profile
          } catch (error) {
            console.warn(`Failed to enrich profile ${profile.id}:`, error)
            return profile
          }
        })
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        users: enrichedProfiles,
        business_id: userContext.profile.business_id
      }
    }, {
      headers: rateLimitResult.headers
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