/**
 * Batch Document Processing API Endpoint - Trigger.dev Integration
 * This endpoint triggers batch OCR processing via Trigger.dev for reliable background execution.
 * 
 * Flow:
 * 1. Validate and prepare documents (PDF conversion if needed)
 * 2. Update document status to 'processing' for immediate UI feedback
 * 3. Send events to Trigger.dev to start background OCR jobs
 * 4. Return immediate 202 Accepted response
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from '@/lib/supabase-server';
import { processRateLimiter, getClientIdentifier, applyRateLimit } from '@/lib/rate-limiter';
import { convertPdfToImage } from '@/lib/pdf-converter';
import { tasks } from "@trigger.dev/sdk/v3";
import type { processDocumentOCR } from '@/trigger/process-document-ocr';

interface BatchProcessRequest {
  documentIds: string[];
}

export async function POST(request: NextRequest) {
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

    // Step 2: Parse and validate request body
    const body: BatchProcessRequest = await request.json();
    const { documentIds } = body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Document IDs array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (documentIds.length > 10) {
      return NextResponse.json(
        { success: false, error: 'Maximum 10 documents can be processed at once' },
        { status: 400 }
      );
    }

    console.log(`[Batch-Processor] Starting batch processing for ${documentIds.length} documents`);
    const supabase = await createAuthenticatedSupabaseClient(userId);

    // Step 3: Find and validate all documents (including file_type and storage_path)
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, processing_status, user_id, file_type, storage_path, file_name')
      .in('id', documentIds)
      .eq('user_id', userId);

    if (fetchError) {
      console.error(`[Batch-Processor] Error fetching documents: ${fetchError.message}`);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch documents' },
        { status: 500 }
      );
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No documents found' },
        { status: 404 }
      );
    }

    // Check for documents not owned by the user
    if (documents.length !== documentIds.length) {
      const foundIds = documents.map(doc => doc.id);
      const missingIds = documentIds.filter(id => !foundIds.includes(id));
      console.warn(`[Batch-Processor] Documents not found or not owned by user: ${missingIds.join(', ')}`);
    }

    // Filter out documents that are already processing
    const processableDocuments = documents.filter(doc => doc.processing_status !== 'processing');
    const alreadyProcessingIds = documents
      .filter(doc => doc.processing_status === 'processing')
      .map(doc => doc.id);

    if (alreadyProcessingIds.length > 0) {
      console.log(`[Batch-Processor] Skipping documents already processing: ${alreadyProcessingIds.join(', ')}`);
    }

    if (processableDocuments.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'All documents are already being processed',
          alreadyProcessing: alreadyProcessingIds.length,
          started: 0,
          errors: []
        }
      });
    }

    // Step 4: Update status to processing for all processable documents
    const processingUpdateIds = processableDocuments.map(doc => doc.id);
    console.log(`[Batch-Processor] Setting processing status for ${processingUpdateIds.length} documents`);

    const { error: updateError } = await supabase
      .from('documents')
      .update({
        processing_status: 'processing',
        processing_started_at: new Date().toISOString(),
        error_message: null,
      })
      .in('id', processingUpdateIds)
      .eq('user_id', userId);

    if (updateError) {
      console.error('[Batch-Processor] Failed to update document statuses:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update document statuses' },
        { status: 500 }
      );
    }

    // Step 5: Process each document through two-stage hybrid architecture
    console.log(`[Batch-Processor] Starting two-stage processing for ${processingUpdateIds.length} documents`);
    
    // Prepare batch payloads for documents that need PDF conversion vs direct OCR
    const batchPayloads: Array<{ payload: { documentId: string; imageStoragePath: string }; documentMeta: typeof processableDocuments[0] }> = [];
    const conversionResults: Array<{ documentId: string; success: boolean; error?: string; processingType?: string }> = [];
    
    // Process PDF conversions first (must be done sequentially due to storage operations)
    for (const documentId of processingUpdateIds) {
      try {
        const document = processableDocuments.find(doc => doc.id === documentId);
        if (!document) {
          throw new Error('Document not found in processable documents list');
        }

        console.log(`[Batch-Processor] Processing document ${documentId} (${document.file_name})`);

        // PREPARATION STAGE - Handle PDF conversion if needed
        let imageStoragePath = document.storage_path;
        
        if (document.file_type === 'application/pdf') {
          console.log(`[Batch-Processor] PDF detected for ${documentId} - starting conversion to image`);
          
          try {
            // Download PDF from storage
            const storageClient = createServiceSupabaseClient();
            const { data: pdfData, error: downloadError } = await storageClient.storage
              .from('documents')
              .download(document.storage_path);

            if (downloadError || !pdfData) {
              throw new Error(`Failed to download PDF: ${downloadError?.message}`);
            }

            // Convert PDF to image using pdf2pic
            const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
            const imageBuffer = await convertPdfToImage(pdfBuffer);
            
            // Upload converted image to processed-images folder
            const imageFileName = `processed-images/${documentId}_converted.png`;
            const { error: uploadError } = await storageClient.storage
              .from('documents')
              .upload(imageFileName, imageBuffer, {
                contentType: 'image/png',
                upsert: true
              });

            if (uploadError) {
              throw new Error(`Failed to upload converted image: ${uploadError.message}`);
            }

            imageStoragePath = imageFileName;
            console.log(`[Batch-Processor] PDF converted and uploaded for ${documentId}: ${imageStoragePath}`);
            
          } catch (conversionError) {
            console.error(`[Batch-Processor] PDF conversion failed for document ${documentId}:`, conversionError);
            
            // Update document status to failed
            await supabase
              .from('documents')
              .update({
                processing_status: 'failed',
                error_message: `PDF conversion failed: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`,
                processed_at: new Date().toISOString()
              })
              .eq('id', documentId);

            conversionResults.push({
              documentId,
              success: false,
              error: `PDF conversion failed: ${conversionError instanceof Error ? conversionError.message : 'Unknown error'}`
            });
            continue; // Skip this document for batch triggering
          }
        } else {
          console.log(`[Batch-Processor] Image document detected for ${documentId} - proceeding directly to OCR stage`);
        }

        // Add to batch payload for Trigger.dev
        batchPayloads.push({
          payload: { documentId, imageStoragePath },
          documentMeta: document
        });
        
      } catch (preparationError) {
        console.error(`[Batch-Processor] Preparation error for document ${documentId}:`, preparationError);
        
        // Update document status to failed
        try {
          await supabase
            .from('documents')
            .update({
              processing_status: 'failed',
              error_message: 'Failed to prepare document for processing',
              processed_at: new Date().toISOString()
            })
            .eq('id', documentId);
        } catch (updateFailureError) {
          console.error(`[Batch-Processor] Failed to update error status for document ${documentId}:`, updateFailureError);
        }

        conversionResults.push({
          documentId,
          success: false,
          error: preparationError instanceof Error ? preparationError.message : 'Failed to prepare document'
        });
      }
    }

    // Step 6: BATCH TRIGGER STAGE - Send all prepared documents to Trigger.dev in a single efficient call
    let batchTriggerResults: Array<{ documentId: string; success: boolean; error?: string; processingType?: string; method?: string }> = [];
    
    if (batchPayloads.length > 0) {
      console.log(`[Batch-Processor] Batch triggering Trigger.dev jobs for ${batchPayloads.length} documents`);
      
      try {
        await tasks.batchTrigger<typeof processDocumentOCR>(
          "process-document-ocr",
          batchPayloads.map(item => ({ payload: item.payload }))
        );
        
        console.log(`[Batch-Processor] Successfully batch-triggered Trigger.dev tasks for ${batchPayloads.length} documents`);
        
        // Mark all batch-triggered documents as successful
        batchTriggerResults = batchPayloads.map(item => ({
          documentId: item.payload.documentId,
          success: true,
          processingType: item.documentMeta.file_type === 'application/pdf' ? 'PDF converted and OCR queued' : 'Direct OCR queued',
          method: 'trigger.dev-batch'
        }));
        
      } catch (batchTriggerError) {
        console.error(`[Batch-Processor] Failed to batch trigger Trigger.dev tasks:`, batchTriggerError);
        
        // Mark all documents as failed and update their status
        for (const item of batchPayloads) {
          const documentId = item.payload.documentId;
          
          // Update document status to failed in background
          supabase
            .from('documents')
            .update({
              processing_status: 'failed',
              error_message: 'Failed to start background OCR processing via Trigger.dev batch',
              processed_at: new Date().toISOString()
            })
            .eq('id', documentId)
            .then(({ error }) => {
              if (error) {
                console.error(`[Batch-Processor] Failed to update error status for ${documentId}:`, error);
              }
            });
        }
            
        batchTriggerResults = batchPayloads.map(item => ({
          documentId: item.payload.documentId,
          success: false,
          error: `Failed to batch trigger processing: ${batchTriggerError instanceof Error ? batchTriggerError.message : 'Unknown error'}`
        }));
      }
    }
    
    // Combine conversion results and batch trigger results
    const results = [...conversionResults, ...batchTriggerResults];
    
    // Analyze results
    const successful = results.filter(result => result.success);
    const failed = results.filter(result => !result.success);

    console.log(`[Batch-Processor] Batch processing initiated: ${successful.length} successful, ${failed.length} failed`);

    // Count processing types for summary
    const pdfConverted = successful.filter(result => result.processingType?.includes('PDF converted')).length;
    const directOCR = successful.filter(result => result.processingType?.includes('Direct OCR')).length;

    // Step 6: Return immediate 202 Accepted response with detailed results
    return NextResponse.json({
      success: true,
      data: {
        message: `Background processing via Trigger.dev started for ${successful.length} of ${processingUpdateIds.length} documents`,
        started: successful.length,
        alreadyProcessing: alreadyProcessingIds.length,
        failed: failed.length,
        processingTypes: {
          pdfConverted,
          directOCR
        },
        errors: failed.map(result => `Document ${result.documentId}: ${result.error}`),
        processingStarted: new Date().toISOString()
      }
    }, { status: 202 }); // 202 Accepted for async processing

  } catch (error) {
    console.error('[Batch-Processor] Unexpected error:', error);
    
    return NextResponse.json(
      { success: false, error: 'Failed to start batch processing' },
      { status: 500 }
    );
  }
}

