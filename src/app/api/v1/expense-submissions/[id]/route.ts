/**
 * Expense Submissions API - Single Resource Routes
 * GET /api/v1/expense-submissions/[id] - Get submission detail
 * PUT /api/v1/expense-submissions/[id] - Update submission metadata
 * DELETE /api/v1/expense-submissions/[id] - Soft-delete submission
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { client, userId } = await getAuthenticatedConvex()
    if (!client || !userId) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
    }

    const { id } = await params

    const result = await client.query(api.functions.expenseSubmissions.getById, { id })

    if (!result) {
      return NextResponse.json({ error: { code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' } }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[API] GET /expense-submissions/[id] error:', error)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get submission' } }, { status: 500 })
  }
}

export async function PUT(
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

    await client.mutation(api.functions.expenseSubmissions.update, {
      id,
      title: body.title,
      description: body.description,
    })

    return NextResponse.json({ id, title: body.title, status: 'draft' })
  } catch (error: any) {
    console.error('[API] PUT /expense-submissions/[id] error:', error)
    const message = error?.message || 'Failed to update submission'
    if (message.includes('draft')) {
      return NextResponse.json({ error: { code: 'SUBMISSION_NOT_DRAFT', message } }, { status: 400 })
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { client, userId } = await getAuthenticatedConvex()
    if (!client || !userId) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, { status: 401 })
    }

    const { id } = await params

    await client.mutation(api.functions.expenseSubmissions.softDelete, { id })

    return NextResponse.json({ deleted: true })
  } catch (error: any) {
    console.error('[API] DELETE /expense-submissions/[id] error:', error)
    const message = error?.message || 'Failed to delete submission'
    if (message.includes('draft')) {
      return NextResponse.json({ error: { code: 'SUBMISSION_NOT_DRAFT', message } }, { status: 400 })
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message } }, { status: 500 })
  }
}
