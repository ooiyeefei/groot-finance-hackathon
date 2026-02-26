/**
 * Resolve E-Invoice Match (019-lhdn-einv-flow-2)
 *
 * POST /api/v1/expense-claims/[id]/resolve-match
 * Accept or reject an ambiguous e-invoice match (Tier 3 fuzzy).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: expenseClaimId } = await params
    const body = await request.json()

    const { receivedDocId, action } = body

    if (!receivedDocId || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: receivedDocId, action' },
        { status: 400 }
      )
    }

    if (action !== 'accept' && action !== 'reject') {
      return NextResponse.json(
        { success: false, error: 'Action must be "accept" or "reject"' },
        { status: 400 }
      )
    }

    console.log(`[Resolve Match API] ${action} match for claim ${expenseClaimId}, doc ${receivedDocId}`)

    const result = await client.mutation(api.functions.expenseClaims.resolveEinvoiceMatch, {
      claimId: expenseClaimId,
      receivedDocId,
      action,
    })

    return NextResponse.json({
      success: true,
      data: result,
    })

  } catch (error) {
    console.error('[Resolve Match API] Error:', error)

    if (error instanceof Error) {
      if (error.message.includes('Not authenticated')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        )
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resolve match'
      },
      { status: 500 }
    )
  }
}
