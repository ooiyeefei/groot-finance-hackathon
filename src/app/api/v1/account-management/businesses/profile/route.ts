/**
 * Business Profile API V1
 * GET /api/v1/businesses/profile - Get business profile
 * PUT /api/v1/businesses/profile - Update business profile
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getBusinessProfile, updateBusinessProfile } from '@/domains/account-management/lib/account-management.service'
import { csrfProtection } from '@/lib/auth/csrf-protection'
import { rateLimiters } from '@/lib/api/rate-limit'

/**
 * Get business profile for current user
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const rateLimitResponse = await rateLimiters.query(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const profile = await getBusinessProfile(userId)

    return NextResponse.json({
      success: true,
      data: profile
    })

  } catch (error) {
    console.error('[Business Profile V1 API] GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * Update business profile
 */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

    const body = await request.json()

    const updatedProfile = await updateBusinessProfile(userId, body)

    return NextResponse.json({
      success: true,
      data: updatedProfile
    })

  } catch (error) {
    console.error('[Business Profile V1 API] PUT error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}
