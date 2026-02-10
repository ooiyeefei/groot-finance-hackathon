/**
 * POST /api/v1/expense-submissions/[id]/claims - Add receipt to submission
 * Multipart form data: file upload + create claim with submissionId
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

    const { id: submissionId } = await params

    // Verify submission exists and is in draft status
    const submission = await client.query(api.functions.expenseSubmissions.getById, { id: submissionId })
    if (!submission) {
      return NextResponse.json({ error: { code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' } }, { status: 404 })
    }
    if (submission.submission.status !== 'draft') {
      return NextResponse.json({ error: { code: 'SUBMISSION_NOT_DRAFT', message: 'Can only add claims to draft submissions' } }, { status: 400 })
    }

    // Check max claims limit
    if (submission.claims.length >= 50) {
      return NextResponse.json({ error: { code: 'MAX_CLAIMS_EXCEEDED', message: 'Submission has reached 50-claim limit' } }, { status: 400 })
    }

    // For multipart uploads, forward to the existing expense-claims POST endpoint
    // The claim will be created with the submissionId
    // This route acts as an intermediary that validates the submission first
    const formData = await request.formData()
    const businessPurpose = (formData.get('businessPurpose') as string) || 'Pending extraction'

    // Create the claim linked to this submission
    const claimId = await client.mutation(api.functions.expenseClaims.create, {
      businessId: submission.submission.businessId as string,
      businessPurpose,
      submissionId: submissionId as any,
      status: 'uploading',
    })

    return NextResponse.json({
      claimId,
      status: 'uploading',
      submissionId,
    }, { status: 201 })
  } catch (error: any) {
    console.error('[API] POST /expense-submissions/[id]/claims error:', error)
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: error?.message || 'Failed to add claim' } }, { status: 500 })
  }
}
