# Tasks: LHDN e-Invoice Submission Pipeline

**Input**: Design documents from `specs/001-lhdn-einvoice-submission/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md, quickstart.md

**Tests**: Not explicitly requested in the feature specification. Test tasks are omitted; testing is covered by sandbox validation in Phase 9.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify prerequisites and environment configuration

- [X] T001 Verify LHDN sandbox credentials (LHDN_CLIENT_ID, LHDN_CLIENT_SECRET, LHDN_API_URL, LHDN_ENVIRONMENT) are configured in .env.local and digital signature Lambda is deployed

---

## Phase 2: Foundational (Schema + Core Library + Core Convex)

**Purpose**: Schema changes, shared types, API client, and core Convex functions that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add all LHDN schema changes to convex/schema.ts — new tables (lhdn_tokens with by_businessId index, lhdn_submission_jobs with by_businessId_status and by_status indexes), new fields on expense_claims (lhdnSubmissionId, lhdnDocumentUuid, lhdnLongId, lhdnStatus, lhdnSubmittedAt, lhdnValidatedAt, lhdnValidationErrors, lhdnDocumentHash, selfBillRequired, receiptQrCodeDetected), invoices AP (same LHDN tracking fields), vendors (isLhdnExempt), customers (isLhdnExempt), businesses (autoSelfBillExemptVendors). Run npx convex deploy --yes
- [X] T003 [P] Create src/lib/lhdn/types.ts — LHDN API types: LhdnToken, LhdnDocument (UBL 2.1 JSON structure), LhdnSubmissionResponse, LhdnSubmissionStatus, LhdnDocumentStatus, LhdnValidationError, LhdnApiError class, LhdnStatus union type
- [X] T004 [P] Create src/lib/lhdn/constants.ts — Document type codes (01-04, 11), general public TIN (EI00000000000), general individual TIN, LHDN API paths (/connect/token, /api/v1.0/documentsubmissions/, etc.), rate limits, UBL namespace prefixes (_D, _A, _B)
- [X] T005 [P] Create src/lib/lhdn/decimal.ts — LHDN decimal formatting utility: at least 1 decimal place, no trailing zeros per GitHub #218 requirements
- [X] T006 Create src/lib/lhdn/client.ts — LHDN MyInvois API client with methods: authenticate(tenantTin) with onbehalfof header and intermediary credentials, submitDocuments(documents[]), getSubmissionStatus(submissionUid), cancelDocument(documentUuid, reason), validateTin(tin). Uses LhdnApiError for error handling. Depends on T003, T004
- [X] T007 [P] Create convex/functions/lhdnTokens.ts — token cache: getOrRefresh mutation that checks cached token expiry, fetches new token via LHDN client if expired, stores in lhdn_tokens table. Depends on T002
- [X] T008 Create convex/functions/lhdnJobs.ts — submission job tracking: createJob mutation, updateJobStatus mutation, pollForResults scheduled function (5s intervals for first 2 min, then 30s up to 30 min, retry at 1-hour intervals up to 3 retries, mark failed after exhaustion). Depends on T002, T003
- [X] T009 Run npx convex deploy --yes and npm run build to validate foundational phase

**Checkpoint**: Foundation ready — schema deployed, LHDN library and core Convex functions available. User story implementation can now begin.

---

## Phase 3: User Story 1 — Submit Sales Invoice to LHDN (Priority: P1) MVP

**Goal**: A business owner or finance admin can submit a finalized sales invoice to LHDN, have it digitally signed and validated, with real-time status updates.

**Independent Test**: Create a sales invoice, send it, then submit to LHDN sandbox. Verify status transitions through pending → submitted → valid/invalid. Delivers immediate compliance value.

### Implementation for User Story 1

- [X] T010 [US1] Create src/lib/lhdn/invoice-mapper.ts — map FinanSEAL sales invoice data to UBL 2.1 JSON with namespace prefixes (_D, _A, _B): supplier party (from business), buyer party (from customer, with general public TIN fallback for missing TIN), invoice lines with tax breakdown, monetary totals using decimal.ts formatting. Support document types 01-04
- [X] T011 [US1] Add LHDN mutations to convex/functions/salesInvoices.ts — initiateLhdnSubmission (validate readiness: sent status, LHDN config complete, handle missing buyer TIN with useGeneralBuyerTin flag; set lhdnStatus to "pending"; create lhdn_submission_jobs record; record e-invoice usage), updateLhdnStatus (update from polling results: documentUuid, longId, validatedAt, validationErrors, documentHash)
- [X] T012 [US1] Create src/app/api/v1/sales-invoices/[invoiceId]/lhdn/submit/route.ts — POST handler: auth check (requireFinanceAdmin), validate business LHDN config, call initiateLhdnSubmission mutation, invoke digital signature Lambda, call LHDN client.submitDocuments, update job status, schedule polling via lhdnJobs. Return jobId and lhdnStatus
- [X] T013 [US1] Wire up existing LHDN submit button in src/domains/sales-invoices/components/lhdn-submit-button.tsx — replace placeholder with real submission call to POST /api/v1/sales-invoices/[id]/lhdn/submit, handle missing TIN confirmation dialog (useGeneralBuyerTin), handle missing LHDN config redirect, show loading/pending state
- [X] T014 [US1] Run npx convex deploy --yes and npm run build to validate US1

**Checkpoint**: Sales invoice submission to LHDN is fully functional. A user can submit an invoice and see it validated with status updates.

---

## Phase 4: User Story 2 — View LHDN Verification QR Code (Priority: P1)

**Goal**: After LHDN validates an e-invoice, display the official verification QR code that links to LHDN's public verification page.

**Independent Test**: View any invoice with LHDN status "valid" — the QR code should render and scan to LHDN's verification URL.

### Implementation for User Story 2

- [X] T015 [US2] Wire existing LHDN QR code component in src/domains/sales-invoices/components/ to generate QR from real lhdnLongId — encode URL format https://myinvois.hasil.gov.my/{longId}/share, conditionally display only when lhdnStatus is "valid" and longId is present, show submission status badge for other states
- [X] T016 [US2] Run npm run build to validate US2

**Checkpoint**: Validated e-invoices display scannable QR codes linking to LHDN verification.

---

## Phase 5: User Story 3 — Cancel a Validated E-Invoice (Priority: P2)

**Goal**: Allow cancellation of validated e-invoices within 72 hours of validation, with a required cancellation reason.

**Independent Test**: Submit an invoice, wait for validation, then cancel within 72 hours. Verify LHDN status updates to "cancelled". Verify cancellation is blocked after 72 hours.

### Implementation for User Story 3

- [X] T017 [US3] Add cancelLhdnSubmission mutation to convex/functions/salesInvoices.ts — validate 72-hour window (compare lhdnValidatedAt + 72h against current time), require reason string, update lhdnStatus to "cancelled"
- [X] T018 [US3] Create src/app/api/v1/sales-invoices/[invoiceId]/lhdn/cancel/route.ts — PUT handler: auth check (requireFinanceAdmin), call cancelLhdnSubmission mutation, call LHDN client.cancelDocument(documentUuid, reason). Return CANCELLATION_WINDOW_EXPIRED error with timestamps if 72h exceeded
- [X] T019 [US3] Add cancel button UI on sales invoice detail — show "Cancel E-Invoice" button only when lhdnStatus is "valid" and within 72-hour window, prompt for cancellation reason, display time remaining in cancellation window, hide button and show expiry note after 72 hours
- [X] T020 [US3] Run npx convex deploy --yes and npm run build to validate US3

**Checkpoint**: E-invoice cancellation works within the 72-hour window. Expired cancellations are blocked with clear messaging.

---

## Phase 6: User Story 4 — Self-Billed E-Invoice for Exempt Vendors (Priority: P2)

**Goal**: Generate and submit self-billed e-invoices (type 11) from approved expense claims and AP/vendor invoices when the vendor is exempt from e-invoicing.

**Independent Test**: (a) Approve an expense claim with no QR code, confirm self-billing prompt, verify self-billed e-invoice submitted. (b) Mark vendor as exempt, create AP invoice, verify self-billing prompt. Both should produce validated self-billed e-invoices linked back to source records.

### Implementation for User Story 4

- [X] T021 [P] [US4] Create src/lib/lhdn/self-bill-mapper.ts — map expense claim or AP invoice data to self-billed UBL 2.1 JSON (document type 11): swap buyer/seller (company is buyer, vendor is seller), use general individual TIN for vendors with minimal info, include line items and tax breakdown from expense claim items or AP invoice lines
- [X] T022 [US4] Add initiateSelfBill mutation to convex/functions/expenseClaims.ts — validate claim is approved, set lhdnStatus to "pending", create lhdn_submission_jobs record with sourceType "expense_claim" and documentType "11"
- [X] T023 [US4] Add initiateSelfBill mutation to convex/functions/invoices.ts — validate AP invoice status, set lhdnStatus to "pending", create lhdn_submission_jobs record with sourceType "invoice" and documentType "11"
- [X] T024 [P] [US4] Create src/app/api/v1/expense-claims/[claimId]/lhdn/self-bill/route.ts — POST handler: auth check, call expenseClaims.initiateSelfBill, invoke digital signature Lambda with self-bill-mapper output, call LHDN client.submitDocuments, schedule polling
- [X] T025 [P] [US4] Create src/app/api/v1/invoices/[invoiceId]/lhdn/self-bill/route.ts — POST handler: auth check, call invoices.initiateSelfBill, invoke digital signature Lambda with self-bill-mapper output, call LHDN client.submitDocuments, schedule polling
- [X] T026 [US4] Create src/domains/expense-claims/components/self-bill-prompt.tsx — show "Self-billing may be required" prompt when selfBillRequired is true or receiptQrCodeDetected is false, offer "Generate Self-Billed E-Invoice" action, allow manual initiation on any approved claim, display LHDN status after submission
- [X] T027 [P] [US4] Add vendor exempt flag (isLhdnExempt) toggle to vendor detail/edit UI — persist across all future transactions, show on vendor list as indicator
- [X] T028 [P] [US4] Add auto-trigger self-bill per-business setting to src/domains/account-management/components/business-profile-settings.tsx — toggle for autoSelfBillExemptVendors (default: off/manual confirmation)
- [X] T029 [US4] Run npx convex deploy --yes and npm run build to validate US4

**Checkpoint**: Self-billing works for both expense claims and AP invoices. Exempt vendor detection (QR + flag) and auto-trigger setting are functional.

---

## Phase 7: User Story 5 — Notifications on E-Invoice Status Changes (Priority: P3)

**Goal**: Notify business owners/finance admins when e-invoice submissions are validated, rejected, or when buyers reject received e-invoices.

**Independent Test**: Submit an invoice, verify notification delivered when LHDN returns validation result (success or failure).

### Implementation for User Story 5

- [X] T030 [US5] Add LHDN notification types to convex/functions/notifications.ts — new types: lhdn_validated (e-invoice accepted), lhdn_rejected (e-invoice rejected with errors), lhdn_buyer_rejection (buyer rejected within 72h), lhdn_failed (submission failed after retries). Include direct link to affected invoice/expense claim
- [X] T031 [US5] Integrate notification creation in convex/functions/lhdnJobs.ts pollForResults — on poll completion (valid/invalid/failed), create notification for business owner and finance admin users via notifications module
- [X] T032 [US5] Run npx convex deploy --yes and npm run build to validate US5

**Checkpoint**: Users receive notifications on all LHDN status changes with direct links to affected records.

---

## Phase 8: User Story 6 — Batch Submit Multiple Invoices (Priority: P3)

**Goal**: Submit multiple sales invoices to LHDN in a single batch operation (up to 100 per batch).

**Independent Test**: Select 5+ invoices from the list, batch submit, verify each invoice's status updates independently based on its validation result.

### Implementation for User Story 6

- [X] T033 [US6] Create src/app/api/v1/sales-invoices/batch/lhdn/submit/route.ts — POST handler: auth check, validate all invoiceIds, call initiateLhdnSubmission for each, invoke digital signature Lambda for each document, batch call LHDN client.submitDocuments (respect 100 doc limit, 5MB total), return accepted/rejected arrays per invoice, schedule polling for batch submissionUid
- [X] T034 [US6] Add batch submit selection and action to sales invoice list UI — multi-select checkboxes on invoice list, "Submit Selected to LHDN" action button, show progress/results summary with per-invoice status
- [X] T035 [US6] Run npm run build to validate US6

**Checkpoint**: Batch submission works for up to 100 invoices with individual status tracking.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, validation, and final deployment

- [X] T036 [P] Verify LHDN rate limit compliance across all API calls — token endpoint (12 RPM), submit (100 RPM), poll (300 RPM), cancel (12 RPM)
- [X] T037 [P] Review error handling across all LHDN mappers, API routes, and Convex functions — ensure LhdnApiError is used consistently, validation errors stored as [{code, message, target}] format
- [X] T038 Final npm run build and npx convex deploy --yes — full end-to-end validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — MVP delivery target
- **US2 (Phase 4)**: Depends on US1 (needs longId data from validated invoices)
- **US3 (Phase 5)**: Depends on Foundational only — can run in parallel with US1 (but logically follows US1 for testing)
- **US4 (Phase 6)**: Depends on Foundational only — can run in parallel with US1
- **US5 (Phase 7)**: Depends on Foundational (lhdnJobs.ts) — can start after Phase 2
- **US6 (Phase 8)**: Depends on US1 (reuses invoice-mapper + submit mutations)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **US2 (P1)**: Depends on US1 for validated invoice data (longId)
- **US3 (P2)**: Can start after Foundational — independently testable, but needs US1 for end-to-end flow
- **US4 (P2)**: Can start after Foundational — independent of US1/US2/US3
- **US5 (P3)**: Can start after Foundational — integrates with lhdnJobs.ts polling completion
- **US6 (P3)**: Depends on US1 (reuses invoice-mapper.ts and salesInvoices mutations)

### Within Each User Story

- Library modules (mappers) before Convex mutations
- Convex mutations before API routes
- API routes before UI components
- Deploy Convex after mutations are added
- Build check at each checkpoint

### Parallel Opportunities

- **Phase 2**: T003 + T004 + T005 can all run in parallel (independent library files)
- **Phase 2**: T007 can run in parallel with T008 (different Convex files, both depend on T002)
- **Phase 3+6**: T010 (invoice-mapper) and T021 (self-bill-mapper) can run in parallel (different files)
- **Phase 6**: T024 + T025 can run in parallel (different API route directories)
- **Phase 6**: T027 + T028 can run in parallel (different UI files)
- **Phase 9**: T036 + T037 can run in parallel (different concerns)
- **Cross-story**: After Foundational, US1 and US4 can proceed in parallel (different source types)

---

## Parallel Example: Foundational Phase

```bash
# Launch all library type files together (no dependencies between them):
Task: "Create LHDN types in src/lib/lhdn/types.ts"
Task: "Create LHDN constants in src/lib/lhdn/constants.ts"
Task: "Create decimal formatting in src/lib/lhdn/decimal.ts"

# After types/constants complete, launch client + Convex in parallel:
Task: "Create LHDN API client in src/lib/lhdn/client.ts"
Task: "Create lhdnTokens in convex/functions/lhdnTokens.ts"
```

## Parallel Example: User Story 4 (Self-Billing)

```bash
# Self-bill mapper can run in parallel with US1 invoice-mapper:
Task: "Create self-bill-mapper.ts in src/lib/lhdn/self-bill-mapper.ts"

# After mutations complete, both API routes in parallel:
Task: "Create expense-claims self-bill route"
Task: "Create invoices self-bill route"

# UI components in parallel (different files):
Task: "Add vendor exempt flag toggle"
Task: "Add auto-trigger business setting"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — Submit Sales Invoice
4. Complete Phase 4: US2 — QR Code Display
5. **STOP and VALIDATE**: Test against LHDN sandbox — submit a real invoice, verify validation, check QR code
6. Deploy if ready — businesses can now submit e-invoices to LHDN

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 (Submit) + US2 (QR Code) → Test independently → Deploy (MVP!)
3. Add US3 (Cancel) → Test 72-hour window → Deploy
4. Add US4 (Self-Bill) → Test expense + AP flows → Deploy
5. Add US5 (Notifications) → Verify notification delivery → Deploy
6. Add US6 (Batch Submit) → Test with 5+ invoices → Deploy
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Submit) → US2 (QR) → US6 (Batch)
   - Developer B: US4 (Self-Bill) → US3 (Cancel)
   - Developer C: US5 (Notifications) → Polish
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable against LHDN sandbox
- Convex deploy (npx convex deploy --yes) is MANDATORY after any schema/function changes
- Build check (npm run build) is MANDATORY at each phase checkpoint
- Reference existing Peppol flow (src/lib/peppol/) for client/mapper/types patterns
- Auth: requireFinanceAdmin(ctx, businessId) on all mutations and API routes
- Error handling: Use custom LhdnApiError class, store errors as [{code, message, target}]
