/**
 * Invoice Extraction Step
 *
 * Extracts structured financial data from invoice documents using Gemini AI.
 */

import type {
  InvoiceExtractionResult,
  ConvertedImageInfo,
  BusinessCategory,
} from '../types';
import {
  extractInvoiceData,
  needsManualReview,
  GeminiOperationError,
} from '../utils/gemini-client';
import { getPresignedImageUrls, getPresignedReadUrl } from '../utils/s3-client';

/**
 * Error thrown when invoice extraction fails
 */
export class InvoiceExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'InvoiceExtractionError';
  }
}

/**
 * Extract invoice data from document images.
 *
 * @param documentId - Document ID for logging
 * @param images - Converted image info (for PDFs) or null (for direct images)
 * @param storagePath - Original document S3 path (used if no conversion, without domain prefix)
 * @param categories - Optional business categories for line item matching
 * @param domain - Domain for S3 prefix (invoices or expense_claims)
 * @returns Invoice extraction result
 */
export async function extractInvoice(
  documentId: string,
  images: ConvertedImageInfo[] | null,
  storagePath: string,
  categories?: BusinessCategory[],
  domain?: 'invoices' | 'expense_claims'
): Promise<InvoiceExtractionResult> {
  try {
    // Get presigned URLs for images
    let imageUrls: string[];

    if (images && images.length > 0) {
      // Use converted images
      imageUrls = await getPresignedImageUrls(images);
    } else {
      // Use original image directly - build full S3 key by prepending domain prefix
      const s3Key = domain ? `${domain}/${storagePath}` : storagePath;
      imageUrls = [await getPresignedReadUrl(s3Key)];
    }

    console.log(`[${documentId}] Extracting invoice data from ${imageUrls.length} image(s)`);

    // Extract using Gemini AI
    const result = await extractInvoiceData(imageUrls, categories);

    // Log extraction confidence
    console.log(`[${documentId}] Invoice extraction confidence: ${result.confidence}`);

    // Check if manual review is needed
    if (needsManualReview(result.confidence)) {
      console.warn(`[${documentId}] Low confidence extraction - may need manual review`);
    }

    // Validate required fields
    validateInvoiceResult(result);

    return result;
  } catch (error) {
    if (error instanceof InvoiceExtractionError) {
      throw error;
    }

    if (error instanceof GeminiOperationError) {
      throw new InvoiceExtractionError(
        error.message,
        error.code,
        error.retryable
      );
    }

    throw new InvoiceExtractionError(
      `Invoice extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'EXTRACTION_FAILED',
      false
    );
  }
}

/**
 * Validate that required invoice fields are present.
 *
 * @param result - Extraction result to validate
 * @throws {InvoiceExtractionError} If validation fails
 */
function validateInvoiceResult(result: InvoiceExtractionResult): void {
  const errors: string[] = [];

  if (!result.vendorName || result.vendorName.trim() === '') {
    errors.push('Vendor name is required');
  }

  if (typeof result.totalAmount !== 'number' || isNaN(result.totalAmount)) {
    errors.push('Total amount must be a valid number');
  }

  if (!result.currency || result.currency.length !== 3) {
    errors.push('Currency must be a 3-letter ISO code');
  }

  if (!result.transactionDate || !isValidDate(result.transactionDate)) {
    errors.push('Transaction date must be a valid YYYY-MM-DD date');
  }

  if (errors.length > 0) {
    throw new InvoiceExtractionError(
      `Invoice validation failed: ${errors.join('; ')}`,
      'EXTRACTION_FAILED',
      false
    );
  }
}

/**
 * Check if a date string is valid YYYY-MM-DD format.
 */
function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Calculate total from line items and compare with extracted total.
 *
 * @param result - Extraction result to validate
 * @returns Discrepancy amount (0 if totals match)
 */
export function calculateLineItemDiscrepancy(
  result: InvoiceExtractionResult
): number {
  if (!result.lineItems || result.lineItems.length === 0) {
    return 0; // No line items to compare
  }

  const calculatedTotal = result.lineItems.reduce(
    (sum, item) => sum + item.totalAmount,
    0
  );

  return Math.abs(result.totalAmount - calculatedTotal);
}
