/**
 * Expense Claims Resubmit API Route
 * POST /api/v1/expense-claims/{id}/resubmit
 *
 * Allows users to resubmit rejected expense claims with optional corrections.
 * Creates a new draft claim linked to the original rejected claim.
 */

import { auth } from '@/lib/demo-server-auth'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import { apiCache } from '@/lib/cache/api-cache'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ResubmitRequest {
  vendorName?: string
  totalAmount?: number
  transactionDate?: string
  currency?: string
  businessPurpose?: string
  description?: string
  expenseCategory?: string
  referenceNumber?: string
}

/**
 * POST /api/v1/expense-claims/{id}/resubmit
 * Resubmit a rejected expense claim with optional corrections
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Validate ID format (Convex ID)
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing expense claim ID' },
        { status: 400 }
      )
    }

    // Parse request body for optional updates
    let updatedData: ResubmitRequest | undefined
    try {
      const body = await request.json()
      if (body && Object.keys(body).length > 0) {
        updatedData = body
      }
    } catch {
      // Empty body is fine - we'll use original claim data
    }

    // Get Convex client
    const { client: convexClient } = await getAuthenticatedConvex()
    if (!convexClient) {
      return NextResponse.json(
        { success: false, error: 'Failed to connect to database' },
        { status: 500 }
      )
    }

    // First verify the user owns this claim
    const existingClaim = await convexClient.query(api.functions.expenseClaims.getById, {
      id
    })

    if (!existingClaim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    // Call the resubmit mutation
    const result = await convexClient.mutation(api.functions.expenseClaims.resubmitRejectedClaim, {
      claimId: id as Id<"expense_claims">,
      updatedData: updatedData ? {
        vendorName: updatedData.vendorName,
        totalAmount: updatedData.totalAmount,
        transactionDate: updatedData.transactionDate,
        currency: updatedData.currency,
        businessPurpose: updatedData.businessPurpose,
        description: updatedData.description,
        expenseCategory: updatedData.expenseCategory,
        referenceNumber: updatedData.referenceNumber,
      } : undefined
    })

    // Invalidate expense claims cache after successful resubmission
    apiCache.invalidate(userId, 'expense-claims')

    return NextResponse.json({
      success: true,
      data: {
        newClaimId: result.newClaimId,
        originalClaimId: result.originalClaimId,
      },
      message: 'Expense claim resubmitted successfully. A new draft has been created.'
    })

  } catch (error) {
    console.error('[API v1] POST expense-claims resubmit error:', error)

    // Handle specific error messages
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    if (errorMessage === 'Only rejected claims can be resubmitted') {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 400 }
      )
    }

    if (errorMessage === 'You can only resubmit your own expense claims') {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 403 }
      )
    }

    if (errorMessage === 'Expense claim not found') {
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
