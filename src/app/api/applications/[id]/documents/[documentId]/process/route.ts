import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
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

    // Get authenticated Supabase client with proper RLS context
    const supabase = await createAuthenticatedSupabaseClient();

    // Fetch document with application context
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('storage_path, file_type, document_slot, application_id')
      .eq('id', documentId)
      .eq('application_id', applicationId)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // Get expected document type for slot validation
    const { data: slotConfig, error: slotError } = await supabase
      .from('application_document_types')
      .select('document_type')
      .eq('application_type', (await supabase
        .from('applications')
        .select('application_type')
        .eq('id', applicationId)
        .single()
      ).data?.application_type)
      .eq('slot', document.document_slot)
      .single();

    const expectedDocumentType = slotConfig?.document_type;

    // Update document status to pending
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        processing_status: 'pending',
        error_message: null,
        processed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

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