/**
 * Payslip Data Extraction Task
 * Extracts payslip data using DSPy and Pydantic models
 */

import { task, tasks } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { supabase, updateDocumentStatus, updateExtractionResults, fetchDocumentImage } from './utils/db-helpers';
import { ExtractionResultSchema, validatePythonScriptResult, type ExtractionResult } from './utils/schemas';

// Import List type for TypeScript
type List<T> = T[];


interface ExtractPayslipDataPayload {
  documentId: string;
  imageStoragePath: string;
}

/**
 * Enhance extraction result with parsed date for client-side validation
 * Converts standardized MMM-YYYY format to YYYY-MM-DD for consistent client processing
 */
async function enhanceWithParsedDate(extractionResult: ExtractionResult, documentId: string): Promise<ExtractionResult> {
  try {
    const payPeriod = extractionResult.extracted_data?.pay_period;

    if (!payPeriod || typeof payPeriod !== 'string') {
      console.log(`[ExtractPayslip] No pay_period found for ${documentId}, skipping date parsing`);
      return extractionResult;
    }

    console.log(`[ExtractPayslip] Parsing pay_period: "${payPeriod}" for client-side validation`);

    // Parse standardized MMM-YYYY format (e.g., 'APR-2025', 'JUN-2024')
    const standardizedMatch = payPeriod.match(/^([A-Z]{3})-(\d{4})$/i);

    if (standardizedMatch) {
      const [, monthAbbr, year] = standardizedMatch;
      const monthNumber = getMonthNumber(monthAbbr.toUpperCase());

      if (monthNumber) {
        // Create date representing the last day of the pay period month
        // This ensures we capture the full month for validation purposes
        const lastDayOfMonth = new Date(parseInt(year), monthNumber, 0); // Day 0 = last day of previous month
        const parsedPayDate = lastDayOfMonth.toISOString().split('T')[0]; // YYYY-MM-DD format

        console.log(`[ExtractPayslip] Parsed "${payPeriod}" to client-ready date: ${parsedPayDate}`);

        // Add parsed date to extracted_data for client-side validation
        const enhancedData = {
          ...extractionResult.extracted_data,
          parsed_pay_date: parsedPayDate,
          pay_period_original: payPeriod // Keep original for reference
        };

        return {
          ...extractionResult,
          extracted_data: enhancedData
        };
      }
    }

    console.warn(`[ExtractPayslip] Could not parse pay_period "${payPeriod}" - expected MMM-YYYY format`);
    return extractionResult;

  } catch (error) {
    console.error(`[ExtractPayslip] Error parsing pay_period for ${documentId}:`, error);
    // Return original result if parsing fails - don't break the extraction
    return extractionResult;
  }
}

/**
 * Convert 3-letter month abbreviation to number (1-12)
 */
function getMonthNumber(monthAbbr: string): number | null {
  const months: { [key: string]: number } = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4,
    'MAY': 5, 'JUN': 6, 'JUL': 7, 'AUG': 8,
    'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
  };
  return months[monthAbbr] || null;
}

/**
 * Extract Python result from runScript response
 * Handles both direct results and stdout-wrapped results
 */
function extractPythonResult(rawResult: any): any {
  if (rawResult && typeof rawResult === 'object' && 'stdout' in rawResult) {
    try {
      const stdout = (rawResult as any).stdout.trim();
      return JSON.parse(stdout);
    } catch (parseError) {
      console.error(`[ExtractPayslip] Failed to parse Python JSON output:`, parseError);
      return {
        success: false,
        error: 'Document processing encountered an unexpected format error. Please try uploading the document again.',
        error_type: 'ParseError'
      };
    }
  }
  return rawResult;
}




export const extractPayslipData = task({
  id: "extract-payslip-data",
  run: async (payload: ExtractPayslipDataPayload, { ctx }) => {
  const { documentId, imageStoragePath } = payload;

  console.log(`[ExtractPayslip] Starting payslip extraction for document ${documentId}`);
  console.log(`[ExtractPayslip] Image storage path: ${imageStoragePath}`);

  try {
    // Update status to extracting
    await updateDocumentStatus(documentId, 'extracting');

    // UNIFIED ARCHITECTURE: Use bucket list() to discover ALL files at storage_path location
    console.log(`[ExtractPayslip] Using unified bucket list() architecture`);
    console.log(`[ExtractPayslip] Discovering files at storage location: ${imageStoragePath}`);

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

    console.log(`[ExtractPayslip] Found ${fileList.length} file(s) at location`);

    // Create signed URLs for ALL discovered files (unified approach for single/multi-page)
    const pageUrls = [];
    for (const file of fileList) {
      const filePath = `${imageStoragePath}/${file.name}`;
      console.log(`[ExtractPayslip] Creating signed URL for file: ${filePath}`);

      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 600);

      if (urlError || !urlData) {
        throw new Error(`Failed to create signed URL for ${file.name}: ${urlError?.message}`);
      }

      pageUrls.push(urlData.signedUrl);
    }

    console.log(`[ExtractPayslip] Created ${pageUrls.length} signed URLs for unified processing`);

    // UNIFIED PROCESSING: Single call to Python script with JSON array (works for both single/multi-page)
    const documentType = pageUrls.length > 1 ? 'multi_payslip' : 'payslip';
    console.log(`[ExtractPayslip] Running unified DSPy extraction with type: ${documentType}`);

    const rawResult = await python.runScript(
      "./src/python/extract_document.py",
      [documentType, JSON.stringify(pageUrls)],
        {
          timeout: 180000, // 3 minute timeout to prevent infinite hangs
        }
    );

    // Debug: Log what Python script returned
    console.log(`[ExtractPayslip] Python script result type: ${typeof rawResult}`);
    console.log(`[ExtractPayslip] Python script result preview:`, JSON.stringify(rawResult).substring(0, 300));

    // Extract actual result from python.runScript response
    const pythonResult = extractPythonResult(rawResult);

      // Check if Python script returned an error and provide user-friendly error message
      if (pythonResult && pythonResult.success === false && pythonResult.error) {
        let userFriendlyError = 'Unable to extract data from this payslip. ';

        // Determine user-friendly message based on error type
        if (pythonResult.error_type === 'ParseError') {
          userFriendlyError += 'The document format could not be processed. Please ensure the payslip is clear and try again.';
        } else if (pythonResult.error.includes('API') || pythonResult.error.includes('overload')) {
          userFriendlyError += 'Our processing service is temporarily busy. Please try again in a few moments.';
        } else if (pythonResult.error.includes('timeout') || pythonResult.error.includes('hang')) {
          userFriendlyError += 'The document took too long to process. Please try uploading a smaller or clearer image.';
        } else if (pythonResult.error.includes('image') || pythonResult.error.includes('download')) {
          userFriendlyError += 'There was an issue accessing your document. Please try uploading it again.';
        } else {
          userFriendlyError += 'Please try uploading the document again or contact support if the issue persists.';
        }

        console.error(`[ExtractPayslip] Technical error details:`, pythonResult.error);
        await updateDocumentStatus(documentId, 'failed', userFriendlyError);
        throw new Error(userFriendlyError);
      }

      const extractionResult = validatePythonScriptResult(pythonResult, ExtractionResultSchema, 'Payslip Extraction');

      console.log(`[ExtractPayslip] Extraction completed:`, extractionResult);

      // Handle extraction failure with user-friendly message
      if (!extractionResult.success) {
        const userFriendlyError = 'Unable to extract data from your payslip. Please ensure the document is clear and all information is visible, then try again.';
        console.error(`[ExtractPayslip] Technical extraction failure:`, extractionResult.error);
        await updateDocumentStatus(documentId, 'failed', userFriendlyError);
        throw new Error(userFriendlyError);
      }

    // Handle multi-payslip vs single payslip results
    let finalResult;
    if (documentType === 'multi_payslip') {
      // For multi-payslip, enhance each payslip with parsed dates
      const enhancedPayslips = await Promise.all(
        extractionResult.extracted_data.payslips.map(async (payslip: any, index: number) => {
          console.log(`[ExtractPayslip] Enhancing payslip ${index + 1} with parsed date`);
          const singlePayslipResult = { success: true, extracted_data: payslip };
          return await enhanceWithParsedDate(singlePayslipResult, `${documentId}_page_${payslip.page_number || index + 1}`);
        })
      );

      finalResult = {
        ...extractionResult,
        extracted_data: {
          ...extractionResult.extracted_data,
          payslips: enhancedPayslips.map(enhanced => enhanced.extracted_data)
        }
      };

      console.log(`[ExtractPayslip] Enhanced ${enhancedPayslips.length} payslips from multi-page document`);
    } else {
      // Single payslip: enhance with parsed date
      finalResult = await enhanceWithParsedDate(extractionResult, documentId);
      console.log(`[ExtractPayslip] Enhanced single payslip with parsed date`);
    }

    // Update database with extraction results
    console.log(`[ExtractPayslip] Updating database with extracted data`);
    await updateExtractionResults(documentId, finalResult);

    console.log(`[ExtractPayslip] Successfully completed ${documentType} extraction for ${documentId}`);

    // Trigger validation after successful extraction (fire-and-forget)
    try {
      // Get the applicationId from the document to trigger validation
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('application_id')
        .eq('id', documentId)
        .single();

      if (!docError && document?.application_id) {
        console.log(`[ExtractPayslip] Triggering payslip validation for application ${document!.application_id}`);

        // Trigger validation task (fire-and-forget)
        await tasks.trigger("validate-payslip-dates", {
          applicationId: document!.application_id
        });

        console.log(`[ExtractPayslip] Payslip validation triggered successfully`);
      } else {
        console.warn(`[ExtractPayslip] Could not trigger validation - application_id not found for document ${documentId}`);
      }
    } catch (validationError) {
      console.error(`[ExtractPayslip] Failed to trigger validation:`, validationError);
      // Don't throw - validation is optional and shouldn't fail the main extraction
    }

    // Return successful result
    return {
      success: true,
      documentId: documentId,
      extraction: finalResult,
      taskId: ctx.run.id,
      extractionType: documentType
    };

  } catch (error) {
    console.error(`[ExtractPayslip] Extraction failed for ${documentId}:`, error);
    console.log(`[ExtractPayslip] Current attempt info:`, {
      runId: ctx.run.id,
      attempt: ctx.attempt?.number || 1
    });

    // Determine if this is already a user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
    const isUserFriendly = errorMessage.includes('Unable to extract') ||
                          errorMessage.includes('document format') ||
                          errorMessage.includes('service is temporarily busy') ||
                          errorMessage.includes('try again');

    const finalErrorMessage = isUserFriendly
      ? errorMessage
      : 'Unable to process your payslip at this time. Please try uploading the document again or contact support if the issue persists.';

    // Log the failure for debugging
    console.log(`[ExtractPayslip] Task failed on attempt ${ctx.attempt?.number || 1}. Error: ${finalErrorMessage}`);

    // Let Trigger.dev's retry mechanism handle status updates
    // Only update to failed status if this is the final attempt (maxAttempts reached)
    const isLastAttempt = (ctx.attempt?.number || 1) >= 3; // maxAttempts is 3

    if (isLastAttempt) {
      console.log(`[ExtractPayslip] Final attempt failed, updating document status to failed`);
      await updateDocumentStatus(documentId, 'failed', finalErrorMessage);
    } else {
      console.log(`[ExtractPayslip] Attempt ${ctx.attempt?.number || 1}/3 failed, will retry`);
    }

    throw new Error(finalErrorMessage);
  }
  }
});