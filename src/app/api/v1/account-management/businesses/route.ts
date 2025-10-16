/**
 * Business API V1
 * POST /api/v1/businesses - Create new business
 * GET /api/v1/businesses - List user's businesses
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createBusiness, getUserBusinessMemberships } from '@/domains/account-management/lib/account-management.service'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { csrfProtection } from '@/domains/security/lib/csrf-protection'

/**
 * Create new business and assign current user as owner
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Apply rate limiting and CSRF protection
    const rateLimitResponse = await rateLimiters.admin(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

    const body = await request.json()
    const business = await createBusiness(userId, body)

    return NextResponse.json({
      success: true,
      business,
      message: 'Business created successfully'
    })

  } catch (error) {
    console.error('[Business V1 API] Create error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}

/**
 * Get all businesses user is member of
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    const rateLimitResponse = await rateLimiters.query(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const businesses = await getUserBusinessMemberships(userId)

    return NextResponse.json({
      success: true,
      data: {
        memberships: businesses
      }
    })

  } catch (error) {
    console.error('[Business V1 API] List error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch business memberships'
    }, { status: 500 })
  }
}
