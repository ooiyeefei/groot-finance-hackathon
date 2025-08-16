/**
 * Document Processing API Endpoint - Synchronous Version
 * This endpoint processes documents synchronously using direct OCR service calls.
 * Robust implementation with improved error handling and JSON fallback parsing.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { OCRService } from '@/lib/ai-services/ocr-service';
import { DocumentContext } from '@/lib/ai-services/types';
import { processRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/rate-limiter';

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

    console.log(`[Document-Processor] Starting synchronous processing for document ${documentId}`);
    const supabase = await createAuthenticatedSupabaseClient(userId);

    // Step 2: Find and validate the document
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
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
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Document-Processor] Failed to update status:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update document status' },
        { status: 500 }
      );
    }

    // Step 4: Download document from storage (requires service role for storage access)
    console.log(`[Document-Processor] Downloading document from storage: ${document.storage_path}`);
    const storageClient = createServiceSupabaseClient();
    const { data: fileData, error: downloadError } = await storageClient.storage
      .from('documents')
      .download(document.storage_path);

    if (downloadError || !fileData) {
      console.error('[Document-Processor] Failed to download document:', downloadError);
      await supabase
        .from('documents')
        .update({
          processing_status: 'failed',
          error_message: 'Failed to download document from storage',
          processed_at: new Date().toISOString()
        })
        .eq('id', documentId);

      return NextResponse.json(
        { success: false, error: 'Failed to access document' },
        { status: 500 }
      );
    }

    // Step 5: Convert file to buffer and create context
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const context: DocumentContext = {
      id: document.id,
      fileName: document.file_name,
      fileType: document.file_type,
      fileSize: document.file_size,
      buffer: buffer,
      userId: userId
    };

    // Step 6: Process with OCR service
    console.log(`[Document-Processor] Processing ${document.file_type} document with OCR`);
    let ocrResult;
    let processingRoute = 'direct-image';
    
    try {
      const ocrService = new OCRService();
      
      // Handle PDF conversion if needed
      if (document.file_type === 'application/pdf') {
        console.log(`[Document-Processor] PDF detected - converting to image for OCR processing`);
        processingRoute = 'pdf-to-image-conversion';
        
        // Convert PDF to image and process with OCR
        ocrResult = await ocrService.processDocument(context);
      } else {
        // Direct image processing
        ocrResult = await ocrService.processDocument(context);
      }
      
      console.log(`[Document-Processor] OCR processing completed successfully`);
      
    } catch (ocrError) {
      console.error('[Document-Processor] OCR processing failed:', ocrError);
      
      // Save error to database
      await supabase
        .from('documents')
        .update({
          processing_status: 'failed',
          error_message: ocrError instanceof Error ? ocrError.message : 'OCR processing failed',
          processed_at: new Date().toISOString()
        })
        .eq('id', documentId);

      return NextResponse.json(
        { success: false, error: 'Document processing failed' },
        { status: 500 }
      );
    }

    // Step 7: Calculate average confidence
    const avgConfidence = ocrResult.entities.length > 0 
      ? ocrResult.entities.reduce((sum, entity) => sum + (entity.confidence || 0), 0) / ocrResult.entities.length
      : 0;

    // Step 8: Save results to database
    console.log(`[Document-Processor] Saving results to database`);
    const { error: saveError } = await supabase
      .from('documents')
      .update({
        extracted_data: ocrResult,
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        confidence_score: avgConfidence,
        processing_metadata: {
          route: processingRoute,
          confidence: avgConfidence,
          entityCount: ocrResult.entities.length,
          wordCount: ocrResult.metadata?.wordCount || 0
        },
      })
      .eq('id', documentId)
      .eq('user_id', userId);

    if (saveError) {
      console.error('[Document-Processor] Failed to save results:', saveError);
      return NextResponse.json(
        { success: false, error: 'Failed to save processing results' },
        { status: 500 }
      );
    }

    console.log(`[Document-Processor] Document ${documentId} processed successfully`);
    
    // Step 9: Return success response
    return NextResponse.json({
      success: true,
      data: {
        documentId: documentId,
        status: 'completed',
        message: 'Document processed successfully',
        confidence: avgConfidence,
        entityCount: ocrResult.entities.length,
        processingRoute: processingRoute,
        processedAt: new Date().toISOString()
      },
    });

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
            .eq('user_id', userId); // Ensure user can only update their own documents
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

