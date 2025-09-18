/**
 * Admin API to sync existing Clerk users to Supabase
 * This is a one-time migration script to handle users who signed up before webhook was implemented
 *
 * POST /api/admin/sync-clerk-users
 * Requires MASTER_ADMIN_KEY for security
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { syncRoleToClerk } from '@/lib/rbac'

export async function POST(request: NextRequest) {
  try {
    console.log('[Clerk Sync] Starting sync process for existing Clerk users')

    // Security: Verify master admin key
    const { masterKey } = await request.json()
    if (masterKey !== process.env.MASTER_ADMIN_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Invalid master key'
      }, { status: 403 })
    }

    const supabase = createServiceSupabaseClient()
    const { clerkClient } = await import('@clerk/nextjs/server')

    // Get all Clerk users
    console.log('[Clerk Sync] Fetching all Clerk users...')
    const clerkUsers = await (await clerkClient()).users.getUserList({ limit: 500 })

    const syncResults = {
      total: clerkUsers.totalCount || 0,
      processed: 0,
      linked: 0,
      created: 0,
      skipped: 0,
      errors: [] as string[]
    }

    console.log(`[Clerk Sync] Found ${syncResults.total} Clerk users to process`)

    // Process each Clerk user
    for (const clerkUser of clerkUsers.data) {
      try {
        syncResults.processed++

        const primaryEmail = clerkUser.emailAddresses.find(
          email => email.verification?.status === 'verified'
        ) || clerkUser.emailAddresses[0]

        if (!primaryEmail) {
          console.log(`[Clerk Sync] Skipping user ${clerkUser.id} - no email`)
          syncResults.skipped++
          continue
        }

        const email = primaryEmail.emailAddress.toLowerCase()
        const fullName = clerkUser.firstName && clerkUser.lastName
          ? `${clerkUser.firstName} ${clerkUser.lastName}`
          : null

        console.log(`[Clerk Sync] Processing: ${email} (${clerkUser.id})`)

        // Check if user already exists in Supabase
        const { data: existingUser } = await supabase
          .from('users')
          .select('id, clerk_user_id, business_id, role, invited_by')
          .or(`clerk_user_id.eq.${clerkUser.id},email.ilike.${email}`)
          .single()

        if (existingUser?.clerk_user_id === clerkUser.id) {
          console.log(`[Clerk Sync] User already synced: ${email}`)
          syncResults.skipped++
          continue
        }

        if (existingUser && !existingUser.clerk_user_id) {
          // Link existing invitation to Clerk user
          console.log(`[Clerk Sync] Linking invitation to Clerk user: ${email}`)

          const { error: linkError } = await supabase
            .from('users')
            .update({
              clerk_user_id: clerkUser.id,
              full_name: fullName,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingUser.id)

          if (linkError) {
            syncResults.errors.push(`Link error for ${email}: ${linkError.message}`)
            continue
          }

          // Check if employee profile exists
          const { data: existingProfile } = await supabase
            .from('employee_profiles')
            .select('id')
            .eq('user_id', existingUser.id)
            .single()

          if (!existingProfile) {
            // Create employee profile
            await createEmployeeProfile(
              existingUser.id,
              existingUser.business_id,
              existingUser.role,
              clerkUser.id
            )
          }

          syncResults.linked++
          console.log(`[Clerk Sync] Successfully linked: ${email}`)
        } else {
          // Create new user (direct signup scenario)
          console.log(`[Clerk Sync] Creating new user for direct signup: ${email}`)

          // Create personal business
          const { data: newBusiness, error: businessError } = await supabase
            .from('businesses')
            .insert({
              name: fullName ? `${fullName}'s Business` : `${email.split('@')[0]}'s Business`,
              email: email,
              country: 'SG',
              currency: 'SGD',
              business_type: 'personal',
              created_at: new Date().toISOString()
            })
            .select('id')
            .single()

          if (businessError) {
            syncResults.errors.push(`Business creation error for ${email}: ${businessError.message}`)
            continue
          }

          // Create user record
          const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({
              clerk_user_id: clerkUser.id,
              email: email,
              full_name: fullName,
              business_id: newBusiness.id,
              role: 'admin', // Direct signups are admins of their personal business
              home_currency: 'SGD',
              created_at: new Date(clerkUser.createdAt).toISOString()
            })
            .select('id')
            .single()

          if (userError) {
            syncResults.errors.push(`User creation error for ${email}: ${userError.message}`)
            continue
          }

          // Create employee profile
          await createEmployeeProfile(
            newUser.id,
            newBusiness.id,
            'admin',
            clerkUser.id
          )

          syncResults.created++
          console.log(`[Clerk Sync] Successfully created: ${email}`)
        }

      } catch (error) {
        syncResults.errors.push(`Processing error for ${clerkUser.id}: ${error}`)
        console.error(`[Clerk Sync] Error processing user ${clerkUser.id}:`, error)
      }
    }

    console.log('[Clerk Sync] Sync completed:', syncResults)

    return NextResponse.json({
      success: true,
      message: 'Clerk user sync completed',
      results: syncResults
    })

  } catch (error) {
    console.error('[Clerk Sync] Sync process failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Sync process failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Helper function to create employee profile
 */
async function createEmployeeProfile(
  userId: string,
  businessId: string,
  role: string,
  clerkUserId: string
) {
  const supabase = createServiceSupabaseClient()

  try {
    const rolePermissions = {
      employee: true,
      manager: role === 'admin' || role === 'manager',
      admin: role === 'admin'
    }

    const { error } = await supabase
      .from('employee_profiles')
      .insert({
        user_id: userId,
        business_id: businessId,
        employee_id: `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        department: 'General',
        job_title: role === 'admin' ? 'Administrator' :
                   role === 'manager' ? 'Manager' : 'Employee',
        role_permissions: rolePermissions,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error('[Clerk Sync] Employee profile creation error:', error)
      return
    }

    // Sync role to Clerk metadata
    await syncRoleToClerk(clerkUserId, rolePermissions)

  } catch (error) {
    console.error('[Clerk Sync] Error in createEmployeeProfile:', error)
  }
}