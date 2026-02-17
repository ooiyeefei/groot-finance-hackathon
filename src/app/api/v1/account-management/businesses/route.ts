/**
 * Business API V1
 * POST /api/v1/businesses - Create new business
 * GET /api/v1/businesses - List user's businesses
 *
 * Migrated to Convex from Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { createBusiness, getUserBusinessMemberships, updateBusinessProfile } from '@/domains/account-management/lib/account-management.service'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { handleApiError, ApiError, HttpStatus } from '@/lib/api-error-handler'

/**
 * Create new business and assign current user as owner
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const { userId } = await auth()
    if (!userId) {
      throw new ApiError('Authentication required', HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED')
    }

    // Get Clerk user info for repair function
    const clerkUser = await currentUser()
    if (!clerkUser) {
      throw new ApiError('Failed to get user info', HttpStatus.UNAUTHORIZED, 'USER_INFO_FAILED')
    }

    const userEmail = clerkUser.emailAddresses[0]?.emailAddress || ''
    const userFullName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || undefined

    // Apply rate limiting
    const rateLimitResponse = await rateLimiters.admin(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Parse request body
    let body: { name?: string }
    try {
      body = await request.json()
    } catch {
      throw new ApiError('Invalid JSON body', HttpStatus.BAD_REQUEST, 'INVALID_JSON')
    }

    // 🔧 REPAIR LOGIC: Check for broken user state before creating new business
    console.log(`[Business API] 🛠️ Checking for broken user state: ${userId}`)
    const repairResult = await repairBrokenUserState(userId, userEmail, userFullName)

    // Handle existing business cases (both repaired and non-repaired)
    if (repairResult.hasExistingBusiness || repairResult.fixed) {
      const existingBusinessName = repairResult.business?.name || ''
      const userProvidedName = body.name?.trim()

      console.log(`[Business API] Existing business name: "${existingBusinessName}", User input: "${userProvidedName}"`)

      // If existing business has default name pattern AND user provided a different name, allow update
      const isDefaultName = existingBusinessName.includes("'s Business") || existingBusinessName.includes("@")
      const shouldUpdateName = isDefaultName && userProvidedName && userProvidedName !== existingBusinessName

      if (shouldUpdateName) {
        console.log(`[Business API] 🔧 Updating business name from "${existingBusinessName}" to "${userProvidedName}"`)

        try {
          const updatedBusiness = await updateBusinessProfile(userId, { name: userProvidedName })

          return NextResponse.json({
            success: true,
            business: {
              ...repairResult.business,
              name: updatedBusiness.name
            },
            message: repairResult.fixed
              ? 'Account setup completed and business name updated successfully'
              : 'Business name updated successfully',
            action: 'redirect_to_dashboard'
          })
        } catch (updateError) {
          // Log but don't fail - fall through to existing business response
          console.error('[Business API] Failed to update business name:', updateError)
        }
      }

      // Return existing business (either repaired or not)
      const responseMessage = repairResult.fixed
        ? 'Account setup completed successfully'
        : 'You already have a business account'

      console.log(`[Business API] ${repairResult.fixed ? '✅ Repaired broken user state' : '⚠️ User already has business'}, redirecting to dashboard`)
      return NextResponse.json({
        success: true,
        business: repairResult.business,
        message: responseMessage,
        action: 'redirect_to_dashboard'
      })
    }

    // Create new business
    const business = await createBusiness(userId, body)

    return NextResponse.json({
      success: true,
      business,
      message: 'Business created successfully'
    })

  } catch (error) {
    return handleApiError(error, {
      route: '/api/v1/account-management/businesses',
      method: 'POST',
      request,
      domain: 'account-management',
      extra: {
        duration_ms: Date.now() - startTime,
      },
    })
  }
}

/**
 * Get all businesses user is member of
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const { userId } = await auth()
    if (!userId) {
      throw new ApiError('Authentication required', HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED')
    }

    // Apply rate limiting
    const rateLimitResponse = await rateLimiters.query(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const businesses = await getUserBusinessMemberships(userId)

    return NextResponse.json({
      success: true,
      data: {
        memberships: businesses
      },
      meta: {
        duration_ms: Date.now() - startTime,
      }
    })

  } catch (error) {
    return handleApiError(error, {
      route: '/api/v1/account-management/businesses',
      method: 'GET',
      request,
      domain: 'account-management',
      extra: {
        duration_ms: Date.now() - startTime,
      },
    })
  }
}

/**
 * 🛠️ REPAIR FUNCTION: Fix broken user states from incomplete signup flows
 */
async function repairBrokenUserState(
  clerkUserId: string,
  email: string,
  fullName?: string
): Promise<{
  fixed: boolean
  hasExistingBusiness: boolean
  business?: { id: string; name: string }
  error?: string
}> {
  try {
    console.log(`[Repair] 🔍 Diagnosing user state via Convex: ${clerkUserId}`)

    const { client } = await getAuthenticatedConvex()
    if (!client) {
      console.error(`[Repair] ❌ Failed to get authenticated Convex client`)
      return { fixed: false, hasExistingBusiness: false, error: 'Authentication failed' }
    }

    // Call Convex mutation that handles all repair scenarios atomically
    const result = await client.mutation(api.functions.users.ensureUserWithBusiness, {
      clerkUserId,
      email,
      fullName
    })

    if (!result) {
      console.log(`[Repair] ❌ ensureUserWithBusiness returned null - user needs onboarding`)
      return { fixed: false, hasExistingBusiness: false }
    }

    // If we have a business_id, fetch the business details
    if (result.business_id) {
      const business = await client.query(api.functions.businesses.getById, {
        id: result.business_id
      })

      if (business) {
        console.log(`[Repair] ✅ User has active membership to business: ${business.name}`)
        return {
          fixed: true,
          hasExistingBusiness: true,
          business: { id: business._id, name: business.name }
        }
      }
    }

    console.log(`[Repair] ⚠️ User exists but no business found`)
    return { fixed: false, hasExistingBusiness: false }

  } catch (error) {
    console.error('[Repair] 💥 Error during repair:', error)
    return { fixed: false, hasExistingBusiness: false, error: 'Repair failed' }
  }
}
