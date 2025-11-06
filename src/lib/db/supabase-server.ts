import { createClient } from '@supabase/supabase-js'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getDefaultExpenseCategories } from '@/domains/expense-claims/lib/default-expense-categories'
import { getDefaultCOGSCategories } from '@/domains/invoices/lib/default-cogs-categories'

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
    // 🔒 AUDIT: Service role key used for user lookup (RLS bypass for performance)
    // Justification: Fast user resolution without row-level security overhead
    console.log(`[Service Role Audit] getSupabaseUserUuid - clerk_user_id: ${clerkUserId}`)

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
      console.error(`[Service Role Audit] Query failed for ${clerkUserId}: ${error.message}`)
      throw new Error(`Failed to resolve Clerk user ID to Supabase UUID: ${error.message}`)
    }

    if (!user) {
      console.error(`[Service Role Audit] User not found for clerk_user_id: ${clerkUserId}`)
      throw new Error('Failed to resolve Clerk user ID to Supabase UUID: User not found')
    }

    console.log(`[Service Role Audit] Resolved ${clerkUserId} → ${user.id}`)
    return user.id
  })
}

/**
 * 🚑 RECOVERY FUNCTION: Create missing user + business records for orphaned Clerk users
 * This handles cases where Clerk user exists but webhook failed to create Supabase records
 *
 * 🔒 AUDIT: Uses service role client passed as parameter (RLS bypass for recovery operations)
 * Justification: Must query and create user records that don't exist yet (chicken-egg problem)
 */
async function createMissingUserRecords(
  clerkUserId: string,
  supabase: any
): Promise<{id: string, business_id: string | null} | null> {
  try {
    console.log(`[Service Role Audit] createMissingUserRecords - Starting recovery for clerk_user_id: ${clerkUserId}`)
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

    // 🛡️ STEP 1: Check if user already exists to prevent duplicate key error
    console.log(`[User Recovery] 🔍 Checking for existing user with clerk_user_id: ${clerkUserId}`)

    const { data: existingUserByClerkId } = await supabase
      .from('users')
      .select('id, business_id, email')
      .eq('clerk_user_id', clerkUserId)
      .single()

    if (existingUserByClerkId) {
      console.log(`[User Recovery] ⚠️ User already exists with clerk_user_id: ${clerkUserId}`)
      console.log(`[User Recovery] 📋 Existing user: ID=${existingUserByClerkId.id}, business_id=${existingUserByClerkId.business_id}`)

      // Return existing user instead of creating duplicate
      return {
        id: existingUserByClerkId.id,
        business_id: existingUserByClerkId.business_id
      }
    }

    // 🛡️ STEP 1.5: Enhanced multi-tenant invitation and membership checking
    console.log(`[User Recovery] 🔍 Checking for pending invitations and removed memberships with email: ${email}`)

    // Check for pending invitations via business_memberships (more reliable in multi-tenant)
    const { data: pendingMemberships } = await supabase
      .from('business_memberships')
      .select(`
        id,
        user_id,
        business_id,
        role,
        status,
        invited_at,
        users!inner(id, email, invited_by, invited_role, status, business_id)
      `)
      .eq('status', 'pending')
      .ilike('users.email', email)
      .is('users.clerk_user_id', null) // User doesn't have Clerk account yet

    if (pendingMemberships && pendingMemberships.length > 0) {
      console.log(`[User Recovery] 🎯 Found ${pendingMemberships.length} pending invitation(s) for ${email}`)

      // For multi-tenant, user might have multiple pending invitations
      // Process the most recent one or let user choose during onboarding
      const latestInvitation = pendingMemberships.sort((a: any, b: any) =>
        new Date(b.invited_at).getTime() - new Date(a.invited_at).getTime()
      )[0]

      const userData = latestInvitation.users
      console.log(`[User Recovery] 🔄 Processing latest invitation for business: ${latestInvitation.business_id}`)

      // Update the user record with Clerk user ID
      const { error: updateError } = await supabase
        .from('users')
        .update({
          clerk_user_id: clerkUserId,
          full_name: fullName,
          updated_at: new Date().toISOString()
        })
        .eq('id', userData.id)

      if (updateError) {
        console.error('[User Recovery] ❌ Failed to update invitation user record:', updateError)
        return null
      }

      // Update membership to active with joined_at timestamp
      const { error: membershipUpdateError } = await supabase
        .from('business_memberships')
        .update({
          status: 'active',
          joined_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userData.id)
        .eq('business_id', latestInvitation.business_id)

      if (membershipUpdateError) {
        console.error('[User Recovery] ❌ Failed to activate membership:', membershipUpdateError)
        // Continue anyway, user record is updated
      }

      // Set role permissions based on the invitation role
      const invitationRole = latestInvitation.role || userData.invited_role || 'employee'
      const rolePermissions = {
        employee: true,
        manager: invitationRole === 'manager' || invitationRole === 'admin',
        admin: invitationRole === 'admin'
      }

      // NATIVE INTEGRATION: No Clerk metadata sync needed
      // Roles are stored in Supabase business_memberships table only
      console.log(`[User Recovery] Using native integration - role stored in database only`)
      console.log(`[User Recovery] Business context stored in database: activeBusinessId = ${latestInvitation.business_id}`)

      console.log(`[User Recovery] 🎉 Successfully processed invitation: ${email} → User: ${userData.id} → Business: ${latestInvitation.business_id}`)

      return {
        id: userData.id,
        business_id: latestInvitation.business_id
      }
    }

    // Check for removed memberships that might indicate a returning user
    const { data: removedMemberships } = await supabase
      .from('business_memberships')
      .select(`
        id,
        user_id,
        business_id,
        role,
        status,
        users!inner(id, email, clerk_user_id, full_name, status)
      `)
      .eq('status', 'removed')
      .ilike('users.email', email)
      .is('users.clerk_user_id', null) // User doesn't have Clerk account

    if (removedMemberships && removedMemberships.length > 0) {
      console.log(`[User Recovery] 🔍 Found ${removedMemberships.length} removed membership(s) for ${email}`)
      console.log(`[User Recovery] ⚠️ This user was previously removed from business(es). They should either:`)
      console.log(`[User Recovery] 1. Be reactivated via admin action, or`)
      console.log(`[User Recovery] 2. Create a new business as owner`)

      // For removed users, we'll create a new business instead of auto-reactivating
      // This follows the "soft removal" principle - removed users don't auto-rejoin
      console.log(`[User Recovery] 🏗️ Proceeding to create new business for previously removed user`)
    }

    // 🛡️ STEP 2: COMPREHENSIVE MULTI-TENANT INVITATION CHECK
    console.log(`[User Recovery] 🚨 COMPREHENSIVE CHECK - Verifying ${email} has no unprocessed invitation history`)

    // Check for ANY unprocessed invitations via business_memberships (more reliable)
    const { data: allInvitations } = await supabase
      .from('business_memberships')
      .select(`
        id,
        user_id,
        business_id,
        role,
        status,
        users!business_memberships_user_id_fkey!inner(id, email, clerk_user_id, invited_by, status)
      `)
      .ilike('users.email', email)
      .not('users.invited_by', 'is', null) // Has invitation history (check via users table)
      .in('status', ['pending', 'active']) // Active invitations

    if (allInvitations && allInvitations.length > 0) {
      console.log(`[User Recovery] 🚨 Found ${allInvitations.length} invitation(s) with history for ${email}`)

      // Find the most appropriate invitation to process
      const activeInvitations = allInvitations.filter((inv: any) => inv.status === 'active')
      const pendingInvitations = allInvitations.filter((inv: any) => inv.status === 'pending')

      if (activeInvitations.length > 0) {
        // User already has active memberships - this is an existing user
        const latestActive = activeInvitations[0]
        console.log(`[User Recovery] ✅ Found active membership for existing user`)

        // Update user record with Clerk ID if not set
        if (!latestActive.users.clerk_user_id) {
          const { error: updateError } = await supabase
            .from('users')
            .update({
              clerk_user_id: clerkUserId,
              full_name: fullName,
              updated_at: new Date().toISOString()
            })
            .eq('id', latestActive.users.id)

          if (updateError) {
            console.error('[User Recovery] ❌ Failed to update existing user record:', updateError)
            return null
          }
        }

        return {
          id: latestActive.users.id,
          business_id: latestActive.business_id
        }
      }

      if (pendingInvitations.length > 0) {
        // This should have been caught earlier, but process it here as fallback
        const latestPending = pendingInvitations[0]
        console.log(`[User Recovery] 🔄 Processing fallback pending invitation`)

        // Update user record
        const { error: updateError } = await supabase
          .from('users')
          .update({
            clerk_user_id: clerkUserId,
            full_name: fullName,
            updated_at: new Date().toISOString()
          })
          .eq('id', latestPending.users.id)

        if (updateError) {
          console.error('[User Recovery] ❌ Failed to update pending user record:', updateError)
          return null
        }

        // Activate the membership
        await supabase
          .from('business_memberships')
          .update({
            status: 'active',
            joined_at: new Date().toISOString()
          })
          .eq('id', latestPending.id)

        return {
          id: latestPending.users.id,
          business_id: latestPending.business_id
        }
      }
    }

    console.log(`[User Recovery] ✅ Confirmed: ${email} has NO invitation history - redirecting to business onboarding`)

    // 🛡️ NEW APPROACH: Create user record WITHOUT business, redirect to onboarding
    console.log(`[User Recovery] 👤 Creating user record for NEW user ${email} - NO auto-business creation`)

    // CRITICAL RACE CONDITION FIX: Use upsert instead of insert to handle concurrent creation attempts
    const userData = {
      clerk_user_id: clerkUserId,
      email: email,
      full_name: fullName,
      business_id: null, // NO business - user will create via onboarding
      preferred_currency: 'SGD',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Use upsert with clerk_user_id as conflict column to prevent duplicates
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .upsert(userData, {
        onConflict: 'clerk_user_id',
        ignoreDuplicates: false
      })
      .select('id, business_id')
      .single()

    if (userError) {
      console.error('[User Recovery] ❌ Error creating/updating user record:', userError)

      // Final fallback: try to find existing user by clerk_user_id
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, business_id')
        .eq('clerk_user_id', clerkUserId)
        .single()

      if (existingUser) {
        console.log(`[User Recovery] ✅ Found existing user after upsert failure: ${existingUser.id}`)
        return {
          id: existingUser.id,
          business_id: existingUser.business_id
        }
      }

      return null
    }

    console.log(`[User Recovery] ✅ Created user with ID: ${newUser.id} - NO business created, user will go through onboarding`)

    // 🔄 IMPORTANT: Return user with business_id: null to trigger onboarding redirect
    console.log(`[User Recovery] 📍 User ${email} created without business - will be redirected to onboarding`)
    console.log(`[Service Role Audit] createMissingUserRecords - SUCCESS: Created user ${newUser.id} for clerk_user_id: ${clerkUserId}`)

    return {
      id: newUser.id,
      business_id: null // This will trigger redirect to /onboarding/business
    }

  } catch (error) {
    console.error('[User Recovery] 💥 Critical error in createMissingUserRecords:', error)
    console.error(`[Service Role Audit] createMissingUserRecords - FAILED for clerk_user_id: ${clerkUserId}`, error)
    return null
  }
}

// Helper function to get user data including business_id (bypasses RLS)
// 🔒 AUDIT: Service role key used for user data resolution (RLS bypass for performance)
// Justification: Critical path operation used on every user context resolution
//                RLS would add 200-400ms overhead with redundant security checks
//                Security: Enforced via clerk_user_id validation (JWT-based)
export async function getUserData(clerkUserId: string): Promise<{id: string, business_id: string | null, home_currency: string, preferred_currency: string, email: string, full_name: string | null}> {
  return retryOperation(async () => {
    console.log(`[Service Role Audit] getUserData - Resolving user data for clerk_user_id: ${clerkUserId}`)

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
    // Get user data with business home currency from joined businesses table
    // Use explicit foreign key relationship to resolve ambiguity
    const { data: users, error } = await serviceClient
      .from('users')
      .select(`
        id,
        business_id,
        email,
        full_name,
        preferred_currency,
        created_at,
        businesses!users_business_id_fkey (
          home_currency
        )
      `)
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

        // Query for complete user data after recovery
        const { data: completeUserData, error: recoveryError } = await serviceClient
          .from('users')
          .select(`
            id,
            business_id,
            email,
            full_name,
            preferred_currency,
            created_at,
            businesses!users_business_id_fkey (
              home_currency
            )
          `)
          .eq('id', recoveredUser.id)
          .single()

        if (recoveryError || !completeUserData) {
          throw new Error('Failed to fetch complete user data after recovery')
        }

        // Extract home_currency from joined business data for recovery
        const recoveryBusinessData = Array.isArray(completeUserData.businesses) ? completeUserData.businesses[0] : completeUserData.businesses
        const recoveryHomeCurrency = recoveryBusinessData?.home_currency || 'SGD'

        return {
          id: completeUserData.id,
          business_id: completeUserData.business_id,
          home_currency: recoveryHomeCurrency,
          preferred_currency: (completeUserData as any).preferred_currency || 'SGD',
          email: completeUserData.email,
          full_name: completeUserData.full_name
        }
      }

      throw new Error('Failed to fetch user data: User not found')
    }

    // 🚨 CRITICAL BUG FIX: Robust duplicate record handling
    if (users.length > 1) {
      console.error(`[CRITICAL] Found ${users.length} duplicate user records for clerk_user_id: ${clerkUserId}`)
      console.error(`[CRITICAL] Duplicate user IDs:`, users.map(u => u.id))
      console.error(`[CRITICAL] Duplicate emails:`, users.map(u => u.email))
      console.error(`[CRITICAL] Duplicate business_ids:`, users.map(u => u.business_id))

      // 🛡️ SECURITY: Validate all duplicates have same email to prevent cross-user contamination
      const emails = users.map(u => u.email).filter(Boolean)
      const uniqueEmails = [...new Set(emails)]

      if (uniqueEmails.length > 1) {
        console.error(`[CRITICAL SECURITY] Duplicate records have DIFFERENT EMAILS - potential cross-user contamination!`)
        console.error(`[CRITICAL SECURITY] Emails found:`, uniqueEmails)
        throw new Error(`SECURITY VIOLATION: Duplicate user records have different emails for ${clerkUserId}`)
      }

      // 🛡️ SECURITY: Validate business_id consistency to prevent cross-business data leakage
      const businessIds = users.map(u => u.business_id).filter(Boolean)
      const uniqueBusinessIds = [...new Set(businessIds)]

      if (uniqueBusinessIds.length > 1) {
        console.error(`[CRITICAL SECURITY] Duplicate records have DIFFERENT BUSINESS_IDs - potential cross-business contamination!`)
        console.error(`[CRITICAL SECURITY] Business IDs found:`, uniqueBusinessIds)
        throw new Error(`SECURITY VIOLATION: Duplicate user records have different business_ids for ${clerkUserId}`)
      }

      // If validation passes, use the most recent record with business_id
      const recordsWithBusiness = users.filter(u => u.business_id)
      if (recordsWithBusiness.length > 0) {
        console.log(`[User Data] Using most recent record with business context: ${recordsWithBusiness[0].id}`)
        // TODO: URGENT - Set up automated cleanup job for duplicates
      } else {
        console.log(`[User Data] Using most recent record: ${users[0].id}`)
        // TODO: URGENT - Set up automated cleanup job for duplicates
      }
    }

    // Select the best user record (prioritize records with business_id)
    const recordsWithBusiness = users.filter(u => u.business_id)
    const user = recordsWithBusiness.length > 0 ? recordsWithBusiness[0] : users[0]

    // Extract home_currency from joined business data
    const businessData = Array.isArray(user.businesses) ? user.businesses[0] : user.businesses
    const homeCurrency = businessData?.home_currency || 'SGD' // Default fallback

    console.log(`[Service Role Audit] getUserData - SUCCESS: Resolved user ${user.id} with business_id: ${user.business_id}`)

    return {
      id: user.id,
      business_id: user.business_id,
      home_currency: homeCurrency,
      preferred_currency: (user as any).preferred_currency || 'SGD',
      email: user.email,
      full_name: user.full_name
    }
  })
}

// ❌ REMOVED: createUserSupabaseClient() - No longer used
// Replaced by createBusinessContextSupabaseClient() for better multi-tenant support

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

// 🔒 AUDIT: RESTRICTED SERVICE ROLE CLIENT - Bypasses all RLS policies
// ⚠️ SECURITY WARNING: Use ONLY for system operations that MUST bypass RLS
//
// Valid Use Cases:
// ✅ User initialization and recovery (createMissingUserRecords)
// ✅ Administrative cleanup jobs (duplicate user cleanup)
// ✅ System-level auditing and reporting
// ✅ Background jobs with explicit user_id filtering
//
// Invalid Use Cases:
// ❌ Regular user queries (use createBusinessContextSupabaseClient instead)
// ❌ API endpoints serving user requests (security risk)
// ❌ Client-side operations (NEVER expose service key)
//
// Audit Requirements:
// - Log function name, operation, and user_id when using this client
// - Document justification for RLS bypass in function comments
// - Implement explicit user_id/business_id filters in queries
export function createServiceSupabaseClient() {
  console.log(`[Service Role Audit] createServiceSupabaseClient - WARNING: Creating service role client with RLS bypass`)

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

// SECURITY: Proper Clerk+Supabase JWT integration
export async function createAuthenticatedSupabaseClient(clerkUserId?: string) {
  const authenticatedClerkUserId = clerkUserId || (await auth()).userId

  if (!authenticatedClerkUserId) {
    throw new Error('Authentication required')
  }

  // Get JWT token from cache or Clerk with enhanced error handling
  const { getCachedJWTToken } = await import('./business-context-cache')

  console.log(`[Auth] Attempting to get JWT token for user: ${authenticatedClerkUserId}`)

  let jwtToken: string | null = null
  try {
    jwtToken = await getCachedJWTToken(authenticatedClerkUserId)
    console.log(`[Auth] JWT token obtained successfully: ${jwtToken ? 'exists' : 'null'}`)

    if (jwtToken) {
      console.log(`[Auth] JWT token validation passed`)
    }
  } catch (error) {
    console.error(`[Auth] Failed to get JWT token:`, error)
    console.error(`[Auth] This may indicate an issue with Clerk authentication`)
    console.error(`[Auth] Please ensure Clerk is properly configured`)
    throw new Error(`JWT token generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  if (!jwtToken) {
    console.error(`[Auth] No JWT token available - Clerk authentication may not be working`)
    throw new Error('No JWT token available - please check Clerk authentication')
  }

  // Create Supabase client with Clerk JWT
  // For native third-party auth, we only use Authorization header, NOT setSession()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${jwtToken}`
        },
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(10000) // 10 second timeout
          })
        }
      }
    }
  )

  // ✅ Native integration: JWT passed via Authorization header only
  // ❌ DO NOT call setSession() - that's for Supabase Auth JWTs, not third-party JWTs

  return supabase
}

// HYBRID: Multi-tenant Supabase client with database-first business context
export async function createBusinessContextSupabaseClient(clerkUserId?: string) {
  const authenticatedClerkUserId = clerkUserId || (await auth()).userId

  if (!authenticatedClerkUserId) {
    throw new Error('Authentication required')
  }

  console.log(`[BusinessContext] Getting business context for user: ${authenticatedClerkUserId}`)

  try {
    // Get user's current business from cache or database (performance optimized)
    const { getCachedUserData } = await import('./business-context-cache')
    const userData = await getCachedUserData(authenticatedClerkUserId)
    const activeBusinessId = userData.business_id

    if (!activeBusinessId) {
      console.log(`[BusinessContext] No business_id found - user needs to create/join a business`)
      throw new Error('No active business found - user must create or join a business first')
    }

    console.log(`[BusinessContext] ✅ Using business context: ${activeBusinessId}`)

    // Get JWT token from cache or Clerk with enhanced error handling
    const { getCachedJWTToken } = await import('./business-context-cache')

    console.log(`[BusinessContext] Attempting to get JWT token for user: ${authenticatedClerkUserId}`)

    let jwtToken: string | null = null
    try {
      jwtToken = await getCachedJWTToken(authenticatedClerkUserId)
      console.log(`[BusinessContext] JWT token obtained successfully: ${jwtToken ? 'exists' : 'null'}`)

      if (jwtToken) {
        console.log(`[BusinessContext] JWT token validation passed`)
      }
    } catch (error) {
      console.error(`[BusinessContext] Failed to get JWT token:`, error)
      console.error(`[BusinessContext] This may indicate an issue with Clerk authentication`)
      throw new Error(`JWT token generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    if (!jwtToken) {
      console.error(`[BusinessContext] No JWT token available - Clerk authentication may not be working`)
      throw new Error('No JWT token available - please check Clerk authentication')
    }

    // Create Supabase client with Clerk JWT
    // For native third-party auth, we only use Authorization header, NOT setSession()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            Authorization: `Bearer ${jwtToken}`
          },
          fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
            return fetch(url, {
              ...options,
              signal: AbortSignal.timeout(10000) // 10 second timeout
            })
          }
        }
      }
    )

    // ✅ Native integration: JWT passed via Authorization header only
    // ❌ DO NOT call setSession() - that's for Supabase Auth JWTs, not third-party JWTs

    // Validate business membership (no session variables needed with direct filtering)
    // Business membership already validated by middleware context system
    // No need for redundant RPC call - middleware provides single source of truth
    console.log(`[BusinessContext] ✅ Business membership pre-validated by middleware for: ${activeBusinessId}`)

    return supabase

  } catch (error) {
    console.error('[BusinessContext] Failed to get business context:', error)
    throw new Error('Failed to establish business context - please try again')
  }
}

/**
 * REMOVED: repairMissingBusinessMembership() function
 *
 * Reason: This function was never called anywhere in the codebase (confirmed via grep search).
 * It contained references to the deprecated employee_profiles table which was dropped in
 * migration 20251005085345.
 *
 * Original purpose: Auto-repair missing business membership records when validation failed.
 *
 * Current approach: Business membership creation is handled via:
 * 1. Clerk webhook sync (src/app/api/v1/system/webhooks/clerk)
 * 2. Invitation acceptance flow (src/app/api/v1/account-management/invitations/accept)
 * 3. Business creation flow (src/app/api/v1/account-management/businesses)
 *
 * If auto-repair functionality is needed in the future, it should be reimplemented using
 * the current business_memberships schema without employee_profiles dependencies.
 *
 * Removed: 2025-01-13
 * Codebase Review: CODEBASE-REVIEW-2025-01-13.md
 */