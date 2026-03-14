/**
 * GET /api/v1/expense-submissions/pending-approvals - List submissions awaiting current manager's approval
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { withCacheHeaders } from '@/lib/cache/cache-headers'

export async function GET(request: NextRequest) {
  try {
    const { client, userId } = await getAuthenticatedConvex()
    if (!client || !userId) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'businessId is required' } }, { status: 400 })
    }

    const submissions = await client.query(api.functions.expenseSubmissions.getPendingApprovals, {
      businessId,
    })

    return withCacheHeaders(NextResponse.json({ submissions }), 'volatile')
  } catch (error) {
    console.error('[API] GET /expense-submissions/pending-approvals error:', error)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list pending approvals' } }, { status: 500 })
  }
}
