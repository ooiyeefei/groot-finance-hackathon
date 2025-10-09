/**
 * Unified Expense Claims Upload API
 * Handles both new uploads and retry/replace scenarios with improved flow:
 * 1. Create expense record FIRST (for better error tracking)
 * 2. Upload file to storage SECOND
 * 3. Update record with storage_path
 * Supports retry/replace via optional expense_claim_id parameter
 */

import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedSupabaseClient, getUserData } from '@/lib/supabase-server'
import { ensureUserProfile } from '@/lib/ensure-employee-profile'
import { StoragePathBuilder, generateUniqueFilename, type DocumentType } from '@/lib/storage-paths'
import { tasks } from '@trigger.dev/sdk/v3'
import type { extractReceiptData } from '@/trigger/extract-receipt-data'

// Supported file types and size limits
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse FormData
    const formData = await request.formData()
    const file = formData.get('file') as File
    const processingMode = formData.get('processing_mode') as string // 'ai' | 'manual'
    const filePath = formData.get('filePath') as string
    const expenseClaimId = formData.get('expense_claim_id') as string // Optional - for retry/replace

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!processingMode || !['ai', 'manual'].includes(processingMode)) {
      return NextResponse.json(
        { success: false, error: 'Invalid processing_mode. Must be "ai" or "manual"' },
        { status: 400 }
      )
    }

    // Validate file type and size
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type. Please upload JPEG, PNG, WebP, or PDF files.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    const isRetryUpload = !!expenseClaimId
    console.log(`[Unified Upload] Processing ${processingMode} mode ${isRetryUpload ? 'retry/replace' : 'new'} upload for user ${userId}${isRetryUpload ? ` (claim: ${expenseClaimId})` : ''}`)

    // Get user data and ensure profile
    const userData = await getUserData(userId)
    const employeeProfile = await ensureUserProfile(userId)

    if (!employeeProfile) {
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve employee profile' },
        { status: 500 }
      )
    }

    const supabase = await createAuthenticatedSupabaseClient(userId)

    let expenseClaim: any
    let documentId: string
    let standardizedFilePath: string

    if (isRetryUpload) {
      // RETRY/REPLACE CASE: Verify existing record and update it
      console.log(`[Unified Upload] Retry/replace mode - validating existing claim: ${expenseClaimId}`)

      // Verify existing record exists and user has access
      const { data: existingClaim, error: fetchError } = await supabase
        .from('expense_claims')
        .select('*')
        .eq('id', expenseClaimId)
        .eq('user_id', employeeProfile.user_id) // Ensure user owns this record
        .single()

      if (fetchError || !existingClaim) {
        return NextResponse.json(
          { success: false, error: 'Expense claim not found or access denied' },
          { status: 404 }
        )
      }

      // Only allow retry/replace for draft claims
      if (existingClaim.status !== 'draft') {
        return NextResponse.json(
          { success: false, error: 'Cannot replace files for submitted expense claims' },
          { status: 400 }
        )
      }

      expenseClaim = existingClaim
      documentId = existingClaim.processing_metadata?.document_id || crypto.randomUUID()

      // Generate standardized file path for replacement using StoragePathBuilder
      if (filePath) {
        standardizedFilePath = filePath
      } else {
        const storageBuilder = new StoragePathBuilder(
          employeeProfile.business_id,
          employeeProfile.user_id,
          undefined,
          expenseClaim.id
        )
        const uniqueFilename = generateUniqueFilename(file.name)
        standardizedFilePath = storageBuilder.forDocument('expense_receipts' as DocumentType).raw(uniqueFilename)
      }

      console.log(`[Unified Upload] Replacing file for existing claim: ${expenseClaim.id}`)

    } else {
      // NEW UPLOAD CASE: Create record FIRST, then upload
      console.log(`[Unified Upload] New upload mode - creating expense record first`)

      documentId = crypto.randomUUID()

      // Set standardized path - will be updated after claim creation if needed
      if (filePath) {
        standardizedFilePath = filePath
      } else {
        // Temporary path - will be updated with proper expense claim ID after creation
        standardizedFilePath = '' // Will be set after claim creation
      }

      // Fetch business categories to get first active one as default
      let defaultExpenseCategory = 'other_business'; // Ultimate fallback
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('custom_expense_categories')
        .eq('id', employeeProfile.business_id)
        .single()

      if (!businessError && business?.custom_expense_categories) {
        const activeCategories = business.custom_expense_categories.filter((cat: any) =>
          cat && cat.category_name && cat.is_active === true
        );
        if (activeCategories.length > 0) {
          defaultExpenseCategory = activeCategories[0].category_code;
          console.log(`[Unified Upload] Using first active business category as default: ${defaultExpenseCategory} (${activeCategories[0].category_name})`);
        } else {
          console.log(`[Unified Upload] No active categories found, using fallback: ${defaultExpenseCategory}`);
        }
      }

      // Create expense claim record FIRST (improved flow)
      const expenseClaimData = {
        user_id: employeeProfile.user_id,
        business_id: employeeProfile.business_id,
        status: 'draft' as const, // Use valid draft status
        business_purpose: '', // Will be filled by user later
        expense_category: defaultExpenseCategory, // Use first active category from business
        claim_month: new Date().toISOString().slice(0, 7) + '-01', // YYYY-MM-01 format
        current_approver_id: null,
        storage_path: null, // Will be set after successful upload
        processing_metadata: {
          document_id: documentId,
          processing_method: processingMode,
          upload_attempt_timestamp: new Date().toISOString(),
          original_filename: file.name,
          file_size: file.size,
          file_type: file.type,
          processing_status: 'upload_pending'
        }
      }

      const { data: newClaim, error: claimError } = await supabase
        .from('expense_claims')
        .insert(expenseClaimData)
        .select()
        .single()

      if (claimError) {
        console.error('[Unified Upload] Failed to create expense claim:', claimError)
        return NextResponse.json(
          { success: false, error: 'Failed to create expense claim record' },
          { status: 500 }
        )
      }

      expenseClaim = newClaim
      console.log(`[Unified Upload] Created expense claim record: ${expenseClaim.id}`)

      // Now generate the proper standardized path using the expense claim ID
      if (!filePath) {
        const storageBuilder = new StoragePathBuilder(
          employeeProfile.business_id,
          employeeProfile.user_id,
          undefined,
          expenseClaim.id
        )
        const uniqueFilename = generateUniqueFilename(file.name)
        standardizedFilePath = storageBuilder.forDocument('expense_receipts' as DocumentType).raw(uniqueFilename)
        console.log(`[Unified Upload] Generated standardized path: ${standardizedFilePath}`)
      }
    }

    // Ensure standardizedFilePath is set before upload
    if (!standardizedFilePath) {
      throw new Error('Storage path not properly initialized')
    }

    // Upload file to Supabase Storage (for both new and retry cases)
    console.log(`[Unified Upload] Uploading file to storage: ${standardizedFilePath}`)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('expense_claims')
      .upload(standardizedFilePath, file, {
        cacheControl: '3600',
        upsert: isRetryUpload // Allow overwrite for retry/replace cases
      })

    if (uploadError) {
      console.error('[Unified Upload] Storage upload failed:', uploadError)

      // Update record with failure status instead of deleting
      await supabase
        .from('expense_claims')
        .update({
          processing_metadata: {
            ...expenseClaim.processing_metadata,
            processing_status: 'upload_failed',
            error_message: uploadError.message,
            error_timestamp: new Date().toISOString()
          }
        })
        .eq('id', expenseClaim.id)

      return NextResponse.json(
        { success: false, error: 'Failed to upload file to storage' },
        { status: 500 }
      )
    }

    // Update expense claim with successful upload
    console.log(`[Unified Upload] File uploaded successfully, updating record: ${expenseClaim.id}`)
    const { error: updateError } = await supabase
      .from('expense_claims')
      .update({
        status: 'draft', // Ready for user to fill details
        storage_path: standardizedFilePath,
        processing_metadata: {
          ...expenseClaim.processing_metadata,
          storage_path: standardizedFilePath,
          upload_timestamp: new Date().toISOString(),
          processing_status: processingMode === 'ai' ? 'pending' : 'completed'
        }
      })
      .eq('id', expenseClaim.id)

    if (updateError) {
      console.error('[Unified Upload] Failed to update expense claim with storage path:', updateError)
      // Clean up uploaded file
      await supabase.storage.from('expense_claims').remove([standardizedFilePath])
      return NextResponse.json(
        { success: false, error: 'Failed to update expense claim record' },
        { status: 500 }
      )
    }

    console.log(`[Unified Upload] Successfully updated expense claim: ${expenseClaim.id}`)

    // For AI mode, trigger DSPy processing
    let triggerResult = null
    if (processingMode === 'ai') {
      try {
        console.log(`[Unified Upload] Triggering DSPy processing for claim: ${expenseClaim.id}`)

        // Create signed URL for secure access (following pattern from other extract tasks)
        const { data: urlData, error: urlError } = await supabase.storage
          .from('expense_claims')
          .createSignedUrl(standardizedFilePath, 600) // 10 minutes

        if (urlError || !urlData) {
          throw new Error(`Failed to create signed URL: ${urlError?.message}`)
        }

        triggerResult = await tasks.trigger<typeof extractReceiptData>(
          "extract-receipt-data",
          {
            expenseClaimId: expenseClaim.id,
            documentId: documentId,
            userId: userData.id,
            documentDomain: 'expense_claims',
            receiptImageUrl: urlData.signedUrl // Use signed URL instead of public URL
          }
        )

        console.log('[Unified Upload] DSPy processing triggered:', triggerResult.id)

        // Update processing metadata with trigger ID
        await supabase
          .from('expense_claims')
          .update({
            processing_metadata: {
              ...expenseClaim.processing_metadata,
              trigger_job_id: triggerResult.id,
              trigger_timestamp: new Date().toISOString()
            }
          })
          .eq('id', expenseClaim.id)

      } catch (triggerError) {
        console.error('[Unified Upload] Failed to trigger DSPy processing:', triggerError)

        // Update status to failed but don't delete the record
        await supabase
          .from('expense_claims')
          .update({
            processing_metadata: {
              ...expenseClaim.processing_metadata,
              processing_status: 'failed',
              error_message: 'Failed to trigger background processing',
              error_timestamp: new Date().toISOString()
            }
          })
          .eq('id', expenseClaim.id)

        // Still return success - user can reprocess later
        console.log('[Unified Upload] Continuing with failed trigger status')
      }
    }

    // Log audit event
    await supabase
      .from('audit_events')
      .insert({
        business_id: employeeProfile.business_id,
        actor_user_id: userData.id,
        event_type: `expense_claim.${isRetryUpload ? 'replace' : 'upload'}_${processingMode}`,
        target_entity_type: 'expense_claim',
        target_entity_id: expenseClaim.id,
        details: {
          processing_mode: processingMode,
          filename: file.name,
          file_size: file.size,
          file_type: file.type,
          storage_path: standardizedFilePath,
          document_id: documentId,
          is_retry_upload: isRetryUpload,
          flow_type: 'record_first_upload_second'
        }
      })

    // Return success response
    const responseData: {
      expense_claim: any
      expense_claim_id: string
      document_id: string
      storage_path: string
      processing_mode: string
      processing_complete: boolean
      message: string
      task_id?: string
    } = {
      expense_claim: expenseClaim,
      expense_claim_id: expenseClaim.id, // For compatibility with DSPy processing step
      document_id: documentId,
      storage_path: standardizedFilePath,
      processing_mode: processingMode,
      processing_complete: processingMode === 'manual', // Manual mode completes immediately
      message: isRetryUpload
        ? `Receipt ${processingMode === 'ai' ? 'replaced and AI processing initiated' : 'replaced successfully'}`
        : processingMode === 'ai'
        ? 'Expense record created and AI processing initiated'
        : 'Expense record created with uploaded receipt'
    }

    // Add task_id if DSPy processing was triggered
    if (processingMode === 'ai' && triggerResult) {
      responseData.task_id = triggerResult.id
    }

    return NextResponse.json({
      success: true,
      data: responseData
    })

  } catch (error) {
    console.error('[Unified Upload] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process file upload'
      },
      { status: 500 }
    )
  }
}