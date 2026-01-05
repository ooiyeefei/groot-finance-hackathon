/**
 * Lambda Invocation Contracts
 *
 * This file defines the TypeScript interfaces for invoking the document
 * processing Lambda from Vercel API routes. These contracts ensure type
 * safety between the Next.js application and AWS Lambda.
 */

import { z } from 'zod';
import type {
  BusinessCategory,
  InvoiceExtractionResult,
  ReceiptExtractionResult,
} from './types';

// ============================================================================
// Input Contracts (Vercel → Lambda)
// ============================================================================

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
  documentId: z.string().min(1),
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

  /** Error details if failed (includes user-friendly messaging) */
  error?: {
    code: string;
    message: string;
    step?: string;
    // User-friendly error information (DSPy-equivalent messaging)
    userMessage?: string;
    actionableSteps?: string[];
    severity?: 'low' | 'medium' | 'high' | 'critical';
    retryable?: boolean;
    supportRequired?: boolean;
  };
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

// Re-export BusinessCategory for consumers
export type { BusinessCategory };
