import { createClient } from '@supabase/supabase-js'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getDefaultExpenseCategories } from '@/lib/default-expense-categories'
import { syncRoleToClerk } from '@/lib/rbac'

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
          status: 'active',
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

      // Sync role permissions to Clerk metadata
      console.log(`[User Recovery] 🔄 Syncing invitation role permissions to Clerk metadata`)
      const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)

      if (!syncResult.success) {
        console.error(`[User Recovery] ❌ Clerk sync failed: ${syncResult.error}`)
      } else {
        console.log(`[User Recovery] ✅ Clerk sync successful for invitation`)
      }

      // HYBRID: Database is single source of truth - no JWT metadata needed
      console.log(`[User Recovery] Business context stored in database: activeBusinessId = ${latestInvitation.business_id}`)
      // Note: Database business_id is authoritative source, no JWT metadata required

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
              status: 'active',
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
            status: 'active',
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

    console.log(`[User Recovery] ✅ Confirmed: ${email} has NO invitation history - safe to create new business`)

    // 🛡️ STEP 3: Create user record FIRST (only for genuinely new users)
    console.log(`[User Recovery] 👤 Creating user record for NEW user ${email}`)

    const userData = {
      clerk_user_id: clerkUserId,
      email: email,
      full_name: fullName,
      business_id: null, // Will be updated after business creation
      home_currency: 'SGD',
      status: 'active', // New user is active by default
      created_at: new Date().toISOString()
    }

    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert(userData)
      .select('id')
      .single()

    if (userError) {
      console.error('[User Recovery] ❌ Error creating user record:', userError)

      // Check if it's a duplicate key error and handle gracefully
      if (userError.message.includes('duplicate') || userError.message.includes('unique')) {
        console.log(`[User Recovery] 🔄 Duplicate key error detected, checking for existing user again...`)

        // Race condition: user was created between our check and insert
        const { data: raceConditionUser } = await supabase
          .from('users')
          .select('id, business_id')
          .eq('clerk_user_id', clerkUserId)
          .single()

        if (raceConditionUser) {
          console.log(`[User Recovery] ✅ Found user created by race condition: ${raceConditionUser.id}`)
          return {
            id: raceConditionUser.id,
            business_id: raceConditionUser.business_id
          }
        }
      }

      return null
    }

    console.log(`[User Recovery] ✅ Created user with ID: ${newUser.id}`)

    // 🛡️ STEP 4: Create business with owner_id = user UUID (only for new users)
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

    console.log(`[User Recovery] ✅ Employee profile created successfully`)

    // 🛡️ STEP 5: Create business membership record (CRITICAL - was missing!)
    console.log(`[User Recovery] 🏢 Creating business membership for user ${newUser.id}`)

    const { error: membershipError } = await supabase
      .from('business_memberships')
      .insert({
        user_id: newUser.id,
        business_id: newBusiness.id,
        role: 'admin', // Owner is admin of their own business
        status: 'active',
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })

    if (membershipError) {
      console.error('[User Recovery] ❌ Error creating business membership:', membershipError)
      return null
    }

    console.log(`[User Recovery] ✅ Business membership created successfully`)

    // 🛡️ STEP 6: Sync role permissions to Clerk metadata (critical for middleware access)
    console.log(`[User Recovery] 🔄 Syncing role permissions to Clerk metadata`)
    await new Promise(resolve => setTimeout(resolve, 500)) // 500ms delay to ensure Clerk user is fully available
    const syncResult = await syncRoleToClerk(clerkUserId, rolePermissions)

    if (!syncResult.success) {
      console.error(`[User Recovery] ❌ CRITICAL: Clerk sync failed after all retries: ${syncResult.error}`)
      console.error(`[User Recovery] 📋 User will have database access but middleware will block manager routes`)
    } else {
      console.log(`[User Recovery] ✅ Clerk sync successful`)
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
export async function getUserData(clerkUserId: string): Promise<{id: string, business_id: string | null, home_currency: string, email: string, full_name: string | null}> {
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
      .select('id, business_id, home_currency, email, full_name, created_at')
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
        const { data: completeUser, error: recoveryError } = await serviceClient
          .from('users')
          .select('id, business_id, home_currency, email, full_name, created_at')
          .eq('id', recoveredUser.id)
          .single()

        if (recoveryError || !completeUser) {
          throw new Error('Failed to fetch complete user data after recovery')
        }

        return completeUser
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

// SECURITY: Proper Clerk+Supabase JWT integration following official docs
export async function createAuthenticatedSupabaseClient(clerkUserId?: string) {
  const authenticatedClerkUserId = clerkUserId || (await auth()).userId

  if (!authenticatedClerkUserId) {
    throw new Error('Authentication required')
  }

  // Get Clerk JWT token for Supabase authentication
  let jwtToken: string | null = null
  try {
    // In server components, we need to get the token differently
    const { getToken } = await auth()
    jwtToken = await getToken({ template: 'supabase' })
  } catch (error) {
    console.error('[Supabase Client] Failed to get Clerk JWT token:', error)
    throw new Error('Failed to authenticate with Clerk')
  }

  if (!jwtToken) {
    throw new Error('No JWT token available')
  }

  // JWT authentication configured for Clerk integration

  // Create Supabase client with proper JWT authentication
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // Use anon key, not JWT token
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
            signal: AbortSignal.timeout(10000) // 10 second timeout for user operations
          })
        }
      }
    }
  )

  // 🔧 CRITICAL FIX: Set the session with JWT token for RPC functions to access claims
  await supabase.auth.setSession({
    access_token: jwtToken,
    refresh_token: '' // Empty refresh token since we don't use it
  })

  // JWT session configured for RPC access

  return supabase
}

// HYBRID: Multi-tenant Supabase client with database-first business context + caching
export async function createBusinessContextSupabaseClient(clerkUserId?: string) {
  const authenticatedClerkUserId = clerkUserId || (await auth()).userId

  if (!authenticatedClerkUserId) {
    throw new Error('Authentication required')
  }

  // HYBRID APPROACH: Database is single source of truth with application layer caching
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

    // HYBRID: Use Clerk JWT authentication for RPC functions
    let jwtToken: string | null = null
    try {
      const { getToken } = await auth()
      jwtToken = await getToken({ template: 'supabase' })
    } catch (error) {
      console.error('[BusinessContext] Failed to get Clerk JWT token:', error)
      throw new Error('Failed to authenticate with Clerk')
    }

    if (!jwtToken) {
      throw new Error('No JWT token available')
    }

    // Create authenticated Supabase client with Clerk JWT
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
          }
        }
      }
    )

    // Set the session with JWT token for RPC functions to access claims
    await supabase.auth.setSession({
      access_token: jwtToken,
      refresh_token: ''
    })

    // Validate business membership (no session variables needed with direct filtering)
    console.log(`[BusinessContext] Validating business membership for: ${activeBusinessId}`)

    const { error: rpcError } = await supabase.rpc('set_tenant_context', { p_business_id: activeBusinessId })

    if (rpcError) {
      console.error(`[BusinessContext] Business membership validation failed for ${activeBusinessId}:`, rpcError)
      throw new Error(`Failed to validate business membership: ${rpcError.message}`)
    }

    console.log(`[BusinessContext] ✅ Business membership validated for: ${activeBusinessId}`)

    // Business context validated (database + cache + JWT)

    return supabase

  } catch (error) {
    console.error('[BusinessContext] Failed to get business context:', error)
    throw new Error('Failed to establish business context - please try again')
  }
}