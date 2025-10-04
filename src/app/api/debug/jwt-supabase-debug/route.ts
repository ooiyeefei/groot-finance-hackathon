import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Debug JWT token passing to Supabase step by step
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, getToken } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    console.log('[JWT DEBUG] Step 1: Getting JWT token from Clerk...')

    // Step 1: Get the JWT token
    let jwtToken: string | null = null
    try {
      jwtToken = await getToken({ template: 'supabase' })
      console.log('[JWT DEBUG] JWT token obtained:', {
        hasToken: !!jwtToken,
        tokenLength: jwtToken?.length,
        tokenPreview: jwtToken ? `${jwtToken.slice(0, 50)}...` : null
      })
    } catch (tokenError) {
      console.error('[JWT DEBUG] Error getting JWT token:', tokenError)
      return NextResponse.json({
        error: 'Failed to get JWT token',
        details: tokenError instanceof Error ? tokenError.message : 'Unknown error'
      }, { status: 500 })
    }

    if (!jwtToken) {
      return NextResponse.json({ error: 'No JWT token available' }, { status: 500 })
    }

    // Step 2: Decode the token to see what's in it
    console.log('[JWT DEBUG] Step 2: Decoding JWT token...')
    let decodedToken = null
    try {
      const parts = jwtToken.split('.')
      const payload = parts[1]
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString())
      decodedToken = decoded
      console.log('[JWT DEBUG] Token payload:', decoded)
    } catch (decodeError) {
      console.error('[JWT DEBUG] Error decoding token:', decodeError)
    }

    // Step 3: Create Supabase client with JWT token
    console.log('[JWT DEBUG] Step 3: Creating Supabase client with JWT token...')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${jwtToken}`
          }
        }
      }
    )

    // Step 4: Test if Supabase can see the JWT claims
    console.log('[JWT DEBUG] Step 4: Testing Supabase JWT claims...')
    const { data: jwtClaims, error: claimsError } = await supabase
      .rpc('requesting_user_id')
      .single()

    console.log('[JWT DEBUG] requesting_user_id() result:', {
      data: jwtClaims,
      error: claimsError
    })

    // Step 5: Test raw JWT claims access
    console.log('[JWT DEBUG] Step 5: Testing raw JWT claims access...')
    const { data: rawClaims, error: rawClaimsError } = await supabase
      .from('users')
      .select('id')
      .limit(0) // Don't return data, just test RLS

    console.log('[JWT DEBUG] RLS test result:', {
      success: !rawClaimsError,
      error: rawClaimsError
    })

    return NextResponse.json({
      step1_clerkUserId: userId,
      step2_jwtToken: {
        hasToken: !!jwtToken,
        tokenLength: jwtToken?.length,
        tokenPreview: jwtToken ? `${jwtToken.slice(0, 50)}...${jwtToken.slice(-50)}` : null
      },
      step3_decodedToken: decodedToken,
      step4_supabaseJwtClaims: {
        data: jwtClaims,
        error: claimsError?.message
      },
      step5_rlsTest: {
        success: !rawClaimsError,
        error: rawClaimsError?.message,
        errorCode: rawClaimsError?.code
      },
      timestamp: new Date().toISOString()
    }, { status: 200 })

  } catch (error) {
    console.error('[JWT DEBUG] Critical error:', error)
    return NextResponse.json({
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}