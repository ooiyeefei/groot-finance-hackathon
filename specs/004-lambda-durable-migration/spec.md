# Feature Specification: Migrate Trigger.dev Tasks to AWS Lambda Durable Functions

**Feature Branch**: `004-lambda-durable-migration`
**Created**: 2026-01-05
**Status**: Draft
**Input**: User description: "Migrate Trigger.dev Tasks to AWS Lambda Durable Functions - rearchitect document processing workflow from scattered Trigger.dev tasks to unified Lambda durable functions with checkpoint, replay, wait, and resume capabilities"
**GitHub Issue**: [#85](https://github.com/grootdev-ai/finanseal-mvp/issues/85)

## Executive Summary

Migrate the current scattered Trigger.dev background tasks to AWS Lambda Durable Functions (released December 2025) to achieve unified workflow orchestration, automatic checkpointing, improved performance, and simplified architecture for document processing pipelines.

### Current Pain Points (from GitHub Issue #85)
- **Performance Concerns**: Trigger.dev tasks feel slow, impacting app smoothness
- **Scattered Tasks**: Multiple separate task files create complexity (classify-document, convert-pdf-to-image, extract-invoice-data, extract-receipt-data)
- **Cold Start Latency**: Each task invocation may incur startup costs
- **Task Orchestration**: Current approach triggers downstream tasks via `tasks.trigger()` but lacks unified workflow visibility

### Proposed Solution Benefits
- **Unified Workflow**: Single workflow definition with sequential steps
- **Built-in Checkpointing**: Automatic state persistence after each step
- **Wait/Resume**: Native support for long waits without consuming compute resources
- **Simplified Orchestration**: No manual task chaining - use `context.step()` for each processing stage
- **Cost Efficiency**: Pay only for actual compute time, not waiting time

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Document Upload Processing (Priority: P1)

A business user uploads a document (PDF or image) for invoice/expense claim processing, and the system processes it through a unified workflow with checkpointing.

**Why this priority**: This is the core functionality - document processing is the primary value proposition of FinanSeal. Without reliable document processing, the product has no value.

**Independent Test**: Can be fully tested by uploading a document and verifying the complete extraction workflow completes successfully with visible progress states.

**Acceptance Scenarios**:

1. **Given** a user uploads a PDF invoice, **When** the document processing Lambda is triggered, **Then** the workflow executes classification, conversion, and extraction steps with checkpoints after each stage
2. **Given** a document is mid-processing and the Lambda times out, **When** the execution resumes from checkpoint, **Then** it continues from the last successful step without re-processing completed work
3. **Given** a multi-page PDF document, **When** processing completes, **Then** all pages are converted and extracted data is consolidated into a single result

---

### User Story 2 - Processing Status Visibility (Priority: P1)

System administrators and users can see real-time processing status for their documents, including which step is currently executing.

**Why this priority**: Visibility into processing state is critical for user experience and debugging issues.

**Independent Test**: Can be verified by checking database status updates and CloudWatch logs during document processing.

**Acceptance Scenarios**:

1. **Given** a document is being processed, **When** each step completes, **Then** the document status is updated in the database (classifying, converting, extracting, completed)
2. **Given** a processing failure occurs, **When** the error is caught, **Then** the document status reflects the failure with appropriate error messaging

---

### User Story 3 - Expense Claim Receipt Processing (Priority: P2)

Business users can upload expense claim receipts that follow a specialized extraction workflow optimized for receipt-specific fields.

**Why this priority**: Expense claims are a secondary but important use case that shares infrastructure with invoices but requires different extraction logic.

**Independent Test**: Can be tested by uploading a receipt image and verifying expense-specific fields are extracted correctly.

**Acceptance Scenarios**:

1. **Given** a user uploads a receipt for an expense claim, **When** document classification identifies it as a receipt, **Then** it routes to receipt-specific extraction logic within the same Lambda workflow
2. **Given** a receipt image with poor quality, **When** extraction confidence is low, **Then** the system flags it for manual validation

---

### User Story 4 - Secure Invocation from Vercel (Priority: P1)

The Vercel-hosted Next.js application securely invokes Lambda functions using existing OIDC integration without exposing public endpoints.

**Why this priority**: Security is non-negotiable - Lambda endpoints must not be publicly accessible, and only authenticated Vercel requests should trigger processing.

**Independent Test**: Can be verified by attempting Lambda invocation from unauthorized sources and confirming rejection.

**Acceptance Scenarios**:

1. **Given** a Vercel API route needs to trigger document processing, **When** it uses the existing OIDC role, **Then** the Lambda is invoked successfully via SDK
2. **Given** an unauthenticated request attempts to invoke the Lambda, **When** IAM policies are evaluated, **Then** the request is denied
3. **Given** the OIDC role is used for invocation, **When** the Lambda executes, **Then** it has only the permissions needed for processing (S3, Convex, no public endpoints)

---

### Edge Cases

- What happens when a PDF has more than 100 pages? System should process pages in batches with checkpointing after each batch
- How does the system handle corrupted or malformed PDFs? Validation step should detect and fail fast with user-friendly error message
- What happens if S3 is temporarily unavailable during processing? Built-in retry logic with exponential backoff
- How does the system handle concurrent processing of the same document? Idempotency keys prevent duplicate processing
- What happens if the AI extraction service (Gemini API) is rate-limited? Durable wait with retry after rate limit period expires

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST consolidate current Trigger.dev tasks (classify-document, convert-pdf-to-image, extract-invoice-data, extract-receipt-data) into a single Lambda Durable Function workflow
- **FR-002**: System MUST implement automatic checkpointing after each processing step using `context.step()`
- **FR-003**: System MUST handle PDF-to-image conversion using Lambda Layers containing poppler-utils and pdf2image dependencies
- **FR-004**: System MUST support document classification (invoice vs receipt) as the first workflow step before routing to appropriate extraction logic
- **FR-005**: System MUST maintain S3 presigned URL generation for image access during AI processing
- **FR-006**: System MUST update Convex database with processing status at each workflow step
- **FR-007**: System MUST be invoked ONLY via AWS SDK from authenticated Vercel OIDC sessions - NO public Lambda URL endpoint
- **FR-008**: System MUST support execution timeout of up to 1 hour for complex multi-page documents (Lambda Durable Functions support up to 1 year)
- **FR-009**: System MUST retain execution history for 30 days for debugging and audit purposes
- **FR-010**: System MUST handle both single-image documents and multi-page PDF documents in the same workflow
- **FR-011**: System MUST integrate with existing Gemini 2.5 Flash API for AI-powered data extraction
- **FR-012**: System MUST implement idempotency to prevent duplicate processing of the same document
- **FR-013**: System MUST be deployed via AWS CDK TypeScript for infrastructure-as-code
- **FR-014**: System MUST integrate with existing Sentry setup using @sentry/aws-serverless for unified error tracking across Next.js and Lambda

### Non-Functional Requirements

- **NFR-001**: Cold start latency MUST be under 3 seconds for document processing initiation
- **NFR-002**: System MUST handle at least 100 concurrent document processing workflows
- **NFR-003**: Checkpoint/replay overhead MUST add no more than 500ms per step
- **NFR-004**: IAM policies MUST follow least-privilege principle with no public endpoint exposure
- **NFR-005**: System MUST be cost-effective compared to current Trigger.dev usage (target: 30% cost reduction)
- **NFR-006**: Lambda memory allocation MUST be 1024 MB to balance performance and cost (~6,600 docs/month within free tier)

### Key Entities

- **DocumentProcessingWorkflow**: The main durable function orchestrating the entire document processing pipeline
- **ProcessingStep**: Represents each checkpointed step (classify, convert, extract)
- **ProcessingState**: Current execution state including completed steps, intermediate results, and error information
- **DocumentDomain**: Routing context for invoice vs expense_claims processing paths

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Document processing completes within 60 seconds for single-page images (current: ~90 seconds with Trigger.dev)
- **SC-002**: System recovers from interruptions and resumes from last checkpoint within 5 seconds
- **SC-003**: Zero public Lambda endpoints exposed - all invocations via authenticated SDK calls
- **SC-004**: Processing cost per document is reduced by at least 30% compared to Trigger.dev
- **SC-005**: 99.9% of documents complete processing without manual intervention
- **SC-006**: CloudWatch provides end-to-end workflow visibility with step-level tracing

---

## Architecture Constraints

### Security Requirements
- NO public Lambda Function URLs
- NO overly permissive IAM policies allowing unauthenticated trigger
- MUST use existing Vercel OIDC integration for authentication
- Lambda execution role MUST have minimal permissions (S3 access, CloudWatch logs, checkpoint operations)

### AWS Integration
- MUST use existing S3 bucket: `finanseal-bucket` with prefixes `invoices/` and `expense_claims/`
- MUST use existing IAM OIDC provider for Vercel: `arn:aws:iam::837224017779:oidc-provider/oidc.vercel.com`
- MUST add Lambda invoke permission to existing Vercel IAM role
- MUST use AWS CDK TypeScript for all infrastructure definitions

### Runtime Requirements
- Lambda runtime: Node.js 22.x (required for Lambda Durable Functions)
- Durable Execution SDK: `@aws/durable-execution-sdk-js`
- Python processing via Lambda Layers containing poppler-utils and pdf2image; Node.js executes Python via child process within single Lambda

### Migration Strategy
- Big bang cutover: Remove Trigger.dev entirely once Lambda implementation is validated in staging
- No parallel operation period - single deployment switch from Trigger.dev to Lambda
- Trigger.dev dependencies to be removed from package.json after successful Lambda deployment
- Rollback plan: Revert to previous deployment if critical issues discovered within 24 hours

---

## Assumptions

- Vercel Pro plan is active for OIDC integration (confirmed via existing IAM setup)
- AWS account 837224017779 has Lambda Durable Functions feature available
- Current Convex database schema and helpers remain unchanged
- Gemini API credentials remain the same
- S3 bucket permissions are already configured correctly

---

## Clarifications

### Session 2026-01-05

- Q: Python processing architecture for PDF conversion? → A: Lambda Layers - Bundle poppler-utils and pdf2image as a Lambda Layer; use Node.js Lambda with child process to execute Python
- Q: Migration strategy from Trigger.dev to Lambda? → A: Big bang cutover - Remove Trigger.dev entirely once Lambda implementation is complete; single deployment switch
- Q: Lambda memory allocation? → A: 1024 MB - Balanced performance with ~6,600 documents/month within free tier
- Q: Error alerting strategy? → A: Sentry integration - Leverage existing Sentry setup with @sentry/aws-serverless for unified error tracking

---

## Out of Scope

- Migration of non-document-processing tasks (if any exist)
- Changes to the frontend upload flow
- Changes to the Convex database schema
- New document types beyond invoice and receipt
- Real-time processing progress streaming to UI (status polling is sufficient)
- Multi-region deployment
