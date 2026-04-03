/**
 * Expense Claims Analytics V1 API
 *
 * GET /api/v1/expense-claims/analytics?scope=personal|department|company
 *
 * Purpose:
 * - Financial analytics specifically for expense claims
 * - Supports personal, department, and company-wide views
 * - Returns monthly trends and category breakdowns
 *
 * North Star Architecture:
 * - Thin wrapper delegating to expense-claims.service.ts
 * - Handles HTTP concerns (auth, validation, error mapping)
 * - Business logic in service layer
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/demo-server-auth'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { getExpenseAnalytics } from '@/domains/expense-claims/lib/data-access'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile from Convex (includes business_id and role_permissions)
    const userProfile = await ensureUserProfile(userId)
    if (!userProfile) {
      return NextResponse.json({ success: false, error: 'Failed to get user profile' }, { status: 400 })
    }

    if (!userProfile.business_id) {
      return NextResponse.json({ success: false, error: 'No business context found' }, { status: 400 })
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope') || 'personal'

    // Validate scope parameter
    if (!['personal', 'department', 'company'].includes(scope)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid scope. Must be personal, department, or company'
      }, { status: 400 })
    }

    console.log(`[Expense Claims Analytics V1 API] Getting analytics for scope: ${scope}, user: ${userId}`)

    // Call service layer
    const analyticsResult = await getExpenseAnalytics(userId, scope as 'personal' | 'department' | 'company')

    if (!analyticsResult.success) {
      return NextResponse.json({
        success: false,
        error: analyticsResult.error || 'Failed to get expense analytics'
      }, { status: 400 })
    }

    return withCacheHeaders(NextResponse.json({
      success: true,
      data: analyticsResult.data
    }), 'standard')

  } catch (error) {
    console.error('[Expense Claims Analytics V1 API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}