/**
 * User Role V1 API
 * GET - Returns current user's role and permission information
 */

import { NextRequest, NextResponse } from 'next/server'
import { rateLimiters } from '@/lib/api/rate-limit'
import { getUserRole } from '@/domains/users/lib/user.service'

// GET /api/v1/users/role - Get current user role and permissions
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await rateLimiters.query(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const roleInfo = await getUserRole()

    return NextResponse.json({
      success: true,
      data: roleInfo
    })

  } catch (error) {
    console.error('[User Role V1 API] Unexpected error:', error)

    if (error instanceof Error && error.message.includes('not authenticated')) {
      return NextResponse.json(
        { success: false, error: 'User not authenticated' },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
