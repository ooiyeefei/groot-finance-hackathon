/**
 * Lambda Invocation Contracts
 *
 * This file defines the TypeScript interfaces for invoking the document
 * processing Lambda from Vercel API routes. These contracts ensure type
 * safety between the Next.js application and AWS Lambda.
 *
 * @see ../data-model.md for complete data model documentation
 */

import { z } from 'zod';

// ============================================================================
// Input Contracts (Vercel → Lambda)
// ============================================================================

/**
 * Business category for line item classification.
 * Pre-fetched from Convex to avoid Lambda→Convex queries during extraction.
 */
export interface BusinessCategory {
  id: string;
  name: string;
  keywords: string[];
  parentCategory?: string;
}

/**
 * Document processing request payload sent from Vercel API routes to Lambda.
 * This is the primary input contract for the durable function.
 */
export interface DocumentProcessingRequest {
  // Document identification
  documentId: string;                    // UUID from Convex
  domain: 'invoices' | 'expense_claims'; // Routing context

  // Storage information
  storagePath: string;                   // S3 key for original document
  fileType: 'pdf' | 'image';             // Determines if conversion needed

  // Processing context
  userId: string;                        // For audit trail
  businessId: string;                    // For business-specific categories

  // Idempotency
  idempotencyKey: string;                // Prevents duplicate processing

  // Optional hints (optimize when caller has context)
  expectedDocumentType?: 'invoice' | 'receipt';  // Skip classification if known
  businessCategories?: BusinessCategory[];        // Pre-fetched categories
}

/**
 * Zod schema for runtime validation of the request payload.
 */
export const DocumentProcessingRequestSchema = z.object({
  documentId: z.string().uuid(),
  domain: z.enum(['invoices', 'expense_claims']),
  storagePath: z.string().min(1),
  fileType: z.enum(['pdf', 'image']),
  userId: z.string().min(1),
  businessId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  expectedDocumentType: z.enum(['invoice', 'receipt']).optional(),
  businessCategories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    keywords: z.array(z.string()),
    parentCategory: z.string().optional(),
  })).optional(),
});

// ============================================================================
// Output Contracts (Lambda → Vercel)
// ============================================================================

/**
 * Immediate response from async Lambda invocation.
 * The actual processing result is retrieved via status polling or webhooks.
 */
export interface LambdaInvocationResponse {
  /** AWS request ID, used for tracking and debugging */
  requestId: string;

  /** Lambda execution ID for durable function state queries */
  executionId: string;

  /** HTTP status code (202 for accepted) */
  statusCode: 202;
}

/**
 * Synchronous invocation response (for testing/debugging only).
 * Production uses async invocation.
 */
export interface LambdaSyncResponse {
  success: boolean;
  documentId: string;
  executionId: string;

  /** Final extraction result */
  extractedData?: InvoiceExtractionResult | ReceiptExtractionResult;

  /** Error details if failed */
  error?: {
    code: string;
    message: string;
    step?: string;
  };
}

// ============================================================================
// Extraction Result Contracts
// ============================================================================

/**
 * Common fields for all extraction results.
 */
export interface BaseExtractionResult {
  confidence: number;
  processingMethod: 'simple' | 'complex' | 'auto';
  extractedAt: string;  // ISO 8601

  // Financial data
  vendorName: string;
  totalAmount: number;
  currency: string;
  transactionDate: string;

  // Optional fields
  referenceNumber?: string;
  subtotalAmount?: number;
  taxAmount?: number;

  // Line items
  lineItems?: ExtractedLineItem[];
}

/**
 * Invoice-specific extraction result.
 */
export interface InvoiceExtractionResult extends BaseExtractionResult {
  documentType: 'invoice';
  invoiceNumber?: string;
  dueDate?: string;
  paymentTerms?: string;
  billingAddress?: string;
  shippingAddress?: string;
}

/**
 * Receipt-specific extraction result.
 */
export interface ReceiptExtractionResult extends BaseExtractionResult {
  documentType: 'receipt';
  storeLocation?: string;
  paymentMethod?: string;
  cardLastFour?: string;
}

/**
 * Extracted line item from document.
 */
export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  category?: string;         // Matched business category
  taxAmount?: number;
  taxRate?: number;
}

// ============================================================================
// Status Polling Contracts
// ============================================================================

/**
 * Workflow execution status response.
 * Used when polling for processing status.
 */
export interface WorkflowStatusResponse {
  executionId: string;
  documentId: string;
  domain: 'invoices' | 'expense_claims';

  status: 'running' | 'completed' | 'failed';
  currentStep: 'classify-document' | 'convert-pdf' | 'extract-data' | 'update-status';

  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;

  // Step progress
  steps: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    durationMs?: number;
  }>;

  // Final result (when completed)
  result?: InvoiceExtractionResult | ReceiptExtractionResult;

  // Error info (when failed)
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    failedStep?: string;
  };
}

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standardized error codes for document processing failures.
 */
export const ErrorCodes = {
  // Classification errors
  CLASSIFICATION_FAILED: 'Unable to determine document type',
  UNSUPPORTED_FORMAT: 'Document format not supported',

  // Conversion errors
  PDF_CONVERSION_FAILED: 'Failed to convert PDF to images',
  PDF_TOO_LARGE: 'PDF exceeds maximum page limit (100)',
  PDF_CORRUPTED: 'PDF file is corrupted or invalid',

  // Extraction errors
  EXTRACTION_FAILED: 'Failed to extract document data',
  LOW_CONFIDENCE: 'Extraction confidence below threshold',
  AI_SERVICE_ERROR: 'AI service temporarily unavailable',
  AI_RATE_LIMITED: 'AI service rate limit exceeded',

  // Storage errors
  S3_READ_ERROR: 'Failed to read document from storage',
  S3_WRITE_ERROR: 'Failed to write converted images',

  // Database errors
  CONVEX_UPDATE_ERROR: 'Failed to update document status',

  // System errors
  TIMEOUT: 'Workflow execution timed out',
  CHECKPOINT_ERROR: 'Failed to save checkpoint',
  IDEMPOTENCY_CONFLICT: 'Duplicate processing request',
} as const;

export type ErrorCode = keyof typeof ErrorCodes;
