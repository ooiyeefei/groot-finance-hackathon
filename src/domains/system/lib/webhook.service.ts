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
 *
 * Migrated to Convex from Supabase
 */

import { Webhook } from 'svix'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { syncRoleToClerk } from '@/domains/security/lib/rbac'

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

// ===== CONVEX CLIENT =====

/**
 * Get Convex client for webhook operations
 * Uses HTTP client since webhooks don't have auth context
 */
function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  }
  return new ConvexHttpClient(convexUrl)
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
 * Uses Convex action that handles all database operations
 *
 * @param user - Clerk user data
 */
export async function handleClerkUserCreated(user: ClerkUser): Promise<void> {
  console.log(`[Webhook Service] 🚀 Processing user.created for Clerk ID: ${user.id}`)
  console.log(`[Webhook Service] 📧 User email addresses:`, user.email_addresses.map(e => ({ email: e.email_address, verified: e.verification?.status })))

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
    const convex = getConvexClient()

    // Call Convex action to handle user creation
    const result = await convex.action(api.functions.webhooks.handleUserCreated, {
      clerkUserId: user.id,
      email: email,
      fullName: fullName
    })

    console.log(`[Webhook Service] Convex action result:`, result)

    // Sync role to Clerk if invitation was linked
    if (result.success && result.action === 'invitation_linked' && result.businessId) {
      console.log(`[Webhook Service] 🔄 Syncing role permissions to Clerk metadata`)
      await new Promise(resolve => setTimeout(resolve, 500)) // 500ms delay for Clerk rate limits

      const rolePermissions = {
        employee: true,
        manager: false, // Default for invitation-based, will be set based on actual role
        admin: false
      }

      const syncResult = await syncRoleToClerk(user.id, rolePermissions)
      if (!syncResult.success) {
        console.error(`[Webhook Service] ⚠️ Failed to sync permissions to Clerk: ${syncResult.error}`)
      }
    }

    // Sync role for direct signups (owner role)
    if (result.success && result.action === 'user_created') {
      console.log(`[Webhook Service] 🔄 Syncing owner role to Clerk metadata`)
      await new Promise(resolve => setTimeout(resolve, 500))

      const ownerPermissions = {
        employee: true,
        manager: true,
        admin: true
      }

      const syncResult = await syncRoleToClerk(user.id, ownerPermissions)
      if (!syncResult.success) {
        console.error(`[Webhook Service] ⚠️ Failed to sync owner permissions to Clerk: ${syncResult.error}`)
      }
    }

    console.log(`[Webhook Service] ✅ Successfully processed user.created for ${email}`)

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
 * Syncs name and email changes from Clerk to Convex.
 *
 * @param user - Clerk user data
 */
export async function handleClerkUserUpdated(user: ClerkUser): Promise<void> {
  console.log(`[Webhook Service] Processing user.updated for Clerk ID: ${user.id}`)

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
    const convex = getConvexClient()

    const result = await convex.action(api.functions.webhooks.handleUserUpdated, {
      clerkUserId: user.id,
      email: email,
      fullName: fullName
    })

    if (result.success) {
      console.log(`[Webhook Service] Successfully updated user: ${email}`)
    } else {
      console.error('[Webhook Service] Error updating user:', result.error)
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

  try {
    const convex = getConvexClient()

    const result = await convex.action(api.functions.webhooks.handleUserDeleted, {
      clerkUserId: user.id
    })

    if (result.success) {
      console.log(`[Webhook Service] Successfully soft-deleted user: ${user.id}`)
    }

  } catch (error) {
    console.error('[Webhook Service] Error in handleClerkUserDeleted:', error)
    throw error
  }
}
