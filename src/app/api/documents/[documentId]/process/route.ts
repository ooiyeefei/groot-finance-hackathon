/**
 * Document Processing API Endpoint - Simplified & Robust
 * This version uses a stable pipeline: All PDFs are converted to images by directly
 * calling the 'poppler' system utility, bypassing all problematic npm libraries.
 */

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { getAIServiceFactory } from '@/lib/ai-services';
import { DocumentContext } from '@/lib/ai-services/types';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface ProcessingResult {
  extractedData: {
    text: string;
    entities: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    metadata: {
      pageCount?: number;
      wordCount: number;
      language?: string;
      processingMethod: 'ocr';
    };
  };
  embedding: number[];
  processingRoute: 'ocr';
  confidence: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const startTime = Date.now();
  
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const documentId = resolvedParams.documentId;
    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID required' },
        { status: 400 }
      );
    }

    console.log(`[API] Starting document processing for ${documentId}`);
    const supabase = createServiceSupabaseClient();

    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    if (document.processing_status === 'processing') {
      return NextResponse.json(
        { success: false, error: 'Document is already being processed' },
        { status: 409 }
      );
    }

    console.log(`[API] Processing document with status: ${document.processing_status}`);
    const updateData: Record<string, unknown> = {
      processing_status: 'processing',
      processing_started_at: new Date().toISOString(),
      error_message: null,
    };

    if (document.processing_status === 'completed') {
      updateData.extracted_data = null;
      updateData.confidence_score = null;
      updateData.processed_at = null;
      console.log('[API] Clearing previous processing results for reprocessing');
    }

    const { error: updateError } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', documentId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update processing status:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update document status' },
        { status: 500 }
      );
    }

    try {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(document.storage_path);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }

      const fileBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);
      console.log(`[API] File downloaded: ${buffer.length} bytes, type: ${document.file_type}`);

      // Update status to indicate OCR processing has started
      await supabase
        .from('documents')
        .update({ 
          status: 'ocr_processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      console.log(`[API] Status updated to 'ocr_processing' - this may take 5-8 minutes for BCCard model`);

      const aiFactory = getAIServiceFactory();
      const processingResult = await processDocument({
        id: documentId,
        fileName: document.file_name,
        fileType: document.file_type,
        fileSize: buffer.length,
        buffer,
        userId: userId,
      }, aiFactory);

      console.log(`[API] Processing completed in ${Date.now() - startTime}ms`);

      const { error: saveError } = await supabase
        .from('documents')
        .update({
          extracted_data: processingResult.extractedData,
          processing_status: 'completed',
          processed_at: new Date().toISOString(),
          processing_metadata: {
            route: processingResult.processingRoute,
            confidence: processingResult.confidence,
            processing_time_ms: Date.now() - startTime,
          },
        })
        .eq('id', documentId)
        .eq('user_id', userId);

      if (saveError) {
        throw new Error(`Failed to save extracted data: ${saveError.message}`);
      }

      await storeVectorEmbedding(documentId, userId, document, processingResult, aiFactory);

      return NextResponse.json({
        success: true,
        data: {
          documentId: documentId,
          status: 'completed',
          extractedData: processingResult.extractedData,
          processingRoute: processingResult.processingRoute,
          confidence: processingResult.confidence,
          processingTimeMs: Date.now() - startTime,
        },
      });
    } catch (processingError) {
      console.error('[API] Processing error:', processingError);
      
      await supabase
        .from('documents')
        .update({
          processing_status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Unknown error',
          failed_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .eq('user_id', userId);

      return NextResponse.json(
        {
          success: false,
          error: processingError instanceof Error ? processingError.message : 'Processing failed',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function processDocument(
    context: DocumentContext, 
    aiFactory: ReturnType<typeof getAIServiceFactory>
  ): Promise<ProcessingResult> {
    console.log(`[Processing] Starting simplified pipeline for ${context.fileName}`);
    try {
      // All documents are processed via OCR.
      const extractedData = await processWithOCR(context, aiFactory);

      const embeddingService = aiFactory.getEmbeddingService();
      const embedding = await embeddingService.generateEmbedding(extractedData.text);

      return {
        extractedData,
        embedding,
        processingRoute: 'ocr', // The route is now always OCR
        confidence: 0.9, // Default confidence for the OCR path
      };
    } catch (error) {
      console.error('[Processing] Failed:', error);
      throw error;
    }
}
  
async function processWithOCR(
  context: DocumentContext, 
  aiFactory: ReturnType<typeof getAIServiceFactory>
): Promise<ProcessingResult['extractedData']> {
  const ocrService = aiFactory.getOCRService();
  try {
    console.log('[OCR] Processing document with OCR service');
    let processContext = context;

    // If the document is a PDF, it must be converted to an image first.
    if (context.fileType === 'application/pdf') {
      console.log('[OCR] PDF detected. Converting to image for OCR processing.');
      processContext = await convertPDFToImage(context);
    }
    
    const ocrResult = await ocrService.processDocument(processContext);
    
    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
      console.error('[OCR] OCR service returned empty text');
      throw new Error(`No text extracted from OCR.`);
    }

    console.log(`[OCR] Extracted ${ocrResult.text.length} characters with ${ocrResult.entities.length} entities`);
    return {
      text: ocrResult.text,
      entities: ocrResult.entities,
      metadata: { ...ocrResult.metadata, processingMethod: 'ocr' }
    };
  } catch (error) {
    console.error('[OCR] Failed:', error);
    throw error;
  }
}

async function storeVectorEmbedding(
  documentId: string,
  userId: string,
  document: { file_name: string; file_type: string },
  processingResult: ProcessingResult,
  aiFactory: ReturnType<typeof getAIServiceFactory>
): Promise<void> {
  try {
    console.log(`[Vector] Storing embedding for document ${documentId}`);
    const vectorStorageService = aiFactory.getVectorStorageService();
    const metadata = {
      document_id: documentId,
      user_id: userId,
      file_name: document.file_name,
      file_type: document.file_type,
      processing_route: processingResult.processingRoute,
      confidence: processingResult.confidence,
      processed_at: new Date().toISOString(),
      entity_count: processingResult.extractedData.entities.length,
      word_count: processingResult.extractedData.metadata.wordCount,
    };
    await vectorStorageService.storeEmbedding(
      documentId,
      processingResult.extractedData.text,
      processingResult.embedding,
      metadata
    );
    console.log(`[Vector] Successfully stored embedding for document ${documentId}`);
  } catch (error) {
    console.error('[Vector] Storage failed:', error);
  }
}

/**
 * FINAL, STABLE VERSION using a direct call to the poppler tool.
 * This function bypasses the broken 'pdf-poppler' npm library and uses Node.js's
 * built-in tools to run the 'pdftocairo' command that Homebrew installed.
 * This is the most robust and reliable method.
 */
async function convertPDFToImage(context: DocumentContext): Promise<DocumentContext> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-direct-'));
  const tempPdfPath = path.join(tempDir, 'input.pdf');
  const outputImagePath = path.join(tempDir, 'output.png');

  try {
    console.log(`[Poppler-Direct] Writing temporary PDF to ${tempPdfPath}`);
    await fs.writeFile(tempPdfPath, context.buffer);

    // This is the path where Homebrew installs binaries on Apple Silicon Macs.
    // Use `which pdftocairo` in your terminal to verify this path.
    const pdftocairoPath = '/opt/homebrew/bin/pdftocairo';

    // These are the command-line arguments we will pass to the tool.
    // -png: output a PNG file
    // -singlefile: output a single image (e.g., 'output.png' instead of 'output-1.png')
    // -f 1 -l 1: only process the first page (from page 1 to page 1)
    const args = ['-png', '-singlefile', '-f', '1', '-l', '1', tempPdfPath, path.join(tempDir, 'output')];

    console.log(`[Poppler-Direct] Executing command: ${pdftocairoPath} ${args.join(' ')}`);
    
    // Use execFile to safely run the command with arguments
    await execFileAsync(pdftocairoPath, args);
    
    console.log('[Poppler-Direct] Conversion successful.');

    const imageBuffer = await fs.readFile(outputImagePath);
    console.log(`[Poppler-Direct] Read converted image buffer (${imageBuffer.length} bytes)`);
    
    // Store the converted image in Supabase for preview annotations
    console.log(`[Poppler-Direct] Uploading converted image to Supabase storage`);
    const supabase = createServiceSupabaseClient();
    const imageFileName = `${context.fileName.replace(/\.[^/.]+$/, "")}_page1.png`;
    const imagePath = `${context.id}/${context.userId}/${imageFileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(imagePath, imageBuffer, {
        contentType: 'image/png',
        upsert: true
      });
    
    if (uploadError) {
      console.error('[Poppler-Direct] Failed to upload converted image:', uploadError);
      // Continue without storing - OCR will use base64
    }
    
    // Get signed URL for the converted image
    const { data: signedUrlData } = await supabase.storage
      .from('documents')
      .createSignedUrl(imagePath, 3600); // 1 hour expiry
      
    const imageUrl = signedUrlData?.signedUrl;
    console.log(`[Poppler-Direct] Converted image stored at: ${imageUrl || 'failed to get URL'}`);
    
    return {
      ...context,
      buffer: imageBuffer,
      fileType: 'image/png',
      fileName: imageFileName,
      imageUrl: imageUrl // This will be used by OCR service and preview
    };
  } catch (error) {
    console.error('[Poppler-Direct] PDF to image conversion failed catastrophically.', error);
    throw new Error(`Poppler direct execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    // Clean up the temporary directory
    console.log(`[Poppler-Direct] Cleaning up temporary directory: ${tempDir}`);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}