/**
 * Document Processing API Endpoint - Trigger.dev Integration
 * This endpoint triggers OCR processing via Trigger.dev for reliable background execution.
 * 
 * Flow:
 * 1. Fetch and validate document ownership
 * 2. Update document status to 'processing' for immediate UI feedback
 * 3. Send event to Trigger.dev to start background OCR job
 * 4. Return immediate 202 Accepted response
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { processRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/rate-limiter';
import { tasks } from '@trigger.dev/sdk/v3';
import type { classifyDocument } from '@/trigger/classify-document';
import type { convertPdfToImage } from '@/trigger/convert-pdf-to-image';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    // Step 1: Perform authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Step 1.5: Apply rate limiting for resource-intensive processing
    const clientId = getClientIdentifier(request, userId)
    const rateLimit = applyRateLimit(processRateLimiter, clientId)
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Processing rate limit exceeded. Please try again later.' },
        { 
          status: 429,
          headers: rateLimit.headers
        }
      )
    }

    const resolvedParams = await params;
    const documentId = resolvedParams.documentId;
    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID is required' },
        { status: 400 }
      );
    }

    console.log(`[Document-Processor] Starting two-stage processing for document ${documentId}`);
    const supabase = await createAuthenticatedSupabaseClient(userId);

    // First get the user's actual ID from users table
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', userId)
      .single();

    if (!userData) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Step 2: Find and validate the document using the correct user_id
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userData.id)
      .single();

    if (fetchError || !document) {
      console.error(`[Document-Processor] Document not found: ${fetchError?.message}`);
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    if (document.processing_status === 'processing') {
      return NextResponse.json(
        { success: false, error: 'Document is already being processed' },
        { status: 409 }
      );
    }

    // Step 3: Update status to processing
    console.log(`[Document-Processor] Setting document status to processing`);
    const updateData: Record<string, unknown> = {
      processing_status: 'processing',
      processing_started_at: new Date().toISOString(),
      error_message: null,
    };

    if (document.processing_status === 'completed') {
      updateData.extracted_data = null;
      updateData.confidence_score = null;
      updateData.processed_at = null;
      console.log('[Document-Processor] Clearing previous results for reprocessing');
    }

    const { error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .eq('user_id', userData.id);

    if (updateError) {
      console.error('[Document-Processor] Failed to update status:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update document status' },
        { status: 500 }
      );
    }

    // Step 4: TRIGGER STAGE - Route based on file type
    console.log(`[Document-Processor] Routing document based on file type: ${document.file_type}`);

    try {
      if (document.file_type === 'application/pdf') {
        // PDF documents: convert first, then classify
        console.log(`[Document-Processor] Triggering PDF conversion pipeline for document ${documentId}`);
        await tasks.trigger<typeof convertPdfToImage>("convert-pdf-to-image", {
          documentId: documentId,
          pdfStoragePath: document.storage_path
        });
        console.log(`[Document-Processor] Successfully triggered PDF conversion pipeline for document ${documentId}`);
      } else {
        // Image documents: directly classify
        console.log(`[Document-Processor] Triggering classification pipeline for image document ${documentId}`);
        await tasks.trigger<typeof classifyDocument>("classify-document", {
          documentId: documentId
        });
        console.log(`[Document-Processor] Successfully triggered classification pipeline for document ${documentId}`);
      }
    } catch (triggerError) {
      console.error('[Document-Processor] Failed to trigger Trigger.dev task:', triggerError);
      
      // Update document status to failed
      await supabase
        .from('documents')
        .update({
          processing_status: 'failed',
          error_message: 'Failed to start background processing via Trigger.dev',
          processed_at: new Date().toISOString()
        })
        .eq('id', documentId)
        .eq('user_id', userData.id);
        
      return NextResponse.json(
        { success: false, error: 'Failed to start background processing' },
        { status: 500 }
      );
    }

    // Step 6: Return immediate 202 Accepted response
    console.log(`[Document-Processor] Document ${documentId} processing started via Trigger.dev`);

    const processingType = document.file_type === 'application/pdf'
      ? 'PDF conversion → Classification → Extraction pipeline'
      : 'Classification → Extraction pipeline';

    return NextResponse.json({
      success: true,
      data: {
        documentId: documentId,
        status: 'processing',
        message: 'Document processing pipeline initiated',
        processingType: processingType,
        processingStarted: new Date().toISOString(),
        method: 'trigger.dev'
      },
    }, { status: 202 }); // 202 Accepted for async processing

  } catch (error) {
    console.error('[Document-Processor] Unexpected error:', error);
    
    // Try to update document status to failed if we have the ID
    const resolvedParams = await params;
    const documentId = resolvedParams.documentId;
    if (documentId) {
      try {
        const { userId } = await auth();
        if (userId) {
          const supabase = await createAuthenticatedSupabaseClient(userId);
          await supabase
            .from('documents')
            .update({
              processing_status: 'failed',
              error_message: 'Unexpected processing error',
              processed_at: new Date().toISOString()
            })
            .eq('id', documentId)
            .eq('user_id', userId);
        }
      } catch (updateError) {
        console.error('[Document-Processor] Failed to update error status:', updateError);
      }
    }
    
    return NextResponse.json(
      { success: false, error: 'Processing failed due to internal error' },
      { status: 500 }
    );
  }
}


