/**
 * Trigger.dev Task: PDF to Image Conversion using Python
 * 
 * This task handles PDF to image conversion using Python's pdf2image library,
 * which is more reliable in containerized environments than Node.js alternatives.
 * 
 * Flow: PDF → Python conversion → Upload image → Trigger classification task
 */

import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { createClient } from '@supabase/supabase-js';
import { classifyDocument } from './classify-document';
import { analyzeStoragePath, generateProcessedPath, StoragePathBuilder, type DocumentType } from '@/lib/storage-paths';


// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ PHASE 4B-2: Domain-to-table mapping for multi-domain architecture
const DOMAIN_TABLE_MAP = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'applications': 'application_documents'
} as const;

export const convertPdfToImage = task({
  id: "convert-pdf-to-image",
  run: async (payload: {
    documentId: string;
    pdfStoragePath?: string;
    documentDomain: 'invoices' | 'expense_claims' | 'applications'; // ✅ PHASE 4B-2: Domain routing parameter
    expectedDocumentType?: string;
    applicationId?: string;
    documentSlot?: string;
  }) => {
    console.log(`✅ Starting PDF to image conversion for document: ${payload.documentId}`);

    try {
      // ✅ PHASE 4B-2: Route to correct table based on domain
      const tableName = DOMAIN_TABLE_MAP[payload.documentDomain];
      console.log(`🔍 Using table: ${tableName} for domain: ${payload.documentDomain}`);

      // Step 1: Get PDF storage path if not provided (for Applications workflow)
      let pdfStoragePath = payload.pdfStoragePath;

      if (!pdfStoragePath) {
        console.log(`🔍 Fetching storage path for document: ${payload.documentId}`);
        const { data: document, error: fetchError } = await supabase
          .from(tableName)  // ✅ PHASE 4B-2: Routed based on domain
          .select('storage_path')
          .eq('id', payload.documentId)
          .single();

        if (fetchError || !document) {
          throw new Error(`Failed to fetch document storage path: ${fetchError?.message}`);
        }

        pdfStoragePath = document.storage_path;
        console.log(`📥 Retrieved storage path: ${pdfStoragePath}`);
      }

      if (!pdfStoragePath) {
        throw new Error('PDF storage path is required but not provided');
      }

      // Step 2: Download PDF from Supabase Storage
      console.log(`📥 Downloading PDF from: ${pdfStoragePath}`);

      // First, check if file exists
      const { data: fileExists, error: listError } = await supabase.storage
        .from('documents')
        .list(pdfStoragePath.split('/').slice(0, -1).join('/'), {
          limit: 1000,
          search: pdfStoragePath.split('/').pop()
        });

      if (listError) {
        console.error(`❌ Error checking file existence:`, listError);
      } else if (!fileExists || fileExists.length === 0) {
        console.error(`❌ File not found in storage: ${pdfStoragePath}`);
        throw new Error(`PDF file not found in storage: ${pdfStoragePath}`);
      } else {
        console.log(`✅ File exists in storage: ${fileExists[0].name} (${fileExists[0].metadata?.size || 'unknown size'})`);
      }

      // Now attempt download
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(pdfStoragePath);

      if (downloadError) {
        console.error(`❌ Download error details:`, JSON.stringify(downloadError, null, 2));
        throw new Error(`Failed to download PDF: ${downloadError.message || JSON.stringify(downloadError)}`);
      }

      if (!pdfData) {
        throw new Error(`No data received from PDF download`);
      }

      // Convert Blob to Buffer for Python processing
      const pdfBuffer = Buffer.from(await pdfData.arrayBuffer());
      console.log(`📄 PDF downloaded successfully: ${pdfBuffer.length} bytes`);

      // Step 3: Convert PDF to PNG using Python pdf2image
      console.log(`🐍 Converting PDF to image using Python pdf2image`);
      console.log(`📊 PDF Buffer size: ${pdfBuffer.length} bytes`);
      
      // For large PDFs, we might hit limits with inline scripts
      // Using runInline with improved error handling and validation
      
      const result = await python.runInline(`
import base64
import io
import sys
import traceback
import subprocess
import json

try:
    # Check system dependencies first
    print("[Python] Checking system dependencies...")
    try:
        result = subprocess.run(['which', 'pdftoppm'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"[Python] Found pdftoppm at: {result.stdout.strip()}")
        else:
            print("[Python] WARNING: pdftoppm not found - this may cause issues")
    except Exception as dep_error:
        print(f"[Python] WARNING: Could not check dependencies: {dep_error}")

    # Import PDF processing libraries
    print("[Python] Importing pdf2image library...")
    from pdf2image import convert_from_bytes
    print("[Python] Importing PIL...")
    from PIL import Image
    print("[Python] All imports successful")

    # PDF data is passed as base64 string
    pdf_base64 = """${pdfBuffer.toString('base64')}"""
    print(f"[Python] Base64 string length: {len(pdf_base64)}")

    pdf_bytes = base64.b64decode(pdf_base64)
    print(f"[Python] Processing PDF of size: {len(pdf_bytes)} bytes")

    # Validate PDF header
    if not pdf_bytes.startswith(b'%PDF'):
        raise Exception("Invalid PDF format - missing PDF header")

    # Convert PDF to images (ALL pages)
    print("[Python] Starting multi-page PDF conversion...")
    images = convert_from_bytes(
        pdf_bytes,
        dpi=150,  # Good balance of quality and file size
        fmt='PNG'
    )

    if not images:
        raise Exception("No images generated from PDF")

    print(f"[Python] Generated {len(images)} page(s) from PDF")

    # Process all pages
    pages_data = []

    for page_num, image in enumerate(images, start=1):
        image_width, image_height = image.size
        print(f"[Python] Processing page {page_num}: {image_width}x{image_height} pixels")

        # Convert to PNG bytes
        img_buffer = io.BytesIO()
        image.save(img_buffer, format='PNG', optimize=True)
        png_bytes = img_buffer.getvalue()

        # Validate PNG output
        if len(png_bytes) == 0:
            raise Exception(f"Generated PNG for page {page_num} is empty")

        # Convert to base64
        base64_image = base64.b64encode(png_bytes).decode('utf-8')

        # Add to pages array
        pages_data.append({
            "page_number": page_num,
            "base64_image": base64_image,
            "width": image_width,
            "height": image_height
        })

        print(f"[Python] Page {page_num} processed: {len(png_bytes)} bytes, base64 length: {len(base64_image)}")

    # Output final JSON result
    result_json = {
        "success": True,
        "pages": pages_data
    }

    print("JSON_RESULT_START")
    print(json.dumps(result_json, separators=(',', ':')))
    print("JSON_RESULT_END")

except Exception as e:
    print(f"[Python] ERROR: {str(e)}")
    print(f"[Python] Traceback: {traceback.format_exc()}")

    # Output error as JSON
    error_result = {
        "success": False,
        "error": str(e),
        "pages": []
    }

    print("JSON_RESULT_START")
    print(json.dumps(error_result, separators=(',', ':')))
    print("JSON_RESULT_END")

    sys.exit(1)
`);

      console.log(`✅ Python PDF conversion completed`);
      console.log(`📝 Python stdout:`, result.stdout);
      console.log(`❌ Python stderr:`, result.stderr);

      // Extract JSON result between markers
      const stdout = result.stdout;
      const jsonStartMarker = 'JSON_RESULT_START';
      const jsonEndMarker = 'JSON_RESULT_END';

      const jsonStartIndex = stdout.indexOf(jsonStartMarker);
      const jsonEndIndex = stdout.indexOf(jsonEndMarker);

      if (jsonStartIndex === -1 || jsonEndIndex === -1) {
        throw new Error(`Failed to extract JSON result from Python output. Exit code: ${result.exitCode}`);
      }

      const jsonString = stdout.substring(jsonStartIndex + jsonStartMarker.length, jsonEndIndex).trim();

      if (!jsonString) {
        throw new Error('Empty JSON result from Python conversion');
      }

      // Parse the multi-page conversion result
      let conversionResult;
      try {
        conversionResult = JSON.parse(jsonString);
      } catch (parseError) {
        throw new Error(`Failed to parse Python JSON output: ${parseError}`);
      }

      if (!conversionResult.success) {
        throw new Error(`Python conversion failed: ${conversionResult.error}`);
      }

      if (!conversionResult.pages || conversionResult.pages.length === 0) {
        throw new Error('No pages generated from PDF conversion');
      }

      console.log(`🎯 Successfully converted PDF to ${conversionResult.pages.length} page(s)`);

      // Step 4: Upload all pages to Supabase using standardized StoragePathBuilder
      console.log(`🔍 Analyzing storage path: ${pdfStoragePath}`);

      // Get the document record for context
      const { data: document, error: docError } = await supabase
        .from(tableName)  // ✅ PHASE 4B-2: Routed based on domain
        .select('file_name, business_id, user_id, document_type, document_metadata')
        .eq('id', payload.documentId)
        .single();

      if (docError || !document) {
        throw new Error(`Failed to fetch document context: ${docError?.message}`);
      }

      const originalFilename = document.file_name;
      console.log(`📁 Document context: ${originalFilename}, type: ${document.document_type}`);

      // Always try to use standardized paths when possible
      const hasRequiredContext = document.business_id && document.user_id;

      // Determine document type for standardized paths
      // If not yet classified, use expectedDocumentType or fallback to 'application_form'
      const documentType = document.document_type || payload.expectedDocumentType || 'application_form';

      console.log(`📊 Context analysis: business_id=${!!document.business_id}, user_id=${!!document.user_id}, document_type=${documentType}`);

      let imagePaths: string[];
      let approach: string;
      let convertedFolderPath: string;

      if (hasRequiredContext) {
        // Use standardized paths with documentId for unique folder structure
        const storageBuilder = new StoragePathBuilder(document.business_id, document.user_id, payload.applicationId, payload.documentId);
        const docType = documentType as DocumentType;
        console.log(`📤 Using standardized storage structure for ${docType} documents with unique documentId folder`);

        // Use timestamp folder to separate reprocessing runs
        const processTimestamp = Date.now().toString(); // Full timestamp for folder uniqueness
        const shortTimestamp = processTimestamp.slice(-8); // Last 8 digits for filename

        imagePaths = conversionResult.pages.map((page: any) => {
          // Create filename with timestamp prefix inside timestamp folder
          const originalFilenamePart = document.file_name.replace(/\.[^/.]+$/, ""); // Remove extension
          const pageFilename = `${shortTimestamp}_${originalFilenamePart}_page_${page.page_number}.png`;
          const baseConvertedPath = storageBuilder.forDocument(docType).converted(pageFilename);

          // Insert timestamp folder between converted/ and filename: converted/1234567890/file.png
          const pathParts = baseConvertedPath.split('/');
          const filename = pathParts.pop();
          const convertedTimestampPath = `${pathParts.join('/')}/${processTimestamp}/${filename}`;
          return convertedTimestampPath;
        });

        // Extract the converted folder path (without filename) - now includes timestamp folder
        const firstImagePath = imagePaths[0];
        convertedFolderPath = firstImagePath.substring(0, firstImagePath.lastIndexOf('/'));

        approach = 'standardized';
        console.log(`✅ Standardized folder structure with timestamp folder: ${convertedFolderPath}`);
      } else {
        // Fallback only when business_id/user_id are genuinely missing
        console.log(`⚠️ Missing context fields - using fallback folder structure with documentId`);
        console.log(`📊 Missing: business_id=${!document.business_id}, user_id=${!document.user_id}`);

        // Create converted folder structure from legacy path with unique documentId + timestamp folder
        const pathParts = pdfStoragePath.split('/');
        const processTimestamp = Date.now().toString(); // Full timestamp for folder uniqueness
        const shortTimestamp = processTimestamp.slice(-8); // Last 8 digits for filename
        convertedFolderPath = `${pathParts.slice(0, -1).join('/')}/${payload.documentId}/converted/${processTimestamp}`;

        imagePaths = conversionResult.pages.map((page: any) => {
          // Create filename with timestamp prefix inside timestamp folder (fallback)
          const originalFilenamePart = document.file_name.replace(/\.[^/.]+$/, ""); // Remove extension
          const pageFilename = `${shortTimestamp}_${originalFilenamePart}_page_${page.page_number}.png`;
          return `${convertedFolderPath}/${pageFilename}`;
        });
        approach = 'fallback';
        console.log(`⚠️ Fallback folder structure with timestamp folder: ${convertedFolderPath}`);
      }

      // Step 4: Upload all pages using unified logic
      const uploadPromises = conversionResult.pages.map(async (page: any, index: number) => {
        const imagePath = imagePaths[index];

        // Convert base64 to buffer for upload
        const imageBuffer = Buffer.from(page.base64_image, 'base64');

        console.log(`📄 Uploading page ${page.page_number} (${imageBuffer.length} bytes) to: ${imagePath}`);

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(imagePath, imageBuffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (uploadError) {
          console.error(`❌ Upload error for page ${page.page_number}:`, JSON.stringify(uploadError, null, 2));
          throw new Error(`Failed to upload page ${page.page_number}: ${JSON.stringify(uploadError)}`);
        }

        return {
          page_number: page.page_number,
          path: imagePath,
          width: page.width,
          height: page.height
        };
      });

      // Execute all uploads in parallel for maximum efficiency
      const uploadedPages = await Promise.all(uploadPromises);
      console.log(`✅ All ${uploadedPages.length} page(s) uploaded successfully using ${approach} approach`);

      // Step 5: Update document record with converted folder path (keep original storage_path)
      console.log(`💾 Updating document converted_image_path to: ${convertedFolderPath}`);

      // Store page metadata for reference
      const pageMetadata = uploadedPages.map(page => ({
        page_number: page.page_number,
        path: page.path,
        width: page.width,
        height: page.height
      }));

      const updateData: any = {
        converted_image_path: convertedFolderPath, // Store converted folder path without overwriting storage_path
        converted_image_width: uploadedPages[0]?.width || null, // First page dimensions for compatibility
        converted_image_height: uploadedPages[0]?.height || null,
        document_metadata: {
          ...document.document_metadata,
          pages: pageMetadata, // Detailed page metadata
          total_pages: uploadedPages.length
        }
      };

      const { error: updateError } = await supabase
        .from(tableName)  // ✅ PHASE 4B-2: Routed based on domain
        .update(updateData)
        .eq('id', payload.documentId);

      if (updateError) {
        console.warn(`⚠️ Failed to update ${tableName} converted_image_path: ${updateError.message}`);
        // Don't throw error - continue with classification
      } else {
        console.log(`✅ ${tableName} converted_image_path updated to: ${convertedFolderPath} with ${uploadedPages.length} pages`);
      }

      // Step 6: Trigger classification task for the converted image
      console.log(`🔗 Triggering document classification for converted image`);

      // Create classification payload, preserving Applications workflow context
      const classificationPayload: any = {
        documentId: payload.documentId,
        documentDomain: payload.documentDomain  // ✅ PHASE 4B-2: Pass domain to next task
      };

      // Pass along Applications workflow context if present
      if (payload.expectedDocumentType) {
        classificationPayload.expectedDocumentType = payload.expectedDocumentType;
      }
      if (payload.applicationId) {
        classificationPayload.applicationId = payload.applicationId;
      }
      if (payload.documentSlot) {
        classificationPayload.documentSlot = payload.documentSlot;
      }

      // Note: converted_image_path already updated above, just update status
      const { error: statusUpdateError } = await supabase
        .from(tableName)  // ✅ PHASE 4B-2: Routed based on domain
        .update({
          processing_status: 'classifying' // Update status as it moves to classification
        })
        .eq('id', payload.documentId);

      if (statusUpdateError) {
        console.error(`❌ Failed to update ${tableName} status:`, statusUpdateError);
        // Don't throw - continue with classification as conversion succeeded
      }

      await classifyDocument.trigger(classificationPayload);

      console.log(`✅ Multi-page PDF conversion pipeline completed for document: ${payload.documentId}`);

      return {
        success: true,
        documentId: payload.documentId,
        totalPages: uploadedPages.length,
        convertedFolderPath: convertedFolderPath,
        pagesPaths: uploadedPages.map(page => page.path),
        approach: approach
      };

    } catch (error) {
      console.error("❌ PDF conversion failed:", error);

      // ✅ PHASE 4B-2: Route error update to correct table
      const errorTableName = DOMAIN_TABLE_MAP[payload.documentDomain];

      // Update document status to failed
      await supabase
        .from(errorTableName)  // ✅ PHASE 4B-2: Routed based on domain
        .update({
          processing_status: 'failed',
          error_message: error instanceof Error ? error.message : 'PDF conversion failed',
          processed_at: new Date().toISOString()
        })
        .eq('id', payload.documentId);

      throw error;
    }
  },
});