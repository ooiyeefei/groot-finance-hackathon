/**
 * Admin Email Logs API Route
 *
 * GET /api/v1/admin/email-logs - Get email logs for admin view
 *
 * Requires Clerk authentication and admin/owner role.
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'

// ===== CONVEX CLIENT =====

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  }
  return new ConvexHttpClient(convexUrl)
}

/**
 * GET - Get email logs for the current business
 *
 * Query params:
 * - limit: number (default: 50, max: 200)
 * - status: string (filter by status)
 * - templateType: string (filter by template type)
 */
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth()

    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const convex = getConvexClient()

    // Get user by Clerk ID
    const user = await convex.query(api.functions.users.getByClerkId, {
      clerkUserId
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Get user's business membership to verify access
    const memberships = await convex.query(api.functions.emails.getMembershipsForUser, {
      userId: user._id
    })

    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No business membership found' },
        { status: 403 }
      )
    }

    // Check if user has admin or owner role
    const adminMembership = memberships.find(
      m => m.role === 'owner' || m.role === 'admin'
    )

    if (!adminMembership) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50', 10),
      200
    )

    // Get email logs for the business
    const logs = await convex.query(api.functions.emails.getEmailLogsForBusiness, {
      businessId: adminMembership.businessId as Id<'businesses'>,
      limit
    })

    // Apply additional filters on the client side (Convex doesn't support complex filtering)
    const status = searchParams.get('status')
    const templateType = searchParams.get('templateType')

    let filteredLogs = logs
    if (status) {
      filteredLogs = filteredLogs.filter(log => log.status === status)
    }
    if (templateType) {
      filteredLogs = filteredLogs.filter(log => log.templateType === templateType)
    }

    return NextResponse.json({
      success: true,
      data: {
        logs: filteredLogs,
        total: filteredLogs.length,
        businessId: adminMembership.businessId
      }
    })

  } catch (error) {
    console.error('[Admin Email Logs API] GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
