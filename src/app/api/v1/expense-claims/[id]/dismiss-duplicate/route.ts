/**
 * Dismiss Duplicate API Route
 * Feature: 007-duplicate-expense-detection (User Story 2, T027)
 *
 * POST /api/v1/expense-claims/{id}/dismiss-duplicate
 *
 * Dismisses a duplicate match, marking it as "not a duplicate".
 * Requires manager/admin role for the business.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface DismissRequest {
  matchId: string
  reason: string
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // 1. Get authenticated Convex client
    const { client, userId } = await getAuthenticatedConvex()
    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Get claim ID from URL params
    const { id: claimId } = await params
    if (!claimId) {
      return NextResponse.json(
        { success: false, error: 'Missing expense claim ID' },
        { status: 400 }
      )
    }

    // 3. Parse request body
    let body: DismissRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      )
    }

    const { matchId, reason } = body

    // 4. Validate required fields
    if (!matchId) {
      return NextResponse.json(
        { success: false, error: 'Missing matchId' },
        { status: 400 }
      )
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Reason is required when dismissing a duplicate' },
        { status: 400 }
      )
    }

    console.log(`[Dismiss Duplicate API] Dismissing match ${matchId} for claim ${claimId}`)

    // 5. Get user ID from Convex for resolvedBy field
    const user = await client.query(api.functions.users.getCurrentUser, {})
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // 6. Call Convex mutation to dismiss the duplicate
    const result = await client.mutation(api.functions.duplicateMatches.dismissDuplicate, {
      matchId: matchId as Id<'duplicate_matches'>,
      reason: reason.trim(),
      resolvedBy: user._id as Id<'users'>,
    })

    console.log(`[Dismiss Duplicate API] Successfully dismissed match ${matchId}`)

    return NextResponse.json({
      success: true,
      data: {
        matchId: result,
        status: 'dismissed',
      },
      message: 'Duplicate match dismissed successfully',
    })

  } catch (error) {
    console.error('[Dismiss Duplicate API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    // Handle specific error cases
    if (errorMessage === 'Duplicate match not found') {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 404 }
      )
    }

    if (errorMessage === 'Not authorized') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to dismiss this duplicate' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
