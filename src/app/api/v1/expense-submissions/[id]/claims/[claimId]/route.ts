/**
 * DELETE /api/v1/expense-submissions/[id]/claims/[claimId] - Remove claim from submission
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  try {
    const { client, userId } = await getAuthenticatedConvex()
    if (!client || !userId) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
    }

    const { id: submissionId, claimId } = await params

    const result = await client.mutation(api.functions.expenseSubmissions.removeClaim, {
      submissionId,
      claimId,
    })

    return NextResponse.json({
      removed: result.removed,
      remainingClaims: result.remainingClaims,
    })
  } catch (error: any) {
    console.error('[API] DELETE /expense-submissions/[id]/claims/[claimId] error:', error)
    const message = error?.message || 'Failed to remove claim'
    if (message.includes('draft')) {
      return NextResponse.json({ error: { code: 'SUBMISSION_NOT_DRAFT', message } }, { status: 400 })
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
