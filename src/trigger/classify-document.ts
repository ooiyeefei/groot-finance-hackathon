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


interface ClassifyDocumentPayload {
  documentId: string;
  expectedDocumentType?: string; // NEW: For slot validation
  applicationId?: string; // NEW: For application context
  documentSlot?: string; // NEW: For slot context
}



export const classifyDocument = task({
  id: "classify-document",
  run: async (payload: ClassifyDocumentPayload, { ctx }) => {
  const { documentId, expectedDocumentType, applicationId, documentSlot } = payload;
  const taskId = ctx.run.id;

  console.log(`[Classify] Starting classification for document ${documentId}`);

  try {
    // Update status to classifying
    await updateDocumentStatus(documentId, 'classifying');

    // Fetch document metadata (needed for task routing)
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('storage_path, converted_image_path, file_type, document_metadata')
      .eq('id', documentId)
      .single();

    if (fetchError || !document) {
      throw new Error(`Document not found: ${fetchError?.message}`);
    }

    // UNIFIED ARCHITECTURE: Use bucket list() to discover files - check converted path first, then original path
    console.log(`[Classify] Using unified bucket list() architecture for document ${documentId}`);

    // Determine which path to use: converted_image_path (for PDFs) or storage_path (for images)
    const searchPath = document.converted_image_path || document.storage_path;
    console.log(`[Classify] Discovering files at storage location: ${searchPath}`);
    console.log(`[Classify] Using ${document.converted_image_path ? 'converted_image_path' : 'storage_path'} for file discovery`);

    // Use storage.list() to discover all files at the determined location
    const { data: fileList, error: listError } = await supabase.storage
      .from('documents')
      .list(searchPath, {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (listError) {
      throw new Error(`Failed to list files at storage path: ${listError.message}`);
    }

    if (!fileList || fileList.length === 0) {
      throw new Error(`No files found at storage path: ${searchPath}`);
    }

    console.log(`[Classify] Found ${fileList.length} file(s) at location`);

    // For classification, we only need the first file (first page for multi-page PDFs)
    const firstFile = fileList[0];
    const classifyImagePath = `${searchPath}/${firstFile.name}`;

    console.log(`[Classify] Using first file for classification: ${classifyImagePath}`);

    // Create signed URL for the discovered file
    const { data: urlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(classifyImagePath, 600); // 10 minute expiry

    if (urlError || !urlData) {
      throw new Error(`Failed to create signed URL: ${urlError?.message}`);
    }

    console.log(`[Classify] Created signed URL for first file`);

    // Run structured AI classification script with URL instead of base64
    console.log(`[Classify] Running structured AI classification via python.runScript`);
    const rawResult = await python.runScript(
      "./src/python/classify_document.py",
      [urlData.signedUrl]
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
      await updateDocumentStatus(documentId, 'classification_failed', errorMsg);
      throw new Error(errorMsg);
    }

    const classificationResult = validationResult.data;
    console.log(`[Classify] Classification completed:`, classificationResult);

    // Handle classification failure from Python script
    if (!classificationResult.success) {
      const errorMsg = `Classification failed: ${classificationResult.error}`;
      await updateDocumentStatus(documentId, 'classification_failed', errorMsg);
      throw new Error(errorMsg);
    }

    // Validate classification result
    if (!classificationResult.document_type) {
      const errorMsg = 'Invalid classification result: missing document_type';
      await updateDocumentStatus(documentId, 'classification_failed', errorMsg);
      throw new Error(errorMsg);
    }

    // Update database with classification results
    console.log(`[Classify] Updating database with classification: ${classificationResult.document_type}`);
    await updateDocumentClassification(documentId, classificationResult, taskId);

    // NEW: Slot validation logic (if expectedDocumentType provided)
    if (expectedDocumentType && applicationId && documentSlot) {
      console.log(`[Classify] Performing slot validation. Expected: ${expectedDocumentType}, Detected: ${classificationResult.document_type}`);

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
        const errorMsg = `Document type mismatch for slot '${documentSlot}'. Expected: ${expectedDocumentType}, but detected: ${classificationResult.document_type}. Please upload the correct document type.`;
        console.log(`[Classify] Slot validation failed: ${errorMsg}`);

        await updateDocumentStatus(documentId, 'classification_failed', errorMsg);

        // Throw error to mark task as failed in Trigger.dev
        throw new Error(errorMsg);
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
          imageStoragePath: imagePath // Pass the actual path
        });
        extractionTaskId = invoiceRun.id;
        break;

      case 'ic':
        console.log(`[Classify] Triggering IC extraction`);
        const icRun = await tasks.trigger<typeof extractIcData>("extract-ic-data", {
          documentId: documentId,
          imageStoragePath: imagePath
        });
        extractionTaskId = icRun.id;
        break;

      case 'payslip':
        console.log(`[Classify] Triggering payslip extraction`);
        const payslipRun = await tasks.trigger<typeof extractPayslipData>("extract-payslip-data", {
          documentId: documentId,
          imageStoragePath: imagePath
        });
        extractionTaskId = payslipRun.id;
        break;

      case 'application_form':
        console.log(`[Classify] Triggering application form extraction`);
        const appRun = await tasks.trigger<typeof extractApplicationFormData>("extract-application-form-data", {
          documentId: documentId,
          imageStoragePath: imagePath
        });
        extractionTaskId = appRun.id;
        break;

      // Gracefully handle other document types that are not yet supported
      case 'other':
        console.log(`[Classify] Document type is 'other' - not currently supported for extraction. Stopping pipeline gracefully.`);
        // Update status to 'completed' as the classification process is done successfully.
        // The UI can show the user-friendly message from the classification metadata.
        await updateDocumentStatus(documentId, 'completed');
        break; // Stop processing

      default:
        const errorMsg = `Router error: Unknown document type returned by classifier: ${docType}`;
        await updateDocumentStatus(documentId, 'classification_failed', errorMsg);
        throw new Error(errorMsg);
    }

    // Only update the extraction_task_id if a task was actually triggered
    if (extractionTaskId) {
      console.log(`[Classify] Updating extraction task ID: ${extractionTaskId}`);
      await supabase
        .from('documents')
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

    // Update document status to failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown classification error';
    await updateDocumentStatus(documentId, 'classification_failed', errorMessage);

    // Re-throw for Trigger.dev error handling
    throw error;
  }
  }
});