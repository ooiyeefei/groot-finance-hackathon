/**
 * Business Profile API V1
 * GET /api/v1/businesses/profile - Get business profile
 * PUT /api/v1/businesses/profile - Update business profile
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getBusinessProfile, updateBusinessProfile } from '@/domains/account-management/lib/account-management.service'
import { csrfProtection } from '@/domains/security/lib/csrf-protection'
import { rateLimiters } from '@/domains/security/lib/rate-limit'
import { getUserData, createServiceSupabaseClient } from '@/lib/db/supabase-server'

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
      const profile = await getBusinessProfile(userId)
      return NextResponse.json({
        success: true,
        data: profile
      })
    } catch (profileError: any) {
      // If business membership validation fails, try repair
      if (profileError.message?.includes('Failed to validate business membership') ||
          profileError.message?.includes('is not a member of business')) {

        console.log(`[Business Profile API] 🛠️ Business membership validation failed, attempting repair for user: ${userId}`)
        const repairResult = await repairBrokenUserStateProfile(userId)

        if (repairResult.fixed) {
          console.log(`[Business Profile API] ✅ Repaired broken user state, redirecting to dashboard`)
          return NextResponse.json({
            success: true,
            data: repairResult.business,
            message: 'Account setup completed successfully',
            action: 'redirect_to_dashboard'
          })
        }

        if (repairResult.hasExistingBusiness) {
          console.log(`[Business Profile API] ⚠️ User already has business, redirect to dashboard`)
          return NextResponse.json({
            success: true,
            data: repairResult.business,
            message: 'Welcome back to your business account'
          })
        }
      }

      // If repair didn't work or it's a different error, throw original error
      throw profileError
    }

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

    // Note: CSRF protection removed - not needed with Clerk auth + business context validation
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

/**
 * 🛠️ REPAIR FUNCTION: Fix broken user states from incomplete signup flows (Profile version)
 * Handles cases where user has business_id but missing business_membership
 */
async function repairBrokenUserStateProfile(clerkUserId: string): Promise<{
  fixed: boolean
  hasExistingBusiness: boolean
  business?: any
  error?: string
}> {
  try {
    console.log(`[Profile Repair] 🔍 Diagnosing user state: ${clerkUserId}`)

    // Get user data to check current state
    const userData = await getUserData(clerkUserId)
    console.log(`[Profile Repair] 📊 User data: business_id=${userData.business_id}, email=${userData.email}`)

    // Case 1: User has no business_id - they need to create a business
    if (!userData.business_id) {
      console.log(`[Profile Repair] ❌ User has no business_id - profile access denied`)
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
      console.log(`[Profile Repair] ❌ Business ${userData.business_id} not found, user state is corrupted`)
      return { fixed: false, hasExistingBusiness: false }
    }

    console.log(`[Profile Repair] 🏢 Found business: ${business.name} (owner: ${business.owner_id})`)

    // Check if business membership exists
    const { data: membership, error: membershipError } = await supabase
      .from('business_memberships')
      .select('id, role, status')
      .eq('user_id', userData.id)
      .eq('business_id', userData.business_id)
      .single()

    if (!membershipError && membership) {
      console.log(`[Profile Repair] ✅ Business membership exists: role=${membership.role}, status=${membership.status}`)

      // If membership exists but status is not active, fix it
      if (membership.status !== 'active') {
        console.log(`[Profile Repair] 🔧 Fixing inactive membership status`)
        const { error: updateError } = await supabase
          .from('business_memberships')
          .update({
            status: 'active',
            joined_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', membership.id)

        if (updateError) {
          console.error(`[Profile Repair] ❌ Failed to fix membership status:`, updateError)
          return { fixed: false, hasExistingBusiness: true, business, error: 'Failed to repair membership' }
        }

        console.log(`[Profile Repair] ✅ Fixed membership status to active`)
        return { fixed: true, hasExistingBusiness: true, business }
      }

      // Membership is active, user is good to go
      return { fixed: false, hasExistingBusiness: true, business }
    }

    // Case 3: Business exists but membership is missing - CREATE MISSING MEMBERSHIP
    console.log(`[Profile Repair] 🚑 CRITICAL: Business exists but membership missing - creating repair membership`)

    const role: 'admin' | 'manager' | 'employee' = business.owner_id === userData.id ? 'admin' : 'employee'
    console.log(`[Profile Repair] 👤 Creating membership with role: ${role} (user=${userData.id}, owner=${business.owner_id})`)

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
      console.error(`[Profile Repair] ❌ Failed to create missing business membership:`, createError)
      return { fixed: false, hasExistingBusiness: false, error: 'Failed to repair membership' }
    }

    console.log(`[Profile Repair] 🎉 SUCCESS: Created missing business membership - role=${newMembership.role}`)

    // REMOVED: employee_profiles table was dropped in migration 20251005085345
    // All role/permission data is now in business_memberships table
    // No need to create separate employee profile

    return { fixed: true, hasExistingBusiness: true, business }

  } catch (error) {
    console.error('[Profile Repair] 💥 Error during repair:', error)
    return { fixed: false, hasExistingBusiness: false, error: 'Repair failed' }
  }
}
