/**
 * Check Duplicates API Route
 * Feature: 007-duplicate-expense-detection (FR-002)
 *
 * POST /api/v1/expense-claims/check-duplicates
 *
 * Pre-submission duplicate check endpoint that:
 * 1. Authenticates the user via Clerk
 * 2. Gets the user's business context from Convex
 * 3. Fetches candidate expense claims from Convex
 * 4. Runs the duplicate detection algorithm
 * 5. Returns matches with confidence scores
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { checkForDuplicates } from '@/domains/expense-claims/lib/duplicate-detection'
import type { Id } from '@/convex/_generated/dataModel'
import type { CheckDuplicatesRequest } from '@/domains/expense-claims/types/duplicate-detection'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user via Clerk
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Get authenticated Convex client
    const { client } = await getAuthenticatedConvex()
    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Failed to authenticate with Convex' },
        { status: 401 }
      )
    }

    // 3. Parse and validate request body
    let body: CheckDuplicatesRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.vendorName || typeof body.vendorName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'vendorName is required and must be a string' },
        { status: 400 }
      )
    }

    if (!body.transactionDate || typeof body.transactionDate !== 'string') {
      return NextResponse.json(
        { success: false, error: 'transactionDate is required and must be a string (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    if (typeof body.totalAmount !== 'number' || isNaN(body.totalAmount)) {
      return NextResponse.json(
        { success: false, error: 'totalAmount is required and must be a number' },
        { status: 400 }
      )
    }

    if (!body.currency || typeof body.currency !== 'string') {
      return NextResponse.json(
        { success: false, error: 'currency is required and must be a string' },
        { status: 400 }
      )
    }

    // 4. Get user's business context from Convex
    const user = await client.query(api.functions.users.getByClerkId, {
      clerkUserId,
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    if (!user.businessId) {
      return NextResponse.json(
        { success: false, error: 'No business context found. Please join or create a business first.' },
        { status: 400 }
      )
    }

    console.log(`[Check Duplicates API] Checking for user ${user._id} in business ${user.businessId}`)

    // 5. Fetch candidate expense claims from Convex
    const candidates = await client.query(api.functions.expenseClaims.checkDuplicates, {
      businessId: user.businessId as Id<'businesses'>,
      userId: user._id as Id<'users'>,
      referenceNumber: body.referenceNumber || undefined,
      vendorName: body.vendorName,
      transactionDate: body.transactionDate,
      totalAmount: body.totalAmount,
      currency: body.currency,
    })

    console.log(`[Check Duplicates API] Found ${candidates.length} candidates to check`)

    // 6. Map Convex candidates to the expected interface (undefined -> null)
    const mappedCandidates = candidates.map((c) => ({
      _id: c._id as string,
      userId: c.userId as string,
      vendorName: c.vendorName ?? null,
      transactionDate: c.transactionDate ?? null,
      totalAmount: c.totalAmount ?? null,
      currency: c.currency ?? null,
      referenceNumber: c.referenceNumber ?? null,
      status: c.status,
      _creationTime: c._creationTime,
      submittedByName: c.submittedByName,
    }))

    // 7. Run the duplicate detection algorithm
    const result = checkForDuplicates({
      currentUserId: user._id,
      referenceNumber: body.referenceNumber,
      vendorName: body.vendorName,
      transactionDate: body.transactionDate,
      totalAmount: body.totalAmount,
      currency: body.currency,
      existingClaims: mappedCandidates,
    })

    console.log(`[Check Duplicates API] Detection result: hasDuplicates=${result.hasDuplicates}, matches=${result.matches.length}, highestTier=${result.highestTier}`)

    // 8. Return results
    return NextResponse.json({
      success: true,
      data: {
        hasDuplicates: result.hasDuplicates,
        matches: result.matches,
        highestTier: result.highestTier,
      },
    })

  } catch (error) {
    console.error('[Check Duplicates API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
