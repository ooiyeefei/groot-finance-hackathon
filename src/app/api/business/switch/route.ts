/**
 * Business Switching API
 * POST: Switch user's active business (updates Clerk JWT)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { switchActiveBusiness } from '@/lib/business-context'
import { z } from 'zod'

const SwitchBusinessSchema = z.object({
  businessId: z.string().uuid('Invalid business ID format')
})

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = SwitchBusinessSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
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
        { error: result.error },
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
    console.error('[API] Error switching business:', error)
    return NextResponse.json(
      { error: 'Failed to switch business' },
      { status: 500 }
    )
  }
}