/**
 * Business Profile API V1
 * GET /api/v1/businesses/profile - Get business profile
 * PUT /api/v1/businesses/profile - Update business profile
 *
 * MIGRATED TO CONVEX (2026-01-03)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getBusinessProfile, updateBusinessProfile } from '@/domains/account-management/lib/account-management.service'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { ensureUserProfile } from '@/domains/security/lib/ensure-employee-profile'
import { withCache, apiCache, CACHE_TTL } from '@/lib/cache/api-cache'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

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

    // 🔧 REPAIR LOGIC: Check for broken user state before fetching profile
    try {
      // ✅ PERFORMANCE: Cache business profile with 30-minute TTL
      const profile = await withCache(
        userId,
        'business-profile',
        () => getBusinessProfile(userId),
        {
          ttlMs: CACHE_TTL.BUSINESS_SETTINGS,
          skipCache: false
        }
      )

      return withCacheHeaders(NextResponse.json({
        success: true,
        data: profile
      }), 'stable')
    } catch (profileError: any) {
      // If business membership validation fails, try repair
      if (profileError.message?.includes('Failed to validate business membership') ||
          profileError.message?.includes('is not a member of business')) {

        console.log(`[Business Profile API] 🛠️ Business membership validation failed, attempting repair for user: ${userId}`)
        const repairResult = await repairBrokenUserStateProfile(userId)

        if (repairResult.fixed) {
          console.log(`[Business Profile API] ✅ Repaired broken user state, redirecting to dashboard`)
          return withCacheHeaders(NextResponse.json({
            success: true,
            data: repairResult.business,
            message: 'Account setup completed successfully',
            action: 'redirect_to_dashboard'
          }), 'stable')
        }

        if (repairResult.hasExistingBusiness) {
          console.log(`[Business Profile API] ⚠️ User already has business, redirect to dashboard`)
          return withCacheHeaders(NextResponse.json({
            success: true,
            data: repairResult.business,
            message: 'Welcome back to your business account'
          }), 'stable')
        }
      }

      // If repair didn't work or it's a different error, throw original error
      throw profileError
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // Handle expected pre-onboarding states gracefully (not 500)
    // These are expected for users who haven't completed onboarding yet
    const isNoBusinessError =
      errorMessage.includes('No business found') ||
      errorMessage.includes('User has no business') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('Failed to get business profile')

    if (isNoBusinessError) {
      // Return 404 with clear message for pre-onboarding users
      console.log('[Business Profile V1 API] User has no business - expected for pre-onboarding')
      return NextResponse.json(
        {
          success: false,
          error: 'No business profile found',
          code: 'NO_BUSINESS',
          message: 'Please complete onboarding to set up your business'
        },
        { status: 404 }
      )
    }

    // Unexpected errors - log and return 500
    console.error('[Business Profile V1 API] GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: errorMessage
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

    // Note: CSRF protection removed - not needed with Clerk auth + business context validation
    const body = await request.json()

    const updatedProfile = await updateBusinessProfile(userId, body)

    // Invalidate business profile cache after successful update
    apiCache.invalidate(userId, 'business-profile')

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

/**
 * 🛠️ REPAIR FUNCTION: Check user state from Convex (simplified post-migration)
 * Legacy Supabase repair logic removed - Convex is now source of truth
 */
async function repairBrokenUserStateProfile(clerkUserId: string): Promise<{
  fixed: boolean
  hasExistingBusiness: boolean
  business?: any
  error?: string
}> {
  try {
    console.log(`[Profile Repair] 🔍 Checking user state in Convex: ${clerkUserId}`)

    // Get user profile from Convex - this is now the single source of truth
    const userProfile = await ensureUserProfile(clerkUserId)

    // Case 1: User has no profile or no business_id - they need to create a business
    if (!userProfile || !userProfile.business_id) {
      console.log(`[Profile Repair] ❌ User has no business_id - profile access denied`)
      return { fixed: false, hasExistingBusiness: false }
    }

    console.log(`[Profile Repair] ✅ User has valid Convex profile with business_id=${userProfile.business_id}`)

    // User has valid Convex profile with business - return success
    // Note: Business details are fetched separately via getBusinessProfile service
    return {
      fixed: false,
      hasExistingBusiness: true,
      business: {
        id: userProfile.business_id,
        name: 'Business', // Actual name fetched via service
        owner_id: userProfile.user_id
      }
    }

  } catch (error) {
    console.error('[Profile Repair] 💥 Error during check:', error)
    return { fixed: false, hasExistingBusiness: false, error: 'Check failed' }
  }
}
