import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server'
import { validateDebugAccess, logDebugAccess, createDebugErrorResponse } from '@/lib/debug-auth'

/**
 * Debug endpoint to test Supabase RLS function integration with JWT
 * This helps us understand if the JWT is being properly processed by Supabase
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[DEBUG RLS] Starting Supabase RLS function testing...')

    // SECURITY: Validate debug access (authentication + environment checks)
    const authResult = await validateDebugAccess()

    if (!authResult.authorized) {
      return authResult.response!
    }

    const userId = authResult.userId!

    // Log access for audit purposes
    logDebugAccess(userId, '/api/debug/supabase-rls', 'accessed')

    console.log(`[DEBUG RLS] User ID: ${userId}`)

    // Create authenticated Supabase client
    let supabase: any
    try {
      supabase = await createAuthenticatedSupabaseClient(userId)
      console.log('[DEBUG RLS] Created authenticated Supabase client')
    } catch (clientError) {
      console.error('[DEBUG RLS] Error creating Supabase client:', clientError)
      return NextResponse.json({
        error: 'Failed to create authenticated Supabase client',
        clientError: clientError instanceof Error ? clientError.message : 'Unknown client error',
        authenticated: true,
        userId
      }, { status: 500 })
    }

    const tests: any = {
      authenticated: true,
      userId,
      timestamp: new Date().toISOString(),
      tests: {}
    }

    // Test 1: Check if RLS functions exist
    console.log('[DEBUG RLS] Test 1: Checking RLS functions...')
    try {
      const { data: functions, error: funcError } = await supabase
        .from('information_schema.routines')
        .select('routine_name')
        .eq('routine_schema', 'public')
        .in('routine_name', ['requesting_user_id', 'current_user_id', 'set_user_context', 'current_business_id'])

      tests.tests.rlsFunctionsExist = {
        success: !funcError,
        error: funcError?.message,
        functionsFound: functions?.map((f: any) => f.routine_name) || [],
        expectedFunctions: ['requesting_user_id', 'current_user_id', 'set_user_context', 'current_business_id']
      }
      console.log('[DEBUG RLS] Test 1 complete:', tests.tests.rlsFunctionsExist)
    } catch (error) {
      tests.tests.rlsFunctionsExist = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test 2: Call requesting_user_id() function
    console.log('[DEBUG RLS] Test 2: Testing requesting_user_id()...')
    try {
      const { data: userIdResult, error: userIdError } = await supabase
        .rpc('requesting_user_id')

      tests.tests.requestingUserId = {
        success: !userIdError,
        error: userIdError?.message,
        result: userIdResult,
        isValidUUID: userIdResult ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userIdResult) : false
      }
      console.log('[DEBUG RLS] Test 2 complete:', tests.tests.requestingUserId)
    } catch (error) {
      tests.tests.requestingUserId = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test 3: Try to query users table (should work with RLS)
    console.log('[DEBUG RLS] Test 3: Testing users table access with RLS...')
    try {
      const { data: userData, error: userError, count } = await supabase
        .from('users')
        .select('id, email, business_id', { count: 'exact' })
        .limit(1)

      tests.tests.usersTableAccess = {
        success: !userError,
        error: userError?.message,
        recordCount: count,
        hasData: !!userData && userData.length > 0,
        sampleUser: userData?.[0] ? {
          hasId: !!userData[0].id,
          hasEmail: !!userData[0].email,
          hasBusinessId: !!userData[0].business_id
        } : null
      }
      console.log('[DEBUG RLS] Test 3 complete:', tests.tests.usersTableAccess)
    } catch (error) {
      tests.tests.usersTableAccess = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test 4: Try to query transactions table (should fail with PGRST301 if issue exists)
    console.log('[DEBUG RLS] Test 4: Testing transactions table access...')
    try {
      const { data: transactionData, error: transactionError, count } = await supabase
        .from('transactions')
        .select('id, user_id, business_id', { count: 'exact' })
        .limit(1)

      tests.tests.transactionsTableAccess = {
        success: !transactionError,
        error: transactionError?.message,
        errorCode: transactionError?.code,
        recordCount: count,
        hasData: !!transactionData && transactionData.length > 0,
        isPGRST301: transactionError?.message?.includes('PGRST301') || transactionError?.code === 'PGRST301'
      }
      console.log('[DEBUG RLS] Test 4 complete:', tests.tests.transactionsTableAccess)
    } catch (error) {
      tests.tests.transactionsTableAccess = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test 5: Test business_memberships table
    console.log('[DEBUG RLS] Test 5: Testing business_memberships table access...')
    try {
      const { data: membershipData, error: membershipError, count } = await supabase
        .from('business_memberships')
        .select('user_id, business_id, role', { count: 'exact' })
        .limit(1)

      tests.tests.businessMembershipsAccess = {
        success: !membershipError,
        error: membershipError?.message,
        errorCode: membershipError?.code,
        recordCount: count,
        hasData: !!membershipData && membershipData.length > 0,
        isPGRST301: membershipError?.message?.includes('PGRST301') || membershipError?.code === 'PGRST301'
      }
      console.log('[DEBUG RLS] Test 5 complete:', tests.tests.businessMembershipsAccess)
    } catch (error) {
      tests.tests.businessMembershipsAccess = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Summary
    const failedTests = Object.entries(tests.tests).filter(([_, test]: [string, any]) => !test.success)
    const pgrst301Errors = Object.entries(tests.tests).filter(([_, test]: [string, any]) => test.isPGRST301)

    tests.summary = {
      totalTests: Object.keys(tests.tests).length,
      failedTests: failedTests.length,
      pgrst301Errors: pgrst301Errors.length,
      failedTestNames: failedTests.map(([name, _]) => name),
      pgrst301TestNames: pgrst301Errors.map(([name, _]) => name),
      diagnosis: pgrst301Errors.length > 0
        ? "PGRST301 errors detected - JWT authentication not working with Supabase RLS"
        : failedTests.length > 0
        ? "Some tests failed but not PGRST301 - may be RLS policy or function issues"
        : "All tests passed - JWT authentication appears to be working"
    }

    console.log('[DEBUG RLS] All tests complete. Summary:', tests.summary)

    return NextResponse.json(tests, { status: 200 })

  } catch (error) {
    return createDebugErrorResponse(error, 'Supabase RLS debug')
  }
}