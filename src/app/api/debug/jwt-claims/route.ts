import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

/**
 * Debug endpoint to inspect JWT claims structure
 * This helps us understand what's being sent to Supabase for RLS
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[DEBUG JWT] Starting JWT claims inspection...')

    // Get Clerk authentication
    const { userId, getToken } = await auth()

    if (!userId) {
      return NextResponse.json({
        error: 'Not authenticated',
        authenticated: false
      }, { status: 401 })
    }

    console.log(`[DEBUG JWT] User ID: ${userId}`)

    // Get the JWT token that would be sent to Supabase
    let supabaseToken: string | null = null
    try {
      supabaseToken = await getToken({ template: 'supabase' })
      console.log(`[DEBUG JWT] Got Supabase token: ${supabaseToken ? 'YES' : 'NO'}`)
    } catch (tokenError) {
      console.error('[DEBUG JWT] Error getting Supabase token:', tokenError)
      return NextResponse.json({
        error: 'Failed to get Supabase token',
        tokenError: tokenError instanceof Error ? tokenError.message : 'Unknown token error',
        authenticated: true,
        userId
      }, { status: 500 })
    }

    if (!supabaseToken) {
      return NextResponse.json({
        error: 'No Supabase token available',
        authenticated: true,
        userId,
        suggestion: 'Check if JWT template "supabase" is configured in Clerk dashboard'
      }, { status: 400 })
    }

    // Parse JWT to see its structure (basic decode, no verification)
    let decodedToken: any = null
    try {
      const parts = supabaseToken.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format')
      }

      const payload = parts[1]
      // Add padding if needed for base64 decode
      const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4)
      const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'))
      decodedToken = JSON.parse(decodedPayload)

      console.log('[DEBUG JWT] Successfully decoded token payload')
    } catch (decodeError) {
      console.error('[DEBUG JWT] Error decoding token:', decodeError)
      return NextResponse.json({
        error: 'Failed to decode JWT',
        decodeError: decodeError instanceof Error ? decodeError.message : 'Unknown decode error',
        authenticated: true,
        userId,
        hasToken: true
      }, { status: 500 })
    }

    // Also get regular session claims for comparison
    const { sessionClaims } = await auth()

    const result = {
      authenticated: true,
      userId,
      hasSupabaseToken: true,
      tokenLength: supabaseToken.length,

      // JWT structure analysis
      jwtHeader: decodedToken ? {
        hasIss: !!decodedToken.iss,
        hasAud: !!decodedToken.aud,
        hasSub: !!decodedToken.sub,
        hasExp: !!decodedToken.exp,
        hasIat: !!decodedToken.iat,
      } : null,

      // JWT payload fields (safe to expose in debug)
      jwtPayload: decodedToken ? {
        iss: decodedToken.iss,
        aud: decodedToken.aud,
        sub: decodedToken.sub,
        exp: decodedToken.exp ? new Date(decodedToken.exp * 1000).toISOString() : null,
        iat: decodedToken.iat ? new Date(decodedToken.iat * 1000).toISOString() : null,

        // Custom claims that should be available to Supabase RLS
        metadata: decodedToken.metadata,
        role: decodedToken.role,
        permissions: decodedToken.permissions,
        businessId: decodedToken.businessId,
        activeBusinessId: decodedToken.activeBusinessId,

        // All custom fields for debugging
        customFields: Object.keys(decodedToken).filter(key =>
          !['iss', 'aud', 'sub', 'exp', 'iat', 'nbf'].includes(key)
        )
      } : null,

      // Session claims for comparison
      sessionClaims: sessionClaims ? {
        hasMetadata: !!sessionClaims.metadata,
        metadata: sessionClaims.metadata
      } : null,

      timestamp: new Date().toISOString(),

      // Instructions for Supabase RLS debugging
      instructions: {
        checkRLSFunctions: "Verify these RLS functions exist: requesting_user_id(), current_user_id(), set_user_context()",
        checkJWTSub: "RLS functions should read JWT 'sub' field which should match Supabase user UUID",
        verifyTemplate: "Ensure JWT template includes necessary user context fields"
      }
    }

    console.log('[DEBUG JWT] Analysis complete:', {
      hasSub: !!decodedToken?.sub,
      subValue: decodedToken?.sub?.substring(0, 8) + '...',
      hasMetadata: !!decodedToken?.metadata,
      customFieldCount: decodedToken ? Object.keys(decodedToken).filter(key =>
        !['iss', 'aud', 'sub', 'exp', 'iat', 'nbf'].includes(key)
      ).length : 0
    })

    return NextResponse.json(result, { status: 200 })

  } catch (error) {
    console.error('[DEBUG JWT] Unexpected error:', error)
    return NextResponse.json({
      error: 'Internal server error during JWT debug',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}