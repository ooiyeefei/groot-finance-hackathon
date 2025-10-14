/**
 * V1 CSRF Token API
 *
 * GET /api/v1/utils/security/csrf-token - Generate CSRF token for authenticated user
 *
 * Purpose:
 * - Cross-cutting security utility for state-changing operations
 * - Used by multiple domains (account-management, users, chat, etc.)
 * - Implements Synchronizer Token Pattern
 *
 * North Star Architecture:
 * - Thin wrapper delegating to csrf-protection.ts
 * - Handles HTTP concerns
 * - Business logic already in shared security library
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateCSRFTokenForUser } from '@/lib/auth/csrf-protection'

export async function GET(request: NextRequest) {
  try {
    const result = await generateCSRFTokenForUser(request)

    if (!result.token) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to generate CSRF token'
      }, { status: 400 })
    }

    // V1 API format: wrap in data object
    return NextResponse.json({
      success: true,
      data: {
        token: result.token,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour expiry
      }
    })
  } catch (error) {
    console.error('[V1 CSRF Token API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
