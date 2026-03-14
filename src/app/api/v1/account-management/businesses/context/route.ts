/**
 * Business Context API V1
 * GET /api/v1/businesses/context - Get current business context from Clerk JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getBusinessContext } from '@/domains/account-management/lib/account-management.service'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const context = await getBusinessContext(userId)

    if (!context) {
      return withCacheHeaders(NextResponse.json({
        success: true,
        data: {
          context: null
        },
        message: 'No active business context'
      }), 'standard')
    }

    return withCacheHeaders(NextResponse.json({
      success: true,
      data: {
        context
      }
    }), 'standard')

  } catch (error) {
    console.error('[Business Context V1 API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get business context' },
      { status: 500 }
    )
  }
}
