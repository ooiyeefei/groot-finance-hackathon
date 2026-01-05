# Tasks: Lambda Durable Functions Migration

**Input**: Design documents from `/specs/004-lambda-durable-migration/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Tests**: Not explicitly requested in specification - omitting test tasks.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **CDK Infrastructure**: `infra/` directory
- **Lambda Handler**: `src/lambda/document-processor/`
- **Vercel Integration**: `src/lib/`, `src/app/api/`
- **Lambda Layers**: `src/lambda/layers/`

---

## Phase 1: Setup (CDK Infrastructure)

**Purpose**: Initialize CDK project and Lambda Layer build system

- [x] T001 Create CDK project structure with `cdk init app --language typescript` in `infra/`
- [x] T002 Configure `infra/cdk.json` with context for staging/prod environments
- [x] T003 [P] Add CDK dependencies to `infra/package.json` (aws-cdk-lib, constructs, @types/node)
- [x] T004 [P] Create `infra/tsconfig.json` with strict TypeScript configuration
- [x] T005 Create Lambda Layer directory structure at `src/lambda/layers/python-pdf/`
- [x] T006 Create `src/lambda/layers/python-pdf/requirements.txt` with pdf2image, Pillow dependencies
- [x] T007 Create `src/lambda/layers/python-pdf/Dockerfile` for ARM64 Lambda Layer build
- [x] T008 [P] Create `src/lambda/layers/python-pdf/python/convert_pdf.py` Python script for PDF conversion
- [x] T009 Create Lambda handler directory structure at `src/lambda/document-processor/`
- [x] T010 [P] Create `src/lambda/document-processor/package.json` with durable SDK dependencies
- [x] T011 [P] Create `src/lambda/document-processor/tsconfig.json` for Lambda TypeScript

---

## Phase 2: Foundational (CDK Stack & Core Types)

**Purpose**: CDK stack definition and shared types - MUST complete before user story implementation

**⚠️ CRITICAL**: No Lambda handler work can begin until this phase is complete

- [x] T012 Create `infra/bin/finanseal-lambda.ts` CDK app entry point
- [x] T013 Create `infra/lib/document-processing-stack.ts` with Lambda function, Layer, IAM roles
- [x] T014 Add S3 bucket reference and permissions to CDK stack in `infra/lib/document-processing-stack.ts`
- [x] T015 Configure durable execution settings (timeout, retention) in CDK stack
- [x] T016 Add Vercel OIDC role invoke permission to Lambda alias in CDK stack
- [x] T017 [P] Create `src/lambda/document-processor/types.ts` with shared TypeScript interfaces from data-model.md
- [x] T018 [P] Copy contracts from `specs/004-lambda-durable-migration/contracts/lambda-invocation.ts` to `src/lambda/document-processor/contracts.ts`
- [ ] T019 Build and test Lambda Layer with Docker: `cd src/lambda/layers/python-pdf && docker build -t pdf-layer .`
- [ ] T020 Run `cdk synth` to validate CloudFormation template generation

**Checkpoint**: CDK stack synthesizes successfully, Lambda Layer builds - handler implementation can begin

---

## Phase 3: User Story 4 - Secure Invocation from Vercel (Priority: P1) 🔒

**Goal**: Enable Vercel API routes to securely invoke Lambda via OIDC without public endpoints

**Independent Test**: Verify OIDC credentials work by invoking Lambda from local environment with test credentials

**Why First**: Security foundation must be in place before any document processing can be invoked

### Implementation for User Story 4

- [x] T021 [US4] Create `src/lib/lambda-invoker.ts` with OIDC credential provider using fromWebToken()
- [x] T022 [US4] Implement `invokeDocumentProcessor()` function with async invocation (InvocationType: 'Event')
- [x] T023 [US4] Add `getVercelOIDCToken()` helper function with environment fallback in `src/lib/lambda-invoker.ts`
- [x] T024 [US4] Create error handling for OIDC token expiration and IAM permission errors
- [x] T025 [US4] Add environment variables to `.env.example`: DOCUMENT_PROCESSOR_LAMBDA_ARN, AWS_ROLE_ARN
- [x] T026 [US4] Validate IAM trust policy in `infra/lib/document-processing-stack.ts` matches Vercel OIDC provider

**Checkpoint**: Lambda can be invoked from Vercel with OIDC credentials - no public endpoint exposed

---

## Phase 4: User Story 1 - Document Upload Processing (Priority: P1) 🎯 MVP

**Goal**: Complete document processing workflow with classification, conversion, and extraction

**Independent Test**: Upload a PDF invoice and verify extraction completes with checkpointed steps

### Implementation for User Story 1

- [x] T027 [P] [US1] Create `src/lambda/document-processor/utils/s3-client.ts` with S3 read/write operations
- [x] T028 [P] [US1] Create `src/lambda/document-processor/utils/convex-client.ts` for status updates
- [x] T029 [P] [US1] Create `src/lambda/document-processor/utils/gemini-client.ts` for AI extraction calls
- [x] T030 [US1] Create `src/lambda/document-processor/steps/classify.ts` with document classification logic
- [x] T031 [US1] Create `src/lambda/document-processor/steps/convert-pdf.ts` with Python child process invocation
- [x] T032 [US1] Create `src/lambda/document-processor/steps/extract-invoice.ts` with invoice extraction using Gemini
- [x] T033 [US1] Create `src/lambda/document-processor/steps/extract-receipt.ts` with receipt extraction using Gemini
- [x] T034 [US1] Create main handler `src/lambda/document-processor/index.ts` with withDurableExecution wrapper
- [x] T035 [US1] Implement context.step() checkpointing for classify-document step in handler
- [x] T036 [US1] Implement context.step() checkpointing for convert-pdf step in handler
- [x] T037 [US1] Implement context.step() checkpointing for extract-data step in handler
- [x] T038 [US1] Implement context.step() checkpointing for update-status step in handler
- [x] T039 [US1] Add idempotency check at handler start using idempotencyKey from payload
- [x] T040 [US1] Update `src/domains/invoices/lib/data-access.ts` processDocument() to call Lambda instead of Trigger.dev

**Checkpoint**: Document upload triggers Lambda workflow, classification and extraction complete with checkpointing

---

## Phase 5: User Story 2 - Processing Status Visibility (Priority: P1)

**Goal**: Real-time status updates in database during each processing step

**Independent Test**: Monitor Convex document status changes during processing via dashboard

### Implementation for User Story 2

- [ ] T041 [US2] Define status constants in `src/lambda/document-processor/utils/convex-client.ts` (processing, analyzing, uploading, completed, failed)
- [ ] T042 [US2] Implement `updateDocumentStatus()` function for invoices domain in Convex client
- [ ] T043 [US2] Implement `updateExpenseClaimStatus()` function for expense_claims domain in Convex client
- [ ] T044 [US2] Add status update calls after each context.step() in `src/lambda/document-processor/index.ts`
- [ ] T045 [US2] Implement error status update on workflow failure with error message storage
- [ ] T046 [US2] Add Sentry context tags (document.domain, document.type) before each step

**Checkpoint**: Document status visible in real-time during processing, errors captured with context

---

## Phase 6: User Story 3 - Expense Claim Receipt Processing (Priority: P2)

**Goal**: Receipt-specific extraction workflow within the same Lambda

**Independent Test**: Upload a receipt image for expense claim and verify receipt-specific fields extracted

### Implementation for User Story 3

- [ ] T047 [US3] Add receipt-specific extraction fields to `src/lambda/document-processor/steps/extract-receipt.ts`
- [ ] T048 [US3] Implement low-confidence flagging for manual review in extract-receipt step
- [x] T049 [US3] Update `src/app/api/v1/expense-claims/[id]/reprocess/route.ts` to call Lambda with documentType: 'receipt'
- [ ] T050 [US3] Add receipt-specific Gemini prompts in `src/lambda/document-processor/utils/gemini-client.ts`
- [ ] T051 [US3] Implement business category matching for receipt line items

**Checkpoint**: Expense claim receipts processed with receipt-specific field extraction

---

## Phase 7: Error Handling & Sentry Integration

**Purpose**: Production-ready error handling and observability

- [ ] T052 Add @sentry/aws-serverless to `src/lambda/document-processor/package.json`
- [ ] T053 Initialize Sentry with dsn, environment, tracesSampleRate in `src/lambda/document-processor/index.ts`
- [ ] T054 Wrap handler with Sentry.wrapHandler() combined with withDurableExecution()
- [ ] T055 Implement error code mapping from ERROR_CODES constant in handler
- [ ] T056 Add retryable error detection and appropriate error responses
- [ ] T057 Create CloudWatch log group with 30-day retention in CDK stack

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup, deployment validation, and Trigger.dev removal

- [ ] T058 [P] Build and bundle Lambda handler: `cd src/lambda/document-processor && npm run build`
- [ ] T059 Deploy CDK stack to staging: `cd infra && cdk deploy --context environment=staging`
- [ ] T060 Test end-to-end document processing in staging environment
- [ ] T061 Deploy CDK stack to production: `cd infra && cdk deploy --context environment=prod`
- [ ] T062 Update Vercel environment variables with production Lambda ARN
- [ ] T063 Monitor production for 24 hours (rollback period)
- [ ] T064 [P] Remove Trigger.dev dependencies from root `package.json`
- [ ] T065 [P] Delete `src/trigger/` directory (classify-document.ts, convert-pdf-to-image.ts, extract-invoice-data.ts, extract-receipt-data.ts)
- [ ] T066 [P] Delete `trigger.config.ts` from project root
- [ ] T067 [P] Move `requirements.txt` content to Lambda Layer (already done in T006)
- [ ] T068 Run quickstart.md validation steps
- [ ] T069 Update CLAUDE.md to reflect Lambda Durable Functions pattern (constitution amendment)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 4 (Phase 3)**: Depends on Foundational - Security foundation required first
- **User Story 1 (Phase 4)**: Depends on US4 - Needs invocation mechanism
- **User Story 2 (Phase 5)**: Depends on US1 - Status updates require processing workflow
- **User Story 3 (Phase 6)**: Depends on US1 - Receipt processing extends base workflow
- **Error Handling (Phase 7)**: Depends on US1, US2 - Needs complete workflow for error context
- **Polish (Phase 8)**: Depends on all user stories - Cleanup after validation

### User Story Dependencies

- **User Story 4 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 1 (P1)**: Depends on US4 (needs Lambda invocation) - MVP delivery point
- **User Story 2 (P1)**: Depends on US1 (needs workflow steps to update status)
- **User Story 3 (P2)**: Depends on US1 (extends extraction workflow)

### Within Each User Story

- Utils before steps (T027-T029 before T030-T033)
- Steps before handler integration (T030-T033 before T034-T039)
- Handler complete before API route update (T039 before T040)
- Core implementation before integration

### Parallel Opportunities

**Phase 1 (Setup)**:
- T003, T004 can run in parallel
- T008 can run in parallel with T005-T007
- T010, T011 can run in parallel with T005-T009

**Phase 2 (Foundational)**:
- T017, T018 can run in parallel with T012-T016

**Phase 4 (User Story 1)**:
- T027, T028, T029 can run in parallel (utility files)

**Phase 8 (Polish)**:
- T064, T065, T066, T067 can run in parallel (cleanup tasks)

---

## Parallel Example: User Story 1 Implementation

```bash
# Launch all utility files together:
Task T027: "Create src/lambda/document-processor/utils/s3-client.ts"
Task T028: "Create src/lambda/document-processor/utils/convex-client.ts"
Task T029: "Create src/lambda/document-processor/utils/gemini-client.ts"

# After utils complete, launch step files (sequentially recommended due to shared patterns):
Task T030: "Create steps/classify.ts"
Task T031: "Create steps/convert-pdf.ts"
Task T032: "Create steps/extract-invoice.ts"
Task T033: "Create steps/extract-receipt.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 4 + 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 4 (Security/Invocation)
4. Complete Phase 4: User Story 1 (Core Processing)
5. **STOP and VALIDATE**: Test document processing end-to-end in staging
6. Deploy to production if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 4 → Test OIDC invocation → Security validated
3. Add User Story 1 → Test document processing → Deploy/Demo (MVP!)
4. Add User Story 2 → Test status visibility → Deploy/Demo
5. Add User Story 3 → Test receipt processing → Deploy/Demo
6. Each story adds value without breaking previous stories

### Rollback Strategy

If critical issues discovered within 24 hours of production deployment:
1. Revert API route changes (git revert T040, T049)
2. Trigger.dev code preserved in feature branch for 7 days
3. No data loss - Convex schema unchanged

---

## Notes

- [P] tasks = different files, no dependencies within phase
- [Story] label maps task to specific user story for traceability
- User Story 4 (Security) must complete before US1 can be tested
- User Story 1 is the MVP delivery point
- User Story 2 and 3 are incremental improvements
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Big Bang Cutover**: After Phase 8 completion, Trigger.dev is fully removed
