/**
 * Document Processing Lambda Handler
 *
 * Main entry point for the AWS Lambda Durable Function that processes
 * invoices and receipts with automatic checkpointing.
 *
 * Workflow Steps:
 * 1. convert-pdf - Convert PDF to images (simple fileType check, no separate service)
 * 2. validate-document - LLM visual validation (reject if wrong document type)
 * 3. extract-data - AI extraction using Gemini 2.5 Flash
 * 4. update-status - Update Convex database with results
 *
 * Validation: If user uploads non-invoice to invoice page, or non-receipt
 * to receipt page, the LLM validation step will reject with clear error.
 */

import * as Sentry from '@sentry/aws-serverless';
import { withDurableExecution, DurableContext } from './utils/durable-execution';
import type { Context as LambdaContext } from 'aws-lambda';

// Initialize Sentry for error tracking and performance monitoring
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [Sentry.awsLambdaIntegration()],
});
import {
  DocumentProcessingRequest,
  DocumentProcessingRequestSchema,
  LambdaSyncResponse,
} from './contracts';
import type {
  WorkflowState,
  ConvertedImageInfo,
  InvoiceExtractionResult,
  ReceiptExtractionResult,
  ProcessingStepName,
} from './types';
import { ERROR_CODES } from './types';

// Step implementations
import { validateDocument, ValidationError } from './steps/validate';
import { convertPdfToImages, needsPdfConversion, PdfConversionError } from './steps/convert-pdf';
import { extractInvoice, InvoiceExtractionError } from './steps/extract-invoice';
import { extractReceipt, ReceiptExtractionError } from './steps/extract-receipt';

// Utilities
import {
  updateInvoiceExtractionResults,
  updateExpenseClaimExtractionResults,
  updateStatus,
  markAsFailed,
  INVOICE_STATUS,
  EXPENSE_CLAIM_STATUS,
} from './utils/convex-client';
import {
  getUserFriendlyErrorMessage,
  getRetryRecommendation,
  type ErrorContext,
} from './utils/error-message-mapper';

/**
 * Lambda event structure for async invocation
 */
interface LambdaEvent {
  body?: string;
  payload?: DocumentProcessingRequest;
}

/**
 * Parse and validate the incoming Lambda event
 */
function parseEvent(event: LambdaEvent): DocumentProcessingRequest {
  // Handle both direct payload and API Gateway-style body
  const rawPayload = event.payload || (event.body ? JSON.parse(event.body) : event);

  const result = DocumentProcessingRequestSchema.safeParse(rawPayload);
  if (!result.success) {
    throw new Error(`Invalid request: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Create standardized error response with user-friendly messaging
 */
function createErrorResponse(
  documentId: string,
  executionId: string,
  code: string,
  technicalMessage: string,
  step?: string,
  domain?: 'invoices' | 'expense_claims'
): LambdaSyncResponse {
  // Get user-friendly error information
  const errorContext: ErrorContext = {
    errorCode: code,
    technicalError: technicalMessage,
    processingStage: step,
    domain,
  };

  const friendlyError = getUserFriendlyErrorMessage(errorContext);
  const retryInfo = getRetryRecommendation(errorContext);

  return {
    success: false,
    documentId,
    executionId,
    error: {
      code,
      message: technicalMessage,
      step,
      // User-friendly error information
      userMessage: friendlyError.userMessage,
      actionableSteps: friendlyError.actionableSteps,
      severity: friendlyError.severity,
      retryable: retryInfo.retryable,
      supportRequired: friendlyError.supportRequired,
    },
  };
}

/**
 * Map step errors to standardized error codes
 */
function mapErrorToCode(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof ValidationError) {
    return { code: error.code, retryable: false };
  }
  if (error instanceof PdfConversionError) {
    return { code: error.code, retryable: false };
  }
  if (error instanceof InvoiceExtractionError) {
    return { code: error.code, retryable: error.retryable };
  }
  if (error instanceof ReceiptExtractionError) {
    return { code: error.code, retryable: error.retryable };
  }
  return { code: ERROR_CODES.PROCESSING_FAILED, retryable: false };
}

/**
 * Main document processing workflow with durable execution
 *
 * Each context.step() call creates a checkpoint. If the Lambda times out
 * or fails, execution resumes from the last completed step.
 */
async function processDocument(
  event: LambdaEvent,
  lambdaContext: LambdaContext,
  context: DurableContext
): Promise<LambdaSyncResponse> {
  // Parse and validate request
  const request = parseEvent(event);
  const {
    documentId,
    storagePath,
    domain,
    fileType,
    businessId,
    userId,
    idempotencyKey,
    expectedDocumentType,
    businessCategories,
  } = request;

  console.log(`[${documentId}] Starting document processing workflow`);
  console.log(`[${documentId}] Domain: ${domain}, Path: ${storagePath}`);

  // Set Sentry context tags for error tracking
  Sentry.setTag('document.id', documentId);
  Sentry.setTag('document.domain', domain);
  Sentry.setTag('execution.id', context.executionId);
  Sentry.setTag('business.id', businessId);

  // Update initial status to processing
  const initialStatus = domain === 'invoices' ? INVOICE_STATUS.PROCESSING : EXPENSE_CLAIM_STATUS.ANALYZING;
  await updateStatus(documentId, domain, initialStatus, { currentStep: 'convert-pdf' });

  // Initialize workflow state
  // Note: convert-pdf MUST be first because validation uses LLM visual processing
  const state: WorkflowState = {
    executionId: context.executionId,
    documentId,
    domain,
    status: 'running',
    startedAt: new Date().toISOString(),
    currentStep: 'convert-pdf',
    steps: [
      { name: 'convert-pdf', status: 'pending' },
      { name: 'validate-document', status: 'pending' },
      { name: 'extract-data', status: 'pending' },
      { name: 'update-status', status: 'pending' },
    ],
  };

  try {
    // =========================================================================
    // STEP 1: Convert PDF (if needed) - MUST be first for LLM visual processing
    // =========================================================================
    Sentry.setTag('workflow.step', 'convert-pdf');
    state.steps[0].status = 'running';
    state.steps[0].startedAt = new Date().toISOString();

    // Check if conversion is needed based on file type
    const needsConversion = needsPdfConversion(fileType);

    const convertedImages = await context.step<ConvertedImageInfo[] | null>(
      'convert-pdf',
      async () => {
        if (!needsConversion) {
          console.log(`[${documentId}] Step 1: Skipping PDF conversion (file is already an image)`);
          return null;
        }

        console.log(`[${documentId}] Step 1: Converting PDF to images`);
        const images = await convertPdfToImages(
          documentId,
          storagePath,
          businessId,
          userId,
          domain === 'invoices' ? 'invoice' : 'receipt',
          domain  // Pass domain for S3 key prefix
        );
        console.log(`[${documentId}] PDF converted to ${images.length} image(s)`);
        return images;
      }
    );

    state.steps[0].status = 'completed';
    state.steps[0].completedAt = new Date().toISOString();
    state.convertedImages = convertedImages ?? undefined;
    state.currentStep = 'validate-document';

    // Update status for validation step
    await updateStatus(documentId, domain, initialStatus, { currentStep: 'validate-document' });

    // =========================================================================
    // STEP 2: Validate Document (LLM visual validation - reject wrong type)
    // =========================================================================
    Sentry.setTag('workflow.step', 'validate-document');
    state.steps[1].status = 'running';
    state.steps[1].startedAt = new Date().toISOString();

    // Determine expected document type from domain
    const docExpectedType: 'invoice' | 'receipt' = expectedDocumentType || (domain === 'invoices' ? 'invoice' : 'receipt');

    const validation = await context.step<{ isValid: boolean; confidence: number }>(
      'validate-document',
      async () => {
        console.log(`[${documentId}] Step 2: Validating document type matches ${docExpectedType}`);

        // LLM visual validation - throws ValidationError if type mismatch
        const result = await validateDocument(
          documentId,
          convertedImages,
          storagePath,
          docExpectedType,
          domain  // Pass domain for S3 key prefix
        );

        console.log(`[${documentId}] Validation passed, confidence: ${result.confidence}`);
        return { isValid: result.isValid, confidence: result.confidence };
      }
    );

    state.steps[1].status = 'completed';
    state.steps[1].completedAt = new Date().toISOString();
    state.currentStep = 'extract-data';

    // Update Sentry context with document type after validation
    Sentry.setTag('document.type', docExpectedType);

    // Update status for extract step
    await updateStatus(documentId, domain, initialStatus, { currentStep: 'extract-data' });

    // =========================================================================
    // STEP 3: Extract Data (Invoice or Receipt)
    // =========================================================================
    Sentry.setTag('workflow.step', 'extract-data');
    state.steps[2].status = 'running';
    state.steps[2].startedAt = new Date().toISOString();

    type LocalExtractionResult = (InvoiceExtractionResult | (ReceiptExtractionResult & { needsReview: boolean }));

    const extraction = await context.step<LocalExtractionResult>(
      'extract-data',
      async () => {
        console.log(`[${documentId}] Step 3: Extracting ${docExpectedType} data`);

        if (docExpectedType === 'invoice') {
          return await extractInvoice(documentId, convertedImages, storagePath, businessCategories, domain);
        } else {
          return await extractReceipt(documentId, convertedImages, storagePath, businessCategories, domain);
        }
      }
    );

    state.steps[2].status = 'completed';
    state.steps[2].completedAt = new Date().toISOString();
    state.extractedData = extraction;
    state.currentStep = 'update-status';

    // Update status to uploading (saving results)
    const uploadingStatus = domain === 'invoices' ? INVOICE_STATUS.UPLOADING : EXPENSE_CLAIM_STATUS.ANALYZING;
    await updateStatus(documentId, domain, uploadingStatus, { currentStep: 'update-status' });

    // =========================================================================
    // STEP 4: Update Database Status
    // =========================================================================
    Sentry.setTag('workflow.step', 'update-status');
    state.steps[3].status = 'running';
    state.steps[3].startedAt = new Date().toISOString();

    await context.step<void>(
      'update-status',
      async () => {
        console.log(`[${documentId}] Step 4: Updating database status`);

        if (domain === 'invoices') {
          await updateInvoiceExtractionResults(
            documentId,
            extraction as InvoiceExtractionResult
          );
        } else {
          await updateExpenseClaimExtractionResults(
            documentId,
            extraction as ReceiptExtractionResult
          );
        }

        console.log(`[${documentId}] Database status updated successfully`);
      }
    );

    state.steps[3].status = 'completed';
    state.steps[3].completedAt = new Date().toISOString();
    state.status = 'completed';
    state.completedAt = new Date().toISOString();

    // =========================================================================
    // Return Success Response
    // =========================================================================
    console.log(`[${documentId}] Workflow completed successfully`);

    return {
      success: true,
      documentId,
      executionId: context.executionId,
      extractedData: extraction,
    };

  } catch (error) {
    // =========================================================================
    // Error Handling
    // =========================================================================
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const { code } = mapErrorToCode(error);

    console.error(`[${documentId}] Workflow failed at step ${state.currentStep}:`, errorMessage);

    // Update workflow state
    state.status = 'failed';
    state.failedStep = state.currentStep;
    state.error = { code, message: errorMessage, retryable: false };

    // Update database with failure status
    try {
      await markAsFailed(documentId, domain, errorMessage, state.currentStep);
    } catch (updateError) {
      console.error(`[${documentId}] Failed to update failure status:`, updateError);
    }

    return createErrorResponse(documentId, context.executionId, code, errorMessage, state.currentStep, domain);
  }
}

/**
 * Lambda handler wrapped with durable execution and Sentry monitoring
 *
 * The withDurableExecution wrapper provides:
 * - Automatic checkpointing via context.step()
 * - State persistence to DynamoDB
 * - Idempotent execution on retries
 * - Workflow replay from last checkpoint
 *
 * Sentry.wrapHandler() provides:
 * - Automatic error capture and reporting
 * - Performance tracing
 * - Lambda context enrichment
 */
const durableHandler = withDurableExecution(processDocument, {
  // Workflow ID uses document ID for idempotency
  workflowId: (event: LambdaEvent) => {
    const request = parseEvent(event);
    return request.idempotencyKey || `doc-${request.documentId}`;
  },
});

// Export handler wrapped with Sentry for error tracking
export const handler = Sentry.wrapHandler(durableHandler);

/**
 * Health check handler for testing Lambda connectivity
 */
export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  };
}
