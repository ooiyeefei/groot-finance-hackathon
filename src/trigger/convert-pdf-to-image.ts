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

// ✅ PHASE 4J: Domain-to-bucket mapping for multi-bucket architecture
const DOMAIN_BUCKET_MAP = {
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
      const bucketName = DOMAIN_BUCKET_MAP[payload.documentDomain];  // ✅ PHASE 4J: Route to correct bucket
      console.log(`🔍 Using table: ${tableName} and bucket: ${bucketName} for domain: ${payload.documentDomain}`);

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
        .from(bucketName)  // ✅ PHASE 4J: Routed to correct bucket
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
        .from(bucketName)  // ✅ PHASE 4J: Routed to correct bucket
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

      // Validate PDF format
      if (pdfBuffer.length === 0) {
        throw new Error('PDF buffer is empty');
      }

      if (!pdfBuffer.subarray(0, 4).toString('ascii').includes('%PDF')) {
        console.error(`🚨 Invalid PDF header. First 10 bytes:`, pdfBuffer.subarray(0, 10).toString('hex'));
        throw new Error('Invalid PDF format - missing PDF header');
      }

      console.log(`✅ PDF validation passed: ${pdfBuffer.length} bytes, header OK`);

      // Step 3: Convert PDF to PNG using Python pdf2image
      console.log(`🐍 Converting PDF to image using Python pdf2image`);
      console.log(`📊 PDF Buffer size: ${pdfBuffer.length} bytes`);

      // First, validate Python environment
      console.log(`🔍 Validating Python environment...`);
      try {
        const envCheck = await python.runInline(`
import sys
import subprocess
print(f"Python version: {sys.version}")
print(f"Python executable: {sys.executable}")

# Check for required packages
try:
    import pdf2image
    print("✅ pdf2image available")
except ImportError as e:
    print(f"❌ pdf2image not available: {e}")

try:
    from PIL import Image
    print("✅ PIL available")
except ImportError as e:
    print(f"❌ PIL not available: {e}")

# Check system dependencies
try:
    result = subprocess.run(['which', 'pdftoppm'], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✅ pdftoppm found at: {result.stdout.strip()}")
    else:
        print("❌ pdftoppm not found")
except Exception as e:
    print(f"❌ Error checking pdftoppm: {e}")
`);
        console.log(`🔍 Environment check result:`, envCheck.stdout);
      } catch (envError) {
        console.error(`🚨 Environment validation failed:`, envError);
      }

      // For large PDFs, we might hit limits with inline scripts
      // Using runInline with improved error handling and validation

      let result;
      try {
        console.log(`🚀 Attempting PDF conversion with pdf2image...`);
        result = await python.runInline(`
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

      console.log(`🐍 Python PDF conversion result - Exit code: ${result.exitCode}`);
      console.log(`📝 Python stdout:`, result.stdout);
      console.log(`❌ Python stderr:`, result.stderr);

      if (result.exitCode !== 0) {
        console.error(`🚨 Python script failed with exit code ${result.exitCode}`);
        console.error(`📝 Full stdout output:`, result.stdout);
        console.error(`❌ Full stderr output:`, result.stderr);
        throw new Error(`Python PDF conversion failed with exit code ${result.exitCode}. Check logs for details.`);
      }

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
      // We only need file_name, business_id, user_id for path construction
      // Document type classification happens AFTER conversion in classify-document.ts

      // Fetch document based on table type (expense_claims doesn't have document_metadata)
      let document: any;
      let docError: any;

      if (tableName === 'expense_claims') {
        const result = await supabase
          .from(tableName)
          .select('file_name, business_id, user_id, processing_metadata')
          .eq('id', payload.documentId)
          .single();
        document = result.data;
        docError = result.error;
      } else {
        const result = await supabase
          .from(tableName)
          .select('file_name, business_id, user_id, document_metadata')
          .eq('id', payload.documentId)
          .single();
        document = result.data;
        docError = result.error;
      }

      if (docError || !document) {
        throw new Error(`Failed to fetch document context: ${docError?.message}`);
      }

      // Type assertion for consistent access
      const typedDocument = document as {
        file_name: string;
        business_id: string | null;
        user_id: string;
        document_metadata?: any;
        processing_metadata?: any;
      };

      const originalFilename = typedDocument.file_name;
      console.log(`📁 Document context: ${originalFilename}`);

      // Always try to use standardized paths when possible
      const hasRequiredContext = typedDocument.business_id && typedDocument.user_id;

      // ✅ PHASE 4K: Determine storage path type based on domain and context
      // Since actual document type is determined AFTER conversion in classify-document.ts,
      // we use domain defaults or application-specific hints for storage path construction
      const getStorageDocumentType = (): string => {
        // Use expectedDocumentType if provided (applications workflow)
        if (payload.expectedDocumentType) {
          return payload.expectedDocumentType;
        }

        // Map document slot to type for applications
        if (payload.documentSlot) {
          if (payload.documentSlot === 'identity_card') return 'ic';
          if (payload.documentSlot.startsWith('payslip_')) return 'payslip';
          if (payload.documentSlot === 'application_form') return 'application_form';
        }

        // Default by domain
        switch (payload.documentDomain) {
          case 'expense_claims':
            return 'receipt';  // Default for expense claims
          case 'invoices':
            return 'invoice';  // Default for invoices
          case 'applications':
            return 'application_form';  // Default for applications
          default:
            return 'document';  // Generic fallback
        }
      };

      const storageDocType = getStorageDocumentType();
      console.log(`📊 Context: business_id=${!!typedDocument.business_id}, user_id=${!!typedDocument.user_id}, domain=${payload.documentDomain}, storage_type=${storageDocType}`);

      let imagePaths: string[];
      let approach: string;
      let convertedFolderPath: string;

      if (hasRequiredContext) {
        // Use standardized paths with documentId for unique folder structure
        // TypeScript: business_id is guaranteed non-null here due to hasRequiredContext check
        const storageBuilder = new StoragePathBuilder(typedDocument.business_id!, typedDocument.user_id, payload.applicationId, payload.documentId);
        const docType = storageDocType as DocumentType;
        console.log(`📤 Using standardized storage structure for ${docType} documents with unique documentId folder`);

        // Use timestamp folder to separate reprocessing runs
        const processTimestamp = Date.now().toString(); // Full timestamp for folder uniqueness
        const shortTimestamp = processTimestamp.slice(-8); // Last 8 digits for filename

        imagePaths = conversionResult.pages.map((page: any) => {
          // Create filename with timestamp prefix inside timestamp folder
          const originalFilenamePart = typedDocument.file_name.replace(/\.[^/.]+$/, ""); // Remove extension
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
        console.log(`📊 Missing: business_id=${!typedDocument.business_id}, user_id=${!typedDocument.user_id}`);

        // Create converted folder structure from legacy path with unique documentId + timestamp folder
        const pathParts = pdfStoragePath.split('/');
        const processTimestamp = Date.now().toString(); // Full timestamp for folder uniqueness
        const shortTimestamp = processTimestamp.slice(-8); // Last 8 digits for filename
        convertedFolderPath = `${pathParts.slice(0, -1).join('/')}/${payload.documentId}/converted/${processTimestamp}`;

        imagePaths = conversionResult.pages.map((page: any) => {
          // Create filename with timestamp prefix inside timestamp folder (fallback)
          const originalFilenamePart = typedDocument.file_name.replace(/\.[^/.]+$/, ""); // Remove extension
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
          .from(bucketName)  // ✅ PHASE 4J: Routed to correct bucket
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

      // Build update data based on table type
      const updateData: any = {
        converted_image_path: convertedFolderPath // Store converted folder path without overwriting storage_path
      };

      // Only add width/height columns for tables that have them (not expense_claims)
      if (tableName !== 'expense_claims') {
        updateData.converted_image_width = uploadedPages[0]?.width || null; // First page dimensions for compatibility
        updateData.converted_image_height = uploadedPages[0]?.height || null;
        updateData.document_metadata = {
          ...typedDocument.document_metadata,
          pages: pageMetadata, // Detailed page metadata
          total_pages: uploadedPages.length
        };
      } else {
        // For expense_claims, store page metadata in processing_metadata instead
        updateData.processing_metadata = {
          ...typedDocument.processing_metadata,
          pages: pageMetadata,
          total_pages: uploadedPages.length,
          // Store dimensions in metadata for expense_claims
          converted_image_width: uploadedPages[0]?.width || null,
          converted_image_height: uploadedPages[0]?.height || null
        };
      }

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
      // Use different column name for expense_claims (status) vs others (processing_status)
      const statusColumn = tableName === 'expense_claims' ? 'status' : 'processing_status';
      const statusValue = tableName === 'expense_claims' ? 'analyzing' : 'classifying';

      const { error: statusUpdateError } = await supabase
        .from(tableName)  // ✅ PHASE 4B-2: Routed based on domain
        .update({
          [statusColumn]: statusValue // Update status as it moves to classification
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

      // Build error details for JSONB format (for expense_claims)
      const errorDetails = {
        message: error instanceof Error ? error.message : 'PDF conversion failed',
        suggestions: [
          'Ensure the PDF file is not corrupted',
          'Try uploading a different PDF file',
          'Contact support if the issue persists'
        ],
        error_type: 'conversion_failed',
        stage: 'pdf_to_image_conversion'
      };

      // Update document status to failed
      // Use different column names for expense_claims
      if (errorTableName === 'expense_claims') {
        await supabase
          .from(errorTableName)
          .update({
            status: 'failed',
            error_message: errorDetails,  // JSONB format
            failed_at: new Date().toISOString()
          })
          .eq('id', payload.documentId);
      } else {
        await supabase
          .from(errorTableName)
          .update({
            processing_status: 'failed',
            error_message: error instanceof Error ? error.message : 'PDF conversion failed',
            processed_at: new Date().toISOString()
          })
          .eq('id', payload.documentId);
      }

      throw error;
    }
  },
});