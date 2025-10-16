/**
 * Webhook Service Layer
 *
 * Business logic for webhook processing:
 * - Clerk user sync (create, update, delete)
 * - Svix signature verification
 * - Multi-tenant user onboarding
 *
 * North Star Architecture:
 * - All business logic centralized in service layer
 * - API routes are thin wrappers handling HTTP concerns
 *
 * Scenarios:
 * 1. Invitation-based: Admin invites → User signs up → Links to existing invitation
 * 2. Direct signup: User signs up → Creates new business → Auto-creates user + employee profile
 */

import { Webhook } from 'svix'
import { createServiceSupabaseClient } from '@/lib/db/supabase-server'
import { syncRoleToClerk } from '@/domains/security/lib/rbac'
import { createUserFirstBusiness } from '@/lib/db/business-context'

// ===== TYPE DEFINITIONS =====

export interface ClerkUser {
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

export interface ClerkWebhookEvent {
  type: 'user.created' | 'user.updated' | 'user.deleted'
  data: ClerkUser
}

export interface WebhookVerificationResult {
  success: boolean
  event?: ClerkWebhookEvent
  error?: string
}

// ===== WEBHOOK VERIFICATION =====

/**
 * Verify Clerk Webhook Signature
 *
 * Uses Svix library to verify webhook authenticity.
 * Protects against replay attacks and unauthorized requests.
 *
 * @param body - Raw webhook body
 * @param headers - Svix headers (id, timestamp, signature)
 * @param webhookSecret - Clerk webhook secret
 * @returns Verification result with parsed event or error
 */
export function verifyClerkWebhook(
  body: string,
  headers: {
    'svix-id': string
    'svix-timestamp': string
    'svix-signature': string
  },
  webhookSecret: string
): WebhookVerificationResult {
  try {
    const wh = new Webhook(webhookSecret)
    const evt = wh.verify(body, headers) as ClerkWebhookEvent

    console.log(`[Webhook Service] Verified event type: ${evt.type} for user: ${evt.data.id}`)

    return {
      success: true,
      event: evt
    }
  } catch (error) {
    console.error('[Webhook Service] Signature verification failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid signature'
    }
  }
}

// ===== CLERK USER SYNC HANDLERS =====

/**
 * Handle Clerk User Created Event
 *
 * Two scenarios:
 * 1. Invitation-based: Links Clerk user to existing invitation
 * 2. Direct signup: Creates new business and user profile
 *
 * @param user - Clerk user data
 */
export async function handleClerkUserCreated(user: ClerkUser): Promise<void> {
  console.log(`[Webhook Service] 🚀 Processing user.created for Clerk ID: ${user.id}`)
  console.log(`[Webhook Service] 📧 User email addresses:`, user.email_addresses.map(e => ({ email: e.email_address, verified: e.verification?.status })))

  const supabase = createServiceSupabaseClient()

  // Get primary verified email
  const primaryEmail = user.email_addresses.find(
    email => email.verification?.status === 'verified'
  ) || user.email_addresses[0]

  if (!primaryEmail) {
    console.error('[Webhook Service] ❌ User has no email addresses, skipping sync')
    return
  }

  const email = primaryEmail.email_address.toLowerCase()

  // Handle partial names with fallbacks
  const fullName = user.first_name || user.last_name
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
    : email.split('@')[0] // Use email username as final fallback

  console.log(`[Webhook Service] 📝 Processing: email=${email}, fullName=${fullName}`)

  try {
    // Check if user already exists by clerk_user_id to prevent duplicates
    console.log(`[Webhook Service] Checking for existing user with Clerk ID: ${user.id}`)

    const { data: existingUser, error: existingUserError } = await supabase
      .from('users')
      .select('id, business_id, role, invited_by, clerk_user_id, email')
      .eq('clerk_user_id', user.id)
      .maybeSingle()

    if (!existingUserError && existingUser) {
      console.log(`[Webhook Service] User already exists with Clerk ID: ${user.id}, email: ${existingUser.email}`)
      return // User already processed
    }

    console.log(`[Webhook Service] 🔍 Checking for existing invitation for email: ${email}`)

    // SCENARIO 1: Check if user has pending invitation
    const { data: existingInvitation, error: invitationError } = await supabase
      .from('users')
      .select('id, business_id, role, invited_by, clerk_user_id')
      .ilike('email', email)
      .not('invited_by', 'is', null)
      .maybeSingle()

    if (invitationError) {
      console.log(`[Webhook Service] 📄 Invitation check error (expected for direct signups): ${invitationError.message}`)
    }

    if (!invitationError && existingInvitation) {
      console.log(`[Webhook Service] 🎫 SCENARIO 1: Found existing invitation for ${email}`)
      if (!existingInvitation.clerk_user_id) {
        // Link existing invitation to Clerk user
        console.log(`[Webhook Service] 🔗 Linking invitation to Clerk user: ${email}`)

        const { error: linkError } = await supabase
          .from('users')
          .update({
            clerk_user_id: user.id,
            full_name: fullName,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingInvitation.id)

        if (linkError) {
          console.error('[Webhook Service] ❌ Error linking invitation:', linkError)
          return
        }

        // Create employee profile with invitation's business and role
        console.log(`[Webhook Service] 👤 Creating employee profile for invitation`)
        await createEmployeeProfile(
          existingInvitation.id,
          existingInvitation.business_id,
          existingInvitation.role,
          user.id
        )

        console.log(`[Webhook Service] ✅ Successfully linked invitation: ${email} → Business: ${existingInvitation.business_id}`)
      } else {
        console.log(`[Webhook Service] ⚠️ Invitation already linked for: ${email}`)
      }
      return
    }

    // SCENARIO 2: Direct signup - create new user with multi-tenant business
    console.log(`[Webhook Service] SCENARIO 2: Creating new user from direct signup: ${email}`)

    const { businessId, userId } = await createUserFirstBusiness(user.id, {
      full_name: fullName || `${email.split('@')[0]}`,
      email: email
    })

    console.log(`[Webhook Service] Successfully created multi-tenant signup: ${email} → Business: ${businessId}, User: ${userId}`)

  } catch (error) {
    console.error('[Webhook Service] 💥 Critical error in handleClerkUserCreated for user', user.id, ':', error)
    console.error('[Webhook Service] 📋 User details:', { email, fullName, clerkId: user.id })

    if (error instanceof Error) {
      console.error('[Webhook Service] 📚 Stack trace:', error.stack)
    }
    throw error // Re-throw to allow API route to handle error response
  }
}

/**
 * Handle Clerk User Updated Event
 *
 * Syncs name and email changes from Clerk to Supabase.
 *
 * @param user - Clerk user data
 */
export async function handleClerkUserUpdated(user: ClerkUser): Promise<void> {
  console.log(`[Webhook Service] Processing user.updated for Clerk ID: ${user.id}`)

  const supabase = createServiceSupabaseClient()

  const primaryEmail = user.email_addresses.find(
    email => email.verification?.status === 'verified'
  ) || user.email_addresses[0]

  if (!primaryEmail) {
    console.error('[Webhook Service] User has no email addresses for update')
    return
  }

  const email = primaryEmail.email_address.toLowerCase()

  const fullName = user.first_name || user.last_name
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
    : email.split('@')[0]

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
      console.error('[Webhook Service] Error updating user:', error)
      throw error
    } else {
      console.log(`[Webhook Service] Successfully updated user: ${email}`)
    }

  } catch (error) {
    console.error('[Webhook Service] Error in handleClerkUserUpdated:', error)
    throw error
  }
}

/**
 * Handle Clerk User Deleted Event
 *
 * Soft deletes user by clearing Clerk ID and anonymizing data.
 * Preserves data for audit trail and foreign key integrity.
 *
 * @param user - Clerk user data
 */
export async function handleClerkUserDeleted(user: ClerkUser): Promise<void> {
  console.log(`[Webhook Service] Processing user.deleted for Clerk ID: ${user.id}`)

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
      console.error('[Webhook Service] Error soft-deleting user:', error)
      throw error
    } else {
      console.log(`[Webhook Service] Successfully soft-deleted user: ${user.id}`)
    }

  } catch (error) {
    console.error('[Webhook Service] Error in handleClerkUserDeleted:', error)
    throw error
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Create Employee Profile
 *
 * Creates business membership and syncs role permissions to Clerk.
 * Used for both invitation-based and direct signup scenarios.
 *
 * @param userId - Supabase user ID
 * @param businessId - Business ID
 * @param role - User role (admin, manager, employee)
 * @param clerkUserId - Clerk user ID
 */
async function createEmployeeProfile(
  userId: string,
  businessId: string,
  role: string,
  clerkUserId: string
): Promise<void> {
  console.log(`[Webhook Service] 🆔 createEmployeeProfile called with:`, { userId, businessId, role, clerkUserId })
  const supabase = createServiceSupabaseClient()

  try {
    // Define role permissions
    const rolePermissions = {
      employee: true,
      manager: role === 'admin' || role === 'manager',
      admin: role === 'admin'
    }

    console.log(`[Webhook Service] 📋 Creating employee profile with role: ${role}`)

    // Create business membership
    const { error } = await supabase
      .from('business_memberships')
      .insert({
        user_id: userId,
        business_id: businessId,
        role: role,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error('[Webhook Service] ❌ Error creating employee profile:', error)
      throw error
    }

    console.log(`[Webhook Service] ✅ Employee profile created successfully`)

    // Sync role permissions to Clerk metadata (add small delay to avoid race conditions)
    console.log(`[Webhook Service] 🔄 Syncing role permissions to Clerk metadata`)
    await new Promise(resolve => setTimeout(resolve, 500)) // 500ms delay
    const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)

    if (!syncResult.success) {
      console.error(`[Webhook Service] ⚠️ Failed to sync permissions to Clerk: ${syncResult.error}`)
    }

    console.log(`[Webhook Service] 🎯 Successfully created employee profile for user: ${userId} with role: ${role}`)

  } catch (error) {
    console.error('[Webhook Service] 💥 Error in createEmployeeProfile:', error)
    if (error instanceof Error) {
      console.error('[Webhook Service] 📚 createEmployeeProfile stack:', error.stack)
    }
    throw error
  }
}
