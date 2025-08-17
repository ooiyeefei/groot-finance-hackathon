/**
 * Trigger.dev Task: PDF to Image Conversion using Python
 * 
 * This task handles PDF to image conversion using Python's pdf2image library,
 * which is more reliable in containerized environments than Node.js alternatives.
 * 
 * Flow: PDF → Python conversion → Upload image → Trigger OCR task
 */

import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { createClient } from '@supabase/supabase-js';
import { processDocumentOCR } from './process-document-ocr';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const convertPdfToImage = task({
  id: "convert-pdf-to-image",
  run: async (payload: { documentId: string; pdfStoragePath: string }) => {
    console.log(`✅ Starting PDF to image conversion for document: ${payload.documentId}`);

    try {
      // Step 1: Download PDF from Supabase Storage
      console.log(`📥 Downloading PDF from: ${payload.pdfStoragePath}`);
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(payload.pdfStoragePath);

      if (downloadError || !pdfData) {
        throw new Error(`Failed to download PDF: ${downloadError?.message}`);
      }

      // Convert Blob to Buffer for Python processing
      const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
      console.log(`📄 PDF downloaded successfully: ${pdfBuffer.length} bytes`);

      // Step 2: Convert PDF to PNG using Python pdf2image
      console.log(`🐍 Converting PDF to image using Python pdf2image`);
      console.log(`📊 PDF Buffer size: ${pdfBuffer.length} bytes`);
      
      // For large PDFs, we might hit limits with inline scripts
      // Using runInline with improved error handling and validation
      
      const result = await python.runInline(`
import base64
import io
import sys
import traceback
from pdf2image import convert_from_bytes
from PIL import Image

try:
    # PDF data is passed as base64 string
    pdf_base64 = """${pdfBuffer.toString('base64')}"""
    print(f"[Python] Base64 string length: {len(pdf_base64)}")
    
    pdf_bytes = base64.b64decode(pdf_base64)
    print(f"[Python] Processing PDF of size: {len(pdf_bytes)} bytes")
    
    # Validate PDF header
    if not pdf_bytes.startswith(b'%PDF'):
        raise Exception("Invalid PDF format - missing PDF header")
    
    # Convert PDF to images (first page only)
    print("[Python] Starting PDF conversion...")
    images = convert_from_bytes(
        pdf_bytes,
        dpi=150,  # Good balance of quality and file size
        first_page=1,
        last_page=1,
        fmt='PNG'
    )
    
    if not images:
        raise Exception("No images generated from PDF")
    
    # Get the first (and only) image
    image = images[0]
    print(f"[Python] Image converted: {image.size[0]}x{image.size[1]} pixels")
    
    # Convert to PNG bytes
    img_buffer = io.BytesIO()
    image.save(img_buffer, format='PNG', optimize=True)
    png_bytes = img_buffer.getvalue()
    
    print(f"[Python] PNG size: {len(png_bytes)} bytes")
    
    # Validate PNG output
    if len(png_bytes) == 0:
        raise Exception("Generated PNG is empty")
    
    # Output base64 for capture
    base64_result = base64.b64encode(png_bytes).decode('utf-8')
    print(f"[Python] Base64 result length: {len(base64_result)}")
    print("RESULT_START")
    print(base64_result)
    print("RESULT_END")
    
except Exception as e:
    print(f"[Python] ERROR: {str(e)}")
    print(f"[Python] Traceback: {traceback.format_exc()}")
    sys.exit(1)
`);

      console.log(`✅ Python PDF conversion completed`);
      console.log(`📝 Python stdout:`, result.stdout);
      console.log(`❌ Python stderr:`, result.stderr);
      
      // Extract base64 string between markers
      const stdout = result.stdout;
      const startMarker = 'RESULT_START';
      const endMarker = 'RESULT_END';
      
      const startIndex = stdout.indexOf(startMarker);
      const endIndex = stdout.indexOf(endMarker);
      
      if (startIndex === -1 || endIndex === -1) {
        throw new Error(`Failed to extract conversion result from Python output. Exit code: ${result.exitCode}`);
      }
      
      const base64String = stdout.substring(startIndex + startMarker.length, endIndex).trim();
      
      if (!base64String) {
        throw new Error('Empty base64 result from Python conversion');
      }
      
      console.log(`🔍 Extracted base64 length: ${base64String.length}`);
      const imageBuffer = Buffer.from(base64String, 'base64');
      console.log(`📦 Final image buffer size: ${imageBuffer.length} bytes`);

      // Step 3: Upload to Supabase (using placeholder for now)
      const imagePath = payload.pdfStoragePath.replace('.pdf', '.png').replace(/^[^/]*\//, 'converted/');
      
      console.log(`📤 Uploading converted image to: ${imagePath}`);
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(imagePath, imageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Failed to upload converted image: ${uploadError.message}`);
      }

      console.log(`✅ Image uploaded successfully to: ${imagePath}`);

      // Step 4: Trigger OCR processing task with the image path
      console.log(`🔗 Triggering OCR processing for converted image`);
      await processDocumentOCR.trigger({
        documentId: payload.documentId,
        imageStoragePath: imagePath
      });

      console.log(`✅ PDF conversion pipeline completed for document: ${payload.documentId}`);
      
      return { 
        success: true, 
        documentId: payload.documentId,
        imagePath: imagePath 
      };

    } catch (error) {
      console.error("❌ PDF conversion failed:", error);
      
      // Update document status to failed
      await supabase.from('documents').update({
        processing_status: 'failed',
        error_message: error instanceof Error ? error.message : 'PDF conversion failed',
        processed_at: new Date().toISOString()
      }).eq('id', payload.documentId);
      
      throw error;
    }
  },
});