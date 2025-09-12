import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Helper function to resolve Clerk user ID to Supabase UUID
async function getSupabaseUserUuid(clerkUserId: string): Promise<string> {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
  
  const { data: user, error } = await serviceClient
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkUserId)
    .single()
    
  if (error || !user) {
    throw new Error(`Failed to resolve Clerk user ID to Supabase UUID: ${error?.message || 'User not found'}`)
  }
  
  return user.id
}

// Create a user-scoped Supabase client with proper RLS enforcement
export async function createUserSupabaseClient() {
  const { userId } = await auth()
  
  if (!userId) {
    throw new Error('Authentication required')
  }
  
  // Resolve Clerk ID to Supabase UUID
  const supabaseUserUuid = await getSupabaseUserUuid(userId)
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  // Set up RLS context with Supabase UUID (not Clerk ID)
  await supabase.rpc('set_user_context', { user_id: supabaseUserUuid })
  
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
export async function createAuthenticatedSupabaseClient(clerkUserId?: string) {
  const authenticatedClerkUserId = clerkUserId || (await auth()).userId
  
  if (!authenticatedClerkUserId) {
    throw new Error('Authentication required')
  }
  
  // Resolve Clerk ID to Supabase UUID
  const supabaseUserUuid = await getSupabaseUserUuid(authenticatedClerkUserId)
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  // Debug: Try both Clerk ID and Supabase UUID to see which one works
  console.log('[Supabase Client] Setting RLS context with:', {
    clerkUserId: authenticatedClerkUserId,
    supabaseUuid: supabaseUserUuid
  })
  
  // Set up RLS context with Supabase UUID (not Clerk ID)
  await supabase.rpc('set_user_context', { user_id: supabaseUserUuid })
  
  return supabase
}