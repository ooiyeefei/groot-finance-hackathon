/**
 * POST /api/v1/expense-submissions/[id]/approve - Approve entire submission (manager)
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
    const body = await request.json().catch(() => ({}))

    const result = await client.mutation(api.functions.expenseSubmissions.approve, {
      id,
      notes: body.notes,
    })

    return NextResponse.json({
      id: result.submissionId,
      status: result.status,
      approvedAt: Date.now(),
      accountingEntriesCreated: result.accountingEntriesCreated,
    })
  } catch (error: any) {
    console.error('[API] POST /expense-submissions/[id]/approve error:', error)
    const message = error?.message || 'Failed to approve'
    if (message.includes('designated approver')) {
      return NextResponse.json({ error: { code: 'NOT_DESIGNATED_APPROVER', message } }, { status: 403 })
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
