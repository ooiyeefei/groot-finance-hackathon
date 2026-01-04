/**
 * Re-extract/reprocess expense claim API endpoint
 * Triggers Trigger.dev receipt extraction task on server-side
 *
 * MIGRATED: Database uses Convex, file storage uses AWS S3
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { tasks } from '@trigger.dev/sdk/v3'
import type { extractReceiptData } from '@/trigger/extract-receipt-data'
import { getPresignedDownloadUrl, URL_EXPIRY } from '@/lib/aws-s3'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get authenticated Convex client
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: expenseClaimId } = await params
    console.log('[Reprocess API] Starting reprocess for claim:', expenseClaimId)

    // Get expense claim from Convex - handles auth and access control internally
    const claim = await client.query(api.functions.expenseClaims.getById, {
      id: expenseClaimId,
    })

    if (!claim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Check if claim has receipt to reprocess
    if (!claim.storagePath) {
      return NextResponse.json(
        { success: false, error: 'No receipt available for reprocessing' },
        { status: 400 }
      )
    }

    // Create signed URL for the receipt (AWS S3)
    let signedUrl: string
    try {
      signedUrl = await getPresignedDownloadUrl(
        'expense_claims',
        claim.storagePath,
        URL_EXPIRY.shortLived // 10 minutes
      )
      console.log('[Reprocess API] Generated S3 signed URL for reprocessing')
    } catch (urlError) {
      console.error('[Reprocess API] Failed to create signed URL:', urlError)
      return NextResponse.json(
        { success: false, error: 'Failed to generate secure access to receipt' },
        { status: 500 }
      )
    }

    // Update status to 'processing' using Convex mutation
    // This also sets processingStartedAt automatically
    try {
      await client.mutation(api.functions.expenseClaims.updateStatus, {
        id: expenseClaimId,
        status: 'processing',
      })
      console.log('[Reprocess API] Status updated to processing')
    } catch (statusError) {
      console.error('[Reprocess API] Failed to update status:', statusError)
      // Continue anyway - status will be set by Trigger.dev job
    }

    // Get user's Convex ID for the Trigger.dev task
    // The task needs this for database operations
    const user = await client.query(api.functions.users.getByClerkId, {
      clerkUserId: userId,
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Trigger the receipt extraction task
    // Uses the same task as the upload workflow
    const triggerResult = await tasks.trigger<typeof extractReceiptData>(
      "extract-receipt-data",
      {
        expenseClaimId: expenseClaimId,
        documentId: undefined, // No separate document ID for direct expense claims
        userId: user._id, // Pass Convex user ID for consistency
        documentDomain: 'expense_claims',
        receiptImageUrl: signedUrl
      }
    )

    console.log('[Reprocess API] Trigger.dev job started:', {
      taskId: triggerResult.id,
      expenseClaimId
    })

    return NextResponse.json({
      success: true,
      data: {
        task_id: triggerResult.id,
        message: 'AI reprocessing started successfully'
      }
    })

  } catch (error) {
    console.error('[Reprocess API] Error:', error)

    // Handle specific Convex errors
    if (error instanceof Error) {
      if (error.message.includes('Not authenticated')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        )
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { success: false, error: 'Expense claim not found' },
          { status: 404 }
        )
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reprocess expense claim'
      },
      { status: 500 }
    )
  }
}
