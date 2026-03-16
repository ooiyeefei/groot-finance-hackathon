# Tasks: Email Forwarding for Documents (Receipts & AP Invoices)

**Input**: Design documents from `/specs/001-doc-email-forward/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md, this is a Next.js monorepo with domain-driven architecture:
- **Domains**: `src/domains/`
- **Shared libs**: `src/lib/`
- **Lambda functions**: `src/trigger/`
- **Convex backend**: `convex/`
- **Infrastructure**: `infra/lib/`
- **Tests**: `tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and configure project structure

- [ ] T001 Install mailparser email parsing library: `npm install mailparser @types/mailparser`
- [ ] T002 [P] Verify Convex CLI version compatibility: `npx convex --version` (ensure 1.31.3+)
- [ ] T003 [P] Verify AWS CDK version: `cd infra && npx cdk --version` (ensure 2.175.0+)
- [ ] T004 [P] Create test data directory for email simulation: `mkdir -p test-data`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema (Convex)

- [ ] T005 Extend Convex schema: Add `document_inbox_entries` table in `convex/schema.ts` with all indexes per data-model.md
- [ ] T006 [P] Extend Convex schema: Add email forwarding fields to `businesses` table (docInboxEmail, authorizedEmailDomains, emailForwardingEnabled, emailNotificationPreferences)
- [ ] T007 [P] Extend Convex schema: Add sourceType tracking fields to `expense_claims` table (sourceType, sourceInboxEntryId)
- [ ] T008 [P] Extend Convex schema: Add sourceType tracking fields to `invoices` table (sourceType, sourceInboxEntryId)
- [ ] T009 Deploy Convex schema to dev environment: `npx convex dev` (verify all tables created)

### Email Parsing Utilities

- [ ] T010 [P] Create email parser utility in `src/lib/email/parser.ts` (RFC 5322 parsing with mailparser)
- [ ] T011 [P] Create attachment extractor utility in `src/lib/email/attachment-extractor.ts` (filter PDF/JPG/PNG, validate size/type)
- [ ] T012 Create duplicate detection utility in `src/lib/email/duplicate-detector.ts` (file hash computation with crypto)

### Convex Base Functions

- [ ] T013 Create Convex document inbox mutations in `convex/functions/documentInbox.ts`:
  - `createInboxEntry` mutation (contract: contracts/convex-mutations.ts)
  - `updateInboxStatus` mutation
  - `findByHash` query (for duplicate detection)
- [ ] T014 [P] Create Convex routing helpers in `convex/lib/email-routing.ts` (inferDomainFromType, routeToDestination)
- [ ] T015 [P] Extend Convex businesses functions in `convex/functions/businesses.ts` (add email config getters/setters)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Email Forwarding for Expense Receipts (Priority: P1) 🎯 MVP

**Goal**: Enable employees to forward receipt images via email, auto-classify as receipts, extract data, and auto-create draft expense claims (confidence ≥85%). Low-confidence receipts (<85%) route to "Needs Review" inbox.

**Independent Test**: Forward email with receipt attachment to `docs@test.hellogroot.com` → Verify draft expense claim auto-created with extracted data within 30 seconds.

### Implementation for User Story 1

#### Lambda Email Processor (Backend)

- [ ] T016 [US1] Extend Lambda email processor in `src/trigger/email-processor.ts`:
  - Add SES S3 event handler (parse event schema from contracts/ses-email-event.json)
  - Implement email parsing with mailparser library
  - Implement attachment extraction (PDF/JPG/PNG only)
  - Add file hash computation for duplicate detection
- [ ] T017 [US1] Implement sender domain validation in `src/trigger/email-processor.ts`:
  - Check SPF/DKIM verdicts from SES event
  - Query business authorized domains from Convex
  - Quarantine unauthorized submissions
- [ ] T018 [US1] Implement duplicate detection in `src/trigger/email-processor.ts`:
  - Check file hash against Convex (90-day window)
  - Send auto-reply email if duplicate found
  - Skip classification for duplicates (save API costs)
- [ ] T019 [US1] Implement file upload to Convex storage in `src/trigger/email-processor.ts`:
  - Upload attachment buffer to Convex `_storage`
  - Create `document_inbox_entries` record via Convex mutation
  - Trigger classification task (Trigger.dev)

#### Classification Extension (AI Routing)

- [ ] T020 [US1] Extend Trigger.dev classification task in `src/trigger/classify-document.ts`:
  - Add `targetDomain` parameter (default: 'expense_claims' for backward compat)
  - Add `targetDomain: 'auto'` mode for multi-domain routing
  - Preserve existing receipt validation logic (no breaking changes)
- [ ] T021 [US1] Implement multi-domain routing logic in `src/trigger/classify-document.ts`:
  - Extract `inferDomainFromType()` helper (receipt → expense_claims, invoice → invoices)
  - Add confidence threshold check (≥85% auto-route, <85% → needs_review)
  - Call Convex `routeDocument` mutation for high-confidence docs
  - Call Convex `updateInboxStatus` mutation for low-confidence docs

#### Convex Integration (Expense Claims)

- [ ] T022 [US1] Extend Convex expense claims functions in `convex/functions/expenseClaims.ts`:
  - Add `createFromEmail` mutation (accepts sourceType='email_forward', sourceInboxEntryId)
  - Add sourceType field to createExpenseClaim logic
  - Handle missing user expense submission (auto-create new batch if needed)
- [ ] T023 [US1] Implement routing mutation in `convex/functions/documentInbox.ts`:
  - `routeDocument` mutation: Create expense claim, update inbox status to 'routed', delete inbox entry
  - Add duplicate metadata check (vendor + amount + date ±1 day)
  - Set duplicateWarning flag if semantic duplicate detected

#### Infrastructure (AWS)

- [ ] T024 [US1] Extend AWS CDK document processing stack in `infra/lib/document-processing-stack.ts`:
  - Add SES Receipt Rule for `docs@*.hellogroot.com` wildcard
  - Configure S3 action to store emails in `finanseal-bucket/emails/`
  - Add Lambda trigger for `finanseal-einvoice-email-processor` on S3 ObjectCreated
- [ ] T025 [US1] Update Lambda IAM permissions in `infra/lib/document-processing-stack.ts`:
  - Add S3 GetObject permission for `emails/*` prefix
  - Add SES SendRawEmail permission for auto-reply emails
  - Add Convex API invocation permission (via IAM auth)
- [ ] T026 [US1] Deploy CDK stack to AWS: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`

#### Testing & Validation

- [ ] T027 [US1] Create email simulation script in `scripts/test-email-forward.ts` per quickstart.md
- [ ] T028 [US1] Test high-confidence receipt flow:
  - Run simulation with clear receipt image
  - Verify classification confidence ≥85%
  - Verify draft expense claim auto-created
  - Verify sourceType='email_forward' in expense_claims record
- [ ] T029 [US1] Test low-confidence receipt flow:
  - Run simulation with blurry receipt image
  - Verify classification confidence <85%
  - Verify document routed to document_inbox_entries table
  - Verify status='needs_review'
- [ ] T030 [US1] Test duplicate detection:
  - Forward same receipt twice
  - Verify second forward rejected with auto-reply email
  - Verify no classification triggered (cost savings)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Employees can forward receipts via email and see auto-created expense claims.

---

## Phase 4: User Story 2 - Email Forwarding for AP Invoices (Priority: P2)

**Goal**: Enable AP accountants to forward vendor invoice emails, auto-classify as invoices, extract data (including PO matching), and auto-create AP invoice entries (confidence ≥85%). Low-confidence invoices (<85%) route to "Needs Review" inbox.

**Independent Test**: Forward email with invoice PDF to `docs@test.hellogroot.com` → Verify AP invoice entry auto-created with extracted data and PO matching (if PO number detected) within 30 seconds.

### Implementation for User Story 2

#### Classification Extension (Invoice Support)

- [ ] T031 [US2] Extend classification prompt in `src/trigger/classify-document.ts`:
  - Update Gemini Vision prompt to distinguish receipts vs invoices
  - Add invoice-specific element detection (invoice_header, invoice_number, line_items, payment_terms)
  - Ensure confidence calibration for invoice type (use existing threshold 85%)
- [ ] T032 [US2] Add invoice routing logic in `src/trigger/classify-document.ts`:
  - Extend `inferDomainFromType()`: 'invoice' → 'invoices' domain
  - Route high-confidence invoices to `invoices` table via Convex mutation
  - Route low-confidence invoices to `document_inbox_entries` (same as receipts)

#### Convex Integration (AP Invoices)

- [ ] T033 [US2] Extend Convex invoices functions in `convex/functions/invoices.ts`:
  - Add `createFromEmail` mutation (accepts sourceType='email_forward', sourceInboxEntryId)
  - Add sourceType field to existing invoice creation logic
  - Preserve existing document processing flow (classification → extraction → AP entry)
- [ ] T034 [US2] Implement PO matching integration in `convex/functions/invoices.ts`:
  - If extractedData contains PO number, query `purchase_orders` table
  - If PO found, pre-populate 3-way matching fields (poId, poNumber, poAmount)
  - If PO not found, create invoice without PO (user can match manually later)
- [ ] T035 [US2] Implement routing mutation for invoices in `convex/functions/documentInbox.ts`:
  - Extend `routeDocument` to handle 'invoices' destination domain
  - Create invoice record, update inbox status to 'routed', delete inbox entry
  - Add duplicate metadata check for invoices (vendor + invoice_number + amount)

#### Testing & Validation

- [ ] T036 [US2] Test high-confidence invoice flow:
  - Forward email with clear invoice PDF
  - Verify classification type='invoice', confidence ≥85%
  - Verify AP invoice entry auto-created
  - Verify sourceType='email_forward' in invoices record
- [ ] T037 [US2] Test PO matching:
  - Forward invoice with PO number in content
  - Verify AI extracts PO number
  - Verify Convex mutation auto-matches to purchase_orders table
  - Verify 3-way matching fields pre-populated
- [ ] T038 [US2] Test multi-attachment email:
  - Forward email with 3 attachments (invoice PDF + 2 supporting docs)
  - Verify system identifies primary invoice vs supporting docs
  - Verify all attachments grouped/linked in invoices record

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Employees can forward receipts, AP accountants can forward invoices.

---

## Phase 5: User Story 3 - Needs Review Inbox (Priority: P2)

**Goal**: Provide UI for users to manually classify low-confidence documents (<85%) that couldn't be auto-routed. Show document preview, AI suggestion, confidence score, and allow manual classification to route document to appropriate workflow.

**Independent Test**: Forward blurry image → Verify document appears in "Needs Review" inbox → Manually classify as "Receipt" → Verify document routed to expense claims.

### Frontend: Needs Review Inbox Page

#### Domain Setup

- [ ] T039 [P] [US3] Create documents-inbox domain structure:
  - Create `src/domains/documents-inbox/` directory
  - Create subdirectories: `components/`, `hooks/`, `lib/`, `types/`
- [ ] T040 [P] [US3] Create inbox types in `src/domains/documents-inbox/types/inbox.ts`:
  - DocumentInboxEntry interface (matches Convex schema)
  - InboxStatus enum (needs_review, extraction_failed, archived, quarantined)
  - InboxDocument interface (UI display format)

#### Convex Queries

- [ ] T041 [P] [US3] Implement Convex inbox queries in `convex/functions/documentInbox.ts`:
  - `getInboxDocuments` query (filter by business, status, user, with pagination)
  - `getInboxDocument` query (get single doc by ID with user details)
  - `getInboxStats` query (count needs_review, extraction_failed for dashboard badge)
- [ ] T042 [P] [US3] Implement Convex inbox mutations in `convex/functions/documentInbox.ts`:
  - `manuallyClassifyDocument` mutation (contract: contracts/convex-mutations.ts)
  - `deleteInboxEntry` mutation (user action)
  - `retryExtraction` mutation (re-trigger classification for failed docs)

#### React Hooks

- [ ] T043 [P] [US3] Create inbox documents hook in `src/domains/documents-inbox/hooks/use-inbox-documents.tsx`:
  - Convex useQuery subscription to `getInboxDocuments`
  - Real-time updates when documents added/removed
  - Filter by status (needs_review, extraction_failed)
  - Pagination support
- [ ] T044 [P] [US3] Create classify document hook in `src/domains/documents-inbox/hooks/use-classify-document.tsx`:
  - Convex useMutation for `manuallyClassifyDocument`
  - Loading/error states
  - Toast notification on success/error

#### UI Components

- [ ] T045 [P] [US3] Create needs review list component in `src/domains/documents-inbox/components/needs-review-list.tsx`:
  - Table with columns: Filename, Source, AI Type, Confidence, Date, Actions
  - Sort by date (newest first)
  - Filter by type (receipts, invoices, unknown)
  - Empty state ("No documents need review")
- [ ] T046 [P] [US3] Create confidence badge component in `src/domains/documents-inbox/components/confidence-badge.tsx`:
  - Color-coded by confidence: <70% red, 70-84% yellow, ≥85% green
  - Tooltip shows AI reasoning on hover
  - Icon: ✗ (red), ⚠ (yellow), ✓ (green)
- [ ] T047 [P] [US3] Create document preview component in `src/domains/documents-inbox/components/document-preview.tsx`:
  - Thumbnail preview for images (JPG/PNG)
  - PDF icon for PDF files (no preview, too complex for MVP)
  - Click to open full-size view in modal
- [ ] T048 [US3] Create classify document dialog in `src/domains/documents-inbox/components/classify-document-dialog.tsx`:
  - Modal with document preview
  - Dropdown: "Expense Receipt", "AP Invoice", "E-Invoice"
  - Show AI's suggested type with confidence (e.g., "AI suggests: Receipt (72%)")
  - Confirm button triggers `manuallyClassifyDocument` mutation
  - Cancel button closes dialog

#### Page Routes

- [ ] T049 [US3] Create inbox page route in `src/app/[locale]/documents-inbox/page.tsx`:
  - Server component with auth() check (Clerk)
  - Wrap <ClientProviders> with <Sidebar /> + <HeaderWithUser />
  - Pass businessId to client component
- [ ] T050 [US3] Create inbox client component in `src/domains/documents-inbox/page.tsx`:
  - Main page layout with title "Needs Review"
  - Use `use-inbox-documents` hook to fetch documents
  - Render <NeedsReviewList /> component
  - Show count badge: "Needs Review (5)"

#### Sidebar Navigation

- [ ] T051 [US3] Add "Documents Inbox" nav item to sidebar in `src/components/sidebar.tsx`:
  - Icon: FileSearch (lucide-react)
  - Label: "Documents Inbox"
  - Badge: count of needs_review documents (from `getInboxStats` query)
  - Route: `/documents-inbox`
  - Only show if user has permission (manager/admin/owner)

### Notification System

#### Email Notifications

- [ ] T052 [P] [US3] Create exception notification cron in `convex/functions/crons.ts`:
  - `sendExceptionNotifications` internal mutation (runs hourly)
  - Query document_inbox_entries with status='needs_review' or 'extraction_failed'
  - Filter by business emailNotificationPreferences.notifyOnNeedsReview=true
  - Send email via existing SES infrastructure (reuse system-email-stack.ts patterns)
- [ ] T053 [P] [US3] Create notification email template in `src/lib/email-templates/exception-notification.tsx`:
  - Subject: "Document needs your review"
  - Body: Document filename, AI suggested type, confidence %, link to inbox
  - Use existing SES template patterns from system-email-stack.ts
- [ ] T054 [US3] Register cron in `convex/crons.ts`:
  - Add hourly cron: `sendExceptionNotifications` (every 60 minutes)
  - Configure to skip weekends if emailNotificationPreferences.digestFrequency != 'daily'

### Testing & Validation

- [ ] T055 [US3] Test "Needs Review" inbox UI:
  - Navigate to `/documents-inbox`
  - Verify page loads with Sidebar + Header
  - Verify empty state if no documents
  - Create low-confidence document via test script
  - Verify document appears in table within 5 seconds (Convex real-time update)
- [ ] T056 [US3] Test manual classification flow:
  - Click "Classify" button on document
  - Verify modal opens with document preview
  - Select "Expense Receipt" from dropdown
  - Click "Confirm"
  - Verify document removed from inbox
  - Navigate to expense claims page → Verify draft claim created
- [ ] T057 [US3] Test confidence badge display:
  - Create documents with different confidence levels (50%, 75%, 90%)
  - Verify badge colors: red (50%), yellow (75%), green (90%)
  - Hover over badge → Verify tooltip shows AI reasoning
- [ ] T058 [US3] Test notification system:
  - Forward blurry document to trigger needs_review
  - Wait 60 minutes (or manually trigger cron)
  - Verify email received with link to inbox
  - Click link → Verify navigation to inbox page

**Checkpoint**: All user stories should now be independently functional. Users can forward documents, low-confidence docs appear in inbox, users can manually classify.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, cleanup, documentation

### Data Retention & Cleanup

- [ ] T059 [P] Create auto-archive cron in `convex/functions/crons.ts`:
  - `autoArchiveInboxDocuments` internal mutation (runs daily at 2 AM)
  - Query document_inbox_entries where archiveEligibleAt ≤ now
  - Update status to 'archived'
  - Move file to S3 Glacier (optional, can defer)
- [ ] T060 [P] Create hard delete cron in `convex/functions/crons.ts`:
  - `deleteExpiredDocuments` internal mutation (runs monthly)
  - Query document_inbox_entries where deleteEligibleAt ≤ now AND status='archived'
  - Hard delete record + file (7-year retention compliance)
- [ ] T061 Register retention crons in `convex/crons.ts`:
  - Add daily cron: `autoArchiveInboxDocuments` (2 AM local time)
  - Add monthly cron: `deleteExpiredDocuments` (1st of month)

### Error Handling & Logging

- [ ] T062 [P] Add comprehensive error handling to Lambda email processor in `src/trigger/email-processor.ts`:
  - Try-catch around email parsing (malformed emails)
  - Try-catch around file upload (Convex storage failures)
  - Try-catch around classification trigger (Trigger.dev API errors)
  - Log all errors to CloudWatch with context (businessId, messageId, filename)
- [ ] T063 [P] Add error handling to Convex mutations in `convex/functions/documentInbox.ts`:
  - Validate input parameters (businessId exists, fileStorageId exists)
  - Handle race conditions (document deleted while processing)
  - Return user-friendly error messages (not raw exceptions)
- [ ] T064 [P] Add CloudWatch alarms in `infra/lib/document-processing-stack.ts`:
  - Lambda error rate >5% → SNS alert to admin
  - Classification failure rate >10% → SNS alert to admin
  - SES quarantine rate >1% → SNS alert (possible attack)

### Documentation & Migration

- [ ] T065 [P] Update root CLAUDE.md documentation:
  - Add email forwarding architecture section
  - Document new document_inbox_entries table
  - Document SES email receiving flow
  - Document classification multi-domain routing
- [ ] T066 [P] Create documents-inbox domain CLAUDE.md in `src/domains/documents-inbox/CLAUDE.md`:
  - Document "Needs Review" inbox architecture
  - Document manual classification flow
  - Document notification system
  - Document state transitions (data-model.md excerpt)
- [ ] T067 [P] Update expense claims CLAUDE.md in `src/domains/expense-claims/CLAUDE.md`:
  - Document email forwarding integration
  - Document sourceType='email_forward' tracking
  - Document auto-create draft from email flow
- [ ] T068 [P] Update invoices CLAUDE.md in `src/domains/invoices/CLAUDE.md`:
  - Document email forwarding integration
  - Document PO matching from forwarded invoices
  - Document sourceType='email_forward' tracking

### Data Migration

- [ ] T069 Backfill existing records with sourceType in `convex/migrations/backfill-source-type.ts`:
  - Query all expense_claims without sourceType
  - Update to sourceType='manual_upload'
  - Query all invoices without sourceType
  - Update to sourceType='manual_upload'
  - Run migration: `npx convex run migrations:backfillSourceType`
- [ ] T070 Initialize business email configs in `convex/migrations/init-email-configs.ts`:
  - Query all businesses without docInboxEmail
  - Set docInboxEmail=`docs@${business.slug}.hellogroot.com`
  - Set authorizedEmailDomains=[owner email domain]
  - Set emailForwardingEnabled=true
  - Run migration: `npx convex run migrations:initEmailConfigs`

### Deployment & Verification

- [ ] T071 Deploy Convex schema to production: `npx convex deploy --yes`
- [ ] T072 Deploy AWS CDK stack to production: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`
- [ ] T073 Verify SES email receiving rule in AWS Console:
  - Navigate to SES → Email receiving → Receipt rules
  - Verify rule exists: `docs-inbox-rule`
  - Verify action: Store in S3 bucket `finanseal-bucket/emails/`
  - Verify Lambda trigger configured
- [ ] T074 Run integration tests from quickstart.md:
  - Test email forwarding (send real email to test business)
  - Test high-confidence auto-routing
  - Test low-confidence manual classification
  - Test duplicate detection
  - Test notification system

### Regression Testing

- [ ] T075 Verify existing expense claims flow not broken:
  - Create expense claim via manual upload (existing UI)
  - Verify classification still works
  - Verify extraction still works
  - Verify approval workflow still works
  - Verify sourceType='manual_upload' for legacy claims
- [ ] T076 Verify existing AP invoices flow not broken:
  - Upload invoice via existing AP invoices UI
  - Verify document processing still works
  - Verify 3-way matching still works
  - Verify sourceType='manual_upload' for legacy invoices
- [ ] T077 Run full build: `npm run build` → Verify zero TypeScript errors
- [ ] T078 Run existing test suite: `npm test` → Verify all tests pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User Story 1 (P1): Can start after Foundational - No dependencies on other stories
  - User Story 2 (P2): Can start after Foundational - Reuses US1 infrastructure but independently testable
  - User Story 3 (P2): Depends on US1 + US2 classification logic existing (needs low-confidence docs to display)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundation → Email processor → Classification → Convex integration → Infrastructure
- **User Story 2 (P2)**: Foundation → Extend US1 classification → Invoices integration (independent of US1 data)
- **User Story 3 (P2)**: Foundation + US1/US2 (needs classification to produce needs_review docs) → Frontend UI → Notifications

### Within Each User Story

- Lambda changes before Convex integration (Lambda creates inbox entries)
- Convex schema before Convex functions (tables must exist)
- Convex functions before frontend hooks (API must exist)
- Frontend hooks before UI components (data layer before presentation)
- UI components before page routes (components before assembly)
- Infrastructure deployment before testing (AWS resources must exist)

### Parallel Opportunities

**Phase 1 (Setup)**: All 4 tasks can run in parallel
**Phase 2 (Foundational)**:
- T006-T008 (schema extensions) can run in parallel
- T010-T012 (email utilities) can run in parallel
- T013-T015 (Convex functions) can run in parallel after T005-T009 complete

**Phase 3 (User Story 1)**:
- T024-T026 (infrastructure) can run in parallel with T016-T023 (backend code)

**Phase 4 (User Story 2)**:
- T031-T032 (classification) and T033-T035 (Convex) can start together

**Phase 5 (User Story 3)**:
- T039-T040 (domain setup) run first
- T041-T044 (hooks/queries) can run in parallel
- T045-T048 (UI components) can run in parallel after hooks complete
- T052-T054 (notifications) can run in parallel with frontend work

**Phase 6 (Polish)**:
- T059-T061 (crons) can run in parallel
- T062-T064 (error handling) can run in parallel
- T065-T068 (documentation) can run in parallel
- T075-T078 (testing) must run sequentially after all code changes

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (4 tasks, ~15 min)
2. Complete Phase 2: Foundational (11 tasks, ~2 hours)
3. Complete Phase 3: User Story 1 (15 tasks, ~4 hours)
4. **STOP and VALIDATE**: Test User Story 1 independently (tasks T027-T030)
5. Deploy to staging for UAT
6. **MVP COMPLETE**: Email forwarding for receipts works end-to-end

**Estimated Total for MVP**: ~6-7 hours

### Incremental Delivery

1. **Week 1**: Setup + Foundational + User Story 1 (MVP)
   - Deploy → Test independently → Demo to stakeholders
   - Value delivered: Employees can forward receipts

2. **Week 2**: User Story 2 (AP Invoices)
   - 8 tasks, ~2 hours
   - Deploy → Test independently → Demo
   - Value delivered: AP accountants can forward invoices

3. **Week 3**: User Story 3 (Needs Review Inbox)
   - 20 tasks, ~4 hours
   - Deploy → Test independently → Demo
   - Value delivered: Exception handling for low-confidence docs

4. **Week 4**: Polish + Production Deploy
   - 18 tasks, ~4 hours
   - Full regression testing
   - Production deployment
   - User training & documentation

**Total estimated time**: ~17-20 hours of development work

### Parallel Team Strategy

With multiple developers:

1. **Team completes Setup + Foundational together** (~2 hours)
2. **Once Foundational is done:**
   - Developer A: User Story 1 (email forwarding backend + expense claims integration)
   - Developer B: User Story 2 (classification extension + invoices integration) - can start in parallel
   - Developer C: Begin User Story 3 infrastructure (Convex queries, types) - blocked on US1/US2 classification logic
3. **User Story 3 completes after US1/US2**
4. **All developers converge on Polish phase**

**Parallel execution reduces timeline to ~10-12 hours** (with 2-3 developers)

---

## Notes

- [P] tasks = different files, no dependencies, can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total tasks: **78 tasks** (Setup: 4, Foundational: 11, US1: 15, US2: 8, US3: 20, Polish: 18, Regression: 4)
- **MVP scope**: Phases 1-3 only (30 tasks, ~6-7 hours)
- **Full feature**: All phases (78 tasks, ~17-20 hours)
- **Critical path**: Setup → Foundational → US1 → US2 → US3 → Polish (no user story can skip Foundational)
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
