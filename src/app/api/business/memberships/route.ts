/**
 * Business Memberships API
 * GET: List all businesses user is member of
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getUserBusinessMemberships } from '@/lib/business-context'

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get all businesses user is member of
    const businesses = await getUserBusinessMemberships(userId)

    return NextResponse.json({
      success: true,
      businesses,
      total: businesses.length
    })

  } catch (error) {
    console.error('[API] Error fetching business memberships:', error)
    return NextResponse.json(
      { error: 'Failed to fetch business memberships' },
      { status: 500 }
    )
  }
}