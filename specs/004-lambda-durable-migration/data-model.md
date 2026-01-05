# Data Model: Lambda Durable Functions Migration

**Feature**: 004-lambda-durable-migration
**Date**: 2026-01-05

## Overview

This document defines the data structures for the Lambda Durable Functions document processing workflow. The existing Convex database schema remains unchanged; this defines the Lambda-specific types and state management.

---

## Core Entities

### 1. DocumentProcessingPayload

The input payload for the Lambda durable function, sent from Vercel API routes.

```typescript
interface DocumentProcessingPayload {
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

  // Optional hints
  expectedDocumentType?: 'invoice' | 'receipt';  // Skip classification if known
  businessCategories?: BusinessCategory[];        // Pre-fetched categories
}
```

### 2. ProcessingStep

Represents the state of each checkpointed step in the workflow.

```typescript
type ProcessingStepName =
  | 'classify-document'
  | 'convert-pdf'
  | 'extract-data'
  | 'update-status';

interface ProcessingStep {
  name: ProcessingStepName;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;        // ISO 8601
  completedAt?: string;      // ISO 8601
  durationMs?: number;
  output?: unknown;          // Step-specific output
  error?: StepError;
}

interface StepError {
  code: string;              // e.g., 'CLASSIFICATION_FAILED'
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
```

### 3. WorkflowState

The complete state of a document processing workflow execution.

```typescript
interface WorkflowState {
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
```

---

## Step Output Types

### ClassificationResult

Output from the `classify-document` step.

```typescript
interface ClassificationResult {
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
```

### ConvertedImageInfo

Output from the `convert-pdf` step (array of pages).

```typescript
interface ConvertedImageInfo {
  pageNumber: number;
  s3Key: string;             // S3 key for converted image
  width: number;
  height: number;
  sizeBytes: number;
}
```

### ExtractionResult

Output from the `extract-data` step.

```typescript
// Base extraction result (common fields)
interface BaseExtractionResult {
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

  // Line items
  lineItems?: ExtractedLineItem[];
}

// Invoice-specific extraction
interface InvoiceExtractionResult extends BaseExtractionResult {
  documentType: 'invoice';
  invoiceNumber?: string;
  dueDate?: string;
  paymentTerms?: string;
  billingAddress?: string;
  shippingAddress?: string;
}

// Receipt-specific extraction
interface ReceiptExtractionResult extends BaseExtractionResult {
  documentType: 'receipt';
  storeLocation?: string;
  paymentMethod?: string;
  cardLastFour?: string;
}

type ExtractionResult = InvoiceExtractionResult | ReceiptExtractionResult;

interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  category?: string;         // Matched business category
  taxAmount?: number;
  taxRate?: number;
}
```

---

## State Transitions

### Workflow Status Flow

```
running → completed  (success path)
running → failed     (error path)
```

### Step Status Flow

```
pending → running → completed  (success)
pending → running → failed     (error, may retry)
```

### Document Status Updates (Convex)

The Lambda updates Convex document status at key points:

| Workflow Event | Convex Status (invoices) | Convex Status (expense_claims) |
|----------------|--------------------------|-------------------------------|
| Workflow started | `processing` | `analyzing` |
| Classification complete | `processing` | `analyzing` |
| Conversion complete | `uploading` | `analyzing` |
| Extraction complete | `completed` | `completed` |
| Workflow failed | `failed` | `failed` |

---

## Error Codes

```typescript
const ERROR_CODES = {
  // Classification errors
  CLASSIFICATION_FAILED: 'Unable to determine document type',
  UNSUPPORTED_FORMAT: 'Document format not supported',

  // Conversion errors
  PDF_CONVERSION_FAILED: 'Failed to convert PDF to images',
  PDF_TOO_LARGE: 'PDF exceeds maximum page limit',
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
} as const;

type ErrorCode = keyof typeof ERROR_CODES;
```

---

## Validation Rules

### DocumentProcessingPayload Validation

```typescript
import { z } from 'zod';

const DocumentProcessingPayloadSchema = z.object({
  documentId: z.string().uuid(),
  domain: z.enum(['invoices', 'expense_claims']),
  storagePath: z.string().min(1),
  fileType: z.enum(['pdf', 'image']),
  userId: z.string().min(1),
  businessId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  expectedDocumentType: z.enum(['invoice', 'receipt']).optional(),
  businessCategories: z.array(BusinessCategorySchema).optional(),
});
```

### Business Rules

1. **Idempotency**: If `idempotencyKey` matches a completed execution within 24 hours, return cached result
2. **Page Limit**: PDFs with more than 100 pages are rejected with `PDF_TOO_LARGE`
3. **File Size**: Documents larger than 50MB are rejected
4. **Confidence Threshold**: Extractions with confidence < 0.6 are flagged for manual review

---

## Relationship to Existing Schema

This data model is **Lambda-internal only**. It does not modify the existing Convex schema:

| Convex Table | Lambda Interaction |
|--------------|-------------------|
| `invoices` | Read storage_path, update status, write extraction_results |
| `expense_claims` | Read storage_path, update status, write processing_metadata |

The Lambda writes extraction results to the existing `extraction_results` / `processing_metadata` JSONB fields, using the same structure as the current Trigger.dev tasks.
