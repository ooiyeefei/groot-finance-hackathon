/**
 * Universal Document Router - Classification Task
 *
 * This is the central router that:
 * 1. Classifies documents using Gemini Vision + rule boosting
 * 2. Updates database with classification results
 * 3. Routes to appropriate extraction task
 *
 * Supports: IC, Payslip, Application Form, Invoice
 */

import { task, tasks } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { supabase, updateDocumentStatus, updateDocumentClassification } from './utils/db-helpers';
import { ClassificationResultSchema, safePythonScriptResult, type ClassificationResult } from './utils/schemas';

// ⚡ OPTIMIZATION: Signed URL cache to avoid redundant Storage API calls
// Cache structure: Map<storage_path, { signedUrl: string, expiryTime: number }>
const signedUrlCache = new Map<string, { signedUrl: string; expiryTime: number }>();
const SIGNED_URL_CACHE_DURATION_MS = 8 * 60 * 1000; // 8 minutes (URLs valid for 10 min, cache for 8 min)

/**
 * Get or create cached signed URL for a storage path
 * Reduces Storage API calls by caching signed URLs with TTL
 */
async function getOrCreateSignedUrl(
  bucketName: string,
  storagePath: string,
  expirySeconds: number = 600
): Promise<string> {
  const now = Date.now();
  const cached = signedUrlCache.get(storagePath);

  // Return cached URL if still valid
  if (cached && cached.expiryTime > now) {
    console.log(`[Cache HIT] Using cached signed URL for: ${storagePath}`);
    return cached.signedUrl;
  }

  // Create new signed URL
  console.log(`[Cache MISS] Creating new signed URL for: ${storagePath}`);
  const { data: urlData, error: urlError } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(storagePath, expirySeconds);

  if (urlError || !urlData) {
    throw new Error(`Failed to create signed URL: ${urlError?.message}`);
  }

  // Cache the signed URL with expiry time (8 min for 10 min URLs)
  const expiryTime = now + SIGNED_URL_CACHE_DURATION_MS;
  signedUrlCache.set(storagePath, {
    signedUrl: urlData.signedUrl,
    expiryTime
  });

  // Periodic cache cleanup (remove expired entries every 50 requests)
  if (signedUrlCache.size % 50 === 0) {
    for (const [path, entry] of signedUrlCache.entries()) {
      if (entry.expiryTime <= now) {
        signedUrlCache.delete(path);
      }
    }
  }

  return urlData.signedUrl;
}

// Import task types for routing
import type { extractInvoiceData } from './extract-invoice-data';
import type { extractIcData } from './extract-ic-data';
import type { extractPayslipData } from './extract-payslip-data';
import type { extractApplicationFormData } from './extract-application-form-data';
import type { extractReceiptData } from './extract-receipt-data';

// ✅ PHASE 4B-3: Domain-to-table mapping for multi-domain architecture
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

interface ClassifyDocumentPayload {
  documentId: string;
  documentDomain: 'invoices' | 'expense_claims' | 'applications';  // ✅ PHASE 4B-3: Domain routing parameter
  expectedDocumentType?: string; // NEW: For slot validation
  applicationId?: string; // NEW: For application context
  documentSlot?: string; // NEW: For slot context
}



export const classifyDocument = task({
  id: "classify-document",
  retry: {
    maxAttempts: 1,  // ✅ No retries - both user errors (wrong doc type) and system errors fail immediately
    // Note: This prevents retries for ALL errors. User errors (wrong doc type) SHOULD NOT retry,
    // but this also prevents retries for legitimate system errors (API failures, network issues).
    // This is acceptable trade-off to avoid wasting time on user errors.
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    randomize: true
  },
  run: async (payload: ClassifyDocumentPayload, { ctx }) => {
  const { documentId, documentDomain, expectedDocumentType, applicationId, documentSlot } = payload;
  const taskId = ctx.run.id;

  // ✅ PHASE 4B-3: Route to correct table based on domain
  const tableName = DOMAIN_TABLE_MAP[documentDomain];
  // ✅ PHASE 4J: Route to correct bucket based on domain
  const bucketName = DOMAIN_BUCKET_MAP[documentDomain];
  console.log(`[Classify] Starting classification for document ${documentId} in ${tableName} (domain: ${documentDomain}, bucket: ${bucketName})`);

  try {
    // ⚡ OPTIMIZATION: Combine status update + fetch in single query (saves 200-500ms)
    // Handle different column names: both expense_claims and invoices use 'status', other tables use 'processing_status'
    const isExpenseClaims = tableName === 'expense_claims';
    const usesStatusColumn = tableName === 'expense_claims' || tableName === 'invoices';
    const statusColumn = usesStatusColumn ? 'status' : 'processing_status';
    const metadataColumn = isExpenseClaims ? 'processing_metadata' : 'document_metadata';

    const updateData: any = {
      [statusColumn]: isExpenseClaims ? 'analyzing' : 'classifying', // expense_claims uses 'analyzing' status
      error_message: null,
      updated_at: new Date().toISOString()
    };

    const selectColumns = `storage_path, converted_image_path, file_type, ${metadataColumn}`;

    const { data: document, error: fetchError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', documentId)
      .select(selectColumns)
      .single();

    if (fetchError || !document) {
      throw new Error(`Document not found: ${fetchError?.message}`);
    }

    // GRACEFUL PATH HANDLING: Different approaches for images vs converted PDFs
    console.log(`[Classify] Document type: ${(document as any).file_type}, has converted path: ${!!(document as any).converted_image_path}`);

    let classifyImagePath: string;

    if ((document as any).converted_image_path) {
      // PDF CASE: converted_image_path is a folder containing multiple images
      console.log(`[Classify] PDF workflow - using converted image folder: ${(document as any).converted_image_path}`);

      // ⚡ OPTIMIZATION: Only fetch 1 file since we only use the first (saves 100-200ms + 90% data transfer)
      const { data: fileList, error: listError } = await supabase.storage
        .from(bucketName)  // ✅ PHASE 4J: Route to correct bucket
        .list((document as any).converted_image_path, {
          limit: 1,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (listError) {
        throw new Error(`Failed to list converted images: ${listError.message}`);
      }

      if (!fileList || fileList.length === 0) {
        throw new Error(`No converted images found in folder: ${(document as any).converted_image_path}`);
      }

      console.log(`[Classify] Found ${fileList.length} converted image(s), using first for classification`);

      // Use first converted image for classification
      const firstFile = fileList[0];
      classifyImagePath = `${(document as any).converted_image_path}/${firstFile.name}`;

    } else {
      // IMAGE CASE: storage_path is the direct file path
      console.log(`[Classify] Image workflow - using direct file path: ${(document as any).storage_path}`);
      classifyImagePath = (document as any).storage_path;
    }

    console.log(`[Classify] Final classification image path: ${classifyImagePath}`);

    // ⚡ OPTIMIZATION: Use cached signed URL to avoid redundant Storage API calls
    const signedUrl = await getOrCreateSignedUrl(bucketName, classifyImagePath, 600);
    console.log(`[Classify] Got signed URL for classification`);

    // Run structured AI classification script with slot validation context
    console.log(`[Classify] Running structured AI classification with slot validation via python.runScript`);
    const rawResult = await python.runScript(
      "./src/python/classify_document.py",
      [signedUrl, expectedDocumentType || "", documentSlot || ""],
      {
        env: {
          GEMINI_API_KEY: process.env.GEMINI_API_KEY,
          SUPPORTED_OCR_DOC_TYPE: process.env.SUPPORTED_OCR_DOC_TYPE
        }
      }
    );

    // Debug: Log what Python script actually returned (development only)
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Classify] Python script raw result:`, JSON.stringify(rawResult, null, 2));

      // Extract and log Gemini API usage for cost tracking
      console.log(`[Classify] 🔍 DEBUG: Checking stderr for usage logs...`);
      console.log(`[Classify] 🔍 DEBUG: stderr exists: ${!!rawResult.stderr}`);
      console.log(`[Classify] 🔍 DEBUG: stderr length: ${rawResult.stderr?.length || 0}`);
      console.log(`[Classify] 🔍 DEBUG: stderr content (first 500 chars): ${rawResult.stderr?.substring(0, 500) || 'EMPTY'}`);

      // Show the last 800 chars where usage logs should be
      if (rawResult.stderr && rawResult.stderr.length > 500) {
        console.log(`[Classify] 🔍 DEBUG: stderr content (last 800 chars): ${rawResult.stderr?.substring(Math.max(0, rawResult.stderr.length - 800)) || 'EMPTY'}`);
      }
    }

    if (rawResult.stderr) {
      const usageMatch = rawResult.stderr.match(/\[Usage\] Model: (.*), Images: (\d+), Input Tokens: (\d+), Output Tokens: (\d+), Total Tokens: (\d+)/);

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Classify] 🔍 DEBUG: Regex match result: ${!!usageMatch}`);
      }

      if (usageMatch) {
        console.log(`[Classify] 💰 Gemini API Usage - Model: ${usageMatch[1]}, Images: ${usageMatch[2]}, Input: ${usageMatch[3]} tokens, Output: ${usageMatch[4]} tokens, Total: ${usageMatch[5]} tokens`);
      } else if (process.env.NODE_ENV === 'development') {
        console.log(`[Classify] ⚠️ WARNING: Usage logs expected but regex did not match stderr content`);
        // Show full stderr for debugging when regex fails
        if (rawResult.stderr.length <= 2000) {
          console.log(`[Classify] 🔍 DEBUG: Full stderr for debugging:`, rawResult.stderr);
        }
      }
    } else if (process.env.NODE_ENV === 'development') {
      console.log(`[Classify] ⚠️ WARNING: stderr is empty - Python script may not be logging usage`);
    }

    // Fix: Check for errors from the Python script itself
    if (rawResult.exitCode !== 0) {
      throw new Error(`Python script failed with exit code ${rawResult.exitCode}: ${rawResult.stderr}`);
    }

    // Fix: Parse clean JSON from stdout (logs now go to stderr)
    let pythonOutput;
    try {
      pythonOutput = JSON.parse(rawResult.stdout);
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
      throw new Error(`Failed to parse JSON from Python script stdout: ${errorMessage}. Raw stdout: ${rawResult.stdout}`);
    }

    // Now validate the parsed pythonOutput object
    const validationResult = safePythonScriptResult(pythonOutput, ClassificationResultSchema);

    if (!validationResult.success) {
      const errorMsg = `Classification validation failed: ${validationResult.error}`;
      console.error(`[Classify] ${errorMsg}`);
      await updateDocumentStatus(documentId, 'classification_failed', errorMsg, tableName);  // ✅ PHASE 4B-3: Pass tableName
      throw new Error(errorMsg);
    }

    const classificationResult = validationResult.data;
    console.log(`[Classify] Classification completed:`, classificationResult);

    // Handle classification failure from Python script
    if (!classificationResult.success) {
      const errorMsg = `Classification failed: ${classificationResult.error}`;
      await updateDocumentStatus(documentId, 'classification_failed', errorMsg, tableName);  // ✅ PHASE 4B-3: Pass tableName
      throw new Error(errorMsg);
    }

    // Validate classification result
    if (!classificationResult.document_type) {
      const errorMsg = 'Invalid classification result: missing document_type';
      await updateDocumentStatus(documentId, 'classification_failed', errorMsg, tableName);  // ✅ PHASE 4B-3: Pass tableName
      throw new Error(errorMsg);
    }

    // Update database with classification results
    console.log(`[Classify] Updating database with classification: ${classificationResult.document_type}`);
    await updateDocumentClassification(documentId, classificationResult, taskId, tableName);  // ✅ PHASE 4B-3: Pass tableName

    // Check for slot validation failures in AI Processing result
    if (expectedDocumentType && applicationId && documentSlot) {
      console.log(`[Classify] Checking AI Processor slot validation result. Expected: ${expectedDocumentType}, Detected: ${classificationResult.document_type}`);

      // Map document types for comparison (handle 'identity_card' vs 'ic')
      const normalizeDocType = (docType: string): string => {
        const typeMapping: { [key: string]: string } = {
          'identity_card': 'ic',
          'ic': 'ic',
          'payslip': 'payslip',
          'application_form': 'application_form'
        };
        return typeMapping[docType] || docType;
      };

      const normalizedDetected = normalizeDocType(classificationResult.document_type);
      const normalizedExpected = normalizeDocType(expectedDocumentType);

      if (normalizedDetected !== normalizedExpected) {
        // Use the user-friendly message generated by DSPy signature
        const userFriendlyErrorMsg = classificationResult.user_message || 'Wrong document type uploaded. Please upload the correct document for this section.';

        console.log(`[Classify] Slot validation failed - using DSPy-generated message: ${userFriendlyErrorMsg}`);

        await updateDocumentStatus(documentId, 'classification_failed', userFriendlyErrorMsg, tableName);  // ✅ PHASE 4B-3: Pass tableName

        // Throw error to mark task as failed in Trigger.dev
        throw new Error(userFriendlyErrorMsg);
      }

      console.log(`[Classify] Slot validation passed for ${documentSlot}`);
    }

    // ✅ INVOICE DOMAIN VALIDATION: Reject non-invoice documents in invoices domain
    if (documentDomain === 'invoices') {
      console.log(`[Classify] Invoice domain validation - Expected: invoice, Detected: ${classificationResult.document_type}`);

      if (classificationResult.document_type !== 'invoice') {
        // ✅ Use LLM-generated suggestions from Python output
        const errorMessage = classificationResult.user_message || 'This document does not appear to be an invoice.';
        const suggestions = classificationResult.suggestions || [
          'Ensure the document is a valid vendor invoice',
          'Check that the document image is clear and readable',
          'Verify the document includes: vendor name, invoice number, line items, and total amount'
        ];

        // Construct jsonb error_message structure
        const errorDetails = {
          message: errorMessage,
          suggestions: suggestions,
          error_type: 'classification_failed',
          detected_type: classificationResult.document_type,
          confidence: classificationResult.confidence_score
        };

        console.log(`[Classify] Invoice validation failed - LLM-generated error:`, errorDetails);

        await updateDocumentStatus(documentId, 'classification_failed', errorDetails, tableName);

        // Throw error to mark task as failed in Trigger.dev (but prevent retry for wrong doc type)
        const error = new Error(errorMessage);
        (error as any).skipRetry = true; // Mark as non-retryable - user error, not system error
        throw error;
      }

      console.log(`[Classify] Invoice validation passed - document is an invoice`);
    }

    // Route to appropriate extraction task
    const docType = classificationResult.document_type;
    console.log(`[Classify] Routing ${docType} document to extraction task`);

    let extractionTaskId: string | null = null; // Can be null for unsupported docs

    // Use converted_image_path if available (for PDFs), otherwise use storage_path (for direct images)
    const imagePath = (document as any).converted_image_path || (document as any).storage_path;
    console.log(`[Classify] Using image path for extraction: ${imagePath}`);

    switch (docType) {
      case 'receipt':
        // Receipts are only valid for expense_claims domain
        if (documentDomain !== 'expense_claims') {
          const errorMsg = 'Receipt document type is only supported for expense claims.';
          console.log(`[Classify] Rejecting receipt for non-expense_claims domain: ${documentDomain}`);
          await updateDocumentStatus(documentId, 'classification_failed', errorMsg, tableName);
          throw new Error(errorMsg);
        }

        console.log(`[Classify] Triggering receipt extraction for expense claim`);

        // Receipt documents go to extract-receipt-data task
        const receiptRun = await tasks.trigger<typeof extractReceiptData>("extract-receipt-data", {
          expenseClaimId: documentId,  // For expense_claims domain, documentId is the expense claim ID
          documentId: documentId,
          userId: undefined,  // Will be fetched from expense claim record
          documentDomain: 'expense_claims' as const  // Explicitly set to expense_claims
          // Don't pass receiptImageUrl - let the task fetch storage_path from DB and create signed URL
        });
        extractionTaskId = receiptRun.id;
        break;

      case 'invoice':
        console.log(`[Classify] Processing invoice document`);

        // For expense_claims domain, invoices are treated as receipts
        if (documentDomain === 'expense_claims') {
          console.log(`[Classify] Invoice in expense_claims domain - routing to receipt extraction`);
          const expenseInvoiceRun = await tasks.trigger<typeof extractReceiptData>("extract-receipt-data", {
            expenseClaimId: documentId,
            documentId: documentId,
            userId: undefined,
            documentDomain: 'expense_claims' as const  // Explicitly set to expense_claims
            // Don't pass receiptImageUrl - let the task fetch storage_path from DB and create signed URL
          });
          extractionTaskId = expenseInvoiceRun.id;
        } else {
          console.log(`[Classify] Triggering invoice data extraction`);
          const invoiceRun = await tasks.trigger<typeof extractInvoiceData>("extract-invoice-data", {
            documentId: documentId,
            imageStoragePath: imagePath,
            documentDomain: documentDomain
          });
          extractionTaskId = invoiceRun.id;
        }
        break;

      case 'ic':
        // For expense_claims domain, reject ID cards
        if (documentDomain === 'expense_claims') {
          const errorMsg = 'This appears to be an identity card. Please upload a receipt or invoice for expense claims.';
          console.log(`[Classify] Rejecting IC document for expense_claims domain`);

          // Use JSONB error format for expense_claims
          const errorDetails = {
            message: errorMsg,
            suggestions: [
              'Upload a receipt or invoice for expense reimbursement',
              'Identity cards should be uploaded in the Employee Onboarding section',
              'Ensure the document shows purchase details and amount'
            ],
            error_type: 'classification_failed',
            detected_type: 'ic'
          };

          await updateDocumentStatus(documentId, 'extraction_failed', errorDetails, tableName);
          throw new Error(errorMsg);
        }

        console.log(`[Classify] Triggering IC extraction`);
        const icRun = await tasks.trigger<typeof extractIcData>("extract-ic-data", {
          documentId: documentId,
          imageStoragePath: imagePath,
          documentDomain: documentDomain  // ✅ PHASE 4B-3: Pass domain to extraction task
        });
        extractionTaskId = icRun.id;
        break;

      case 'payslip':
        // For expense_claims domain, reject payslips
        if (documentDomain === 'expense_claims') {
          const errorMsg = 'This appears to be a payslip. Please upload a receipt or invoice for expense claims.';
          console.log(`[Classify] Rejecting payslip document for expense_claims domain`);

          // Use JSONB error format for expense_claims
          const errorDetails = {
            message: errorMsg,
            suggestions: [
              'Upload a receipt or invoice for expense reimbursement',
              'Payslips should be uploaded in the HR/Payroll section',
              'Ensure the document shows purchase transaction details'
            ],
            error_type: 'classification_failed',
            detected_type: 'payslip'
          };

          await updateDocumentStatus(documentId, 'extraction_failed', errorDetails, tableName);
          throw new Error(errorMsg);
        }

        console.log(`[Classify] Triggering payslip extraction`);
        const payslipRun = await tasks.trigger<typeof extractPayslipData>("extract-payslip-data", {
          documentId: documentId,
          imageStoragePath: imagePath,
          documentDomain: documentDomain  // ✅ PHASE 4B-3: Pass domain to extraction task
        });
        extractionTaskId = payslipRun.id;
        break;

      case 'application_form':
        // For expense_claims domain, reject application forms
        if (documentDomain === 'expense_claims') {
          const errorMsg = 'This appears to be an application form. Please upload a receipt or invoice for expense claims.';
          console.log(`[Classify] Rejecting application form for expense_claims domain`);

          // Use JSONB error format for expense_claims
          const errorDetails = {
            message: errorMsg,
            suggestions: [
              'Upload a receipt or invoice for expense reimbursement',
              'Application forms should be uploaded in the Applications section',
              'Ensure the document shows a purchase transaction'
            ],
            error_type: 'classification_failed',
            detected_type: 'application_form'
          };

          await updateDocumentStatus(documentId, 'extraction_failed', errorDetails, tableName);
          throw new Error(errorMsg);
        }

        console.log(`[Classify] Triggering application form extraction`);
        const appRun = await tasks.trigger<typeof extractApplicationFormData>("extract-application-form-data", {
          documentId: documentId,
          imageStoragePath: imagePath,
          documentDomain: documentDomain  // ✅ PHASE 4B-3: Pass domain to extraction task
        });
        extractionTaskId = appRun.id;
        break;

      // Gracefully handle other document types that are not yet supported
      case 'other':
        // For expense_claims domain, reject unrecognized documents
        if (documentDomain === 'expense_claims') {
          const errorMsg = 'This document type is not supported for expense claims. Please upload a receipt or invoice.';
          console.log(`[Classify] Rejecting unrecognized document for expense_claims domain`);

          // Use JSONB error format for expense_claims
          const errorDetails = {
            message: errorMsg,
            suggestions: [
              'Upload a receipt or invoice that shows purchase details',
              'Ensure the document is clear and readable',
              'Check that you are uploading the correct document type'
            ],
            error_type: 'classification_failed',
            detected_type: 'other'
          };

          await updateDocumentStatus(documentId, 'extraction_failed', errorDetails, tableName);
          throw new Error(errorMsg);
        }

        console.log(`[Classify] Document type is 'other' - not currently supported for extraction. Stopping pipeline gracefully.`);
        // Update status to 'pending' for invoices, 'completed' for other documents
        // The UI can show the user-friendly message from the classification metadata.
        const finalStatus = tableName === 'invoices' ? 'pending' : 'completed';
        await updateDocumentStatus(documentId, finalStatus, undefined, tableName);  // ✅ PHASE 4B-3: Pass tableName
        break; // Stop processing

      default:
        const errorMsg = `Router error: Unknown document type returned by classifier: ${docType}`;
        await updateDocumentStatus(documentId, 'classification_failed', errorMsg, tableName);  // ✅ PHASE 4B-3: Pass tableName
        throw new Error(errorMsg);
    }

    // Only update the extraction_task_id if a task was actually triggered
    if (extractionTaskId) {
      console.log(`[Classify] Updating extraction task ID: ${extractionTaskId}`);
      await supabase
        .from(tableName)  // ✅ PHASE 4B-3: Routed based on domain
        .update({ extraction_task_id: extractionTaskId })
        .eq('id', documentId);
    }

    console.log(`[Classify] Successfully routed or handled ${docType} document`);

    return {
      success: true,
      documentId: documentId,
      classification: classificationResult,
      extractionTaskId: extractionTaskId,
      classificationTaskId: taskId,
      slotValidation: expectedDocumentType ? {
        expectedType: expectedDocumentType,
        detectedType: classificationResult.document_type,
        documentSlot,
        applicationId,
        validationPassed: true
      } : undefined
    };

  } catch (error) {
    console.error(`[Classify] Classification failed for ${documentId}:`, error);

    // Check if this is a user error (wrong document type) that shouldn't retry
    const isUserError = error instanceof Error && (error as any).skipRetry === true;

    if (isUserError) {
      // For user errors (wrong document type), don't retry - just fail immediately
      // Note: Database already updated with detailed error before throwing
      console.log(`[Classify] User error detected - will not retry: ${error.message}`);
    } else {
      // For system errors and unexpected failures, ensure database status is updated
      // Only update if not already handled by specific error cases
      try {
        const errorMessage = error instanceof Error ? error.message : 'Classification failed due to unexpected error';

        // Create structured error for expense_claims (JSONB format)
        const errorDetails = tableName === 'expense_claims'
          ? {
              message: errorMessage,
              suggestions: [
                'Please try uploading the document again',
                'Ensure the document image is clear and readable',
                'Contact support if the issue persists'
              ],
              error_type: 'classification_failed',
              technical_error: error instanceof Error ? error.stack : String(error)
            }
          : errorMessage; // String format for other tables

        console.log(`[Classify] Updating document status to failed due to unexpected error`);
        await updateDocumentStatus(documentId, 'classification_failed', errorDetails, tableName);
      } catch (updateError) {
        console.error(`[Classify] Failed to update document status during error handling:`, updateError);
        // Don't throw here to avoid masking the original error
      }
    }

    // Re-throw for Trigger.dev error handling
    throw error;
  }
  }
});