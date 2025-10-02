/**
 * Application Form Data Extraction Task
 * Extracts application form data using DSPy and Pydantic models
 */

import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { supabase, updateDocumentStatus, updateExtractionResults, fetchDocumentImage } from './utils/db-helpers';
import { ExtractionResultSchema, validatePythonScriptResult, type ExtractionResult } from './utils/schemas';


interface ExtractApplicationFormDataPayload {
  documentId: string;
  imageStoragePath: string; // This is now storage_path - can be single file or folder
}



export const extractApplicationFormData = task({
  id: "extract-application-form-data",
  run: async (payload: ExtractApplicationFormDataPayload, { ctx }) => {
  const { documentId, imageStoragePath } = payload;

  console.log(`[ExtractApplication] Starting application form extraction for document ${documentId}`);
  console.log(`[ExtractApplication] Image storage path: ${imageStoragePath}`);

  try {
    // Step 1: Update status to pending_extraction (consistent with payslip flow)
    await updateDocumentStatus(documentId, 'pending_extraction');

    // Brief delay to allow UI to show the status update
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Update status to extracting
    await updateDocumentStatus(documentId, 'extracting');

    // UNIFIED ARCHITECTURE: Use bucket list() to discover ALL files at storage_path location
    console.log(`[ExtractApplication] Using unified bucket list() architecture`);
    console.log(`[ExtractApplication] Discovering all files at storage location: ${imageStoragePath}`);

    // Use storage.list() to discover all files at the storage_path location
    const { data: fileList, error: listError } = await supabase.storage
      .from('documents')
      .list(imageStoragePath, {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (listError) {
      throw new Error(`Failed to list files at storage path: ${listError.message}`);
    }

    if (!fileList || fileList.length === 0) {
      throw new Error(`No files found at storage path: ${imageStoragePath}`);
    }

    console.log(`[ExtractApplication] Found ${fileList.length} file(s) at location`);

    // Create signed URLs for ALL discovered files (unified approach for single/multi-page)
    const pageUrls = [];
    for (const file of fileList) {
      const filePath = `${imageStoragePath}/${file.name}`;
      console.log(`[ExtractApplication] Creating signed URL for file: ${filePath}`);

      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 600);

      if (urlError || !urlData) {
        throw new Error(`Failed to create signed URL for ${file.name}: ${urlError?.message}`);
      }

      pageUrls.push(urlData.signedUrl);
    }

    console.log(`[ExtractApplication] Created ${pageUrls.length} signed URLs for unified processing`);

    // Single call to Python script with JSON array (unified approach)
    console.log(`[ExtractApplication] Running unified DSPy application form extraction`);
    const rawResult = await python.runScript(
      "./src/python/extract_document.py",
      ["application_form", JSON.stringify(pageUrls)],
      {
        timeout: pageUrls.length > 1 ? 300000 : 180000, // 5min for multi-page, 3min for single
      }
    );

    // Debug: Log what Python script returned (detailed like process-document-ocr)
    console.log(`[ExtractApplication] Python script result type: ${typeof rawResult}`);
    console.log(`[ExtractApplication] Python script result preview:`, JSON.stringify(rawResult).substring(0, 300));

    // Enhanced debugging for extraction quality analysis
    if (rawResult && typeof rawResult === 'object' && 'stderr' in rawResult) {
      const stderr = (rawResult as any).stderr || '';
      const stdout = (rawResult as any).stdout || '';

      console.log(`[ExtractApplication] Python stderr length: ${stderr.length}`);
      console.log(`[ExtractApplication] Python stdout length: ${stdout.length}`);

      // Log key parts of stderr for debugging
      const stderrLines = stderr.split('\n');
      const keyLines = stderrLines.filter((line: string) =>
        line.includes('[ReAct Agent]') ||
        line.includes('Tool') ||
        line.includes('ERROR') ||
        line.includes('confidence') ||
        line.includes('extracted')
      );

      if (keyLines.length > 0) {
        console.log(`[ExtractApplication] Key ReAct execution lines:`);
        keyLines.forEach((line: string) => console.log(`  ${line}`));
      }
    }

    console.log(`[ExtractApplication] Python script raw result (full):`, JSON.stringify(rawResult, null, 2));

    // Extract actual result from python.runScript response
    let pythonResult: any;
    if (rawResult && typeof rawResult === 'object' && 'stdout' in rawResult) {
      try {
        // Parse stdout directly as JSON since our Python script outputs clean JSON
        const stdout = (rawResult as any).stdout.trim();
        pythonResult = JSON.parse(stdout);
        console.log(`[ExtractApplication] Successfully parsed Python JSON output`);
      } catch (parseError) {
        console.error(`[ExtractApplication] Failed to parse Python JSON output:`, parseError);
        console.log(`[ExtractApplication] Raw stdout for debugging:`, (rawResult as any).stdout);

        // Create user-friendly error message
        pythonResult = {
          success: false,
          error: 'Document processing encountered an unexpected format error. Please try uploading the document again.',
          document_type: 'application_form',
          error_type: 'ParseError'
        };
      }
    } else {
      pythonResult = rawResult;
    }

    // Check if Python script returned an error and provide user-friendly error message
    if (pythonResult && pythonResult.success === false && pythonResult.error) {
      let userFriendlyError = 'Unable to extract data from this application form. ';

      // Determine user-friendly message based on error type
      if (pythonResult.error_type === 'ParseError') {
        userFriendlyError += 'The document format could not be processed. Please ensure the form is clear and try again.';
      } else if (pythonResult.error.includes('API') || pythonResult.error.includes('overload')) {
        userFriendlyError += 'Our processing service is temporarily busy. Please try again in a few moments.';
      } else if (pythonResult.error.includes('timeout') || pythonResult.error.includes('hang')) {
        userFriendlyError += 'The document took too long to process. Please try uploading a smaller or clearer image.';
      } else if (pythonResult.error.includes('image') || pythonResult.error.includes('download')) {
        userFriendlyError += 'There was an issue accessing your document. Please try uploading it again.';
      } else {
        userFriendlyError += 'Please try uploading the document again or contact support if the issue persists.';
      }

      console.error(`[ExtractApplication] Technical error details:`, pythonResult.error);
      await updateDocumentStatus(documentId, 'failed', userFriendlyError);
      throw new Error(userFriendlyError);
    }

    const extractionResult = validatePythonScriptResult(pythonResult, ExtractionResultSchema, 'Application Form Extraction');

    console.log(`[ExtractApplication] Extraction completed:`, extractionResult);

    // Handle extraction failure with user-friendly message
    if (!extractionResult.success) {
      const userFriendlyError = 'Unable to extract data from your application form. Please ensure the document is clear and all information is visible, then try again.';
      console.error(`[ExtractApplication] Technical extraction failure:`, extractionResult.error);
      await updateDocumentStatus(documentId, 'failed', userFriendlyError);
      throw new Error(userFriendlyError);
    }

    // Update database with extraction results
    console.log(`[ExtractApplication] Updating database with extracted data`);
    await updateExtractionResults(documentId, extractionResult);

    // Trigger downstream image annotation if bounding boxes exist
    if (extractionResult.extracted_data?.metadata?.boundingBoxes) {
      console.log(`[ExtractApplication] Triggering image annotation for visual feedback`);
      // TODO: Trigger annotate-document-image task
    }

    console.log(`[ExtractApplication] Successfully completed application form extraction for ${documentId}`);

    return {
      success: true,
      documentId: documentId,
      extraction: extractionResult,
      taskId: ctx.run.id
    };

  } catch (error) {
    console.error(`[ExtractApplication] Extraction failed for ${documentId}:`, error);

    // Determine if this is already a user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
    const isUserFriendly = errorMessage.includes('Unable to extract') ||
                          errorMessage.includes('document format') ||
                          errorMessage.includes('service is temporarily busy') ||
                          errorMessage.includes('try again');

    const finalErrorMessage = isUserFriendly
      ? errorMessage
      : 'Unable to process your application form at this time. Please try uploading the document again or contact support if the issue persists.';

    await updateDocumentStatus(documentId, 'failed', finalErrorMessage);
    throw new Error(finalErrorMessage);
  }
  }
});