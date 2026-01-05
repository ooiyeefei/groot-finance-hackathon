/**
 * Convex Client for Document Status Updates
 *
 * Provides functions to update document processing status in Convex
 * during Lambda execution. Uses Convex's HTTP API for serverless
 * environments without persistent connections.
 */

import type {
  InvoiceStatus,
  ExpenseClaimStatus,
  ExtractionResult,
} from '../types';

// Convex configuration
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

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
// Internal HTTP Client
// ============================================================================

/**
 * Make an HTTP request to Convex.
 * Uses Convex's HTTP Actions API for serverless environments.
 */
async function convexRequest(
  functionPath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (!CONVEX_URL) {
    throw new ConvexOperationError(
      'NEXT_PUBLIC_CONVEX_URL environment variable is not configured',
      'CONVEX_UPDATE_ERROR'
    );
  }

  // Convex HTTP API endpoint
  const url = `${CONVEX_URL}/api/mutation`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: functionPath,
        args,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new ConvexOperationError(
      `Convex request failed: ${message}`,
      'CONVEX_UPDATE_ERROR'
    );
  }
}

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
  try {
    await convexRequest('invoices:updateProcessingStatus', {
      documentId,
      status,
      ...metadata,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ConvexOperationError) {
      throw new ConvexOperationError(error.message, error.code, documentId);
    }
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
  try {
    await convexRequest('invoices:updateExtractionResults', {
      documentId,
      extractionResults: results,
      status: INVOICE_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update invoice extraction results: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
  try {
    await convexRequest('expense_claims:updateProcessingStatus', {
      documentId,
      status,
      ...metadata,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof ConvexOperationError) {
      throw new ConvexOperationError(error.message, error.code, documentId);
    }
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
  try {
    await convexRequest('expense_claims:updateExtractionResults', {
      documentId,
      processingMetadata: {
        extraction_method: 'lambda-durable',
        extraction_timestamp: new Date().toISOString(),
        confidence_score: results.confidence,
        financial_data: {
          description: results.vendorName,
          vendor_name: results.vendorName,
          total_amount: results.totalAmount,
          original_currency: results.currency,
          transaction_date: results.transactionDate,
          reference_number: results.referenceNumber,
          subtotal_amount: results.subtotalAmount,
          tax_amount: results.taxAmount,
        },
        line_items: results.lineItems?.map((item, index) => ({
          item_description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_amount: item.totalAmount,
          currency: results.currency,
          tax_amount: item.taxAmount,
          tax_rate: item.taxRate,
          item_category: item.category,
          line_order: index + 1,
        })),
        raw_extraction: results,
      },
      status: EXPENSE_CLAIM_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    throw new ConvexOperationError(
      `Failed to update expense claim extraction results: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
