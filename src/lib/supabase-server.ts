import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Create a user-scoped Supabase client with proper RLS enforcement
export async function createUserSupabaseClient() {
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('Authentication required')
  }
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  // Set up RLS context with user ID
  await supabase.rpc('set_user_context', { user_id: userId })
  
  return supabase
}

// Create a simple Supabase client for database operations (still requires proper auth)
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// RESTRICTED: Service role client - only for system operations that must bypass RLS
// Use sparingly and only for administrative tasks like user initialization
export function createServiceSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Safe helper for user-specific operations with automatic RLS enforcement
export async function createAuthenticatedSupabaseClient(userId?: string) {
  const authenticatedUserId = userId || (await auth()).userId
  
  if (!authenticatedUserId) {
    throw new Error('Authentication required')
  }
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          'X-User-ID': authenticatedUserId
        }
      }
    }
  )
}