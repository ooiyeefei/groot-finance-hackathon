/**
 * Business Creation API
 * POST /api/business/create - Create new business and assign current user as owner
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createServiceSupabaseClient, getUserData } from '@/lib/supabase-server'
import { syncRoleToClerk } from '@/lib/rbac'
import { getDefaultExpenseCategories } from '@/lib/default-expense-categories'

interface CreateBusinessRequest {
  name: string
  country_code?: string
  home_currency?: string
}

// CRITICAL FIX: Complete rollback function for atomic business creation
async function performCompleteRollback(supabase: any, businessId: string, userId: string, reason: string) {
  console.log(`[Business Creation] ROLLBACK: Performing complete cleanup - ${reason}`)

  try {
    // Delete business membership
    await supabase.from('business_memberships').delete().eq('business_id', businessId)
    console.log(`[Business Creation] ROLLBACK: Deleted business membership`)

    // Delete the business
    await supabase.from('businesses').delete().eq('id', businessId)
    console.log(`[Business Creation] ROLLBACK: Deleted business`)

    // Reset user's business_id if it was set
    await supabase
      .from('users')
      .update({
        business_id: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
    console.log(`[Business Creation] ROLLBACK: Reset user business_id`)

    console.log(`[Business Creation] ROLLBACK: Complete cleanup successful`)
  } catch (rollbackError) {
    console.error(`[Business Creation] ROLLBACK ERROR: Failed to cleanup:`, rollbackError)
    // Log but don't throw - we've already failed, don't want to hide the original error
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    const body = await request.json() as CreateBusinessRequest
    const { name, country_code = 'SG', home_currency = 'SGD' } = body

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Business name is required'
      }, { status: 400 })
    }

    if (name.trim().length < 2) {
      return NextResponse.json({
        success: false,
        error: 'Business name must be at least 2 characters'
      }, { status: 400 })
    }

    // Get user data to ensure user exists in our system
    const userData = await getUserData(userId)
    if (!userData) {
      return NextResponse.json({
        success: false,
        error: 'User not found in system'
      }, { status: 404 })
    }

    const supabase = createServiceSupabaseClient()

    // Generate unique business slug
    const baseSlug = name.trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens

    const timestamp = Date.now()
    const businessSlug = `${baseSlug}-${timestamp}`

    console.log(`[Business Creation] Creating business for user ${userData.email}: "${name}" (${businessSlug})`)

    // Create the business with user as owner
    const { data: newBusiness, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: name.trim(),
        slug: businessSlug,
        owner_id: userData.id, // Use Supabase user UUID as owner
        country_code,
        home_currency,
        custom_expense_categories: getDefaultExpenseCategories(),
        created_at: new Date().toISOString()
      })
      .select('*')
      .single()

    if (businessError) {
      console.error('[Business Creation] Error creating business:', businessError)
      return NextResponse.json({
        success: false,
        error: `Failed to create business: ${businessError.message}`
      }, { status: 500 })
    }

    console.log(`[Business Creation] Business created with ID: ${newBusiness.id}`)

    // Create owner's business membership with admin role
    const { error: membershipError } = await supabase
      .from('business_memberships')
      .insert({
        user_id: userData.id,
        business_id: newBusiness.id,
        role: 'admin', // Owner gets admin role for operational permissions
        joined_at: new Date().toISOString(),
        status: 'active'
      })

    if (membershipError) {
      console.error('[Business Creation] Error creating owner membership:', membershipError)

      // Cleanup: Delete the business if membership creation fails
      await supabase.from('businesses').delete().eq('id', newBusiness.id)

      return NextResponse.json({
        success: false,
        error: `Failed to create owner membership: ${membershipError.message}`
      }, { status: 500 })
    }

    console.log(`[Business Creation] Owner membership created successfully`)

    // Update user's business_id to point to new business
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        business_id: newBusiness.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', userData.id)

    if (userUpdateError) {
      console.error('[Business Creation] Error updating user business_id:', userUpdateError)
      // Don't fail the entire operation for this - it's not critical
    }

    // CRITICAL FIX: Sync admin permissions to Clerk metadata with proper rollback
    const adminRolePermissions = {
      employee: true,
      manager: true,
      admin: true
    }

    const syncResult = await syncRoleToClerk(userId, adminRolePermissions)
    if (!syncResult.success) {
      console.error(`[Business Creation] CRITICAL: Failed to sync permissions to Clerk: ${syncResult.error}`)

      // ROLLBACK: Complete cleanup on permission sync failure
      await performCompleteRollback(supabase, newBusiness.id, userData.id, 'Clerk permission sync failed')

      return NextResponse.json({
        success: false,
        error: `Failed to sync user permissions: ${syncResult.error}`
      }, { status: 500 })
    }

    // Set the new business as active business in Clerk metadata with rollback
    try {
      const { clerkClient } = await import('@clerk/nextjs/server')
      await (await clerkClient()).users.updateUser(userId, {
        publicMetadata: {
          ...((await (await clerkClient()).users.getUser(userId)).publicMetadata || {}),
          activeBusinessId: newBusiness.id
        }
      })
      console.log(`[Business Creation] Successfully set active business in Clerk metadata`)
    } catch (error) {
      console.error('[Business Creation] CRITICAL: Failed to set active business in Clerk:', error)

      // ROLLBACK: Complete cleanup on metadata sync failure
      await performCompleteRollback(supabase, newBusiness.id, userData.id, 'Clerk metadata sync failed')

      return NextResponse.json({
        success: false,
        error: 'Failed to activate business in user profile'
      }, { status: 500 })
    }

    console.log(`[Business Creation] Successfully created business "${name}" for user ${userData.email}`)

    return NextResponse.json({
      success: true,
      business: {
        id: newBusiness.id,
        name: newBusiness.name,
        slug: newBusiness.slug,
        country_code: newBusiness.country_code,
        home_currency: newBusiness.home_currency,
        is_owner: true
      },
      message: 'Business created successfully'
    })

  } catch (error) {
    console.error('[Business Creation] Unexpected error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error while creating business'
    }, { status: 500 })
  }
}