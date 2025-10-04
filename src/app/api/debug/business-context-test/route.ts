import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getCurrentBusinessContext, getUserBusinessMemberships } from '@/lib/business-context'
import { getUserData } from '@/lib/supabase-server'

/**
 * Debug endpoint to test business context functions and identify issues
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, sessionClaims } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const tests: any = {
      authenticated: true,
      userId,
      timestamp: new Date().toISOString(),
      tests: {}
    }

    // Test 1: Check Clerk user metadata
    console.log('[BUSINESS CONTEXT TEST] Test 1: Checking Clerk metadata...')
    try {
      const user = await (await clerkClient()).users.getUser(userId)
      tests.tests.clerkMetadata = {
        success: true,
        publicMetadata: user.publicMetadata,
        privateMetadata: user.privateMetadata,
        sessionClaimsMetadata: sessionClaims?.metadata,
        activeBusinessFromPublic: user.publicMetadata?.activeBusinessId,
        activeBusinessFromPrivate: user.privateMetadata?.activeBusinessId
      }
    } catch (error) {
      tests.tests.clerkMetadata = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test 2: Check getUserData function (Clerk ID → Supabase UUID mapping)
    console.log('[BUSINESS CONTEXT TEST] Test 2: Testing getUserData mapping...')
    try {
      const userData = await getUserData(userId)
      tests.tests.userDataMapping = {
        success: true,
        clerkUserId: userId,
        supabaseUserId: userData.id,
        userData: {
          email: userData.email,
          fullName: userData.full_name,
          businessId: userData.business_id
        }
      }
    } catch (error) {
      tests.tests.userDataMapping = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test 3: Test getCurrentBusinessContext function
    console.log('[BUSINESS CONTEXT TEST] Test 3: Testing getCurrentBusinessContext...')
    try {
      const context = await getCurrentBusinessContext(userId)
      tests.tests.currentBusinessContext = {
        success: true,
        hasContext: !!context,
        context: context
      }
    } catch (error) {
      tests.tests.currentBusinessContext = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }

    // Test 4: Test getUserBusinessMemberships function
    console.log('[BUSINESS CONTEXT TEST] Test 4: Testing getUserBusinessMemberships...')
    try {
      const memberships = await getUserBusinessMemberships(userId)
      tests.tests.businessMemberships = {
        success: true,
        membershipCount: memberships.length,
        memberships: memberships.map(m => ({
          businessId: m.id,
          businessName: m.name,
          role: m.membership?.role,
          isOwner: m.isOwner
        }))
      }
    } catch (error) {
      tests.tests.businessMemberships = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        isPGRST301: error instanceof Error && error.message.includes('PGRST301')
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
        ? "PGRST301 errors detected - RLS policies blocking database access"
        : failedTests.length > 0
        ? "Business context functions failing - likely metadata or authentication issues"
        : "All business context tests passed"
    }

    console.log('[BUSINESS CONTEXT TEST] All tests complete. Summary:', tests.summary)

    return NextResponse.json(tests, { status: 200 })

  } catch (error) {
    console.error('[BUSINESS CONTEXT TEST] Unexpected error:', error)
    return NextResponse.json({
      error: 'Internal server error during business context test',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}