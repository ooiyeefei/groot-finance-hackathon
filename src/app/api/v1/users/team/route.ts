/**
 * Team Management V1 API
 * GET - Get all team members for the business
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserContextWithBusiness } from '@/lib/auth/rbac'
import { teamManagementRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/api/rate-limit'
import { auditLogger } from '@/lib/api/audit-logger'
import { getTeamMembers } from '@/domains/users/lib/user.service'

// GET /api/v1/users/team - Get all team members
export async function GET(request: NextRequest) {
  try {
    console.log('[Team V1 API] 🚀 Team API called')

    // Get user context to check permissions
    const userContext = await getCurrentUserContextWithBusiness()

    console.log('[Team V1 API] 📊 User context:', {
      userId: userContext?.userId,
      businessId: userContext?.businessContext?.businessId,
      role: userContext?.businessContext?.role,
      permissions: userContext?.permissions,
      canViewAllExpenses: userContext?.canViewAllExpenses,
      canManageUsers: userContext?.canManageUsers
    })

    if (!userContext) {
      console.log('[Team V1 API] ❌ No user context')
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    // Require manager or admin permission for team access
    if (!userContext.permissions.manager && !userContext.permissions.admin) {
      console.log('[Team V1 API] ❌ Permission denied - manager:', userContext.permissions.manager, 'admin:', userContext.permissions.admin)
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions. Manager or admin access required.' },
        { status: 403 }
      )
    }

    console.log('[Team V1 API] ✅ Permission granted - proceeding with team fetch')

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
    console.log('[Team V1 API] 🔍 Calling getTeamMembers with:', {
      userId: userContext.userId,
      businessId: userContext.profile.business_id
    })

    const teamData = await getTeamMembers(userContext.userId, userContext.profile.business_id)

    console.log('[Team V1 API] 📋 Team data received:', {
      userCount: teamData.users.length,
      businessId: teamData.business_id,
      users: teamData.users.map(u => ({
        id: u.id,
        user_id: u.user_id,
        full_name: u.full_name,
        email: u.email,
        role_permissions: u.role_permissions
      }))
    })

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

    console.log('[Team V1 API] ✅ Returning team data - success: true, userCount:', teamData.users.length)

    return NextResponse.json({
      success: true,
      data: teamData
    }, {
      headers: rateLimitResult.headers
    })

  } catch (error) {
    console.error('[Team V1 API] Unexpected error:', error)

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
