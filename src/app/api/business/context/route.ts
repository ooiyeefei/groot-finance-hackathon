/**
 * Business Context API
 * GET: Get current business context from Clerk JWT
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentBusinessContext } from '@/lib/business-context'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get current business context
    const context = await getCurrentBusinessContext(userId)

    if (!context) {
      return NextResponse.json({
        success: true,
        data: {
          context: null
        },
        message: 'No active business context'
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        context
      }
    })

  } catch (error) {
    console.error('[API] Error getting business context:', error)
    return NextResponse.json(
      { error: 'Failed to get business context' },
      { status: 500 }
    )
  }
}