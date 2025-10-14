/**
 * Team Management V1 API
 * GET - Get all team members for the business
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/rbac'
import { teamManagementRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/api/rate-limit'
import { auditLogger } from '@/lib/api/audit-logger'
import { getTeamMembers } from '@/domains/users/lib/user.service'

// GET /api/v1/users/team - Get all team members
export async function GET(request: NextRequest) {
  try {
    // Require admin permission for team management
    const userContext = await requirePermission('admin')

    // Apply rate limiting
    const clientId = getClientIdentifier(request, userContext.userId)
    const rateLimitResult = applyRateLimit(teamManagementRateLimiter, clientId)

    if (!rateLimitResult.allowed) {
      console.log(`[Team V1 API] Rate limit exceeded for user: ${userContext.userId}`)
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

    console.log('[Team V1 API] Fetching team members for business:', userContext.profile.business_id)

    const teamRpcStartTime = Date.now()

    // Use service layer
    const teamData = await getTeamMembers(userContext.userId, userContext.profile.business_id)

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
    console.error('[Team V1 API] Unexpected error:', error)

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
