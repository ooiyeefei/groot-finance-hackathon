/**
 * Business Invitations API V1
 * POST /api/v1/invitations - Create new invitation
 * GET /api/v1/invitations - List invitations for business
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createInvitation, getInvitations } from '@/domains/account-management/lib/account-management.service'
import { getCurrentUserContext } from '@/lib/auth/rbac'
import { rateLimiters } from '@/lib/api/rate-limit'
import { csrfProtection } from '@/lib/auth/csrf-protection'

/**
 * Create new business invitation
 */
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting for invitation creation (admin operation)
    const rateLimitResponse = await rateLimiters.admin(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    // Apply CSRF protection
    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({
        success: false,
        error: 'Admin permissions required to send invitations'
      }, { status: 403 })
    }

    const body = await request.json()

    // Validate required fields
    if (!body.email || !body.role) {
      return NextResponse.json({
        success: false,
        error: 'Email and role are required'
      }, { status: 400 })
    }

    const result = await createInvitation(
      body,
      userId,
      userContext.profile.business_id
    )

    if (result.emailFailed) {
      return NextResponse.json({
        success: true,
        invitation: result.invitation,
        emailFailed: true,
        warning: result.warning
      })
    }

    return NextResponse.json({
      success: true,
      invitation: result.invitation
    })

  } catch (error) {
    console.error('[Invitations V1 API] POST error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: error instanceof Error && error.message.includes('already') ? 409 : 500 })
  }
}

/**
 * Get invitations for current business
 */
export async function GET(request: NextRequest) {
  try {
    // Apply rate limiting for admin queries
    const rateLimitResponse = await rateLimiters.query(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 })
    }

    // Check admin permissions
    const userContext = await getCurrentUserContext()
    if (!userContext?.canManageUsers) {
      return NextResponse.json({
        success: false,
        error: 'Admin permissions required to view invitations'
      }, { status: 403 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as 'pending' | 'accepted' | undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const result = await getInvitations(userContext.profile.business_id, {
      status,
      limit,
      offset
    })

    return NextResponse.json({
      success: true,
      invitations: result.invitations,
      total: result.total
    })

  } catch (error) {
    console.error('[Invitations V1 API] GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch invitations'
    }, { status: 500 })
  }
}
