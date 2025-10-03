/**
 * Clerk Webhook Handler - Automatically sync Clerk users to Supabase
 * Supports both invitation-based and direct signup flows
 *
 * Scenarios:
 * 1. Invitation-based: Admin invites → User signs up → Links to existing invitation
 * 2. Direct signup: User signs up → Creates new business → Auto-creates user + employee profile
 */

import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { syncRoleToClerk } from '@/lib/rbac'
import { getDefaultExpenseCategories } from '@/lib/default-expense-categories'

// Clerk webhook event types
interface ClerkUser {
  id: string
  email_addresses: Array<{
    email_address: string
    verification?: {
      status: string
    }
  }>
  first_name?: string
  last_name?: string
  created_at: number
  updated_at: number
}

interface ClerkWebhookEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted'
  data: ClerkUser
}

export async function POST(req: NextRequest) {
  console.log('[Clerk Webhook] Received webhook request')

  // Get headers for signature verification
  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  // Check for required headers
  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error('[Clerk Webhook] Missing required svix headers')
    return NextResponse.json(
      { error: 'Missing required webhook headers' },
      { status: 400 }
    )
  }

  // Get webhook secret from environment
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[Clerk Webhook] CLERK_WEBHOOK_SECRET not configured')
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  // Get the request body
  const body = await req.text()

  try {
    // Verify the webhook signature using svix
    const wh = new Webhook(webhookSecret)
    const evt = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent

    console.log(`[Clerk Webhook] Verified event type: ${evt.type} for user: ${evt.data.id}`)

    // Handle different event types
    switch (evt.type) {
      case 'user.created':
        await handleUserCreated(evt.data)
        break
      case 'user.updated':
        await handleUserUpdated(evt.data)
        break
      case 'user.deleted':
        await handleUserDeleted(evt.data)
        break
      default:
        console.log(`[Clerk Webhook] Unhandled event type: ${evt.type}`)
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${evt.type} event`
    })

  } catch (err) {
    console.error('[Clerk Webhook] Error verifying webhook signature or processing event:', err)
    console.error('[Clerk Webhook] Request details:', {
      bodyLength: body.length,
      hasHeaders: { svixId: !!svixId, svixTimestamp: !!svixTimestamp, svixSignature: !!svixSignature },
      errorType: err instanceof Error ? err.constructor.name : typeof err
    })
    return NextResponse.json(
      { error: 'Invalid webhook signature or processing error' },
      { status: 400 }
    )
  }
}

/**
 * Handle user.created event - Main sync logic for both invitation and direct signup
 */
async function handleUserCreated(user: ClerkUser) {
  console.log(`[Clerk Webhook] 🚀 Processing user.created for Clerk ID: ${user.id}`)
  console.log(`[Clerk Webhook] 📧 User email addresses:`, user.email_addresses.map(e => ({ email: e.email_address, verified: e.verification?.status })))

  const supabase = createServiceSupabaseClient()

  // Get primary verified email
  const primaryEmail = user.email_addresses.find(
    email => email.verification?.status === 'verified'
  ) || user.email_addresses[0]

  if (!primaryEmail) {
    console.error('[Clerk Webhook] ❌ User has no email addresses, skipping sync')
    return
  }

  const email = primaryEmail.email_address.toLowerCase()
  const fullName = user.first_name && user.last_name
    ? `${user.first_name} ${user.last_name}`
    : null

  console.log(`[Clerk Webhook] 📝 Processing: email=${email}, fullName=${fullName}`)

  try {
    // 🛡️ FIRST: Check if user already exists by clerk_user_id to prevent duplicates
    console.log(`[Clerk Webhook] Checking for existing user with Clerk ID: ${user.id}`)

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, business_id, role, invited_by, clerk_user_id, email')
      .eq('clerk_user_id', user.id)
      .maybeSingle()  // 🔧 FIX: Use maybeSingle() instead of single() for new users

    if (!existingUserError && existingUser) {
      console.log(`[Clerk Webhook] User already exists with Clerk ID: ${user.id}, email: ${existingUser.email}`)
      return // User already processed, nothing to do
    }

    console.log(`[Clerk Webhook] 🔍 Checking for existing invitation for email: ${email}`)

    // SCENARIO 1: Check if user has pending invitation (invitation-based signup)
    const { data: existingInvitation, error: invitationError } = await supabase
      .from('users')
      .select('id, business_id, role, invited_by, clerk_user_id')
      .ilike('email', email)
      .not('invited_by', 'is', null) // Must be an invitation
      .maybeSingle()  // 🔧 FIX: Use maybeSingle() - no error if no invitation exists

    if (invitationError) {
      console.log(`[Clerk Webhook] 📄 Invitation check error (expected for direct signups): ${invitationError.message}`)
    }

    if (!invitationError && existingInvitation) {
      console.log(`[Clerk Webhook] 🎫 SCENARIO 1: Found existing invitation for ${email}`)
      if (!existingInvitation.clerk_user_id) {
        // Link existing invitation to Clerk user
        console.log(`[Clerk Webhook] 🔗 Linking invitation to Clerk user: ${email}`)

        const { error: linkError } = await supabase
          .from('users')
          .update({
            clerk_user_id: user.id,
            full_name: fullName,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingInvitation.id)

        if (linkError) {
          console.error('[Clerk Webhook] ❌ Error linking invitation:', linkError)
          return
        }

        // Create employee profile with invitation's business and role
        console.log(`[Clerk Webhook] 👤 Creating employee profile for invitation`)
        await createEmployeeProfile(
          existingInvitation.id,
          existingInvitation.business_id,
          existingInvitation.role,
          user.id
        )

        console.log(`[Clerk Webhook] ✅ Successfully linked invitation: ${email} → Business: ${existingInvitation.business_id}`)
      } else {
        console.log(`[Clerk Webhook] ⚠️ Invitation already linked for: ${email}`)
      }
      return
    }

    // SCENARIO 2: Direct signup - create new user with personal business
    console.log(`[Clerk Webhook] 🏢 SCENARIO 2: Creating new user from direct signup: ${email}`)

    // Create personal business for direct signup using correct schema
    const businessName = fullName ? `${fullName}'s Business` : `${email.split('@')[0]}'s Business`
    const businessSlug = `${email.split('@')[0]}-business-${Date.now()}`

    console.log(`[Clerk Webhook] 🏪 Creating business: name="${businessName}", slug="${businessSlug}"`)

    const { data: newBusiness, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: businessName,
        slug: businessSlug,
        country_code: 'SG',
        home_currency: 'SGD',
        custom_expense_categories: getDefaultExpenseCategories(),
        created_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (businessError) {
      console.error('[Clerk Webhook] ❌ Error creating personal business:', businessError)
      console.error('[Clerk Webhook] 📊 Business creation details:', { businessName, businessSlug })
      return
    }

    console.log(`[Clerk Webhook] ✅ Created business with ID: ${newBusiness.id}`)

    // 🛡️ Create user record with additional duplicate protection
    console.log(`[Clerk Webhook] 👤 Creating user record for ${email} in business ${newBusiness.id}`)

    const userData = {
      clerk_user_id: user.id,
      email: email,
      full_name: fullName,
      business_id: newBusiness.id,
      role: 'admin',
      home_currency: 'SGD',
      created_at: new Date().toISOString()
    }

    console.log(`[Clerk Webhook] 📝 User data:`, userData)

    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert(userData)
      .select('id')
      .single()

    if (userError) {
      // Handle potential unique constraint violation gracefully
      if (userError.code === '23505' && userError.message.includes('clerk_user_id')) {
        console.log(`[Clerk Webhook] ⚠️ User with Clerk ID ${user.id} already exists (race condition), skipping creation`)
        return
      }
      console.error('[Clerk Webhook] ❌ Error creating user record:', userError)
      console.error('[Clerk Webhook] 📊 User data details:', userData)
      return
    }

    console.log(`[Clerk Webhook] ✅ Created user with ID: ${newUser.id}`)

    // Create employee profile for direct signup (they're admin of their own business)
    console.log(`[Clerk Webhook] 👔 Creating employee profile for user ${newUser.id} in business ${newBusiness.id}`)
    await createEmployeeProfile(
      newUser.id,
      newBusiness.id,
      'admin',
      user.id
    )

    console.log(`[Clerk Webhook] 🎉 Successfully created direct signup: ${email} → User: ${newUser.id} → Business: ${newBusiness.id}`)

  } catch (error) {
    console.error('[Clerk Webhook] 💥 Critical error in handleUserCreated for user', user.id, ':', error)
    console.error('[Clerk Webhook] 📋 User details:', { email, fullName, clerkId: user.id })

    // Ensure error is properly logged with stack trace
    if (error instanceof Error) {
      console.error('[Clerk Webhook] 📚 Stack trace:', error.stack)
    }
  }
}

/**
 * Handle user.updated event - Sync name/email changes
 */
async function handleUserUpdated(user: ClerkUser) {
  console.log(`[Clerk Webhook] Processing user.updated for Clerk ID: ${user.id}`)

  const supabase = createServiceSupabaseClient()

  const primaryEmail = user.email_addresses.find(
    email => email.verification?.status === 'verified'
  ) || user.email_addresses[0]

  if (!primaryEmail) {
    console.error('[Clerk Webhook] User has no email addresses for update')
    return
  }

  const email = primaryEmail.email_address.toLowerCase()
  const fullName = user.first_name && user.last_name
    ? `${user.first_name} ${user.last_name}`
    : null

  try {
    const { error } = await supabase
      .from('users')
      .update({
        email: email,
        full_name: fullName,
        updated_at: new Date().toISOString()
      })
      .eq('clerk_user_id', user.id)

    if (error) {
      console.error('[Clerk Webhook] Error updating user:', error)
    } else {
      console.log(`[Clerk Webhook] Successfully updated user: ${email}`)
    }

  } catch (error) {
    console.error('[Clerk Webhook] Error in handleUserUpdated:', error)
  }
}

/**
 * Handle user.deleted event - Soft delete user data
 */
async function handleUserDeleted(user: ClerkUser) {
  console.log(`[Clerk Webhook] Processing user.deleted for Clerk ID: ${user.id}`)

  const supabase = createServiceSupabaseClient()

  try {
    // Soft delete by clearing Clerk ID and anonymizing data
    const { error } = await supabase
      .from('users')
      .update({
        clerk_user_id: null,
        email: `deleted_${user.id}@deleted.local`,
        full_name: 'Deleted User',
        updated_at: new Date().toISOString()
      })
      .eq('clerk_user_id', user.id)

    if (error) {
      console.error('[Clerk Webhook] Error soft-deleting user:', error)
    } else {
      console.log(`[Clerk Webhook] Successfully soft-deleted user: ${user.id}`)
    }

  } catch (error) {
    console.error('[Clerk Webhook] Error in handleUserDeleted:', error)
  }
}

/**
 * Create employee profile for user (both invitation and direct signup scenarios)
 */
async function createEmployeeProfile(
  userId: string,
  businessId: string,
  role: string,
  clerkUserId: string
) {
  console.log(`[Clerk Webhook] 🆔 createEmployeeProfile called with:`, { userId, businessId, role, clerkUserId })
  const supabase = createServiceSupabaseClient()

  try {
    // Define role permissions based on role
    const rolePermissions = {
      employee: true,
      manager: role === 'admin' || role === 'manager',
      admin: role === 'admin'
    }

    const employeeId = `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const jobTitle = role === 'admin' ? 'Administrator' :
                     role === 'manager' ? 'Manager' : 'Employee'

    console.log(`[Clerk Webhook] 📋 Creating employee profile:`, {
      user_id: userId,
      business_id: businessId,
      employee_id: employeeId,
      job_title: jobTitle,
      role_permissions: rolePermissions
    })

    // Create employee profile
    const { error } = await supabase
      .from('employee_profiles')
      .insert({
        user_id: userId,
        business_id: businessId,
        employee_id: employeeId,
        department: 'General',
        job_title: jobTitle,
        role_permissions: rolePermissions,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error('[Clerk Webhook] ❌ Error creating employee profile:', error)
      return
    }

    console.log(`[Clerk Webhook] ✅ Employee profile created successfully`)

    // Sync role permissions to Clerk metadata
    console.log(`[Clerk Webhook] 🔄 Syncing role permissions to Clerk metadata`)
    await syncRoleToClerk(clerkUserId, rolePermissions)

    console.log(`[Clerk Webhook] 🎯 Successfully created employee profile for user: ${userId} with role: ${role}`)

  } catch (error) {
    console.error('[Clerk Webhook] 💥 Error in createEmployeeProfile:', error)
    if (error instanceof Error) {
      console.error('[Clerk Webhook] 📚 createEmployeeProfile stack:', error.stack)
    }
  }
}