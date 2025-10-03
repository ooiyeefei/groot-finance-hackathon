import { createClient } from '@supabase/supabase-js'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getDefaultExpenseCategories } from '@/lib/default-expense-categories'

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

/**
 * 🚑 RECOVERY FUNCTION: Create missing user + business records for orphaned Clerk users
 * This handles cases where Clerk user exists but webhook failed to create Supabase records
 */
async function createMissingUserRecords(
  clerkUserId: string,
  supabase: any
): Promise<{id: string, business_id: string | null} | null> {
  try {
    console.log(`[User Recovery] 🚑 Starting recovery process for Clerk user: ${clerkUserId}`)

    // Get user details from Clerk
    const clerkUser = await (await clerkClient()).users.getUser(clerkUserId)
    if (!clerkUser) {
      console.error(`[User Recovery] ❌ Clerk user not found: ${clerkUserId}`)
      return null
    }

    const primaryEmail = clerkUser.emailAddresses.find(
      email => email.verification?.status === 'verified'
    ) || clerkUser.emailAddresses[0]

    if (!primaryEmail) {
      console.error(`[User Recovery] ❌ No email found for Clerk user: ${clerkUserId}`)
      return null
    }

    const email = primaryEmail.emailAddress.toLowerCase()
    const fullName = clerkUser.firstName && clerkUser.lastName
      ? `${clerkUser.firstName} ${clerkUser.lastName}`
      : null

    console.log(`[User Recovery] 📧 Processing recovery for: email=${email}, fullName=${fullName}`)

    // 🛡️ STEP 1: Create user record FIRST (same as webhook flow)
    console.log(`[User Recovery] 👤 Creating user record for ${email}`)

    const userData = {
      clerk_user_id: clerkUserId,
      email: email,
      full_name: fullName,
      business_id: null, // Will be updated after business creation
      role: 'admin',
      home_currency: 'SGD',
      created_at: new Date().toISOString()
    }

    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert(userData)
      .select('id')
      .single()

    if (userError) {
      console.error('[User Recovery] ❌ Error creating user record:', userError)
      return null
    }

    console.log(`[User Recovery] ✅ Created user with ID: ${newUser.id}`)

    // 🛡️ STEP 2: Create business with owner_id = user UUID
    const businessName = fullName ? `${fullName}'s Business` : `${email.split('@')[0]}'s Business`
    const businessSlug = `${email.split('@')[0]}-business-${Date.now()}`

    console.log(`[User Recovery] 🏪 Creating business: name="${businessName}", slug="${businessSlug}", owner_id="${newUser.id}"`)

    const { data: newBusiness, error: businessError } = await supabase
      .from('businesses')
      .insert({
        name: businessName,
        slug: businessSlug,
        owner_id: newUser.id, // 🔧 Use the created user UUID as owner
        country_code: 'SG',
        home_currency: 'SGD',
        custom_expense_categories: getDefaultExpenseCategories(),
        created_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (businessError) {
      console.error('[User Recovery] ❌ Error creating business:', businessError)
      return null
    }

    console.log(`[User Recovery] ✅ Created business with ID: ${newBusiness.id}`)

    // 🛡️ STEP 3: Update user record with business_id
    console.log(`[User Recovery] 🔗 Linking user ${newUser.id} to business ${newBusiness.id}`)

    const { error: linkError } = await supabase
      .from('users')
      .update({ business_id: newBusiness.id, updated_at: new Date().toISOString() })
      .eq('id', newUser.id)

    if (linkError) {
      console.error('[User Recovery] ❌ Error linking user to business:', linkError)
      return null
    }

    // 🛡️ STEP 4: Create employee profile
    console.log(`[User Recovery] 👔 Creating employee profile for user ${newUser.id}`)

    const rolePermissions = {
      employee: true,
      manager: true, // Admin has all permissions
      admin: true
    }

    const employeeId = `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

    const { error: employeeError } = await supabase
      .from('employee_profiles')
      .insert({
        user_id: newUser.id,
        business_id: newBusiness.id,
        employee_id: employeeId,
        department: 'General',
        job_title: 'Administrator',
        role_permissions: rolePermissions,
        created_at: new Date().toISOString()
      })

    if (employeeError) {
      console.error('[User Recovery] ❌ Error creating employee profile:', employeeError)
      return null
    }

    console.log(`[User Recovery] 🎉 Successfully recovered user: ${email} → User: ${newUser.id} → Business: ${newBusiness.id}`)

    return {
      id: newUser.id,
      business_id: newBusiness.id
    }

  } catch (error) {
    console.error('[User Recovery] 💥 Critical error in createMissingUserRecords:', error)
    return null
  }
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

    // 🛡️ RESILIENT QUERY: Handle potential duplicate records gracefully
    const { data: users, error } = await serviceClient
      .from('users')
      .select('id, business_id, created_at')
      .eq('clerk_user_id', clerkUserId)
      .order('created_at', { ascending: false }) // Get most recent first

    if (error) {
      // Check if it's a network error or database error
      if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('timeout')) {
        throw new Error(`Network error: ${error.message}`)
      }
      throw new Error(`Failed to fetch user data: ${error.message}`)
    }

    if (!users || users.length === 0) {
      console.log(`[User Recovery] No Supabase record found for Clerk user: ${clerkUserId}`)
      console.log(`[User Recovery] Attempting to create missing user records using webhook flow...`)

      // 🚑 CATCH-UP: Create missing user + business records for orphaned Clerk users
      const recoveredUser = await createMissingUserRecords(clerkUserId, serviceClient)
      if (recoveredUser) {
        console.log(`[User Recovery] ✅ Successfully created missing records for: ${clerkUserId}`)
        return recoveredUser
      }

      throw new Error('Failed to fetch user data: User not found')
    }

    // 🚨 DETECT AND HANDLE DUPLICATE RECORDS
    if (users.length > 1) {
      console.error(`[CRITICAL] Found ${users.length} duplicate user records for clerk_user_id: ${clerkUserId}`)
      console.error(`[CRITICAL] Duplicate user IDs:`, users.map(u => u.id))
      console.error(`[CRITICAL] Using most recent record: ${users[0].id}`)

      // TODO: Set up automated cleanup job for duplicates
    }

    const user = users[0] // Use the most recent record

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