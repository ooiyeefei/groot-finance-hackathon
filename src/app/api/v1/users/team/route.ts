/**
 * Team Management V1 API
 * GET - Get all team members for the business
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserContextWithBusiness } from '@/domains/security/lib/rbac'
import { teamManagementRateLimiter, getClientIdentifier, applyRateLimit } from '@/domains/security/lib/rate-limit'
import { auditLogger } from '@/domains/security/lib/audit-logger'
import { getTeamMembers } from '@/domains/users/lib/user.service'
import { withCache, CACHE_TTL } from '@/lib/cache/api-cache'

// GET /api/v1/users/team - Get all team members
export async function GET(request: NextRequest) {
  try {
    const userContext = await getCurrentUserContextWithBusiness()

    if (!userContext) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Require manager or admin permission for team access
    if (!userContext.permissions.manager && !userContext.permissions.admin) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager or admin access required.' },
        { status: 403 }
      )
    }

    // Apply rate limiting
    const clientId = getClientIdentifier(request, userContext.userId)
    const rateLimitResult = applyRateLimit(teamManagementRateLimiter, clientId)

    if (!rateLimitResult.allowed) {
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

    const teamRpcStartTime = Date.now()

    // Cache team members with 10-minute TTL (expensive RPC call)
    const teamData = await withCache(
      userContext.userId,
      'team-members',
      () => getTeamMembers(userContext.userId, userContext.profile.business_id),
      {
        params: { business_id: userContext.profile.business_id },
        ttlMs: CACHE_TTL.TEAM_MEMBERS,
        skipCache: false
      }
    )

    const teamExecutionTime = Date.now() - teamRpcStartTime
    auditLogger.logRPCCall(
      userContext.profile.user_id,
      userContext.profile.business_id,
      'get_manager_team_employees',
      { manager_user_id: userContext.userId, business_id_param: userContext.profile.business_id },
      true,
      request,
      teamExecutionTime,
      teamData.users.length
    )

    return NextResponse.json({
      success: true,
      data: teamData
    }, {
      headers: rateLimitResult.headers
    })

  } catch (error) {
    console.error('[Team API] Error:', error)

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
