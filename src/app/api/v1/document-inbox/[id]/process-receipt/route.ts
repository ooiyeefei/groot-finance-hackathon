/**
 * Process Receipt from Document Inbox
 *
 * POST /api/v1/document-inbox/[id]/process-receipt
 *
 * After a document is classified as "receipt" via manuallyClassifyDocument,
 * call this endpoint to trigger OCR extraction via the document processor Lambda.
 * The file is already in S3 under expense_claims/ prefix (uploaded by the email Lambda).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { invokeDocumentProcessor } from '@/lib/lambda-invoker'
import { Id } from '@/convex/_generated/dataModel'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: inboxEntryId } = await params
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get inbox entry to find the destination claim
    const inboxEntry = await client.query(
      api.functions.documentInbox.getInboxDocument,
      { inboxEntryId: inboxEntryId as Id<"document_inbox_entries"> }
    )

    if (!inboxEntry?.document) {
      return NextResponse.json({ error: 'Inbox entry not found' }, { status: 404 })
    }

    const doc = inboxEntry.document

    // Verify it's been classified and routed
    if (doc.status !== "routed" || doc.destinationDomain !== "expense_claims" || !doc.destinationRecordId) {
      return NextResponse.json(
        { error: 'Document not classified as receipt or not yet routed' },
        { status: 400 }
      )
    }

    const claimId = String(doc.destinationRecordId)
    const storagePath = doc.s3ExpenseClaimsKey

    if (!storagePath) {
      return NextResponse.json(
        { error: 'No S3 expense claims key — file not available for processing' },
        { status: 400 }
      )
    }

    // Determine file type for Lambda
    const fileType = doc.mimeType === 'application/pdf' ? 'pdf' : 'image'

    console.log(`[DocInbox] Triggering OCR for claim ${claimId}, storagePath: ${storagePath}`)

    // Update claim status to processing
    await client.mutation(api.functions.expenseClaims.updateStatus, {
      id: claimId,
      status: "processing",
    })
    await client.mutation(api.functions.expenseClaims.update, {
      id: claimId as Id<"expense_claims">,
      processingMetadata: {
        status: 'analyzing',
        processing_timestamp: new Date().toISOString(),
        source: 'email_forward',
      },
    })

    // Trigger document processor Lambda (same flow as manual upload)
    const lambdaResult = await invokeDocumentProcessor({
      documentId: claimId,
      domain: 'expense_claims',
      storagePath,
      fileType: fileType as 'pdf' | 'image',
      userId: String(doc.userId),
      businessId: String(doc.businessId),
      idempotencyKey: `email-fwd-${claimId}-${Date.now()}`,
      expectedDocumentType: 'receipt',
    })

    console.log(`[DocInbox] Lambda invoked: ${lambdaResult.executionId}`)

    // Update claim with Lambda execution info
    await client.mutation(api.functions.expenseClaims.update, {
      id: claimId as Id<"expense_claims">,
      processingMetadata: {
        status: 'analyzing',
        lambda_execution_id: lambdaResult.executionId,
        lambda_request_id: lambdaResult.requestId,
        processing_timestamp: new Date().toISOString(),
        processing_stage: 'lambda_invoked',
        source: 'email_forward',
      },
    })

    return NextResponse.json({
      success: true,
      claimId,
      executionId: lambdaResult.executionId,
    })
  } catch (error) {
    console.error('[DocInbox] process-receipt error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
