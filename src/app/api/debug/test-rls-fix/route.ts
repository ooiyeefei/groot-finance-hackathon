import { NextRequest, NextResponse } from 'next/server'
import { createBusinessContextSupabaseClient } from '@/lib/supabase-server'
import { auth } from '@clerk/nextjs/server'

/**
 * Test the RLS fix - verify that Clerk ID now maps to Supabase UUID
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = await createBusinessContextSupabaseClient()

    // Test 1: Check if requesting_user_id() now works
    console.log('[RLS FIX TEST] Testing requesting_user_id() function...')
    const { data: rlsUserId, error: rlsError } = await supabase
      .rpc('requesting_user_id')

    // Test 2: Try to access users table
    console.log('[RLS FIX TEST] Testing users table access...')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, business_id')
      .limit(1)

    // Test 3: Try to access transactions table
    console.log('[RLS FIX TEST] Testing transactions table access...')
    const { data: transactionData, error: transactionError } = await supabase
      .from('transactions')
      .select('id, user_id, business_id')
      .limit(1)

    const tests = {
      rlsFunction: {
        success: !rlsError,
        error: rlsError?.message,
        supabaseUserId: rlsUserId,
        isValidUUID: rlsUserId ? /^[0-9a-f-]{36}$/i.test(rlsUserId) : false,
        isPGRST301: false
      },

      usersTable: {
        success: !userError,
        error: userError?.message,
        errorCode: userError?.code,
        hasData: !!userData && userData.length > 0,
        isPGRST301: userError?.code === 'PGRST301'
      },

      transactionsTable: {
        success: !transactionError,
        error: transactionError?.message,
        errorCode: transactionError?.code,
        hasData: !!transactionData && transactionData.length > 0,
        isPGRST301: transactionError?.code === 'PGRST301'
      }
    }

    // Calculate summary
    const allTests = Object.values(tests)
    const successCount = allTests.filter(test => test.success).length
    const pgrst301Count = allTests.filter(test => test.isPGRST301).length

    const result = {
      clerkUserId: userId,
      timestamp: new Date().toISOString(),
      tests,
      summary: {
        successfulTests: successCount,
        totalTests: allTests.length,
        pgrst301Errors: pgrst301Count,
        allTestsPassed: successCount === allTests.length,
        rlsFixed: tests.rlsFunction.success && tests.rlsFunction.isValidUUID
      }
    }

    console.log('[RLS FIX TEST] Test complete:', {
      rlsWorking: result.tests.rlsFunction.success,
      usersWorking: result.tests.usersTable.success,
      transactionsWorking: result.tests.transactionsTable.success,
      allFixed: result.summary.allTestsPassed
    })

    return NextResponse.json(result, { status: 200 })

  } catch (error) {
    console.error('[RLS FIX TEST] Error:', error)
    return NextResponse.json({
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}