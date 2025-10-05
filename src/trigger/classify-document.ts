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

// Import task types for routing
import type { processDocumentOCR } from './process-document-ocr';
import type { extractIcData } from './extract-ic-data';
import type { extractPayslipData } from './extract-payslip-data';
import type { extractApplicationFormData } from './extract-application-form-data';

// ✅ PHASE 4B-3: Domain-to-table mapping for multi-domain architecture
const DOMAIN_TABLE_MAP = {
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
  run: async (payload: ClassifyDocumentPayload, { ctx }) => {
  const { documentId, documentDomain, expectedDocumentType, applicationId, documentSlot } = payload;
  const taskId = ctx.run.id;

  // ✅ PHASE 4B-3: Route to correct table based on domain
  const tableName = DOMAIN_TABLE_MAP[documentDomain];
  console.log(`[Classify] Starting classification for document ${documentId} in ${tableName} (domain: ${documentDomain})`);

  try {
    // Update status to classifying
    await updateDocumentStatus(documentId, 'classifying', undefined, tableName);  // ✅ PHASE 4B-3: Pass tableName

    // Fetch document metadata (needed for task routing)
    const { data: document, error: fetchError } = await supabase
      .from(tableName)  // ✅ PHASE 4B-3: Routed based on domain
      .select('storage_path, converted_image_path, file_type, document_metadata')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      throw new Error(`Document not found: ${fetchError?.message}`);
    }

    // GRACEFUL PATH HANDLING: Different approaches for images vs converted PDFs
    console.log(`[Classify] Document type: ${document.file_type}, has converted path: ${!!document.converted_image_path}`);

    let classifyImagePath: string;

    if (document.converted_image_path) {
      // PDF CASE: converted_image_path is a folder containing multiple images
      console.log(`[Classify] PDF workflow - using converted image folder: ${document.converted_image_path}`);

      const { data: fileList, error: listError } = await supabase.storage
        .from('documents')
        .list(document.converted_image_path, {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (listError) {
        throw new Error(`Failed to list converted images: ${listError.message}`);
      }

      if (!fileList || fileList.length === 0) {
        throw new Error(`No converted images found in folder: ${document.converted_image_path}`);
      }

      console.log(`[Classify] Found ${fileList.length} converted image(s), using first for classification`);

      // Use first converted image for classification
      const firstFile = fileList[0];
      classifyImagePath = `${document.converted_image_path}/${firstFile.name}`;

    } else {
      // IMAGE CASE: storage_path is the direct file path
      console.log(`[Classify] Image workflow - using direct file path: ${document.storage_path}`);
      classifyImagePath = document.storage_path;
    }

    console.log(`[Classify] Final classification image path: ${classifyImagePath}`);

    // Create signed URL for the discovered file
    const { data: urlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(classifyImagePath, 600); // 10 minute expiry

    if (urlError || !urlData) {
      throw new Error(`Failed to create signed URL: ${urlError?.message}`);
    }

    console.log(`[Classify] Created signed URL for first file`);

    // Run structured AI classification script with slot validation context
    console.log(`[Classify] Running structured AI classification with slot validation via python.runScript`);
    const rawResult = await python.runScript(
      "./src/python/classify_document.py",
      [urlData.signedUrl, expectedDocumentType || "", documentSlot || ""]
    );

    // Debug: Log what Python script actually returned
    console.log(`[Classify] Python script raw result:`, JSON.stringify(rawResult, null, 2));

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

    // Check for slot validation failures in DSPy result
    if (expectedDocumentType && applicationId && documentSlot) {
      console.log(`[Classify] Checking DSPy slot validation result. Expected: ${expectedDocumentType}, Detected: ${classificationResult.document_type}`);

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

    // Route to appropriate extraction task
    const docType = classificationResult.document_type;
    console.log(`[Classify] Routing ${docType} document to extraction task`);

    let extractionTaskId: string | null = null; // Can be null for unsupported docs

    // Use converted_image_path if available (for PDFs), otherwise use storage_path (for direct images)
    const imagePath = document.converted_image_path || document.storage_path;
    console.log(`[Classify] Using image path for extraction: ${imagePath}`);

    switch (docType) {
      case 'invoice':
        console.log(`[Classify] Triggering legacy OCR for invoice`);

        const invoiceRun = await tasks.trigger<typeof processDocumentOCR>("process-document-ocr", {
          documentId: documentId,
          imageStoragePath: imagePath,  // Pass the actual path
          documentDomain: documentDomain  // ✅ PHASE 4B-3: Pass domain to extraction task
        });
        extractionTaskId = invoiceRun.id;
        break;

      case 'ic':
        console.log(`[Classify] Triggering IC extraction`);
        const icRun = await tasks.trigger<typeof extractIcData>("extract-ic-data", {
          documentId: documentId,
          imageStoragePath: imagePath,
          documentDomain: documentDomain  // ✅ PHASE 4B-3: Pass domain to extraction task
        });
        extractionTaskId = icRun.id;
        break;

      case 'payslip':
        console.log(`[Classify] Triggering payslip extraction`);
        const payslipRun = await tasks.trigger<typeof extractPayslipData>("extract-payslip-data", {
          documentId: documentId,
          imageStoragePath: imagePath,
          documentDomain: documentDomain  // ✅ PHASE 4B-3: Pass domain to extraction task
        });
        extractionTaskId = payslipRun.id;
        break;

      case 'application_form':
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
        console.log(`[Classify] Document type is 'other' - not currently supported for extraction. Stopping pipeline gracefully.`);
        // Update status to 'completed' as the classification process is done successfully.
        // The UI can show the user-friendly message from the classification metadata.
        await updateDocumentStatus(documentId, 'completed', undefined, tableName);  // ✅ PHASE 4B-3: Pass tableName
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

    // ✅ PHASE 4B-3: Route error update to correct table
    const errorTableName = DOMAIN_TABLE_MAP[payload.documentDomain];

    // Update document status to failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown classification error';
    await updateDocumentStatus(documentId, 'classification_failed', errorMessage, errorTableName);  // ✅ PHASE 4B-3: Pass tableName

    // Re-throw for Trigger.dev error handling
    throw error;
  }
  }
});