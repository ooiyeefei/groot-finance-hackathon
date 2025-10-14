/**
 * Application Documents Service Layer
 * Document upload, management, and processing operations
 */

import { auth } from '@clerk/nextjs/server'
import {
  createBusinessContextSupabaseClient,
  createServiceSupabaseClient,
  getUserData
} from '@/lib/db/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import type { classifyDocument } from '@/trigger/classify-document'
import type { convertPdfToImage } from '@/trigger/convert-pdf-to-image'
import { StoragePathBuilder, generateUniqueFilename, type DocumentType } from '@/lib/storage-paths'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Maps document slot to expected document type
 */
function getExpectedTypeForSlot(slot: string): string {
  const slotMapping: { [key: string]: string } = {
    'identity_card': 'ic',
    'payslip_recent': 'payslip',
    'payslip_month1': 'payslip',
    'payslip_month2': 'payslip',
    'application_form': 'application_form'
  }
  return slotMapping[slot] || 'unknown'
}

// ============================================================================
// Upload Document
// ============================================================================

/**
 * Uploads document to specific application slot with type validation
 * Logic extracted from /src/app/api/applications/[id]/documents/route.ts:32-352
 *
 * @param applicationId - UUID of the application
 * @param file - File to upload (FormData)
 * @param documentSlot - Slot identifier for the document
 * @returns Promise with upload result
 */
export async function uploadDocument(
  applicationId: string,
  file: File,
  documentSlot: string
) {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationDocumentsService.uploadDocument] User ${userId} uploading to application ${applicationId}, slot: ${documentSlot}`)

  if (!file) {
    throw new Error('No file provided')
  }

  if (!documentSlot) {
    throw new Error('Document slot is required')
  }

  // Get Supabase user data and business context
  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  console.log(`[ApplicationDocumentsService.uploadDocument] User ${userData.email} (${userData.id}) uploading to application ${applicationId}`)

  // 1. Validate application ownership - RLS will enforce business_id filtering
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, user_id, business_id, status, application_type')
    .eq('id', applicationId)
    .single()

  if (appError || !application) {
    console.error('[ApplicationDocumentsService.uploadDocument] Application not found:', appError)
    throw new Error('Application not found or access denied')
  }

  // 2. Check if application is still editable
  if (application.status !== 'draft') {
    throw new Error('Cannot upload documents to submitted applications')
  }

  // 3. Check if slot is already filled (for replacement functionality)
  const { data: existingDoc, error: checkError } = await supabase
    .from('application_documents')
    .select('id, file_name, storage_path')
    .eq('application_id', applicationId)
    .eq('document_slot', documentSlot)
    .is('deleted_at', null)
    .maybeSingle()

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('[ApplicationDocumentsService.uploadDocument] Error checking existing document:', checkError)
    throw new Error('Error checking existing documents')
  }

  const isReplacement = existingDoc !== null
  console.log(`[ApplicationDocumentsService.uploadDocument] ${isReplacement ? 'Replacing' : 'Creating new'} document for slot: ${documentSlot}`)

  // 4. Create or update document record
  let document
  let docError
  const expectedDocumentType = getExpectedTypeForSlot(documentSlot)

  if (isReplacement) {
    // Update existing document record for replacement
    console.log(`[ApplicationDocumentsService.uploadDocument] Updating existing document ID: ${existingDoc.id}`)
    const { data: updatedDoc, error: updateError } = await supabase
      .from('application_documents')
      .update({
        file_name: file.name,
        storage_path: 'temp_pending_upload',
        file_size: file.size,
        file_type: file.type,
        processing_status: 'pending',
        document_type: null,
        document_classification_confidence: null,
        error_message: null,
        extracted_data: null,
        classification_task_id: null,
        extraction_task_id: null,
        processed_at: null,
        converted_image_path: null,
        converted_image_width: null,
        converted_image_height: null,
        document_metadata: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingDoc.id)
      .select()
      .single()

    document = updatedDoc
    docError = updateError
  } else {
    // Create new document record
    console.log(`[ApplicationDocumentsService.uploadDocument] Creating new document record for slot: ${documentSlot}`)
    const { data: newDoc, error: insertError } = await supabase
      .from('application_documents')
      .insert({
        user_id: userData.id,
        business_id: application.business_id,
        application_id: applicationId,
        document_slot: documentSlot,
        slot_position: 1,
        file_name: file.name,
        storage_path: 'temp_pending_upload',
        file_size: file.size,
        file_type: file.type,
        processing_status: 'pending'
      })
      .select()
      .single()

    document = newDoc
    docError = insertError
  }

  if (docError) {
    console.error(`[ApplicationDocumentsService.uploadDocument] Database ${isReplacement ? 'update' : 'insert'} failed:`, docError)
    throw new Error(`Database ${isReplacement ? 'update' : 'insert'} failed`)
  }

  // 5. Generate standardized storage path
  const storageBuilder = new StoragePathBuilder(application.business_id, userData.id, applicationId, document.id)
  const uniqueFilename = generateUniqueFilename(file.name)
  const storagePath = storageBuilder.forDocument(expectedDocumentType as DocumentType).raw(uniqueFilename)

  console.log(`[ApplicationDocumentsService.uploadDocument] Generated storage path: ${storagePath}`)

  // 6. Upload to Supabase Storage
  const supabaseAdmin = createServiceSupabaseClient()
  const { data: uploadResult, error: uploadError } = await supabaseAdmin.storage
    .from('application_documents')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (uploadError) {
    console.error('[ApplicationDocumentsService.uploadDocument] File upload failed:', uploadError)

    // Clean up document record if upload fails
    if (!isReplacement) {
      await supabase.from('application_documents').delete().eq('id', document.id)
    }

    throw new Error('File upload failed')
  }

  // 7. Update document record with final storage path
  const { error: pathUpdateError } = await supabase
    .from('application_documents')
    .update({
      storage_path: storagePath,
      processing_status: 'pending'
    })
    .eq('id', document.id)

  if (pathUpdateError) {
    console.error('[ApplicationDocumentsService.uploadDocument] Failed to update storage path:', pathUpdateError)

    // Clean up uploaded file
    await supabaseAdmin.storage.from('application_documents').remove([storagePath])

    // Clean up document record if newly created
    if (!isReplacement) {
      await supabase.from('application_documents').delete().eq('id', document.id)
    }

    throw new Error('Failed to update document storage path')
  }

  // 8. Trigger document processing workflow
  try {
    console.log(`[ApplicationDocumentsService.uploadDocument] Starting processing for document ${document.id}`)

    const payload = {
      documentId: document.id,
      documentDomain: 'applications' as const,
      expectedDocumentType,
      applicationId: applicationId,
      documentSlot
    }

    // Route based on file type
    if (file.type === 'application/pdf') {
      const timestamp = Date.now()
      const idempotencyKey = isReplacement
        ? `pdf-convert-${document.id}-slot-${documentSlot}-replace-${timestamp}`
        : `pdf-convert-${document.id}-slot-${documentSlot}`

      const processingRun = await tasks.trigger<typeof convertPdfToImage>(
        "convert-pdf-to-image",
        payload,
        {
          idempotencyKey,
          tags: [`application:${applicationId}`, `slot:${documentSlot}`, `user:${userId}`]
        }
      )

      console.log(`[ApplicationDocumentsService.uploadDocument] PDF conversion triggered: ${processingRun.id}`)

      await supabase
        .from('application_documents')
        .update({
          classification_task_id: processingRun.id,
          processing_status: 'processing'
        })
        .eq('id', document.id)

    } else {
      const timestamp = Date.now()
      const idempotencyKey = isReplacement
        ? `doc-${document.id}-slot-${documentSlot}-replace-${timestamp}`
        : `doc-${document.id}-slot-${documentSlot}`

      const processingRun = await tasks.trigger<typeof classifyDocument>(
        "classify-document",
        payload,
        {
          idempotencyKey,
          tags: [`application:${applicationId}`, `slot:${documentSlot}`, `user:${userId}`]
        }
      )

      console.log(`[ApplicationDocumentsService.uploadDocument] Classification triggered: ${processingRun.id}`)

      await supabase
        .from('application_documents')
        .update({
          classification_task_id: processingRun.id,
          processing_status: 'classifying'
        })
        .eq('id', document.id)
    }

  } catch (triggerError) {
    console.error('[ApplicationDocumentsService.uploadDocument] Failed to trigger processing:', triggerError)

    await supabase
      .from('application_documents')
      .update({
        processing_status: 'failed',
        error_message: 'Failed to start document processing'
      })
      .eq('id', document.id)

    throw new Error('Failed to start document processing')
  }

  return {
    document_id: document.id,
    application_id: applicationId,
    document_slot: documentSlot,
    file_name: file.name,
    processing_status: 'processing',
    expected_document_type: expectedDocumentType,
    is_replacement: isReplacement
  }
}

// ============================================================================
// Get Application Documents
// ============================================================================

/**
 * Retrieves all documents for an application
 * Logic extracted from /src/app/api/applications/[id]/documents/route.ts:355-435
 *
 * @param applicationId - UUID of the application
 * @returns Promise with array of documents
 */
export async function getApplicationDocuments(applicationId: string) {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationDocumentsService.getApplicationDocuments] User ${userId} fetching documents for application ${applicationId}`)

  // Get Supabase user data and business context
  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // Validate application access
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, user_id')
    .eq('id', applicationId)
    .single()

  if (appError || !application) {
    throw new Error('Application not found or access denied')
  }

  // Get all documents for this application
  const { data: documents, error: docsError } = await supabase
    .from('application_documents')
    .select(`
      id,
      document_slot,
      slot_position,
      file_name,
      storage_path,
      file_size,
      mime_type,
      processing_status,
      document_type,
      document_classification_confidence,
      error_message,
      extracted_data,
      classification_task_id,
      extraction_task_id,
      created_at,
      updated_at
    `)
    .eq('application_id', applicationId)
    .is('deleted_at', null)
    .order('slot_position', { ascending: true })

  if (docsError) {
    console.error('[ApplicationDocumentsService.getApplicationDocuments] Error fetching documents:', docsError)
    throw new Error('Failed to fetch documents')
  }

  return {
    application_id: applicationId,
    documents: documents || []
  }
}

// ============================================================================
// Delete Document
// ============================================================================

/**
 * Soft deletes document from application (preserves file in storage)
 * Logic extracted from /src/app/api/applications/[id]/documents/[documentId]/route.ts:10-156
 *
 * @param applicationId - UUID of the application
 * @param documentId - UUID of the document
 * @returns Promise with deletion result
 */
export async function deleteDocument(applicationId: string, documentId: string) {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationDocumentsService.deleteDocument] User ${userId} deleting document ${documentId} from application ${applicationId}`)

  // Use service client for reliable access
  const supabase = createServiceSupabaseClient()

  // Convert Clerk user ID to Supabase UUID
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('clerk_user_id', userId)
    .single()

  if (userError || !user) {
    console.error(`[ApplicationDocumentsService.deleteDocument] User lookup failed:`, userError)
    throw new Error('User not found')
  }

  const supabaseUserId = user.id

  // Verify document belongs to user and application
  const { data: document, error: fetchError } = await supabase
    .from('application_documents')
    .select('id, file_name, application_id, user_id, storage_path, business_id, deleted_at')
    .eq('id', documentId)
    .eq('application_id', applicationId)
    .single()

  if (fetchError || !document) {
    console.error(`[ApplicationDocumentsService.deleteDocument] Document fetch failed:`, fetchError)
    throw new Error('Document not found')
  }

  // Check access
  let hasAccess = false

  if (document.user_id === supabaseUserId) {
    hasAccess = true
  } else if (document.business_id) {
    const { data: membership, error: memberError } = await supabase
      .from('business_memberships')
      .select('business_id')
      .eq('user_id', supabaseUserId)
      .eq('business_id', document.business_id)
      .eq('status', 'active')
      .single()

    if (membership && !memberError) {
      hasAccess = true
    }
  }

  if (!hasAccess) {
    throw new Error('Document not found or access denied')
  }

  // Soft delete - set deleted_at timestamp
  const { error: softDeleteError } = await supabase
    .from('application_documents')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId)
    .eq('user_id', supabaseUserId)

  if (softDeleteError) {
    console.error('[ApplicationDocumentsService.deleteDocument] Soft delete failed:', softDeleteError)
    throw new Error('Failed to remove document from application')
  }

  console.log(`[ApplicationDocumentsService.deleteDocument] Successfully soft deleted document ${documentId}`)

  return {
    success: true,
    message: 'Document removed from application successfully',
    preserved_file: document.storage_path
  }
}

// ============================================================================
// Reprocess Document
// ============================================================================

/**
 * Reprocesses document with application context for slot validation
 * Logic extracted from /src/app/api/applications/[id]/documents/[documentId]/process/route.ts:10-143
 *
 * @param applicationId - UUID of the application
 * @param documentId - UUID of the document
 * @returns Promise with reprocess result
 */
export async function reprocessDocument(applicationId: string, documentId: string) {
  // Get authenticated user from Clerk
  const { userId } = await auth()
  if (!userId) {
    throw new Error('Unauthorized')
  }

  console.log(`[ApplicationDocumentsService.reprocessDocument] User ${userId} reprocessing document ${documentId}`)

  // Get Supabase user data and business context
  const userData = await getUserData(userId)
  const supabase = await createBusinessContextSupabaseClient()

  // Verify user has business context
  if (!userData.business_id) {
    throw new Error('User not associated with a business')
  }

  // Fetch document with RLS
  const { data: document, error: fetchError } = await supabase
    .from('application_documents')
    .select('storage_path, file_type, document_slot, application_id, user_id')
    .eq('id', documentId)
    .eq('application_id', applicationId)
    .single()

  if (fetchError || !document) {
    throw new Error('Document not found or access denied')
  }

  // Get expected document type for slot validation
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('application_type')
    .eq('id', applicationId)
    .eq('user_id', userData.id)
    .eq('business_id', userData.business_id)
    .single()

  if (appError || !application) {
    throw new Error('Application not found or access denied')
  }

  // Fetch slot configuration
  const { data: slotConfig, error: slotError } = await supabase
    .from('application_document_types')
    .select('document_type')
    .eq('application_type', application.application_type)
    .eq('slot', document.document_slot)
    .single()

  const expectedDocumentType = slotConfig?.document_type

  // Update document status to pending
  const { error: updateError } = await supabase
    .from('application_documents')
    .update({
      processing_status: 'pending',
      error_message: null,
      processed_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', documentId)
    .eq('user_id', userData.id)
    .eq('business_id', userData.business_id)

  if (updateError) {
    console.error('[ApplicationDocumentsService.reprocessDocument] Failed to update status:', updateError)
    throw new Error('Failed to update document status')
  }

  // Trigger processing pipeline
  const payload = {
    documentId: documentId,
    pdfStoragePath: document.storage_path,
    documentDomain: 'applications' as const,
    expectedDocumentType: expectedDocumentType,
    applicationId: applicationId,
    documentSlot: document.document_slot
  }

  console.log(`[ApplicationDocumentsService.reprocessDocument] Starting reprocessing`)

  if (document.file_type === 'application/pdf') {
    await tasks.trigger<typeof convertPdfToImage>("convert-pdf-to-image", payload)
    console.log(`[ApplicationDocumentsService.reprocessDocument] PDF conversion triggered`)
  } else {
    await tasks.trigger<typeof classifyDocument>("classify-document", payload)
    console.log(`[ApplicationDocumentsService.reprocessDocument] Image classification triggered`)
  }

  return {
    success: true,
    message: 'Document reprocessing started with application context',
    documentId: documentId,
    applicationId: applicationId,
    documentSlot: document.document_slot,
    expectedDocumentType: expectedDocumentType
  }
}
