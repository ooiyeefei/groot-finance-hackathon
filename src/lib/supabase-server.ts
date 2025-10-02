import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Retry utility for network operations
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      // Don't retry on authentication or permission errors
      if (lastError.message.includes('User not found') ||
          lastError.message.includes('authentication') ||
          lastError.message.includes('permission')) {
        throw lastError
      }

      console.warn(`[Supabase] Attempt ${attempt} failed:`, lastError.message)

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = delayMs * Math.pow(2, attempt - 1) + Math.random() * 1000
        console.log(`[Supabase] Retrying in ${delay.toFixed(0)}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw new Error(`Operation failed after ${maxRetries} attempts. Last error: ${lastError?.message}`)
}

// Helper function to resolve Clerk user ID to Supabase UUID
async function getSupabaseUserUuid(clerkUserId: string): Promise<string> {
  return retryOperation(async () => {
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        global: {
          fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
            return fetch(url, {
              ...options,
              signal: AbortSignal.timeout(10000) // 10 second timeout
            })
          }
        }
      }
    )

    const { data: user, error } = await serviceClient
      .from('users')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .single()

    if (error) {
      // Check if it's a network error or database error
      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout')) {
        throw new Error(`Network error: ${error.message}`)
      }
      throw new Error(`Failed to resolve Clerk user ID to Supabase UUID: ${error.message}`)
    }

    if (!user) {
      throw new Error('Failed to resolve Clerk user ID to Supabase UUID: User not found')
    }

    return user.id
  })
}

// Helper function to get user data including business_id (bypasses RLS)
export async function getUserData(clerkUserId: string): Promise<{id: string, business_id: string | null}> {
  return retryOperation(async () => {
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        global: {
          fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
            return fetch(url, {
              ...options,
              signal: AbortSignal.timeout(10000) // 10 second timeout
            })
          }
        }
      }
    )

    const { data: user, error } = await serviceClient
      .from('users')
      .select('id, business_id')
      .eq('clerk_user_id', clerkUserId)
      .single()

    if (error) {
      // Check if it's a network error or database error
      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout')) {
        throw new Error(`Network error: ${error.message}`)
      }
      throw new Error(`Failed to fetch user data: ${error.message}`)
    }

    if (!user) {
      throw new Error('Failed to fetch user data: User not found')
    }

    return user
  })
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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(10000) // 10 second timeout
          })
        }
      }
    }
  )

  // Set up RLS context with Supabase UUID (not Clerk ID) with retry
  await retryOperation(async () => {
    const { error } = await supabase.rpc('set_user_context', { user_id: supabaseUserUuid })
    if (error) {
      throw new Error(`Failed to set RLS context: ${error.message}`)
    }
  })

  return supabase
}

// Create a simple Supabase client for database operations (still requires proper auth)
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(10000) // 10 second timeout
          })
        }
      }
    }
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
      },
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(15000) // 15 second timeout for service operations
          })
        }
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

  // Resolve Clerk ID to Supabase UUID and get business_id
  const userData = await getUserData(authenticatedClerkUserId)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(10000) // 10 second timeout for user operations
          })
        }
      }
    }
  )

  // Debug: Log context being set
  console.log('[Supabase Client] Setting RLS context with:', {
    clerkUserId: authenticatedClerkUserId,
    supabaseUuid: userData.id,
    businessId: userData.business_id
  })

  // Set up RLS context with both user and business context
  await retryOperation(async () => {
    // Set user context for auth.uid()
    const { error: userError } = await supabase.rpc('set_user_context', { user_id: userData.id })
    if (userError) {
      throw new Error(`Failed to set user context: ${userError.message}`)
    }

    // Set business context for current_business_id() if user has a business
    if (userData.business_id) {
      const { error: businessError } = await supabase.rpc('set_tenant_context', { business_id: userData.business_id })
      if (businessError) {
        throw new Error(`Failed to set business context: ${businessError.message}`)
      }
    }
  })

  return supabase
}