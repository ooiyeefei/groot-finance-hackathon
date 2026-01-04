/**
 * Convex Client Utilities
 *
 * Server-side utilities for interacting with Convex from:
 * - API routes
 * - Server actions
 * - Trigger.dev tasks
 *
 * For client-side usage, use the hooks from 'convex/react' directly:
 * - useQuery() for reading data with real-time updates
 * - useMutation() for writing data
 * - useAction() for running Convex actions
 */

import { ConvexHttpClient } from 'convex/browser'
import { auth } from '@clerk/nextjs/server'

// Server-side Convex client for API routes and server actions
// This client does NOT support real-time subscriptions
// Use for one-shot queries/mutations from the server
export const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/**
 * Get the Convex deployment URL
 * Useful for HTTP actions and webhooks
 */
export function getConvexSiteUrl(): string {
  // .convex.site is for HTTP actions (webhooks, etc.)
  // .convex.cloud is for queries/mutations
  const cloudUrl = process.env.NEXT_PUBLIC_CONVEX_URL!
  return cloudUrl.replace('.convex.cloud', '.convex.site')
}

/**
 * Get an authenticated Convex client for server-side calls
 *
 * This function:
 * 1. Gets the Clerk JWT token from the current request
 * 2. Configures a ConvexHttpClient with the token
 * 3. Returns the authenticated client for queries/mutations
 *
 * Convex validates the JWT using the CLERK_JWT_ISSUER_DOMAIN in auth.config.ts
 * and populates ctx.auth.getUserIdentity() in Convex functions.
 *
 * @returns Authenticated ConvexHttpClient and user info, or null if not authenticated
 *
 * Usage:
 * ```typescript
 * import { api } from '@/convex/_generated/api'
 * import { getAuthenticatedConvex } from '@/lib/convex'
 *
 * export async function GET() {
 *   const { client, userId } = await getAuthenticatedConvex()
 *   if (!client) {
 *     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 *   }
 *
 *   const invoices = await client.query(api.functions.invoices.list, { ... })
 *   return NextResponse.json({ data: invoices })
 * }
 * ```
 */
export async function getAuthenticatedConvex(): Promise<{
  client: ConvexHttpClient | null
  userId: string | null
  sessionId: string | null
}> {
  const { userId, sessionId, getToken } = await auth()

  if (!userId) {
    return { client: null, userId: null, sessionId: null }
  }

  // Get JWT token for Convex authentication
  // This token is validated by Convex using CLERK_JWT_ISSUER_DOMAIN
  const token = await getToken({ template: 'convex' })

  if (!token) {
    console.error('[Convex Auth] ❌ Failed to get JWT token for Convex. Ensure "convex" JWT template exists in Clerk Dashboard.')
    console.error('[Convex Auth] userId:', userId, 'sessionId:', sessionId)
    return { client: null, userId: null, sessionId: null }
  }

  console.log('[Convex Auth] ✅ Got JWT token for user:', userId)

  // Create a new client instance for this request to avoid race conditions
  const authenticatedClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
  authenticatedClient.setAuth(token)

  return {
    client: authenticatedClient,
    userId,
    sessionId: sessionId ?? null
  }
}

/**
 * Get an unauthenticated Convex client for public queries
 * Use this for queries that don't require authentication
 *
 * @returns ConvexHttpClient without authentication
 */
export function getPublicConvex(): ConvexHttpClient {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
}

/**
 * Type-safe helper for calling Convex from server context
 *
 * Usage:
 * ```typescript
 * import { api } from '@/convex/_generated/api'
 * import { convexClient } from '@/lib/convex'
 *
 * // In API route or server action
 * const user = await convexClient.query(api.functions.users.getByClerkId, {
 *   clerkUserId: 'user_xxx'
 * })
 * ```
 *
 * @deprecated Use getAuthenticatedConvex() for authenticated calls
 */
export { convexClient as serverConvex }

/**
 * Get user data from Convex by Clerk user ID
 *
 * This is a drop-in replacement for the old Supabase `getUserData` function.
 * Returns the same interface for backward compatibility with existing API routes.
 *
 * @param clerkUserId - The Clerk user ID (e.g., 'user_xxx')
 * @returns User data with business context, or throws if not found
 *
 * Usage:
 * ```typescript
 * import { getUserDataConvex } from '@/lib/convex'
 *
 * export async function GET() {
 *   const { userId } = await auth()
 *   const userData = await getUserDataConvex(userId)
 *
 *   if (!userData.business_id) {
 *     return NextResponse.json({ error: 'No business context' }, { status: 400 })
 *   }
 *   // ...
 * }
 * ```
 */
export async function getUserDataConvex(clerkUserId: string): Promise<{
  id: string
  business_id: string | null
  email: string
  full_name: string | null
  home_currency: string | null
}> {
  // Import API here to avoid circular dependencies
  const { api } = await import('@/convex/_generated/api')

  // Get authenticated client
  const { client } = await getAuthenticatedConvex()

  if (!client) {
    throw new Error('Not authenticated')
  }

  // Query user by Clerk ID
  const user = await client.query(api.functions.users.getByClerkId, {
    clerkUserId,
  })

  if (!user) {
    throw new Error(`User not found for Clerk ID: ${clerkUserId}`)
  }

  // Return in snake_case format for backward compatibility with existing routes
  return {
    id: user._id,
    business_id: user.businessId ?? null,
    email: user.email,
    full_name: user.fullName ?? null,
    home_currency: user.homeCurrency ?? null,
  }
}
