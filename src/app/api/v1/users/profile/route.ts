/**
 * User Profile V1 API Routes
 * GET - Fetch user profile data including home currency (rate limited for queries)
 * PATCH - Update user profile settings (rate limited for mutations)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserProfile, updateUserProfile } from '@/domains/users/lib/user.service'
import { rateLimit, RATE_LIMIT_CONFIGS } from '@/domains/security/lib/rate-limit'

// GET /api/v1/users/profile - Fetch user profile
export async function GET(request: NextRequest) {
  // Apply rate limiting for query operations (100 requests per minute)
  const queryRateLimit = await rateLimit(request, RATE_LIMIT_CONFIGS.QUERY)

  if (queryRateLimit) {
    return queryRateLimit // Return rate limit error response
  }
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const profile = await getUserProfile(userId)

    return NextResponse.json({
      success: true,
      data: profile
    })

  } catch (error) {
    console.error('Error in GET /api/v1/users/profile:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/v1/users/profile - Update user profile (including name)
export async function PATCH(request: NextRequest) {
  // Apply rate limiting for mutation operations (30 requests per minute)
  const mutationRateLimit = await rateLimit(request, RATE_LIMIT_CONFIGS.MUTATION)

  if (mutationRateLimit) {
    return mutationRateLimit // Return rate limit error response
  }

  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Validate name if provided
    if (body.full_name !== undefined) {
      if (!body.full_name || !body.full_name.trim()) {
        return NextResponse.json(
          { success: false, error: 'Full name is required' },
          { status: 400 }
        )
      }

      if (body.full_name.trim().length < 2) {
        return NextResponse.json(
          { success: false, error: 'Name must be at least 2 characters long' },
          { status: 400 }
        )
      }
    }

    try {
      const updatedProfile = await updateUserProfile(userId, body)

      console.log(`[User Profile V1 API] Updated profile for user ${userId}`)

      return NextResponse.json({
        success: true,
        data: updatedProfile,
        message: 'Profile updated successfully'
      })
    } catch (serviceError) {
      const errorMessage = serviceError instanceof Error ? serviceError.message : 'Failed to update profile'

      if (errorMessage.includes('Unsupported currency') || errorMessage.includes('No valid fields')) {
        return NextResponse.json(
          { success: false, error: errorMessage },
          { status: 400 }
        )
      }

      throw serviceError
    }

  } catch (error) {
    console.error('Error in PATCH /api/v1/users/profile:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
