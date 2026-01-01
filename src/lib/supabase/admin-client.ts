/**
 * Supabase Admin Client Initialization
 *
 * Lazy-initialized Supabase client with service role for server-side operations.
 * Pattern: Following Stripe client lazy initialization pattern to prevent build failures.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase admin client (prevents build failure when env vars missing)
let supabaseAdminInstance: SupabaseClient | null = null

/**
 * Get Supabase admin client with validation
 * Uses lazy initialization to avoid build-time errors when env vars are placeholders
 *
 * @returns Supabase client with service role permissions
 * @throws Error if required environment variables are not configured
 */
export function getSupabaseAdmin(): SupabaseClient {
  // Validate environment variables at runtime, not import time
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'your_supabase_project_url'
  ) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY === 'your_supabase_service_role_key'
  ) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  // Create instance only once
  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }

  return supabaseAdminInstance
}

// Type export
export type { SupabaseClient }
