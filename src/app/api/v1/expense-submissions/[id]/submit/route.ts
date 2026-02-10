/**
 * POST /api/v1/expense-submissions/[id]/submit - Submit for manager approval
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

    const result = await client.mutation(api.functions.expenseSubmissions.submit, { id })

    return NextResponse.json({
      id: result.submissionId,
      status: result.status,
      submittedAt: Date.now(),
      designatedApproverId: result.designatedApproverId,
    })
  } catch (error: any) {
    console.error('[API] POST /expense-submissions/[id]/submit error:', error)
    const message = error?.message || 'Failed to submit'
    if (message.includes('no claims')) {
      return NextResponse.json({ error: { code: 'SUBMISSION_EMPTY', message } }, { status: 400 })
    }
    if (message.includes('still being processed')) {
      return NextResponse.json({ error: { code: 'CLAIMS_STILL_PROCESSING', message } }, { status: 400 })
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
