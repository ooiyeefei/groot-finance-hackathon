/**
 * Receipt Extraction Step
 *
 * Extracts structured financial data from receipt documents using Gemini AI.
 * Includes receipt-specific fields like store location and payment method.
 */

import type {
  ReceiptExtractionResult,
  ConvertedImageInfo,
  BusinessCategory,
} from '../types';
import {
  extractReceiptData,
  needsManualReview,
  GeminiOperationError,
} from '../utils/gemini-client';
import { getPresignedImageUrls, getPresignedReadUrl } from '../utils/s3-client';

/**
 * Error thrown when receipt extraction fails
 */
export class ReceiptExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'ReceiptExtractionError';
  }
}

/**
 * Confidence threshold for flagging manual review
 */
const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Extract receipt data from document images.
 *
 * @param documentId - Document ID for logging
 * @param images - Converted image info (for PDFs) or null (for direct images)
 * @param storagePath - Original document S3 path (used if no conversion, without domain prefix)
 * @param categories - Optional business categories for line item matching
 * @param domain - Domain for S3 prefix (invoices or expense_claims)
 * @returns Receipt extraction result with needsReview flag
 */
export async function extractReceipt(
  documentId: string,
  images: ConvertedImageInfo[] | null,
  storagePath: string,
  categories?: BusinessCategory[],
  domain?: 'invoices' | 'expense_claims'
): Promise<ReceiptExtractionResult & { needsReview: boolean }> {
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

    console.log(`[${documentId}] Extracting receipt data from ${imageUrls.length} image(s)`);

    // Extract using Gemini AI
    const result = await extractReceiptData(imageUrls, categories);

    // Log extraction confidence
    console.log(`[${documentId}] Receipt extraction confidence: ${result.confidence}`);

    // Determine if manual review is needed
    const needsReview = checkNeedsManualReview(result);

    if (needsReview) {
      console.warn(`[${documentId}] Receipt flagged for manual review`);
    }

    // Validate required fields
    validateReceiptResult(result);

    return {
      ...result,
      needsReview,
    };
  } catch (error) {
    if (error instanceof ReceiptExtractionError) {
      throw error;
    }

    if (error instanceof GeminiOperationError) {
      throw new ReceiptExtractionError(
        error.message,
        error.code,
        error.retryable
      );
    }

    throw new ReceiptExtractionError(
      `Receipt extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'EXTRACTION_FAILED',
      false
    );
  }
}

/**
 * Check if a receipt extraction needs manual review.
 *
 * Criteria for manual review:
 * 1. Overall confidence below threshold
 * 2. Missing critical fields (vendor, total)
 * 3. Unusual values (negative amounts, future dates)
 *
 * @param result - Extraction result to check
 * @returns true if manual review is recommended
 */
function checkNeedsManualReview(result: ReceiptExtractionResult): boolean {
  // Low confidence
  if (needsManualReview(result.confidence, LOW_CONFIDENCE_THRESHOLD)) {
    return true;
  }

  // Missing vendor name
  if (!result.vendorName || result.vendorName.trim() === '') {
    return true;
  }

  // Suspiciously low or high amount
  if (result.totalAmount <= 0 || result.totalAmount > 100000) {
    return true;
  }

  // Future date
  const transactionDate = new Date(result.transactionDate);
  if (transactionDate > new Date()) {
    return true;
  }

  // Date too far in the past (more than 1 year)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  if (transactionDate < oneYearAgo) {
    return true;
  }

  return false;
}

/**
 * Validate that required receipt fields are present.
 *
 * @param result - Extraction result to validate
 * @throws {ReceiptExtractionError} If validation fails
 */
function validateReceiptResult(result: ReceiptExtractionResult): void {
  const errors: string[] = [];

  if (!result.vendorName || result.vendorName.trim() === '') {
    errors.push('Vendor/store name is required');
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
    throw new ReceiptExtractionError(
      `Receipt validation failed: ${errors.join('; ')}`,
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
 * Match receipt line items to business expense categories.
 *
 * @param result - Extraction result with line items
 * @param categories - Business categories to match against
 * @returns Result with categories assigned to line items
 */
export function matchReceiptCategories(
  result: ReceiptExtractionResult,
  categories: BusinessCategory[]
): ReceiptExtractionResult {
  if (!result.lineItems || result.lineItems.length === 0 || categories.length === 0) {
    return result;
  }

  const matchedItems = result.lineItems.map(item => {
    if (item.category) return item; // Already categorized

    const description = item.description.toLowerCase();

    for (const category of categories) {
      const matches = category.keywords.some(keyword =>
        description.includes(keyword.toLowerCase())
      );
      if (matches) {
        return { ...item, category: category.name };
      }
    }

    return item;
  });

  return {
    ...result,
    lineItems: matchedItems,
  };
}

/**
 * Calculate suggested expense category based on vendor and items.
 *
 * @param result - Extraction result
 * @param categories - Available business categories
 * @returns Suggested primary category or undefined
 */
export function suggestExpenseCategory(
  result: ReceiptExtractionResult,
  categories: BusinessCategory[]
): string | undefined {
  // Check vendor name against category keywords
  const vendorLower = result.vendorName.toLowerCase();

  for (const category of categories) {
    if (category.keywords.some(kw => vendorLower.includes(kw.toLowerCase()))) {
      return category.name;
    }
  }

  // Check most common category in line items
  if (result.lineItems && result.lineItems.length > 0) {
    const categoryCounts: Record<string, number> = {};

    for (const item of result.lineItems) {
      if (item.category) {
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      }
    }

    const topCategory = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])[0];

    if (topCategory) {
      return topCategory[0];
    }
  }

  return undefined;
}
