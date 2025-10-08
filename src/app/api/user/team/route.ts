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

    // PERFORMANCE: Use optimized RPC function with proper status filtering
    console.log('[Team API] Using get_manager_team_employees RPC for business:', userContext.profile.business_id)

    // AUDIT: Log RPC call start for team management
    const teamRpcStartTime = Date.now()
    // CRITICAL FIX: RPC function expects Clerk ID as single parameter, not object
    const clerkUserId = userContext.userId

    const { data: rpcTeamData, error: rpcError } = await supabase
      .rpc('get_manager_team_employees', { manager_user_id: clerkUserId })

    // AUDIT: Log RPC call completion for team management
    const teamExecutionTime = Date.now() - teamRpcStartTime
    auditLogger.logRPCCall(
      userContext.profile.user_id,  // ✅ Use Supabase UUID instead of Clerk ID
      userContext.profile.business_id,
      'get_manager_team_employees',
      { manager_user_id: clerkUserId },
      !rpcError,
      request,
      teamExecutionTime,
      rpcTeamData?.length || 0,
      rpcError?.message
    )

    let enrichedProfiles: any[] = []

    if (rpcError) {
      console.error('[Team API] RPC function error:', rpcError)
      // Fallback to manual approach if RPC fails (still using authenticated client)
      const { data: memberships, error: fallbackError } = await supabase
        .from('business_memberships')
        .select(`
          id,
          user_id,
          business_id,
          role,
          created_at,
          users!business_memberships_user_id_fkey(
            id,
            email,
            full_name,
            home_currency,
            clerk_user_id
          )
        `)
        .eq('business_id', userContext.profile.business_id)
        .eq('status', 'active') // Only include active members
        .not('users.clerk_user_id', 'is', null) // Only include users who have actually signed up
        .order('created_at', { ascending: false })

      if (fallbackError) {
        console.error('[Team API] Fallback query error:', fallbackError)
        return NextResponse.json(
          { success: false, error: 'Failed to fetch team members' },
          { status: 500 }
        )
      }

      // Transform business_memberships to profile format
      enrichedProfiles = (memberships || []).map(membership => {
        // Handle Supabase relationship - users is a single object, not an array
        const user = Array.isArray(membership.users) ? membership.users[0] : membership.users

        return {
          id: membership.id,
          user_id: membership.user_id,
          business_id: membership.business_id,
          full_name: user?.full_name || null,
          email: user?.email || null,
          role_permissions: {
            employee: true,
            manager: membership.role === 'admin' || membership.role === 'manager',
            admin: membership.role === 'admin'
          },
          home_currency: user?.home_currency || null,
          manager_id: null, // Not available in business_memberships
          manager_name: null,
          manager_user_id: null,
          created_at: membership.created_at,
          updated_at: membership.created_at, // Use created_at as fallback
          clerk_user: null
        }
      })
    } else {
      console.log('[Team API] RPC function completed successfully, got', rpcTeamData?.length || 0, 'team members')

      // Debug: Log the actual RPC response structure
      if (rpcTeamData && rpcTeamData.length > 0) {
        console.log('[Team API] Sample RPC member fields:', Object.keys(rpcTeamData[0]))
        console.log('[Team API] Sample RPC member data:', JSON.stringify(rpcTeamData[0], null, 2))
      }

      // RPC returns pre-joined data with optimized structure
      enrichedProfiles = (rpcTeamData || []).map((member: any) => ({
        // CRITICAL FIX: Use membership_id as the profile id for role updates
        id: member.membership_id, // Use membership_id for frontend role update API calls
        user_id: member.id, // Use user_id (member.id) for user identification
        business_id: userContext.profile.business_id, // From user context
        full_name: member.full_name,
        email: member.email,
        // Convert role to role_permissions structure
        role_permissions: {
          employee: true,
          manager: member.role === 'manager' || member.role === 'admin',
          admin: member.role === 'admin'
        },
        home_currency: member.home_currency || 'SGD', // Use from RPC or default
        manager_id: member.manager_membership_id, // NEW: Manager membership ID from RPC
        manager_name: member.manager_name, // NEW: Manager name from RPC
        manager_user_id: member.manager_user_uuid, // NEW: Manager user ID from RPC
        created_at: member.joined_at || member.created_at, // Use joined_at or created_at
        updated_at: member.joined_at || member.updated_at, // Use joined_at or updated_at
        // Keep clerk_user as null for now since RPC doesn't include Clerk data
        clerk_user: null
      }))
    }

    // PERFORMANCE FIX: Batch Clerk API calls to prevent N+1 query issue
    if (enrichedProfiles.length > 0 && enrichedProfiles[0].clerk_user === null) {
      console.log('[Team API] Enriching with Clerk data using batch API...')

      // Collect all valid Clerk user IDs for batch fetching
      const clerkUserIds: string[] = []
      const profileClerkIdMap = new Map<string, any>()

      enrichedProfiles.forEach((profile) => {
        const memberData = rpcTeamData ? rpcTeamData.find((member: any) => member.id === profile.user_id) : null
        const clerkUserId = memberData?.clerk_user_id

        if (clerkUserId) {
          clerkUserIds.push(clerkUserId)
          profileClerkIdMap.set(clerkUserId, profile)
        } else {
          console.log(`[Team API] User ${profile.user_id} has no clerk_user_id - pending invitation`)
        }
      })

      // Batch fetch all Clerk users in a single API call (up to 100 at once)
      let clerkUsersMap = new Map<string, any>()

      if (clerkUserIds.length > 0) {
        try {
          const startTime = Date.now()

          // Batch fetch using getUserList with userId filter (more efficient than individual calls)
          const clerkUsers = await (await clerkClient()).users.getUserList({
            userId: clerkUserIds,
            limit: 100 // Clerk API limit
          })

          const fetchTime = Date.now() - startTime
          console.log(`[Team API] Batch fetched ${clerkUsers.data.length} Clerk users in ${fetchTime}ms (vs ${clerkUserIds.length} individual calls)`)

          // Create efficient lookup map
          clerkUsers.data.forEach(user => {
            clerkUsersMap.set(user.id, user)
          })

        } catch (error) {
          console.error('[Team API] Batch Clerk fetch failed:', error)
          // Continue without Clerk data rather than failing completely
        }
      }

      // Efficiently enrich profiles with batch-fetched Clerk data
      const enrichedWithClerkData = enrichedProfiles.map((profile) => {
        const memberData = rpcTeamData ? rpcTeamData.find((member: any) => member.id === profile.user_id) : null
        const clerkUserId = memberData?.clerk_user_id

        if (clerkUserId && clerkUsersMap.has(clerkUserId)) {
          profile.clerk_user = clerkUsersMap.get(clerkUserId)
          return profile
        } else if (!clerkUserId) {
          // Pending invitation - exclude from results
          return null
        } else {
          // Clerk user not found in batch - include profile without Clerk data
          console.warn(`[Team API] Clerk user ${clerkUserId} not found in batch response`)
          return profile
        }
      })

      // Filter out null values (pending invitations without clerk_user_id)
      enrichedProfiles = enrichedWithClerkData.filter(profile => profile !== null)
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