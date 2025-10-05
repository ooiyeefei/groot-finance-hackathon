/**
 * Application Documents API - Slot-specific Document Upload
 * POST - Upload document to specific application slot with type validation
 * GET - Get all documents in application with slot status
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server'
import { tasks } from '@trigger.dev/sdk/v3'
import type { classifyDocument } from '@/trigger/classify-document'
import type { convertPdfToImage } from '@/trigger/convert-pdf-to-image'
import { StoragePathBuilder, generateUniqueFilename, type DocumentType } from '@/lib/storage-paths'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Helper function to get expected document type for slot
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

// POST /api/applications/[applicationId]/documents - Slot-specific upload
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: applicationId } = await params
    const formData = await request.formData()

    const file = formData.get('file') as File
    const documentSlot = formData.get('slot') as string

    console.log(`[Application Documents API] User ${userId} uploading to application ${applicationId}, slot: ${documentSlot}`)

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!documentSlot) {
      return NextResponse.json(
        { success: false, error: 'Document slot is required' },
        { status: 400 }
      )
    }

    const supabase = createServiceSupabaseClient()

    // Convert Clerk user ID to Supabase UUID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error(`[Application Documents API] User lookup failed for clerk_user_id ${userId}:`, userError)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const supabaseUserId = user.id
    console.log(`[Application Documents API] Converted Clerk ID ${userId} to Supabase UUID ${supabaseUserId}`)

    // 1. Validate application ownership and get business_id
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, user_id, business_id, status, application_type')
      .eq('id', applicationId)
      .eq('user_id', supabaseUserId)
      .single()

    if (appError || !application) {
      console.error('[Application Documents API] Application not found:', appError)
      return NextResponse.json(
        { success: false, error: 'Application not found or access denied' },
        { status: 404 }
      )
    }

    // 2. Check if application is still editable
    if (application.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: 'Cannot upload documents to submitted applications' },
        { status: 400 }
      )
    }

    // 3. Check if slot is already filled (for replacement functionality)
    const { data: existingDoc, error: checkError } = await supabase
      .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
      .select('id, file_name, storage_path')
      .eq('application_id', applicationId)
      .eq('document_slot', documentSlot)
      .eq('user_id', supabaseUserId)
      .is('deleted_at', null)
      .maybeSingle() // Use maybeSingle instead of single to avoid error when no row

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found, which is expected
      console.error('[Application Documents API] Error checking existing document:', checkError)
      return NextResponse.json(
        { success: false, error: 'Error checking existing documents' },
        { status: 500 }
      )
    }

    const isReplacement = existingDoc !== null
    console.log(`[Application Documents API] ${isReplacement ? 'Replacing' : 'Creating new'} document for slot: ${documentSlot}`)

    // 4. Create or update document record first to get documentId
    let document
    let docError
    const expectedDocumentType = getExpectedTypeForSlot(documentSlot)

    if (isReplacement) {
      // Update existing document record for replacement
      console.log(`[Application Documents API] Updating existing document ID: ${existingDoc.id}`)
      const { data: updatedDoc, error: updateError } = await supabase
        .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
        .update({
          file_name: file.name,
          storage_path: 'temp_pending_upload', // Temporary placeholder
          file_size: file.size,
          file_type: file.type,
          processing_status: 'pending',
          // Reset previous processing results and paths
          document_type: null,
          document_classification_confidence: null,
          error_message: null,
          extracted_data: null,
          classification_task_id: null,
          extraction_task_id: null,
          processed_at: null,
          converted_image_path: null, // Clear old converted path for replacement
          converted_image_width: null,
          converted_image_height: null,
          document_metadata: null, // Clear old metadata
          updated_at: new Date().toISOString()
        })
        .eq('id', existingDoc.id)
        .select()
        .single()

      document = updatedDoc
      docError = updateError
    } else {
      // Create new document record
      console.log(`[Application Documents API] Creating new document record for slot: ${documentSlot}`)
      const { data: newDoc, error: insertError } = await supabase
        .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
        .insert({
          user_id: supabaseUserId,
          business_id: application.business_id,
          application_id: applicationId, // Direct foreign key
          document_slot: documentSlot, // Slot identifier
          slot_position: 1, // Will be updated if needed
          file_name: file.name,
          storage_path: 'temp_pending_upload', // Temporary placeholder
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
      console.error(`[Application Documents API] Database ${isReplacement ? 'update' : 'insert'} failed:`, docError)
      return NextResponse.json(
        { success: false, error: `Database ${isReplacement ? 'update' : 'insert'} failed` },
        { status: 500 }
      )
    }

    // 5. Generate standardized storage path with documentId
    const storageBuilder = new StoragePathBuilder(application.business_id, supabaseUserId, applicationId, document.id)
    const uniqueFilename = generateUniqueFilename(file.name)
    const storagePath = storageBuilder.forDocument(expectedDocumentType as DocumentType).raw(uniqueFilename)

    console.log(`[Application Documents API] Generated storage path with documentId: ${storagePath}`)

    // 6. Upload to Supabase Storage with documentId-based path
    const supabaseAdmin = createServiceSupabaseClient()
    const { data: uploadResult, error: uploadError } = await supabaseAdmin.storage
      .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('[Application Documents API] File upload failed:', uploadError)

      // Clean up document record if upload fails
      if (!isReplacement) {
        await supabase.from('application_documents').delete().eq('id', document.id)  // ✅ PHASE 4G: Fixed cleanup query
      }

      return NextResponse.json(
        { success: false, error: 'File upload failed' },
        { status: 500 }
      )
    }

    // 7. Update document record with final storage path
    const { error: pathUpdateError } = await supabase
      .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
      .update({
        storage_path: storagePath,
        processing_status: 'pending'
      })
      .eq('id', document.id)

    if (pathUpdateError) {
      console.error('[Application Documents API] Failed to update storage path:', pathUpdateError)

      // Clean up uploaded file
      await supabaseAdmin.storage.from('application_documents').remove([storagePath])  // ✅ PHASE 4G: Fixed storage bucket

      // Clean up document record if it was newly created
      if (!isReplacement) {
        await supabase.from('application_documents').delete().eq('id', document.id)  // ✅ PHASE 4G: Fixed cleanup query
      }

      return NextResponse.json(
        { success: false, error: 'Failed to update document storage path' },
        { status: 500 }
      )
    }

    // 8. Trigger decoupled document processing workflow

    try {
      console.log(`[Application Documents API] Starting decoupled processing for document ${document.id}, file type: ${file.type}, expected type: ${expectedDocumentType}`)

      // Create payload for workflow
      const payload = {
        documentId: document.id,
        documentDomain: 'applications' as const,  // ✅ PHASE 4B-2: Add domain parameter
        expectedDocumentType, // For slot validation
        applicationId: applicationId, // For context
        documentSlot // For context
      }

      // Route based on file type for proper workflow
      if (file.type === 'application/pdf') {
        // For PDFs: convert first, then classify (chained in convert-pdf-to-image task)
        console.log(`[Application Documents API] Triggering PDF conversion for document: ${document.id}`)

        // Create unique idempotency key for replacements to ensure new runs
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

        console.log(`[Application Documents API] PDF conversion triggered with task ID: ${processingRun.id}`)

        // Update document with task ID
        await supabase
          .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
          .update({
            classification_task_id: processingRun.id,
            processing_status: 'processing'
          })
          .eq('id', document.id)

      } else {
        // For images: directly classify
        console.log(`[Application Documents API] Triggering classification for image document: ${document.id}`)

        // Create unique idempotency key for replacements to ensure new runs
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

        console.log(`[Application Documents API] Classification triggered with task ID: ${processingRun.id}`)

        // Update document with task ID
        await supabase
          .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
          .update({
            classification_task_id: processingRun.id,
            processing_status: 'classifying'
          })
          .eq('id', document.id)
      }

    } catch (triggerError) {
      console.error('[Application Documents API] Failed to trigger processing:', triggerError)

      // Update document with error status
      await supabase
        .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
        .update({
          processing_status: 'failed',
          error_message: 'Failed to start document processing'
        })
        .eq('id', document.id)

      return NextResponse.json(
        { success: false, error: 'Failed to start document processing' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        document_id: document.id,
        application_id: applicationId,
        document_slot: documentSlot,
        file_name: file.name,
        processing_status: 'processing',
        expected_document_type: expectedDocumentType,
        is_replacement: isReplacement
      },
      message: isReplacement ? 'Document replaced and processing started' : 'Document uploaded and processing started'
    })

  } catch (error) {
    console.error('[Application Documents API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to upload document' },
      { status: 500 }
    )
  }
}

// GET /api/applications/[applicationId]/documents - Get all documents in application
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: applicationId } = await params

    console.log(`[Application Documents API] User ${userId} fetching documents for application ${applicationId}`)

    const supabase = createServiceSupabaseClient()

    // Convert Clerk user ID to Supabase UUID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single()

    if (userError || !user) {
      console.error(`[Application Documents API GET] User lookup failed for clerk_user_id ${userId}:`, userError)
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    const supabaseUserId = user.id

    // Validate application access
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, user_id')
      .eq('id', applicationId)
      .eq('user_id', supabaseUserId)
      .single()

    if (appError || !application) {
      return NextResponse.json(
        { success: false, error: 'Application not found or access denied' },
        { status: 404 }
      )
    }

    // Get all documents for this application
    const { data: documents, error: docsError } = await supabase
      .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
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
      console.error('[Application Documents API] Error fetching documents:', docsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        application_id: applicationId,
        documents: documents || []
      }
    })

  } catch (error) {
    console.error('[Application Documents API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}