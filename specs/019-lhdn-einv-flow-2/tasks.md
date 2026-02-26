# Tasks: LHDN e-Invoice Flow 2 — Expense Claim E-Invoice Retrieval

**Input**: Design documents from `/specs/019-lhdn-einv-flow-2/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md, quickstart.md

**Tests**: Not explicitly requested — test tasks omitted. Manual testing strategy defined in quickstart.md.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and prepare development environment

- [X] T001 Install `@browserbasehq/stagehand` npm dependency for AI browser agent
- [X] T002 [P] Add `pyzbar==0.1.9` to `src/lambda/document-processor-python/requirements.txt`
- [X] T003 [P] Add `libzbar0` system dependency to `src/lambda/document-processor-python/Dockerfile`
- [ ] T004 [P] Add environment variables `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` to `.env.local` and Vercel project settings

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema changes and core Convex functions that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete and deployed to Convex

- [X] T005 Extend `expense_claims` table in `convex/schema.ts` with 13 new e-invoice fields: `merchantFormUrl`, `einvoiceRequestStatus` (union: "none" | "requesting" | "requested" | "received" | "failed"), `einvoiceSource` (union: "merchant_issued" | "manual_upload" | "not_applicable"), `einvoiceAttached`, `lhdnReceivedDocumentUuid`, `lhdnReceivedLongId`, `lhdnReceivedStatus`, `lhdnReceivedAt`, `einvoiceEmailRef`, `einvoiceManualUploadPath`, `einvoiceRequestedAt`, `einvoiceReceivedAt`, `einvoiceAgentError` — all optional per data-model.md
- [X] T006 Add new indexes to `expense_claims` in `convex/schema.ts`: `by_businessId_einvoiceRequestStatus` and `by_einvoiceEmailRef`
- [X] T007 Create `einvoice_received_documents` table in `convex/schema.ts` with all fields and indexes per data-model.md: `by_businessId_status`, `by_lhdnDocumentUuid`, `by_matchedExpenseClaimId`, `by_businessId_processedAt`
- [X] T008 Create `einvoice_request_logs` table in `convex/schema.ts` with all fields and indexes per data-model.md: `by_expenseClaimId`, `by_businessId_status`
- [X] T009 Deploy schema changes to Convex: `npx convex deploy --yes`
- [X] T010 Create `expenseClaims.updateEinvoiceStatus` internal mutation in `convex/functions/expenseClaims.ts` — validates state transitions per data-model.md state diagram, updates e-invoice fields on expense claim
- [X] T011 [P] Create `expenseClaims.getEinvoiceStatus` query in `convex/functions/expenseClaims.ts` — returns all e-invoice fields + pending match candidates per api-contracts.md
- [X] T012 [P] Create `convex/functions/einvoiceReceivedDocuments.ts` with `upsert` internal mutation (deduplication by `lhdnDocumentUuid` + `businessId`) and `listUnmatched` query per api-contracts.md
- [X] T013 Deploy Convex functions: `npx convex deploy --yes`

**Checkpoint**: Schema deployed with new tables and indexes. Core mutations/queries available for all user stories.

---

## Phase 3: User Story 1 — QR Code Detection from Receipt (Priority: P1) MVP

**Goal**: Detect merchant buyer-info QR codes from uploaded receipt images and store the URL on the expense claim

**Independent Test**: Upload receipt images with/without QR codes. Verify `merchantFormUrl` is populated on the expense claim when a merchant form QR is detected. Verify LHDN validation QR codes (`myinvois.hasil.gov.my`) are excluded.

### Implementation for User Story 1

- [X] T014 [US1] Create `src/lambda/document-processor-python/steps/detect_qr.py` — QR detection step using pyzbar + Pillow: decode QR codes from image, extract URLs, filter out LHDN validation QRs (`myinvois.hasil.gov.my`), return list of detected merchant form URLs
- [X] T015 [US1] Modify `src/lambda/document-processor-python/handler.py` — add `detect_qr_step()` call after `convert_pdf_step()`, parallel to `extract_receipt_step()`. Store results in `processing_metadata.detected_qr_codes`. Set first non-LHDN URL as `merchantFormUrl`.
- [X] T016 [US1] Modify the Convex update step in the Python Lambda (where it writes results back to Convex) to include `merchantFormUrl` field when a merchant form URL is detected
- [X] T017 [US1] Modify `infra/lib/document-processing-stack.ts` — add `libzbar0` to the Docker image build for the document processor Lambda
- [ ] T018 [US1] Verify QR detection end-to-end: build Lambda Docker image, test with sample receipt images containing QR codes, verify `merchantFormUrl` appears on expense claim in Convex

**Checkpoint**: Receipt uploads now detect QR codes. Expense claims with merchant QR receipts have `merchantFormUrl` populated. Foundation for Story 2.

---

## Phase 4: User Story 2 — Request E-Invoice via AI Agent (Priority: P1)

**Goal**: Employee clicks "Request E-Invoice" on an expense claim. AI agent fills the merchant's buyer-info form with company details and a trackable system email.

**Independent Test**: Set `merchantFormUrl` on an expense claim manually. Trigger "Request E-Invoice" API. Verify Stagehand session is created, form is navigated and filled, request log is created, expense claim status transitions correctly.

**Depends on**: Phase 2 (schema), Phase 3 (merchantFormUrl populated — or can set manually for testing)

### Implementation for User Story 2

- [X] T019 [US2] Create email ref token generator utility — generates 6-character alphanumeric tokens, checks uniqueness via `by_einvoiceEmailRef` index. Place in `convex/functions/einvoiceJobs.ts` or a shared utility.
- [X] T020 [US2] Create `einvoiceJobs.executeFormFill` internal action in `convex/functions/einvoiceJobs.ts` — Stagehand REST API integration: create session → navigate to merchantFormUrl → act (fill company details + trackable email) → end session. Update request log and expense claim status on success/failure. Send notification via `ctx.scheduler.runAfter(0, internal.functions.notifications.create, ...)`.
- [X] T021 [US2] Create `src/app/api/v1/expense-claims/[id]/request-einvoice/route.ts` — POST handler per api-contracts.md: Clerk auth, validate ownership, validate merchantFormUrl exists, validate business settings (TIN, BRN, address), check no duplicate request (409), generate einvoiceEmailRef token, create `einvoice_request_logs` record (status: "pending"), update expense claim to "requesting", schedule `executeFormFill` action asynchronously, return 202 with requestId + emailRef
- [X] T022 [US2] Add business settings validation helper — read business TIN, BRN, company name, address from `businesses` table. Return validation errors if incomplete. Used by request-einvoice route.
- [X] T023 [US2] Add retry support — when `einvoiceRequestStatus` is "failed", allow re-triggering the request: clear `einvoiceAgentError`, transition back to "requesting", create new request log entry

**Checkpoint**: Employees can click "Request E-Invoice". AI agent fills merchant forms. Status transitions: none → requesting → requested (success) or failed. Retry available on failure.

---

## Phase 5: User Story 3 — Dual-Channel E-Invoice Retrieval and Matching (Priority: P1)

**Goal**: Automatically match received e-invoices to expense claims through both email inbox (fast, deterministic) and LHDN polling (authoritative compliance). Three-tier matching strategy.

**Independent Test**: (1) Simulate an email to the SES endpoint with `+{ref}` suffix — verify deterministic match. (2) Simulate LHDN received documents via sandbox — verify 3-tier matching pairs correctly. (3) Verify ambiguous matches are flagged for employee review.

**Depends on**: Phase 2 (schema + received documents table), Phase 4 (einvoiceEmailRef generation)

### 5A: LHDN Polling Channel

- [X] T024 [US3] Create 3-tier matching algorithm in `convex/functions/einvoiceJobs.ts` — accepts received document metadata + raw UBL fields, runs: Tier 1 (parse buyer email `+` suffix → lookup by `einvoiceEmailRef`), Tier 2 (supplierTin + total + dateTimeIssued ±1 day → single match), Tier 3 (supplierName fuzzy + total + date → flag for review). Returns match result with tier and confidence.
- [X] T025 [US3] Create `einvoiceJobs.pollReceivedDocuments` internal action in `convex/functions/einvoiceJobs.ts` — for each active business with LHDN config: authenticate with LHDN (reuse Flow 1 token caching), fetch `GET /documents/recent?InvoiceDirection=Received`, for each new document (not in `einvoice_received_documents`): fetch raw UBL via `GET /documents/{uuid}/raw`, extract buyer email + supplier details, run matching algorithm, upsert to `einvoice_received_documents`, if matched: update expense claim via `updateEinvoiceStatus`, send notification. If ambiguous: store `matchCandidateClaimIds`, notify employee for review.
- [X] T026 [US3] Add LHDN polling cron to `convex/crons.ts` — schedule `einvoiceJobs.pollReceivedDocuments` every 15 minutes
- [X] T027 [US3] Deploy cron changes to Convex: `npx convex deploy --yes`

### 5B: Email Receiving Channel

- [ ] T028 [P] [US3] Create `infra/lib/email-receiving-stack.ts` — CDK stack: SES receiving rule for `einvoice@hellogroot.com` (or subdomain `einv.hellogroot.com`), S3 bucket for raw email storage, Lambda trigger function, IAM permissions. Lambda calls Convex action `einvoiceJobs.processIncomingEmail`.
- [X] T029 [US3] Create `einvoiceJobs.processIncomingEmail` internal action in `convex/functions/einvoiceJobs.ts` — download raw email from S3, parse MIME (extract `To:` header for `+` suffix, extract attachments), lookup expense claim by `einvoiceEmailRef`, store e-invoice attachment in Convex storage, update expense claim status to "received" (pending LHDN confirmation), send notification. Deduplication via email `Message-ID`.
- [ ] T030 [US3] Deploy email receiving infrastructure: `cd infra && npx cdk deploy --profile groot-finanseal --region us-east-1` (SES receiving only available in us-east-1)

### 5C: Match Resolution

- [X] T031 [US3] Create `src/app/api/v1/expense-claims/[id]/resolve-match/route.ts` — POST handler per api-contracts.md: Clerk auth, validate ownership, accept/reject action on a received document candidate. On accept: link received document to expense claim, update all e-invoice fields. On reject: remove candidate from `matchCandidateClaimIds`.
- [X] T032 [US3] Handle dual-channel merge — when LHDN polling finds a document already matched via email: upgrade the expense claim with LHDN references (UUID, longId, status) without creating a duplicate match. Update `einvoice_received_documents` record accordingly.
- [X] T033 [US3] Handle LHDN cancellation detection — during polling, if a previously matched document's status changes to "cancelled": update expense claim `lhdnReceivedStatus` to "cancelled", send notification to employee

**Checkpoint**: Both channels operational. Emails deterministically match. LHDN polling finds and matches received documents. Ambiguous matches flagged for employee review. Cancellations detected.

---

## Phase 6: User Story 4 — Manual E-Invoice Upload (Priority: P2)

**Goal**: Employees can manually upload e-invoice documents (PDF/image) to expense claims as a fallback

**Independent Test**: Upload a PDF or image file to an expense claim without a merchant QR code. Verify file is stored and expense claim shows "E-Invoice Attached (Manual)" status.

**Depends on**: Phase 2 (schema)

### Implementation for User Story 4

- [X] T034 [US4] Create `src/app/api/v1/expense-claims/[id]/upload-einvoice/route.ts` — POST handler per api-contracts.md: Clerk auth, validate ownership, accept multipart/form-data (PDF, PNG, JPG, max 10MB), upload to Convex file storage, update expense claim: `einvoiceSource = "manual_upload"`, `einvoiceManualUploadPath`, `einvoiceAttached = true`, `einvoiceRequestStatus = "received"`. Return 200 with storagePath. Error responses: 400 (invalid type/size), 409 (already attached), 404 (not found).

**Checkpoint**: Manual upload works independently. Employees without merchant QR codes can still attach e-invoices.

---

## Phase 7: User Story 5 — View E-Invoice Status on Expense Claims (Priority: P2)

**Goal**: Display e-invoice status badges in list view and full e-invoice details in claim detail page

**Independent Test**: View expense claims with various e-invoice statuses (none, requesting, requested, received, failed, manual). Verify correct badges in list and correct detail sections.

**Depends on**: Phase 2 (schema fields), best tested after Phases 3-6 populate real data

### Implementation for User Story 5

- [X] T035 [P] [US5] Create `src/domains/expense-claims/components/einvoice-status-badge.tsx` — badge component for list view. States: "No E-Invoice" (gray), "QR Detected" (blue), "Requesting" (yellow/animated), "Requested" (orange), "Received" (green), "Failed" (red), "Manual" (teal), "Cancelled" (red strikethrough). Use semantic design tokens per CLAUDE.md.
- [X] T036 [P] [US5] Create `src/domains/expense-claims/components/einvoice-section.tsx` — detail view section showing: e-invoice status, source (merchant_issued/manual_upload), timestamps (requested/received), LHDN document reference (UUID, longId), LHDN verification QR code (when longId available), agent error message (when failed), "Request E-Invoice" button (when merchantFormUrl exists and no e-invoice attached), "Upload E-Invoice" button (when no e-invoice attached), manual fallback URL link (when agent failed)
- [X] T037 [P] [US5] Create `src/domains/expense-claims/components/einvoice-match-review.tsx` — match review UI for Tier 3/ambiguous cases: display candidate received documents (supplier name, total, date, match tier, confidence), accept/reject actions calling resolve-match API route
- [X] T038 [US5] Modify `src/domains/expense-claims/components/submission-detail-page.tsx` — integrate `einvoice-section` component into the expense claim detail page. Add conditional rendering based on e-invoice fields. Wire up "Request E-Invoice" button to POST `/api/v1/expense-claims/[id]/request-einvoice`. Wire up "Upload E-Invoice" to upload-einvoice route. Show match review when `pendingMatchCandidates` exist.
- [X] T039 [US5] Modify `src/domains/expense-claims/components/personal-expense-dashboard.tsx` — add `einvoice-status-badge` to expense claim cards/list items. Display alongside existing status information.
- [X] T040 [US5] Generate LHDN verification QR code in `einvoice-section.tsx` — when `lhdnReceivedLongId` is available, render a QR code linking to `https://myinvois.hasil.gov.my/{longId}/share`

**Checkpoint**: E-invoice status visible at a glance in list view. Full details, actions, and match review available in detail view.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Notifications, edge cases, build verification, and deployment

- [X] T041 Add e-invoice notification types to `convex/functions/notifications.ts` — ensure "compliance" type supports: "E-Invoice Requested", "E-Invoice Request Failed", "E-Invoice Received", "E-Invoice Match Needs Review", "E-Invoice Cancelled". Use `sourceEvent` deduplication pattern per research.md R5.
- [X] T042 [P] Handle edge case: both channels deliver same e-invoice — in `pollReceivedDocuments`, when a document matches an expense claim already marked "received" via email: merge LHDN references (UUID, longId, status) onto the expense claim without creating duplicate notification
- [X] T043 [P] Handle edge case: malformed `+` suffix in email — in `processIncomingEmail`, when suffix parsing fails: attempt Tier 2/3 matching against all unmatched claims in the business, log email for review
- [X] T044 [P] Handle edge case: LHDN token refresh failure during polling — in `pollReceivedDocuments`, catch auth failures gracefully, skip business, log error for admin notification
- [X] T045 Run `npm run build` — fix any TypeScript/build errors until clean
- [X] T046 Run `npx convex deploy --yes` — final deployment of all Convex changes
- [X] T047 Deploy document-processor Lambda with QR detection: build Docker image, push to ECR, update Lambda
- [ ] T048 Deploy email-receiving infrastructure if not already deployed in T030

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T001-T003 for deps). BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Phase 2 (schema deployed). No dependency on other stories.
- **US2 (Phase 4)**: Depends on Phase 2 (schema). Logically follows US1 (merchantFormUrl) but can be tested independently by setting merchantFormUrl manually.
- **US3 (Phase 5)**: Depends on Phase 2 (schema + received documents table). Logically follows US2 (einvoiceEmailRef generation) but matching can be tested independently with simulated data.
- **US4 (Phase 6)**: Depends on Phase 2 (schema) only. Fully independent of US1-US3.
- **US5 (Phase 7)**: Depends on Phase 2 (schema fields). Best tested after US1-US4 populate real data, but UI can be built against schema fields independently.
- **Polish (Phase 8)**: Depends on all user stories being implemented.

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2. MVP candidate.
- **US2 (P1)**: Logically after US1 but independently testable. Shares schema from Phase 2.
- **US3 (P1)**: Most complex story. Two sub-channels (5A: LHDN, 5B: Email) can be built in parallel. 5C (match resolution) depends on 5A.
- **US4 (P2)**: Fully independent. Single task. Can be done any time after Phase 2.
- **US5 (P2)**: UI layer. Depends on API routes from US2/US3/US4 for button wiring, but component structure can be built independently.

### Within Each User Story

- Schema/models before services/actions
- Actions before API routes (API routes schedule actions)
- Core implementation before edge case handling
- Deploy after each phase with schema changes

### Parallel Opportunities

Within Phase 2 (after T009 deploy):
- T010, T011, T012 can all run in parallel (different files/functions)

Within Phase 3:
- T014 and T017 can run in parallel (Python step vs CDK change)

Within Phase 5:
- 5A (LHDN polling: T024-T027) and 5B (Email: T028-T030) can run in parallel
- T028 (CDK stack) can run in parallel with T024-T025 (matching logic)

Within Phase 7:
- T035, T036, T037 can all run in parallel (separate component files)

Cross-story parallelism:
- US4 (T034) can run in parallel with any other story after Phase 2
- US5 component creation (T035-T037) can run in parallel with US3 implementation

---

## Parallel Example: Phase 5 (User Story 3)

```bash
# Launch LHDN polling and email receiving in parallel:
# Thread A (LHDN):
Task: T024 "Create 3-tier matching algorithm in convex/functions/einvoiceJobs.ts"
Task: T025 "Create pollReceivedDocuments action in convex/functions/einvoiceJobs.ts"
Task: T026 "Add LHDN polling cron to convex/crons.ts"

# Thread B (Email — different files):
Task: T028 "Create infra/lib/email-receiving-stack.ts CDK stack"
Task: T029 "Create processIncomingEmail action in convex/functions/einvoiceJobs.ts"

# Note: T025 and T029 both write to einvoiceJobs.ts — schedule them sequentially
# or merge at the end. T024+T028 are fully parallel (different files).
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T013)
3. Complete Phase 3: User Story 1 — QR Detection (T014-T018)
4. **STOP and VALIDATE**: Upload receipt images, verify QR detection works, `merchantFormUrl` populated
5. This alone delivers value: employees see the merchant form URL detected automatically

### Core Flow (US1 + US2 + US3)

1. Phases 1-3 (MVP above)
2. Phase 4: US2 — AI Agent Form Fill (T019-T023)
3. Phase 5: US3 — Dual-Channel Matching (T024-T033)
4. **VALIDATE**: Full e-invoice lifecycle works end-to-end
5. This completes all P1 stories — the core automation

### Full Feature (All Stories)

1. Core Flow above
2. Phase 6: US4 — Manual Upload (T034) — quick, single task
3. Phase 7: US5 — UI Components (T035-T040) — visual layer
4. Phase 8: Polish (T041-T048) — edge cases, build, deploy
5. **VALIDATE**: All acceptance scenarios pass

### Incremental Delivery

1. Setup + Foundational → Schema ready
2. Add US1 (QR Detection) → Test → Deploy (MVP!)
3. Add US2 (AI Agent) → Test → Deploy (employees can request e-invoices)
4. Add US3 (Matching) → Test → Deploy (full automation loop)
5. Add US4 (Manual Upload) → Test → Deploy (fallback path)
6. Add US5 (UI Status) → Test → Deploy (visibility)
7. Polish → Final build + deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [US#] label maps task to specific user story
- Each user story is independently completable and testable after Phase 2
- No test tasks generated — spec uses manual testing strategy (LHDN sandbox, receipt samples, merchant forms)
- Convex deploy (`npx convex deploy --yes`) is required after schema changes (T009, T013, T027, T046)
- CDK deploy required for email receiving (T030) and Lambda Docker update (T047)
- All commits must use git author `grootdev-ai` per CLAUDE.md
- `npm run build` must pass before task completion per CLAUDE.md
