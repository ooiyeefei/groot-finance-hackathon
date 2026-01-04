/**
 * Trigger.dev Task: PDF to Image Conversion using Python
 *
 * This task handles PDF to image conversion using Python's pdf2image library,
 * which is more reliable in containerized environments than Node.js alternatives.
 *
 * Flow: PDF → Python conversion → Upload image to S3 → Trigger classification task
 *
 * STORAGE: Migrated from Supabase Storage to AWS S3 (2025)
 * DATABASE: Migrated from Supabase to Convex (2025)
 */

import { task, tasks } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { analyzeStoragePath, generateProcessedPath, StoragePathBuilder, type DocumentType } from '@/lib/storage-paths';
import {
  downloadFile,
  uploadFile,
  listFiles,
  fileExists,
  type S3Prefix
} from './utils/s3-helpers';
// ✅ CONVEX MIGRATION: Use Convex helpers instead of direct Supabase client
import {
  fetchDocument,
  updateDocumentStatus,
  updateConvertedImagePath,
} from './utils/convex-helpers';

// ✅ PHASE 4B-2: Domain-to-table mapping for multi-domain architecture
const DOMAIN_TABLE_MAP = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims'
} as const;

// ✅ S3 MIGRATION: Domain-to-S3-prefix mapping
const DOMAIN_S3_PREFIX_MAP: Record<string, S3Prefix> = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims'
};

export const convertPdfToImage = task({
  id: "convert-pdf-to-image",
  run: async (payload: {
    documentId: string;
    pdfStoragePath?: string;
    documentDomain: 'invoices' | 'expense_claims'; // ✅ PHASE 4B-2: Domain routing parameter
    expectedDocumentType?: string;
  }) => {
    console.log(`✅ Starting PDF to image conversion for document: ${payload.documentId}`);

    try {
      // ✅ PHASE 4B-2: Route to correct table based on domain
      const tableName = DOMAIN_TABLE_MAP[payload.documentDomain];
      const s3Prefix = DOMAIN_S3_PREFIX_MAP[payload.documentDomain];  // ✅ S3 MIGRATION: Route to correct S3 prefix
      console.log(`🔍 Using table: ${tableName} and S3 prefix: ${s3Prefix} for domain: ${payload.documentDomain}`);

      // Step 1: Get PDF storage path if not provided (for Applications workflow)
      let pdfStoragePath = payload.pdfStoragePath;

      if (!pdfStoragePath) {
        console.log(`🔍 Fetching storage path for document: ${payload.documentId}`);
        // ✅ CONVEX MIGRATION: Use fetchDocument helper instead of direct Supabase
        const document = await fetchDocument(payload.documentId, tableName);

        if (!document) {
          throw new Error(`Failed to fetch document storage path: Document not found`);
        }

        pdfStoragePath = document.storage_path;
        console.log(`📥 Retrieved storage path: ${pdfStoragePath}`);
      }

      if (!pdfStoragePath) {
        throw new Error('PDF storage path is required but not provided');
      }

      // Step 2: Download PDF from AWS S3
      console.log(`📥 Downloading PDF from S3: ${s3Prefix}/${pdfStoragePath}`);

      // ✅ S3 MIGRATION: Check if file exists in S3
      const pdfExists = await fileExists(s3Prefix, pdfStoragePath);

      if (!pdfExists) {
        console.error(`❌ File not found in S3: ${s3Prefix}/${pdfStoragePath}`);
        throw new Error(`PDF file not found in S3: ${pdfStoragePath}`);
      }

      console.log(`✅ File exists in S3: ${pdfStoragePath}`);

      // ✅ S3 MIGRATION: Download PDF from S3
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await downloadFile(s3Prefix, pdfStoragePath);
        console.log(`✅ Downloaded PDF from S3: ${pdfBuffer.length} bytes`);
      } catch (downloadError) {
        console.error(`❌ S3 Download error:`, downloadError);
        throw new Error(`Failed to download PDF from S3: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`);
      }

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error(`No data received from PDF download`);
      }
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

    # Convert PDF to images (ALL pages) - optimized for OCR token efficiency
    print("[Python] Starting multi-page PDF conversion...")
    images = convert_from_bytes(
        pdf_bytes,
        dpi=120,  # Optimized for OCR and token efficiency (was 150)
        fmt='JPEG'  # JPEG for smaller file sizes (was PNG)
    )

    if not images:
        raise Exception("No images generated from PDF")

    print(f"[Python] Generated {len(images)} page(s) from PDF")

    # Process all pages
    pages_data = []

    for page_num, image in enumerate(images, start=1):
        image_width, image_height = image.size
        print(f"[Python] Processing page {page_num}: {image_width}x{image_height} pixels")

        # ✅ Optimize image for OCR and token efficiency
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # Iteratively optimize image size to target ~1MB
        target_size_bytes = 1024 * 1024  # 1MB target
        quality = 85
        optimized_image = image.copy()
        attempts = 0
        max_attempts = 10

        while attempts < max_attempts:
            img_buffer = io.BytesIO()
            optimized_image.save(img_buffer, format='JPEG', quality=quality, optimize=True)
            jpeg_bytes = img_buffer.getvalue()

            print(f"[Python] Page {page_num} optimization attempt {attempts+1}: {optimized_image.width}x{optimized_image.height}, quality={quality}, size={len(jpeg_bytes)/1024:.1f}KB")

            if len(jpeg_bytes) <= target_size_bytes:
                print(f"[Python] Page {page_num} optimized successfully: {len(jpeg_bytes)/1024:.1f}KB")
                break

            # Try reducing quality first
            if quality > 60:
                quality -= 10
            else:
                # If quality is already low, resize image
                new_width = int(optimized_image.width * 0.85)
                new_height = int(optimized_image.height * 0.85)
                optimized_image = optimized_image.resize((new_width, new_height))
                quality = 75  # Reset quality after resize

            attempts += 1

        if attempts >= max_attempts:
            print(f"[Python] Warning: Page {page_num} could not be optimized to target size, using best attempt")

        # Use the optimized image
        img_buffer = io.BytesIO()
        optimized_image.save(img_buffer, format='JPEG', quality=quality, optimize=True)
        jpeg_bytes = img_buffer.getvalue()

        # Validate JPEG output
        if len(jpeg_bytes) == 0:
            raise Exception(f"Generated JPEG for page {page_num} is empty")

        # Convert to base64
        base64_image = base64.b64encode(jpeg_bytes).decode('utf-8')

        # Add to pages array
        pages_data.append({
            "page_number": page_num,
            "base64_image": base64_image,
            "width": optimized_image.width,
            "height": optimized_image.height
        })

        print(f"[Python] Page {page_num} processed: {len(jpeg_bytes)} bytes, base64 length: {len(base64_image)}")

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

      // ✅ CONVEX MIGRATION: Use fetchDocument helper which returns all fields for both table types
      const docContext = await fetchDocument(payload.documentId, tableName);

      if (!docContext) {
        throw new Error(`Failed to fetch document context: Document not found`);
      }

      // Map Convex response to expected format (already includes all fields)
      const typedDocument = {
        file_name: docContext.file_name || '',
        business_id: docContext.business_id || null,
        user_id: docContext.user_id || '',
        document_metadata: docContext.document_metadata,
        processing_metadata: docContext.processing_metadata,
      };

      const originalFilename = typedDocument.file_name;
      console.log(`📁 Document context: ${originalFilename}`);

      // Always try to use standardized paths when possible
      const hasRequiredContext = typedDocument.business_id && typedDocument.user_id;

      // ✅ PHASE 4K: Determine storage path type based on domain and context
      // Since actual document type is determined AFTER conversion in classify-document.ts,
      // we use domain defaults for storage path construction
      const getStorageDocumentType = (): string => {
        // Use expectedDocumentType if provided
        if (payload.expectedDocumentType) {
          return payload.expectedDocumentType;
        }

        // Default by domain
        switch (payload.documentDomain) {
          case 'expense_claims':
            return 'receipt';  // Default for expense claims
          case 'invoices':
            return 'invoice';  // Default for invoices
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
        const storageBuilder = new StoragePathBuilder(typedDocument.business_id!, typedDocument.user_id, payload.documentId);
        const docType = storageDocType as DocumentType;
        console.log(`📤 Using standardized storage structure for ${docType} documents with unique documentId folder`);

        // Use timestamp folder to separate reprocessing runs
        const processTimestamp = Date.now().toString(); // Full timestamp for folder uniqueness
        const shortTimestamp = processTimestamp.slice(-8); // Last 8 digits for filename

        imagePaths = conversionResult.pages.map((page: any) => {
          // Create filename with timestamp prefix inside timestamp folder
          const originalFilenamePart = typedDocument.file_name.replace(/\.[^/.]+$/, ""); // Remove extension
          const pageFilename = `${shortTimestamp}_${originalFilenamePart}_page_${page.page_number}.jpg`;
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
          const pageFilename = `${shortTimestamp}_${originalFilenamePart}_page_${page.page_number}.jpg`;
          return `${convertedFolderPath}/${pageFilename}`;
        });
        approach = 'fallback';
        console.log(`⚠️ Fallback folder structure with timestamp folder: ${convertedFolderPath}`);
      }

      // Step 4: Upload all pages to S3 using unified logic
      const uploadPromises = conversionResult.pages.map(async (page: any, index: number) => {
        const imagePath = imagePaths[index];

        // Convert base64 to buffer for upload
        const imageBuffer = Buffer.from(page.base64_image, 'base64');

        console.log(`📄 Uploading page ${page.page_number} (${imageBuffer.length} bytes) to S3: ${s3Prefix}/${imagePath}`);

        // ✅ S3 MIGRATION: Upload to AWS S3
        const uploadResult = await uploadFile(
          s3Prefix,
          imagePath,
          imageBuffer,
          'image/jpeg'
        );

        if (!uploadResult.success) {
          console.error(`❌ S3 Upload error for page ${page.page_number}:`, uploadResult.error);
          throw new Error(`Failed to upload page ${page.page_number} to S3: ${uploadResult.error}`);
        }

        console.log(`✅ Page ${page.page_number} uploaded to S3: ${uploadResult.key}`);

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

      // ✅ CONVEX MIGRATION: Use updateConvertedImagePath helper (handles table-specific metadata internally)
      try {
        await updateConvertedImagePath(
          payload.documentId,
          convertedFolderPath,
          pageMetadata,
          tableName
        );
        console.log(`✅ ${tableName} converted_image_path updated to: ${convertedFolderPath} with ${uploadedPages.length} pages`);
      } catch (updateError) {
        console.warn(`⚠️ Failed to update ${tableName} converted_image_path: ${updateError instanceof Error ? updateError.message : updateError}`);
        // Don't throw error - continue with classification
      }

      // Step 6: Trigger classification task for the converted image
      console.log(`🔗 Triggering document classification for converted image`);

      // Create classification payload
      const classificationPayload: any = {
        documentId: payload.documentId,
        documentDomain: payload.documentDomain  // ✅ PHASE 4B-2: Pass domain to next task
      };

      // ✅ CONVEX MIGRATION: Update status before triggering classification
      // Status values: expense_claims → 'analyzing', invoices → 'uploading', others → 'classifying'
      const statusValue = tableName === 'expense_claims' ? 'analyzing' :
                        tableName === 'invoices' ? 'uploading' : 'classifying';

      try {
        await updateDocumentStatus(payload.documentId, statusValue, undefined, tableName);
        console.log(`✅ ${tableName} status updated to '${statusValue}' for classification`);
      } catch (statusUpdateError) {
        console.error(`❌ Failed to update ${tableName} status:`, statusUpdateError);
        // Don't throw - continue with classification as conversion succeeded
      }

      await tasks.trigger("classify-document", classificationPayload);

      console.log(`✅ Multi-page PDF conversion pipeline completed for document: ${payload.documentId}`);

      return {
        success: true,
        documentId: payload.documentId,
        totalPages: uploadedPages.length,
        convertedFolderPath: convertedFolderPath,
        pagesPaths: uploadedPages.map(page => page.path),
        approach: approach
      };

      } catch (pythonError) {
        console.error(`🚨 Python PDF conversion failed:`, pythonError);
        throw pythonError;
      }

    } catch (error) {
      console.error("❌ PDF conversion failed:", error);

      // ✅ CONVEX MIGRATION: Route error update to correct table using Convex helper
      const errorTableName = DOMAIN_TABLE_MAP[payload.documentDomain];

      // Build error details in consistent format (Convex helper handles JSONB vs string internally)
      const errorDetails = {
        message: error instanceof Error ? error.message : 'PDF conversion failed',
        error_type: 'conversion_failed'
      };

      console.log(`🔄 Updating ${errorTableName} status to 'failed' for document ${payload.documentId}`);

      try {
        await updateDocumentStatus(payload.documentId, 'failed', errorDetails, errorTableName);
        console.log(`✅ Updated ${errorTableName} status to 'failed' for document ${payload.documentId}`);
      } catch (updateError) {
        console.error(`⚠️ Failed to update ${errorTableName} error status:`, updateError);
        // Don't throw - we're already in the error handler
      }

      throw error;
    }
  }
});