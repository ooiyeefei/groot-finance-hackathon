/**
 * Expense Submissions API - Collection Routes
 * GET /api/v1/expense-submissions - List submissions
 * POST /api/v1/expense-submissions - Create new submission
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
    const status = searchParams.get('status') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    const cursor = searchParams.get('cursor') || undefined

    if (!businessId) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'businessId is required' } }, { status: 400 })
    }

    const submissions = await client.query(api.functions.expenseSubmissions.list, {
      businessId,
      status,
      limit,
      cursor,
    })

    return withCacheHeaders(NextResponse.json({ submissions, cursor: null, hasMore: false }), 'volatile')
  } catch (error) {
    console.error('[API] GET /expense-submissions error:', error)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list submissions' } }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { client, userId } = await getAuthenticatedConvex()
    if (!client || !userId) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
    }

    const body = await request.json()
    const { businessId, title } = body

    if (!businessId) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'businessId is required' } }, { status: 400 })
    }

    const submissionId = await client.mutation(api.functions.expenseSubmissions.create, {
      businessId,
      title,
    })

    return NextResponse.json({ id: submissionId, title: title || 'Auto-generated', status: 'draft' }, { status: 201 })
  } catch (error: any) {
    console.error('[API] POST /expense-submissions error:', error)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to create submission' } }, { status: 500 })
  }
}
