/**
 * Shared TypeScript types for Lambda Durable Functions
 * Based on data-model.md specification
 */

// ============================================================================
// Processing Step Types
// ============================================================================

export type ProcessingStepName =
  | 'convert-pdf'
  | 'validate-document'
  | 'extract-data'
  | 'update-status';

export interface ProcessingStep {
  name: ProcessingStepName;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;        // ISO 8601
  completedAt?: string;      // ISO 8601
  durationMs?: number;
  output?: unknown;          // Step-specific output
  error?: StepError;
}

export interface StepError {
  code: string;              // e.g., 'CLASSIFICATION_FAILED'
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

// ============================================================================
// Workflow State Types
// ============================================================================

export interface WorkflowState {
  // Execution metadata
  executionId: string;       // Lambda execution ID
  documentId: string;
  domain: 'invoices' | 'expense_claims';

  // Overall status
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  totalDurationMs?: number;

  // Step tracking
  currentStep: ProcessingStepName;
  steps: ProcessingStep[];

  // Results (populated as steps complete)
  classification?: ClassificationResult;
  convertedImages?: ConvertedImageInfo[];
  extractedData?: ExtractionResult;

  // Error tracking (if failed)
  failedStep?: ProcessingStepName;
  error?: StepError;
}

// ============================================================================
// Step Output Types
// ============================================================================

/**
 * Result from LLM visual validation step
 * Validates that document type matches expected (invoice vs receipt)
 */
export interface ValidationResult {
  isValid: boolean;          // Document matches expected type
  detectedType: 'invoice' | 'receipt' | 'unknown';
  expectedType: 'invoice' | 'receipt';
  confidence: number;        // 0.0 - 1.0
  reason?: string;           // Explanation if invalid
  metadata: {
    detectedLanguage?: string;
    detectedCurrency?: string;
    hasLineItems: boolean;
  };
}

/** @deprecated Use ValidationResult instead */
export interface ClassificationResult {
  type: 'invoice' | 'receipt' | 'unknown';
  confidence: number;        // 0.0 - 1.0
  needsConversion: boolean;  // True if PDF needs to be converted
  pageCount?: number;        // For PDFs
  metadata: {
    detectedLanguage?: string;
    detectedCurrency?: string;
    hasLineItems: boolean;
  };
}

export interface ConvertedImageInfo {
  pageNumber: number;
  s3Key: string;             // S3 key for converted image
  width: number;
  height: number;
  sizeBytes: number;
}

// ============================================================================
// Extraction Result Types
// ============================================================================

/**
 * Base extraction result with DSPy-equivalent fields
 * Ported from src/python models and signatures
 */
export interface BaseExtractionResult {
  confidence: number;
  processingMethod: 'simple' | 'complex' | 'auto';
  extractedAt: string;

  // Financial data
  vendorName: string;
  totalAmount: number;
  currency: string;
  transactionDate: string;

  // Optional fields
  referenceNumber?: string;
  subtotalAmount?: number;
  taxAmount?: number;
  taxRate?: number;

  // Line items
  lineItems?: ExtractedLineItem[];

  // DSPy-equivalent fields for user feedback
  suggestedCategory?: string | null;
  extractionQuality?: 'high' | 'medium' | 'low';
  userMessage?: string | null;
  suggestions?: string[] | null;
  reasoning?: string | null;

  // Context metadata (ported from DSPy signature)
  contextMetadata?: {
    country?: string | null;
    currency_format?: string | null;
    receipt_type?: string | null;
  } | null;
}

export interface InvoiceExtractionResult extends BaseExtractionResult {
  documentType: 'invoice';
  invoiceNumber?: string | null;
  dueDate?: string | null;
  paymentTerms?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
}

export interface ReceiptExtractionResult extends BaseExtractionResult {
  documentType: 'receipt';
  receiptNumber?: string | null;
  storeLocation?: string | null;
  paymentMethod?: string | null;
  cardLastFour?: string | null;
  serviceCharge?: number | null;
  discountAmount?: number | null;
  businessPurpose?: string | null;
}

export type ExtractionResult = InvoiceExtractionResult | ReceiptExtractionResult;

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
// Business Category Types
// ============================================================================

export interface BusinessCategory {
  id: string;
  code?: string;
  name: string;
  keywords: string[];
  vendorPatterns?: string[];
  parentCategory?: string;
}

// ============================================================================
// Document Status Types (for Convex updates)
// ============================================================================

export type InvoiceStatus =
  | 'pending'
  | 'processing'
  | 'uploading'
  | 'completed'
  | 'failed';

export type ExpenseClaimStatus =
  | 'draft'
  | 'analyzing'
  | 'needs_review'
  | 'completed'
  | 'failed';

// ============================================================================
// Error Codes
// ============================================================================

export const ERROR_CODES = {
  // Validation errors
  DOCUMENT_TYPE_MISMATCH: 'Document type does not match expected type',
  VALIDATION_FAILED: 'Document validation failed',
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
  PROCESSING_FAILED: 'Document processing failed',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
