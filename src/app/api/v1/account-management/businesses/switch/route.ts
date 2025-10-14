/**
 * Business Switching API V1
 * POST /api/v1/businesses/switch - Switch user's active business (updates Clerk JWT)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { switchActiveBusiness } from '@/domains/account-management/lib/account-management.service'
import { csrfProtection } from '@/lib/auth/csrf-protection'
import { z } from 'zod'

const SwitchBusinessSchema = z.object({
  businessId: z.string().uuid('Invalid business ID format')
})

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Apply CSRF protection
    const csrfResponse = await csrfProtection(request)
    if (csrfResponse) {
      return csrfResponse
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = SwitchBusinessSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: validation.error.issues
        },
        { status: 400 }
      )
    }

    const { businessId } = validation.data

    // Switch active business
    const result = await switchActiveBusiness(businessId, userId)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Business switched successfully',
      data: {
        context: result.context
      }
    })

  } catch (error) {
    console.error('[Business Switch V1 API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to switch business' },
      { status: 500 }
    )
  }
}
