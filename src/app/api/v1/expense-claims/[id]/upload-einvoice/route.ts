/**
 * Upload E-Invoice Manually (019-lhdn-einv-flow-2)
 *
 * POST /api/v1/expense-claims/[id]/upload-einvoice
 * Accepts multipart/form-data with e-invoice file (PDF, PNG, JPG, max 10MB).
 * Uploads to S3 under expense_claims/{bizId}/{userId}/{claimId}/einvoice/
 * and updates Convex with the storage path.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import { api } from '@/convex/_generated/api'
import { uploadFile } from '@/lib/aws-s3'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { client, userId } = await getAuthenticatedConvex()

    if (!client || !userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: expenseClaimId } = await params

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Invalid file type: ${file.type}. Allowed: PDF, PNG, JPG` },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 10MB` },
        { status: 400 }
      )
    }

    console.log(`[Upload E-Invoice API] Uploading ${file.name} (${file.type}, ${file.size} bytes) for claim ${expenseClaimId}`)

    // Step 1: Get claim details for S3 path construction
    const claim = await client.query(api.functions.expenseClaims.getById, {
      id: expenseClaimId,
    })

    if (!claim) {
      return NextResponse.json(
        { success: false, error: 'Expense claim not found' },
        { status: 404 }
      )
    }

    // Step 2: Upload to S3 under einvoice/ folder
    // Path: expense_claims/{bizId}/{userId}/{claimId}/einvoice/{filename}
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const sanitizedFilename = `einvoice-manual.${ext}`
    const s3Path = `${claim.businessId}/${claim.userId}/${claim._id}/einvoice/${sanitizedFilename}`

    const uploadResult = await uploadFile('expense_claims', s3Path, file, file.type, {
      source: 'manual_upload',
      claimId: expenseClaimId,
    })

    if (!uploadResult.success) {
      throw new Error(`S3 upload failed: ${uploadResult.error}`)
    }

    console.log(`[Upload E-Invoice API] Uploaded to S3: ${s3Path}`)

    // Step 3: Update Convex with S3 storage path
    await client.mutation(api.functions.expenseClaims.markEinvoiceManualUpload, {
      claimId: expenseClaimId,
      storagePath: s3Path,
    })

    console.log('[Upload E-Invoice API] Upload complete:', { expenseClaimId, s3Path })

    return NextResponse.json({
      success: true,
      data: {
        storagePath: s3Path,
        message: 'E-invoice uploaded successfully',
      }
    })

  } catch (error) {
    console.error('[Upload E-Invoice API] Error:', error)

    if (error instanceof Error) {
      if (error.message.includes('Not authenticated')) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        )
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 404 }
        )
      }
      if (error.message.includes('already attached')) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 409 }
        )
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload e-invoice'
      },
      { status: 500 }
    )
  }
}
