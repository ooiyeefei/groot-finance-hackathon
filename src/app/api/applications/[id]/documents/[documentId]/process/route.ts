import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createServiceSupabaseClient, getUserData } from '@/lib/supabase-server';
import { tasks } from '@trigger.dev/sdk/v3';

// Import task types
import type { convertPdfToImage } from '@/trigger/convert-pdf-to-image';
import type { classifyDocument } from '@/trigger/classify-document';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  try {
    const { id: applicationId, documentId } = await params;

    // Check authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user data and use service client to bypass RLS
    const userData = await getUserData(userId);
    const supabase = createServiceSupabaseClient();

    // Verify user is associated with a business
    if (!userData.business_id) {
      return NextResponse.json(
        { success: false, error: 'User not associated with a business' },
        { status: 400 }
      );
    }

    // Fetch document with application context and explicit user+business isolation
    const { data: document, error: fetchError } = await supabase
      .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
      .select('storage_path, file_type, document_slot, application_id, user_id')
      .eq('id', documentId)
      .eq('application_id', applicationId)
      .eq('user_id', userData.id)  // 🛡️ EXPLICIT USER ISOLATION with UUID
      .eq('business_id', userData.business_id)  // 🛡️ EXTRA LAYER: Business isolation
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // Get expected document type for slot validation
    // First fetch the application to get application_type
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('application_type')
      .eq('id', applicationId)
      .eq('user_id', userData.id)  // 🛡️ EXPLICIT USER ISOLATION with UUID
      .eq('business_id', userData.business_id)  // 🛡️ EXTRA LAYER: Business isolation
      .single();

    if (appError || !application) {
      return NextResponse.json(
        { success: false, error: 'Application not found or access denied' },
        { status: 404 }
      );
    }

    // Then fetch the slot configuration
    const { data: slotConfig, error: slotError } = await supabase
      .from('application_document_types')
      .select('document_type')
      .eq('application_type', application.application_type)
      .eq('slot', document.document_slot)
      .single();

    const expectedDocumentType = slotConfig?.document_type;

    // Update document status to pending
    const { error: updateError } = await supabase
      .from('application_documents')  // ✅ PHASE 4E: Routed to application_documents
      .update({
        processing_status: 'pending',
        error_message: null,
        processed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .eq('user_id', userData.id)  // 🛡️ EXPLICIT USER ISOLATION with UUID
      .eq('business_id', userData.business_id);  // 🛡️ EXTRA LAYER: Business isolation

    if (updateError) {
      console.error('Failed to update document status:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update document status' },
        { status: 500 }
      );
    }

    // Create payload with application context for slot validation
    const payload = {
      documentId: documentId,
      pdfStoragePath: document.storage_path,
      documentDomain: 'applications' as const,  // ✅ PHASE 4B-2: Add domain parameter
      expectedDocumentType: expectedDocumentType,
      applicationId: applicationId,
      documentSlot: document.document_slot
    };

    console.log(`[ApplicationReprocess] Starting reprocessing for document ${documentId} in application ${applicationId}`);

    // Trigger appropriate processing pipeline based on file type
    if (document.file_type === 'application/pdf') {
      // PDF files: convert-pdf-to-image → classify-document → extract-X
      await tasks.trigger<typeof convertPdfToImage>("convert-pdf-to-image", payload);
      console.log(`[ApplicationReprocess] Triggered PDF conversion pipeline`);
    } else {
      // Image files: classify-document → extract-X
      await tasks.trigger<typeof classifyDocument>("classify-document", payload);
      console.log(`[ApplicationReprocess] Triggered image classification pipeline`);
    }

    return NextResponse.json({
      success: true,
      message: 'Document reprocessing started with application context',
      documentId: documentId,
      applicationId: applicationId,
      documentSlot: document.document_slot,
      expectedDocumentType: expectedDocumentType
    });

  } catch (error) {
    console.error('Application document reprocess error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
}