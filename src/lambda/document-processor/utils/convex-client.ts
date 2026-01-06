/**
 * Convex Client for Document Status Updates
 *
 * Provides functions to update document processing status in Convex
 * during Lambda execution. Uses ConvexHttpClient for proper API integration.
 *
 * Pattern mirrors src/trigger/utils/convex-helpers.ts
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import type {
  InvoiceStatus,
  ExpenseClaimStatus,
  ExtractionResult,
} from '../types';

// Convex configuration
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

// Singleton Convex client
let convexClient: ConvexHttpClient | null = null;

function getConvexClient(): ConvexHttpClient {
  if (!convexClient) {
    if (!CONVEX_URL) {
      throw new ConvexOperationError(
        'NEXT_PUBLIC_CONVEX_URL environment variable is not configured',
        'CONVEX_NOT_CONFIGURED'
      );
    }
    convexClient = new ConvexHttpClient(CONVEX_URL);
    console.log('[Convex-Lambda] Client initialized');
  }
  return convexClient;
}

/**
 * Error thrown when Convex operations fail
 */
export class ConvexOperationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly documentId?: string
  ) {
    super(message);
    this.name = 'ConvexOperationError';
  }
}

// ============================================================================
// Status Constants
// ============================================================================

export const INVOICE_STATUS = {
  PENDING: 'pending' as InvoiceStatus,
  PROCESSING: 'processing' as InvoiceStatus,
  UPLOADING: 'uploading' as InvoiceStatus,
  COMPLETED: 'completed' as InvoiceStatus,
  FAILED: 'failed' as InvoiceStatus,
} as const;

export const EXPENSE_CLAIM_STATUS = {
  DRAFT: 'draft' as ExpenseClaimStatus,
  ANALYZING: 'analyzing' as ExpenseClaimStatus,
  NEEDS_REVIEW: 'needs_review' as ExpenseClaimStatus,
  COMPLETED: 'completed' as ExpenseClaimStatus,
  FAILED: 'failed' as ExpenseClaimStatus,
} as const;

// ============================================================================
// Invoice Status Updates
// ============================================================================

/**
 * Update invoice document status in Convex.
 *
 * @param documentId - Invoice document ID
 * @param status - New status
 * @param metadata - Optional additional metadata
 */
export async function updateDocumentStatus(
  documentId: string,
  status: InvoiceStatus,
  metadata?: {
    error?: string;
    extractionResults?: ExtractionResult;
    currentStep?: string;
  }
): Promise<void> {
  const client = getConvexClient();

  try {
    await client.mutation(api.functions.system.updateInvoiceStatus, {
      id: documentId,
      status: status,
      errorMessage: metadata?.error,
    });
    console.log(`[Convex-Lambda] Updated invoice ${documentId} status to: ${status}`);
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update invoice status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONVEX_UPDATE_ERROR',
      documentId
    );
  }
}

/**
 * Update invoice with extraction results.
 *
 * @param documentId - Invoice document ID
 * @param results - Extraction results
 */
export async function updateInvoiceExtractionResults(
  documentId: string,
  results: ExtractionResult
): Promise<void> {
  const client = getConvexClient();

  // Transform line items to snake_case for UI compatibility
  const transformedLineItems = results.lineItems?.map(item => ({
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_amount: item.totalAmount,
    category: item.category,
    tax_amount: item.taxAmount,
    tax_rate: item.taxRate,
  }));

  // Invoice-specific fields (handle InvoiceExtractionResult type)
  const invoiceResults = results as ExtractionResult & {
    invoiceNumber?: string;
    dueDate?: string;
    paymentTerms?: string;
    billingAddress?: string;
    shippingAddress?: string;
  };

  try {
    await client.mutation(api.functions.system.updateInvoiceExtraction, {
      id: documentId,
      // Use snake_case field names to match UI expectations
      extractedData: {
        vendor_name: results.vendorName,
        total_amount: results.totalAmount,
        currency: results.currency,
        document_date: results.transactionDate,
        transaction_date: results.transactionDate,  // Alias for UI fallback
        reference_number: results.referenceNumber,
        document_number: invoiceResults.invoiceNumber || results.referenceNumber,  // Alias
        subtotal_amount: results.subtotalAmount,
        tax_amount: results.taxAmount,
        tax_rate: results.taxRate,
        confidence: results.confidence,
        line_items: transformedLineItems,
        // Invoice-specific fields
        invoice_number: invoiceResults.invoiceNumber,
        due_date: invoiceResults.dueDate,
        payment_terms: invoiceResults.paymentTerms,
        billing_address: invoiceResults.billingAddress,
        shipping_address: invoiceResults.shippingAddress,
        // Document type for UI display
        document_type: results.documentType || 'invoice',
        // Extraction metadata
        extraction_method: 'lambda-durable',
        suggested_category: results.suggestedCategory,
        extraction_quality: results.extractionQuality,
        user_message: results.userMessage,
        reasoning: results.reasoning,
      },
      confidenceScore: results.confidence,
      extractionMethod: 'lambda-durable',
    });
    console.log(`[Convex-Lambda] Updated invoice ${documentId} extraction results`);
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update invoice extraction results: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONVEX_UPDATE_ERROR',
      documentId
    );
  }
}

/**
 * Update invoice classification results.
 *
 * @param documentId - Invoice document ID
 * @param classification - Classification results
 */
export async function updateInvoiceClassification(
  documentId: string,
  classification: {
    isSupported: boolean;
    documentType?: string;
    confidenceScore?: number;
    reasoning?: string;
    userMessage?: string;
  }
): Promise<void> {
  const client = getConvexClient();

  try {
    await client.mutation(api.functions.system.updateInvoiceClassification, {
      id: documentId,
      classification: {
        isSupported: classification.isSupported,
        documentType: classification.documentType,
        confidenceScore: classification.confidenceScore,
        classificationMethod: 'lambda-gemini',
        reasoning: classification.reasoning,
        userMessage: classification.userMessage,
      },
    });
    console.log(`[Convex-Lambda] Updated invoice ${documentId} classification`);
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update invoice classification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONVEX_UPDATE_ERROR',
      documentId
    );
  }
}

/**
 * Update invoice converted image path.
 *
 * @param documentId - Invoice document ID
 * @param convertedImagePath - S3 key for converted image
 * @param pageCount - Number of pages
 * @param totalSizeBytes - Total size of converted images
 */
export async function updateInvoiceConvertedImage(
  documentId: string,
  convertedImagePath: string,
  pageCount?: number,
  totalSizeBytes?: number
): Promise<void> {
  const client = getConvexClient();

  try {
    await client.mutation(api.functions.system.updateInvoiceConvertedImage, {
      id: documentId,
      convertedImagePath,
      pageCount,
      totalSizeBytes,
    });
    console.log(`[Convex-Lambda] Updated invoice ${documentId} converted image`);
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update invoice converted image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONVEX_UPDATE_ERROR',
      documentId
    );
  }
}

// ============================================================================
// Expense Claim Status Updates
// ============================================================================

/**
 * Update expense claim status in Convex.
 *
 * @param documentId - Expense claim document ID
 * @param status - New status
 * @param metadata - Optional additional metadata
 */
export async function updateExpenseClaimStatus(
  documentId: string,
  status: ExpenseClaimStatus,
  metadata?: {
    error?: string;
    processingMetadata?: Record<string, unknown>;
    currentStep?: string;
  }
): Promise<void> {
  const client = getConvexClient();

  try {
    await client.mutation(api.functions.system.updateExpenseClaimStatus, {
      id: documentId,
      status: status,
      errorMessage: metadata?.error,
    });
    console.log(`[Convex-Lambda] Updated expense claim ${documentId} status to: ${status}`);
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update expense claim status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONVEX_UPDATE_ERROR',
      documentId
    );
  }
}

/**
 * Update expense claim with extraction results.
 *
 * @param documentId - Expense claim document ID
 * @param results - Extraction results
 */
export async function updateExpenseClaimExtractionResults(
  documentId: string,
  results: ExtractionResult
): Promise<void> {
  const client = getConvexClient();

  // Transform line items to snake_case for UI compatibility
  const transformedLineItems = results.lineItems?.map(item => ({
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_amount: item.totalAmount,
    category: item.category,
    tax_amount: item.taxAmount,
    tax_rate: item.taxRate,
  }));

  // Receipt-specific fields (handle ReceiptExtractionResult type)
  const receiptResults = results as ExtractionResult & {
    receiptNumber?: string;
    storeLocation?: string;
    paymentMethod?: string;
    cardLastFour?: string;
    serviceCharge?: number;
    discountAmount?: number;
    businessPurpose?: string;
  };

  try {
    await client.mutation(api.functions.system.updateExpenseClaimExtraction, {
      id: documentId,
      // Use snake_case field names to match UI expectations
      extractedData: {
        vendor_name: results.vendorName,
        total_amount: results.totalAmount,
        currency: results.currency,
        document_date: results.transactionDate,
        transaction_date: results.transactionDate,  // Alias for UI fallback
        reference_number: results.referenceNumber,
        document_number: receiptResults.receiptNumber || results.referenceNumber,  // Alias
        subtotal_amount: results.subtotalAmount,
        tax_amount: results.taxAmount,
        tax_rate: results.taxRate,
        confidence: results.confidence,
        line_items: transformedLineItems,
        // Receipt-specific fields
        receipt_number: receiptResults.receiptNumber,
        store_location: receiptResults.storeLocation,
        payment_method: receiptResults.paymentMethod,
        card_last_four: receiptResults.cardLastFour,
        service_charge: receiptResults.serviceCharge,
        discount_amount: receiptResults.discountAmount,
        business_purpose: receiptResults.businessPurpose,
        // Document type for UI display
        document_type: results.documentType || 'receipt',
        // Extraction metadata
        extraction_method: 'lambda-durable',
        suggested_category: results.suggestedCategory,
        extraction_quality: results.extractionQuality,
        user_message: results.userMessage,
        reasoning: results.reasoning,
      },
      confidenceScore: results.confidence,
      extractionMethod: 'lambda-durable',
      // Also update top-level fields for expense claim model
      vendorName: results.vendorName,
      totalAmount: results.totalAmount,
      currency: results.currency,
      transactionDate: results.transactionDate,
    });
    console.log(`[Convex-Lambda] Updated expense claim ${documentId} extraction results`);
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update expense claim extraction results: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONVEX_UPDATE_ERROR',
      documentId
    );
  }
}

/**
 * Update expense claim classification results.
 *
 * @param documentId - Expense claim document ID
 * @param classification - Classification results
 */
export async function updateExpenseClaimClassification(
  documentId: string,
  classification: {
    isSupported: boolean;
    documentType?: string;
    confidenceScore?: number;
    reasoning?: string;
    userMessage?: string;
  }
): Promise<void> {
  const client = getConvexClient();

  try {
    await client.mutation(api.functions.system.updateExpenseClaimClassification, {
      id: documentId,
      classification: {
        isSupported: classification.isSupported,
        documentType: classification.documentType,
        confidenceScore: classification.confidenceScore,
        classificationMethod: 'lambda-gemini',
        reasoning: classification.reasoning,
        userMessage: classification.userMessage,
      },
    });
    console.log(`[Convex-Lambda] Updated expense claim ${documentId} classification`);
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update expense claim classification: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONVEX_UPDATE_ERROR',
      documentId
    );
  }
}

/**
 * Update expense claim converted image path.
 *
 * @param documentId - Expense claim document ID
 * @param convertedImagePath - S3 key for converted image
 * @param pageCount - Number of pages
 * @param totalSizeBytes - Total size of converted images
 */
export async function updateExpenseClaimConvertedImage(
  documentId: string,
  convertedImagePath: string,
  pageCount?: number,
  totalSizeBytes?: number
): Promise<void> {
  const client = getConvexClient();

  try {
    await client.mutation(api.functions.system.updateExpenseClaimConvertedImage, {
      id: documentId,
      convertedImagePath,
      pageCount,
      totalSizeBytes,
    });
    console.log(`[Convex-Lambda] Updated expense claim ${documentId} converted image`);
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update expense claim converted image: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONVEX_UPDATE_ERROR',
      documentId
    );
  }
}

// ============================================================================
// Generic Status Update (for both domains)
// ============================================================================

/**
 * Update document status based on domain.
 *
 * @param documentId - Document ID
 * @param domain - 'invoices' or 'expense_claims'
 * @param status - Status string
 * @param metadata - Optional metadata
 */
export async function updateStatus(
  documentId: string,
  domain: 'invoices' | 'expense_claims',
  status: string,
  metadata?: {
    error?: string;
    currentStep?: string;
  }
): Promise<void> {
  if (domain === 'invoices') {
    await updateDocumentStatus(documentId, status as InvoiceStatus, metadata);
  } else {
    await updateExpenseClaimStatus(documentId, status as ExpenseClaimStatus, metadata);
  }
}

/**
 * Mark document as failed with error details.
 *
 * @param documentId - Document ID
 * @param domain - 'invoices' or 'expense_claims'
 * @param error - Error message
 * @param step - Step where failure occurred
 */
export async function markAsFailed(
  documentId: string,
  domain: 'invoices' | 'expense_claims',
  error: string,
  step?: string
): Promise<void> {
  const status = domain === 'invoices' ? INVOICE_STATUS.FAILED : EXPENSE_CLAIM_STATUS.FAILED;
  await updateStatus(documentId, domain, status, { error, currentStep: step });
}
