/**
 * Team Management V1 API
 * GET - Get all team members for the business
 *
 * Query Parameters:
 * - directReportsOnly: boolean - When true, returns only employees reporting to current user
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserContextWithBusiness } from '@/domains/security/lib/rbac'
import { teamManagementRateLimiter, getClientIdentifier, applyRateLimit } from '@/domains/security/lib/rate-limit'
import { auditLogger } from '@/domains/security/lib/audit-logger'
import { getTeamMembers, getDirectReports } from '@/domains/users/lib/user.service'
import { withCache, CACHE_TTL } from '@/lib/cache/api-cache'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

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

    // Require manager or finance_admin permission for team access
    if (!userContext.permissions.manager && !userContext.permissions.finance_admin) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager or finance admin access required.' },
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

    // Check if directReportsOnly is requested
    const { searchParams } = new URL(request.url)
    const directReportsOnly = searchParams.get('directReportsOnly') === 'true'

    const teamRpcStartTime = Date.now()

    // Fetch team members or direct reports based on query param
    const teamData = directReportsOnly
      ? await withCache(
          userContext.userId,
          'direct-reports',
          () => getDirectReports(userContext.userId, userContext.profile.business_id),
          {
            params: { business_id: userContext.profile.business_id },
            ttlMs: CACHE_TTL.TEAM_MEMBERS,
            skipCache: false
          }
        )
      : await withCache(
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
      directReportsOnly ? 'get_direct_reports' : 'get_manager_team_employees',
      { manager_user_id: userContext.userId, business_id_param: userContext.profile.business_id, directReportsOnly },
      true,
      request,
      teamExecutionTime,
      teamData.users.length
    )

    return withCacheHeaders(NextResponse.json({
      success: true,
      data: teamData
    }, {
      headers: rateLimitResult.headers
    }), 'volatile')

  } catch (error) {
    console.error('[Team API] Error:', error)

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
