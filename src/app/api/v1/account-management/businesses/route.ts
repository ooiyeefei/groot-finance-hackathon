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
import { getUserData, createServiceSupabaseClient } from '@/lib/db/supabase-server'

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

    // Apply rate limiting
    const rateLimitResponse = await rateLimiters.admin(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Note: CSRF protection removed - not needed with JWT auth + business context validation

    // Parse request body first (used in multiple paths)
    const body = await request.json()

    // 🔧 REPAIR LOGIC: Check for broken user state before creating new business
    console.log(`[Business API] 🛠️ Checking for broken user state: ${userId}`)
    const repairResult = await repairBrokenUserState(userId)

    // Handle existing business cases (both repaired and non-repaired)
    if (repairResult.hasExistingBusiness || repairResult.fixed) {
      // CRITICAL FIX: Check if existing business has default name and user wants to update it
      const existingBusinessName = repairResult.business?.name || ''
      const userProvidedName = body.name?.trim()

      console.log(`[Business API] Existing business name: "${existingBusinessName}", User input: "${userProvidedName}"`)

      // If existing business has default name pattern AND user provided a different name, allow update
      const isDefaultName = existingBusinessName.includes("'s Business") || existingBusinessName.includes("@")
      const shouldUpdateName = isDefaultName && userProvidedName && userProvidedName !== existingBusinessName

      if (shouldUpdateName) {
        console.log(`[Business API] 🔧 Updating business name from "${existingBusinessName}" to "${userProvidedName}"`)

        try {
          // Update the business name using the service layer
          const { updateBusinessProfile } = await import('@/domains/account-management/lib/account-management.service')
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
          console.error('[Business API] Failed to update business name:', updateError)
          // Fall through to existing business response
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

/**
 * 🛠️ REPAIR FUNCTION: Fix broken user states from incomplete signup flows
 * Handles cases where user has business_id but missing business_membership
 */
async function repairBrokenUserState(clerkUserId: string): Promise<{
  fixed: boolean
  hasExistingBusiness: boolean
  business?: any
  error?: string
}> {
  try {
    console.log(`[Repair] 🔍 Diagnosing user state: ${clerkUserId}`)

    // Get user data to check current state
    const userData = await getUserData(clerkUserId)
    console.log(`[Repair] 📊 User data: business_id=${userData.business_id}, email=${userData.email}`)

    // Case 1: User has no business_id - completely new user, no repair needed
    if (!userData.business_id) {
      console.log(`[Repair] ✅ User has no business_id - new user, no repair needed`)
      return { fixed: false, hasExistingBusiness: false }
    }

    // Case 2: User has business_id - check if business and membership exist
    const supabase = createServiceSupabaseClient()

    // Check if business exists
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, name, owner_id')
      .eq('id', userData.business_id)
      .single()

    if (businessError || !business) {
      console.log(`[Repair] ❌ Business ${userData.business_id} not found, user state is corrupted`)
      // Could reset user's business_id to null here, but safer to let them create new business
      return { fixed: false, hasExistingBusiness: false }
    }

    console.log(`[Repair] 🏢 Found business: ${business.name} (owner: ${business.owner_id})`)

    // Check if business membership exists
    const { data: membership, error: membershipError } = await supabase
      .from('business_memberships')
      .select('id, role, status')
      .eq('user_id', userData.id)
      .eq('business_id', userData.business_id)
      .single()

    if (!membershipError && membership) {
      console.log(`[Repair] ✅ Business membership exists: role=${membership.role}, status=${membership.status}`)

      // If membership exists but status is not active, fix it
      if (membership.status !== 'active') {
        console.log(`[Repair] 🔧 Fixing inactive membership status`)
        const { error: updateError } = await supabase
          .from('business_memberships')
          .update({
            status: 'active',
            joined_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', membership.id)

        if (updateError) {
          console.error(`[Repair] ❌ Failed to fix membership status:`, updateError)
          return { fixed: false, hasExistingBusiness: true, business, error: 'Failed to repair membership' }
        }

        console.log(`[Repair] ✅ Fixed membership status to active`)
        return { fixed: true, hasExistingBusiness: true, business }
      }

      // Membership is active, user is good to go
      return { fixed: false, hasExistingBusiness: true, business }
    }

    // Case 3: Business exists but membership is missing - CREATE MISSING MEMBERSHIP
    console.log(`[Repair] 🚑 CRITICAL: Business exists but membership missing - creating repair membership`)

    const role: 'admin' | 'manager' | 'employee' = business.owner_id === userData.id ? 'admin' : 'employee'
    console.log(`[Repair] 👤 Creating membership with role: ${role} (user=${userData.id}, owner=${business.owner_id})`)

    const { data: newMembership, error: createError } = await supabase
      .from('business_memberships')
      .insert({
        user_id: userData.id,
        business_id: userData.business_id,
        role: role,
        status: 'active',
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select('id, role, status')
      .single()

    if (createError) {
      console.error(`[Repair] ❌ Failed to create missing business membership:`, createError)
      return { fixed: false, hasExistingBusiness: false, error: 'Failed to repair membership' }
    }

    console.log(`[Repair] 🎉 SUCCESS: Created missing business membership - role=${newMembership.role}`)

    // REMOVED: employee_profiles table was dropped in migration 20251005085345
    // All role/permission data is now in business_memberships table
    // No need to create separate employee profile

    return { fixed: true, hasExistingBusiness: true, business }

  } catch (error) {
    console.error('[Repair] 💥 Error during repair:', error)
    return { fixed: false, hasExistingBusiness: false, error: 'Repair failed' }
  }
}
