/**
 * Expense Claim Processing API Endpoint - Unified Route
 * This endpoint handles both initial processing and reprocessing of expense claims.
 *
 * Flow (following document processing pattern):
 * 1. Fetch and validate expense claim ownership
 * 2. Auto-detect current status and clear previous data if reprocessing
 * 3. Update expense claim status to 'processing' for immediate UI feedback
 * 4. Trigger expense-specific background processing via Trigger.dev
 * 5. Return immediate 202 Accepted response
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabaseClient } from '@/lib/supabase-server'
import { ensureEmployeeProfile } from '@/lib/ensure-employee-profile'
import { tasks } from '@trigger.dev/sdk/v3'
import type { dspyReceiptExtraction } from '@/trigger/dspy-receipt-extraction'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Step 1: Perform authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const expenseClaimId = resolvedParams.id
    if (!expenseClaimId) {
      return NextResponse.json(
        { success: false, error: 'Expense claim ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Expense-Processor] Starting processing for expense claim ${expenseClaimId}`)
    const supabase = createServiceSupabaseClient()

    // Get employee profile to convert Clerk userId to employee UUID
    const employeeProfile = await ensureEmployeeProfile(userId)
    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to get employee profile' },
        { status: 500 }
      )
    }

    // Step 2: Find and validate the expense claim
    const { data: expenseClaim, error: fetchError } = await supabase
      .from('expense_claims')
      .select('*')
      .eq('id', expenseClaimId)
      .eq('employee_id', employeeProfile.id)
      .single()

    if (fetchError || !expenseClaim) {
      console.error(`[Expense-Processor] Expense claim not found: ${fetchError?.message}`)
      return NextResponse.json(
        { success: false, error: 'Expense claim not found or access denied' },
        { status: 404 }
      )
    }

    // Step 2b: Fetch linked document if document_id exists
    let linkedDocument = null
    if (expenseClaim.document_id) {
      console.log(`[Expense-Processor] Fetching linked document: ${expenseClaim.document_id}`)
      const { data: documentData, error: documentError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', expenseClaim.document_id)
        .single()

      if (!documentError && documentData) {
        linkedDocument = documentData
        console.log(`[Expense-Processor] Successfully fetched linked document`)
      } else {
        console.log(`[Expense-Processor] Could not fetch linked document: ${documentError?.message}`)
      }
    }

    // Check if already processing
    if (expenseClaim.processing_status === 'processing') {
      return NextResponse.json(
        { success: false, error: 'Expense claim is already being processed' },
        { status: 409 }
      )
    }

    // Step 3: Auto-detect status and prepare update data (following document pattern)
    console.log(`[Expense-Processor] Current status: ${expenseClaim.processing_status}`)
    const updateData: Record<string, unknown> = {
      processing_status: 'processing',
      processing_started_at: new Date().toISOString(),
      error_message: null,
      failed_at: null
    }

    // If reprocessing completed/failed claims, clear previous results
    if (['completed', 'failed'].includes(expenseClaim.processing_status)) {
      updateData.confidence_score = null
      updateData.processed_at = null
      console.log('[Expense-Processor] Clearing previous results for reprocessing')
    }

    // Step 4: Update status to processing
    const { error: updateError } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', expenseClaimId)
      .eq('employee_id', employeeProfile.id)

    if (updateError) {
      console.error('[Expense-Processor] Failed to update status:', updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to update expense claim status' },
        { status: 500 }
      )
    }

    // Step 5: Trigger expense-specific processing via Trigger.dev
    console.log(`[Expense-Processor] Triggering expense processing for claim ${expenseClaimId}`)
    console.log(`[Expense-Processor] DEBUG - linkedDocument:`, linkedDocument ? 'exists' : 'null')
    console.log(`[Expense-Processor] DEBUG - business_purpose_details:`, JSON.stringify(expenseClaim.business_purpose_details, null, 2))

    try {
      // Check if expense claim has a linked document (primary method for reprocessing)
      if (linkedDocument && linkedDocument.storage_path) {
        const document = linkedDocument
        console.log(`[Expense-Processor] Found linked document: ${document.id}`)
        console.log(`[Expense-Processor] Document storage path: ${document.storage_path}`)

        // Determine the best image path for processing
        let imagePath: string
        let resolvedFileName: string

        // Check if document has been converted to pages (multi-page PDF)
        const pageMetadata = document.document_metadata?.pages
        if (pageMetadata && Array.isArray(pageMetadata) && pageMetadata.length > 0) {
          // Use the first page for processing (most receipts are single page)
          imagePath = pageMetadata[0].path
          resolvedFileName = `page_1.png`
          console.log(`[Expense-Processor] Using first page of multi-page document: ${imagePath}`)
        } else {
          // For single files, storage_path now points to converted folder or raw file
          // Check if storage_path is a folder (ends without file extension) or a file
          if (document.storage_path.includes('.')) {
            // Direct file path (legacy or single image)
            imagePath = document.storage_path
            resolvedFileName = document.file_name || 'receipt.jpg'
          } else {
            // Folder path (new documentId-based converted folder)
            // Look for the first available image file in the folder
            imagePath = `${document.storage_path}/page_1.png`  // Default to first page
            resolvedFileName = 'page_1.png'
            console.log(`[Expense-Processor] Converted folder detected, using: ${imagePath}`)
          }
        }

        console.log(`[Expense-Processor] Using image path: ${imagePath}`)
        console.log(`[Expense-Processor] Downloading and preparing image for DSPy extraction`)

        // Download the image from Supabase storage and convert to base64
        const { data: urlData, error: urlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(imagePath, 600)

        if (urlError || !urlData) {
          throw new Error(`Failed to create signed URL for file: ${urlError?.message}`)
        }

        const imageResponse = await fetch(urlData.signedUrl)
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status}`)
        }

        const imageBuffer = await imageResponse.arrayBuffer()
        const base64Image = Buffer.from(imageBuffer).toString('base64')
        const mimeType = document.file_type || 'image/jpeg'
        const fileName = resolvedFileName

        console.log(`[Expense-Processor] Image prepared: ${Math.round(imageBuffer.byteLength / 1024)}KB, type: ${mimeType}`)
        console.log(`[Expense-Processor] Triggering DSPy extraction for receipt reprocessing`)

        // Trigger DSPy extraction with properly formatted image data
        await tasks.trigger<typeof dspyReceiptExtraction>("dspy-receipt-extraction", {
          receiptImageData: {
            base64: base64Image,
            mimeType: mimeType,
            filename: fileName
          },
          documentId: document.id, // Include document ID for proper tracking
          expenseClaimId: expenseClaimId,
          userId: userId,
          requestId: `expense-reprocess-${expenseClaimId}-${Date.now()}`
        })
        console.log(`[Expense-Processor] Successfully triggered DSPy extraction for claim ${expenseClaimId}`)

      } else if (expenseClaim.business_purpose_details?.file_upload?.file_path) {
        // Fallback: Check if expense claim has file upload info in business_purpose_details
        const filePath = expenseClaim.business_purpose_details.file_upload.file_path
        console.log(`[Expense-Processor] Found file path in business_purpose_details: ${filePath}`)
        console.log(`[Expense-Processor] Downloading and preparing image for DSPy extraction`)

        // Download the image from Supabase storage and convert to base64
        const { data: urlData, error: urlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(filePath, 600)

        if (urlError || !urlData) {
          throw new Error(`Failed to create signed URL for file: ${urlError?.message}`)
        }

        const imageResponse = await fetch(urlData.signedUrl)
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.status}`)
        }

        const imageBuffer = await imageResponse.arrayBuffer()
        const base64Image = Buffer.from(imageBuffer).toString('base64')
        const mimeType = expenseClaim.business_purpose_details.file_upload.file_type || 'image/jpeg'
        const fileName = expenseClaim.business_purpose_details.file_upload.file_name || 'receipt.jpg'

        console.log(`[Expense-Processor] Image prepared: ${Math.round(imageBuffer.byteLength / 1024)}KB, type: ${mimeType}`)
        console.log(`[Expense-Processor] Triggering DSPy extraction for receipt processing`)

        // Trigger DSPy extraction with properly formatted image data
        await tasks.trigger<typeof dspyReceiptExtraction>("dspy-receipt-extraction", {
          receiptImageData: {
            base64: base64Image,
            mimeType: mimeType,
            filename: fileName
          },
          expenseClaimId: expenseClaimId,
          userId: userId,
          requestId: `expense-reprocess-${expenseClaimId}-${Date.now()}`
        })
        console.log(`[Expense-Processor] Successfully triggered DSPy extraction for claim ${expenseClaimId}`)

      } else {
        // Manual entry - mark as processed without DSPy extraction
        console.log(`[Expense-Processor] Manual entry claim - no file to process`)
        console.log(`[Expense-Processor] True manual entry - triggering manual review processing`)

        // Even for manual entries, don't immediately mark as completed when explicitly reprocessing
        // Instead, trigger a minimal processing job to validate the data
        await tasks.trigger<typeof dspyReceiptExtraction>("dspy-receipt-extraction", {
          receiptText: expenseClaim.description || "Manual entry for review",
          expenseClaimId: expenseClaimId,
          userId: userId,
          requestId: `manual-reprocess-${expenseClaimId}-${Date.now()}`,
          forcedProcessingMethod: 'simple' // Use simple processing for manual entries
        })
        console.log(`[Expense-Processor] Successfully triggered manual entry reprocessing for ${expenseClaimId}`)
      }

    } catch (triggerError) {
      console.error('[Expense-Processor] Failed to trigger processing:', triggerError)

      // Update expense claim status to failed
      await supabase
        .from('expense_claims')
        .update({
          processing_status: 'failed',
          error_message: 'Failed to start background processing',
          failed_at: new Date().toISOString()
        })
        .eq('id', expenseClaimId)

      return NextResponse.json(
        { success: false, error: 'Failed to start background processing' },
        { status: 500 }
      )
    }

    // Step 6: Return immediate 202 Accepted response
    console.log(`[Expense-Processor] Expense claim ${expenseClaimId} processing started successfully`)

    return NextResponse.json({
      success: true,
      data: {
        expenseClaimId: expenseClaimId,
        status: 'processing',
        message: 'Expense claim processing started successfully',
        processingType: (expenseClaim.document?.storage_path || expenseClaim.business_purpose_details?.file_upload?.file_path) ? 'DSPy receipt extraction queued' : 'Manual entry processed',
        processingStarted: new Date().toISOString(),
        method: 'trigger.dev'
      }
    }, { status: 202 }) // 202 Accepted for async processing

  } catch (error) {
    console.error('[Expense-Processor] Unexpected error:', error)

    // Try to update expense claim status to failed if we have the ID
    try {
      const resolvedParams = await params
      const expenseClaimId = resolvedParams.id
      if (expenseClaimId) {
        const { userId } = await auth()
        if (userId) {
          const employeeProfile = await ensureEmployeeProfile(userId)
          if (employeeProfile) {
            const supabase = createServiceSupabaseClient()
            await supabase
              .from('expense_claims')
              .update({
                processing_status: 'failed',
                error_message: 'Unexpected processing error',
                failed_at: new Date().toISOString()
              })
              .eq('id', expenseClaimId)
              .eq('employee_id', employeeProfile.id)
          }
        }
      }
    } catch (updateError) {
      console.error('[Expense-Processor] Failed to update error status:', updateError)
    }

    return NextResponse.json(
      { success: false, error: 'Processing failed due to internal error' },
      { status: 500 }
    )
  }
}