/**
 * POST /api/v1/expense-submissions/[id]/reject - Reject entire submission (manager)
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
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    if (!body.reason) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Rejection reason is required' } }, { status: 400 })
    }

    const result = await client.mutation(api.functions.expenseSubmissions.reject, {
      id,
      reason: body.reason,
      claimNotes: body.claimNotes,
    })

    return NextResponse.json({
      id: result.submissionId,
      status: result.status,
      rejectedAt: result.rejectedAt,
    })
  } catch (error: any) {
    console.error('[API] POST /expense-submissions/[id]/reject error:', error)
    const message = error?.message || 'Failed to reject'
    if (message.includes('designated approver')) {
      return NextResponse.json({ error: { code: 'NOT_DESIGNATED_APPROVER', message } }, { status: 403 })
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
