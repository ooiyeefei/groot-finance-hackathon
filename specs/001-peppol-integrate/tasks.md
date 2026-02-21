# Tasks: Singapore InvoiceNow (Peppol) Full Integration

**Input**: Design documents from `/specs/001-peppol-integrate/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks excluded. Manual testing via Storecove sandbox.

**Organization**: Tasks grouped by user story. US1+US2 merged (document generation is part of the transmission pipeline). US3 (status badges) already functional — verification only.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Schema changes, environment configuration, Storecove type definitions

- [X] T001 Add `originalInvoiceId` and `creditNoteReason` fields to `sales_invoices` table in `convex/schema.ts` — add `originalInvoiceId: v.optional(v.id("sales_invoices"))`, `creditNoteReason: v.optional(v.string())`, and index `by_originalInvoiceId` on `["originalInvoiceId"]`
- [X] T002 Deploy Convex schema changes — run `npx convex deploy --yes` to push new fields and index to production
- [X] T003 [P] Add Storecove environment variables to `.env.local` — `STORECOVE_API_KEY`, `STORECOVE_LEGAL_ENTITY_ID`, `STORECOVE_API_URL`, `STORECOVE_WEBHOOK_SECRET` (see `specs/001-peppol-integrate/quickstart.md` for values)
- [X] T004 [P] Create Storecove TypeScript types in `src/lib/peppol/types.ts` — define `StorecoveConfig`, `StorecoveDocumentSubmission`, `StorecoveSubmissionResponse`, `StorecoveParty`, `StorecoveInvoiceLine`, `StorecoveWebhookEvent`, error types per `specs/001-peppol-integrate/contracts/storecove-client.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Storecove client library and data mappers — ALL user stories depend on these

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement Storecove API client in `src/lib/peppol/storecove-client.ts` — `submitDocument()`, `discoverReceiver()`, `getEvidence()` methods with Bearer token auth, error handling (422 → `StorecoveValidationError`, 401/403 → `StorecoveAuthError`, 5xx → `StorecoveServerError`) per `specs/001-peppol-integrate/contracts/storecove-client.md`
- [X] T006 [P] Implement invoice-to-Storecove data mapper in `src/lib/peppol/invoice-mapper.ts` — `mapInvoiceToStorecove(invoice, business, customer)` function that maps SalesInvoice fields to Storecove JSON format, splits `peppolParticipantId` ("0195:T08GA1234A") into scheme + identifier for routing, maps `einvoiceType` to Storecove `documentType`, maps tax rates to UNCL 5305 codes (S/Z/E/O), includes `billingReference` for credit notes, per `specs/001-peppol-integrate/data-model.md` mapping tables
- [X] T007 [P] Implement Storecove error mapper in `src/lib/peppol/invoice-mapper.ts` — `mapStorecoveErrorsToPeppolErrors()` function that converts Storecove's `{ source, details }` format to FinanSEAL's `{ code, message }` format
- [X] T008 [P] Implement webhook event parser in `src/lib/peppol/webhook-parser.ts` — `parseWebhookEvent(rawBody)` function that parses Storecove webhook payload (stringified JSON in `body` field), extracts `submissionGuid`, `eventType`, `timestamp`, and optional `errors` per `specs/001-peppol-integrate/contracts/storecove-client.md`
- [X] T009 [P] Add tax category mapping constants in `src/lib/peppol/invoice-mapper.ts` — Singapore GST mappings: 9% → S (Standard), 0% → Z (Zero-rated), exempt → E, out-of-scope → O per `specs/001-peppol-integrate/research.md` Decision 5

**Checkpoint**: Storecove integration library ready — user story implementation can begin

---

## Phase 3: User Story 1+2 — Transmit Invoice via InvoiceNow + Document Generation (Priority: P1) 🎯 MVP

**Goal**: End-to-end Peppol transmission — user clicks "Send via InvoiceNow", invoice is mapped to Storecove JSON, submitted to Peppol network, and status tracked through the lifecycle

**Independent Test**: Open a sent invoice for a Peppol-enabled customer, click "Send via InvoiceNow", confirm in dialog, verify status transitions to "pending". Verify in Storecove sandbox that the document was received.

### Implementation

- [X] T010 [US1] Implement `initiatePeppolTransmission` mutation body in `convex/functions/salesInvoices.ts` — replace existing stub with full validation: check finance admin role, verify invoice status is "sent"/"paid"/"overdue", verify no existing peppolStatus, verify business and customer have peppolParticipantId, then atomically patch invoice with `peppolStatus: "pending"` and `peppolTransmittedAt: Date.now()`
- [X] T011 [US1] Implement `retryPeppolTransmission` mutation body in `convex/functions/salesInvoices.ts` — replace existing stub with validation: check peppolStatus is "failed", then atomically patch to reset `peppolStatus: "pending"`, `peppolErrors: undefined`, `peppolTransmittedAt: Date.now()`
- [X] T012 [US1] Add `updatePeppolStatus` internal mutation in `convex/functions/salesInvoices.ts` — accepts `{ invoiceId, peppolStatus, peppolTransmittedAt?, peppolDeliveredAt?, peppolErrors?, peppolDocumentId? }`, enforces one-directional status transitions (pending → transmitted → delivered/failed), ignores stale events
- [X] T013 [US1] Create transmit API route at `src/app/api/v1/sales-invoices/[invoiceId]/peppol/transmit/route.ts` — POST handler that: authenticates via Clerk, loads invoice + business + customer from Convex, checks e-invoice usage limit, calls `mapInvoiceToStorecove()`, calls `storecoveClient.submitDocument()`, updates invoice via Convex mutation with `peppolDocumentId` (Storecove GUID) and `peppolStatus: "pending"`, increments e-invoice usage counter, returns `{ success: true, data: { peppolDocumentId, status } }` per `specs/001-peppol-integrate/contracts/api-contracts.md` section 1
- [X] T014 [US1] Create retry API route at `src/app/api/v1/sales-invoices/[invoiceId]/peppol/retry/route.ts` — POST handler with same flow as transmit but additionally validates `peppolStatus === "failed"` before re-executing per `specs/001-peppol-integrate/contracts/api-contracts.md` section 2
- [X] T015 [US1] Create webhook handler at `src/app/api/v1/peppol/webhook/route.ts` — POST handler that: verifies `X-Storecove-Secret` header, calls `parseWebhookEvent()`, finds invoice by `peppolDocumentId`, calls `updatePeppolStatus` internal mutation, returns 200 per `specs/001-peppol-integrate/contracts/api-contracts.md` section 3
- [X] T016 [US1] Wire transmission panel in `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — remove "Coming Soon" badge and disabled state, wire `onTransmit` callback to call `POST /api/v1/sales-invoices/[invoiceId]/peppol/transmit`, wire `onRetry` callback to call retry endpoint, show loading states during API calls
- [X] T017 [US1] Update invoice detail page in `src/app/[locale]/sales-invoices/[id]/page.tsx` — ensure `onTransmit` and `onRetry` handlers call the new API routes instead of stubs, pass real `businessHasPeppolId` and `customerHasPeppolId` props from loaded data
- [X] T018 [US1] Add pre-submission validation in transmit API route (`src/app/api/v1/sales-invoices/[invoiceId]/peppol/transmit/route.ts`) — before calling Storecove, validate invoice has all required Peppol fields (line items with tax, customer address, amounts), return 400 with specific `validationErrors` array if incomplete per FR-002

**Checkpoint**: Core Peppol transmission works end-to-end. Invoice can be sent via InvoiceNow, status tracks through pending → transmitted → delivered.

---

## Phase 4: User Story 3 — Peppol Status Visibility Across Invoices (Priority: P1)

**Goal**: Color-coded Peppol status badges visible in the invoices list for all Peppol-active invoices

**Independent Test**: View invoices list with mix of Peppol and non-Peppol invoices. Verify correct badge colors and mobile layout.

### Implementation

- [X] T019 [US3] Verify Peppol status badge rendering in `src/domains/sales-invoices/components/peppol-status-badge.tsx` — component already exists with correct color mapping (gray/blue/green/red). Confirm it renders correctly for all four statuses and hides when peppolStatus is undefined. No changes expected unless bugs found.
- [X] T020 [US3] Verify invoice list integration in `src/domains/sales-invoices/components/sales-invoice-list.tsx` — confirm PeppolStatusBadge is correctly imported and rendered for each invoice row, verify it appears in both desktop table view and mobile card layout per FR-015 and FR-019

**Checkpoint**: Status badges visible across invoice list. Already functional from prior work — this phase is verification.

---

## Phase 5: User Story 4 — Transmission Error Handling & Retry (Priority: P2)

**Goal**: Failed transmissions show error details and offer retry action

**Independent Test**: View an invoice with `peppolStatus: "failed"` and `peppolErrors` populated. Verify error panel renders with codes/messages. Click "Retry" and verify status resets to "pending".

### Implementation

- [X] T021 [US4] Wire error panel in `src/domains/sales-invoices/components/peppol-error-panel.tsx` — ensure `onRetry` callback triggers API call to `POST /api/v1/sales-invoices/[invoiceId]/peppol/retry`, show loading state on retry button, handle success (status resets to "pending") and failure (show error toast)
- [X] T022 [US4] Handle synchronous Storecove validation errors in transmit API route (`src/app/api/v1/sales-invoices/[invoiceId]/peppol/transmit/route.ts`) — when Storecove returns HTTP 422, catch `StorecoveValidationError`, map errors via `mapStorecoveErrorsToPeppolErrors()`, save to invoice `peppolErrors` field, set `peppolStatus: "failed"`, return 502 with error details per contract
- [X] T023 [US4] Add generic fallback error message in `src/domains/sales-invoices/components/peppol-error-panel.tsx` — when `peppolErrors` is empty/undefined but status is "failed", display "Transmission failed — an unexpected error occurred" with retry option per acceptance scenario 3

**Checkpoint**: Error handling complete. Failed transmissions show details and can be retried.

---

## Phase 6: User Story 5 — Delivery Confirmation Display (Priority: P2)

**Goal**: Delivered invoices show confirmation panel with delivery timestamp

**Independent Test**: View an invoice with `peppolStatus: "delivered"` and `peppolDeliveredAt` populated. Verify delivery confirmation panel renders with formatted timestamp.

### Implementation

- [X] T024 [US5] Verify delivery confirmation in `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — confirm the delivered state renders a green success panel with formatted `peppolDeliveredAt` timestamp using `formatBusinessDate()`. Component already has this logic in the shell — verify it works with real data from webhook status updates.

**Checkpoint**: Delivery confirmation displays correctly. Mostly verification of existing shell.

---

## Phase 7: User Story 6 — Create and Transmit Credit Notes (Priority: P2)

**Goal**: Users can create credit notes against sent/paid invoices and transmit them via Peppol

**Independent Test**: Select a sent invoice, create a credit note for a partial amount, verify it appears in the list with its own Peppol transmission capability. Transmit the credit note and verify Storecove receives it as `documentType: "creditnote"`.

### Implementation

- [X] T025 [US6] Implement `createCreditNote` mutation in `convex/functions/salesInvoices.ts` — accepts `{ originalInvoiceId, businessId, lineItems, creditNoteReason, notes? }`, validates: finance admin role, original invoice exists with status "sent"/"paid"/"overdue" (not draft/void), total credited amount doesn't exceed original total, generates credit note number "CN-{originalInvoiceNumber}-{seq}", creates new sales_invoices record with `einvoiceType: "credit_note"`, `originalInvoiceId`, `creditNoteReason`, copies customerSnapshot, sets status to "draft" per `specs/001-peppol-integrate/contracts/api-contracts.md` section 5
- [X] T026 [US6] Implement `getCreditNotesForInvoice` query in `convex/functions/salesInvoices.ts` — query sales_invoices by `originalInvoiceId` index, return array of `{ _id, invoiceNumber, totalAmount, status, peppolStatus, creditNoteReason, _creationTime }` per contract section 6
- [X] T027 [US6] Implement `getNetOutstandingAmount` query in `convex/functions/salesInvoices.ts` — sum all credit note `totalAmount` values for the original invoice, return `{ originalAmount, totalCredited, netOutstanding }` per contract section 6
- [X] T028 [US6] Add credit note hooks in `src/domains/sales-invoices/hooks/use-sales-invoices.ts` — add `useCreateCreditNote`, `useCreditNotesForInvoice`, `useNetOutstandingAmount` hooks wrapping the new Convex mutations/queries
- [X] T029 [P] [US6] Create credit note form component in `src/domains/sales-invoices/components/credit-note-form.tsx` — form pre-populated with original invoice line items and amounts, allows adjusting amounts per line, requires credit note reason field, validates total doesn't exceed original invoice amount, calls `createCreditNote` mutation on submit, uses existing form patterns from invoice generation
- [X] T030 [P] [US6] Create credit note list component in `src/domains/sales-invoices/components/credit-note-list.tsx` — displays linked credit notes for an invoice using `getCreditNotesForInvoice` query, shows each credit note's number, amount, status, peppolStatus badge, and creation date, shows net outstanding amount from `getNetOutstandingAmount`
- [X] T031 [US6] Add credit note section to invoice detail page in `src/app/[locale]/sales-invoices/[id]/page.tsx` — add "Create Credit Note" button (visible for sent/paid invoices, finance admin only, hidden for drafts/voided), render `CreditNoteList` component showing linked credit notes and net outstanding amount, open `CreditNoteForm` in dialog/modal when button clicked
- [X] T032 [US6] Update invoice mapper for credit notes in `src/lib/peppol/invoice-mapper.ts` — when `einvoiceType === "credit_note"`, set `documentType: "creditnote"` and include `billingReference` with original invoice number in the Storecove JSON payload per data-model mapping table
- [X] T033 [US6] Deploy Convex changes — run `npx convex deploy --yes` after adding credit note mutations and queries

**Checkpoint**: Credit notes can be created, displayed, and transmitted via Peppol as Credit Note documents.

---

## Phase 8: User Story 7 — Peppol Status Timeline (Priority: P3)

**Goal**: Visual timeline on invoice/credit note detail page showing Peppol lifecycle stages with timestamps

**Independent Test**: View invoices at each Peppol lifecycle stage (pending, transmitted, delivered, failed). Verify timeline highlights correct steps with accurate timestamps.

### Implementation

- [X] T034 [US7] Verify and enhance Peppol status timeline in `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — the component shell already renders a StatusTimeline with steps (Created → Transmitted → Delivered/Failed). Verify timestamps display correctly using `formatBusinessDate()` for `peppolTransmittedAt` and `peppolDeliveredAt`. Ensure failed state shows "Failed" step in red instead of "Delivered". Ensure mobile-responsive layout.

**Checkpoint**: Timeline renders correctly at each lifecycle stage. Mostly verification of existing shell.

---

## Phase 9: User Story 8 — Business Peppol Registration Setup (Priority: P3)

**Goal**: Business admin can configure their Peppol participant ID in settings

**Independent Test**: Navigate to business settings, enter a Peppol participant ID, save. Navigate to a sent invoice for a Peppol-enabled customer. Verify "Send via InvoiceNow" button appears.

### Implementation

- [X] T035 [US8] Verify Peppol participant ID field in `src/domains/account-management/components/business-profile-settings.tsx` — field already exists with state variable `peppolParticipantId`. Verify: field saves correctly to Convex `businesses.peppolParticipantId`, auto-expand of e-Invoice section when field has data, validation of format (scheme:identifier pattern)
- [X] T036 [P] [US8] Create Peppol discovery API route at `src/app/api/v1/peppol/discovery/route.ts` — GET handler that accepts `peppolId` query param, splits into scheme + identifier, calls `storecoveClient.discoverReceiver()`, returns `{ active: boolean, participantId }` per `specs/001-peppol-integrate/contracts/api-contracts.md` section 4

**Checkpoint**: Business setup complete. Peppol participant IDs can be configured and verified against the network.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Usage limits, edge cases, build verification, deployment

- [X] T037 Add grace buffer logic to e-invoice usage check in `convex/functions/einvoiceUsage.ts` — modify `checkAndRecord` to: when `submissionsUsed >= planLimit && planLimit !== -1`, allow up to 5 additional transmissions (grace buffer), when `submissionsUsed >= planLimit + 5`, return `{ allowed: false, reason: "USAGE_LIMIT_EXCEEDED" }` per FR-024 and FR-025
- [X] T038 [P] Add usage limit warning UI — when approaching limit (>= 90% used), show warning banner on invoice detail page near the "Send via InvoiceNow" button with upgrade prompt. When hard blocked (grace exhausted), disable the button with "Limit reached — upgrade your plan" message per FR-025
- [X] T039 [P] Add voided invoice guard in `src/domains/sales-invoices/components/peppol-transmission-panel.tsx` — when invoice status is "void", hide all Peppol action buttons (send/retry) but continue displaying status badges and timeline as historical record per edge case
- [X] T040 [P] Add concurrent transmission prevention in transmit API route (`src/app/api/v1/sales-invoices/[invoiceId]/peppol/transmit/route.ts`) — after Convex mutation sets peppolStatus to "pending", if Storecove submission fails, atomically reset status to "failed" with error; prevent double-submission if peppolStatus is already "pending" or "transmitted"
- [X] T041 [P] Add credit note amount validation in `convex/functions/salesInvoices.ts` `createCreditNote` — query existing credit notes for the original invoice, sum their totalAmount, verify new credit note amount + existing total doesn't exceed original invoice total per FR-004e
- [X] T042 Run `npm run build` — fix any TypeScript or build errors until build passes cleanly
- [X] T043 Run `npx convex deploy --yes` — final deployment of all Convex function changes to production
- [X] T044 Manual end-to-end testing in Storecove sandbox — test: transmit invoice, receive webhook, verify status transitions, test credit note transmission, test error/retry flow, verify usage counting

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T004 (types) from Setup — BLOCKS all user stories
- **US1+US2 (Phase 3)**: Depends on Phase 2 completion — this is the MVP
- **US3 (Phase 4)**: Can start after Phase 2 — independent verification, low effort
- **US4 (Phase 5)**: Depends on US1 (retry endpoint + webhook handler from Phase 3)
- **US5 (Phase 6)**: Depends on US1 (webhook handler delivers status)
- **US6 (Phase 7)**: Depends on Phase 2 only — credit notes are independent of invoice transmission
- **US7 (Phase 8)**: Depends on US1 (needs real Peppol data to verify timeline)
- **US8 (Phase 9)**: Depends on Phase 2 only — business setup is independent
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (Foundational) ──── BLOCKS ALL ────┐
    │                                       │
    ▼                                       ▼
Phase 3 (US1+US2) ◄── MVP          Phase 7 (US6) Credit Notes
    │                                Phase 9 (US8) Business Setup
    ├──► Phase 4 (US3) Badges
    ├──► Phase 5 (US4) Errors/Retry
    ├──► Phase 6 (US5) Delivery
    └──► Phase 8 (US7) Timeline
                │
                ▼
         Phase 10 (Polish)
```

### Parallel Opportunities

**Phase 2** — T005, T006, T007, T008, T009 can all run in parallel (different files)

**Phase 3** — After T010-T012 (mutations), T013+T014+T015 (API routes) can run in parallel, then T016+T017 (UI) in parallel

**Phase 7 (US6)** — T029+T030 (credit note components) can run in parallel, independent of Phase 3

**Phase 9+10** — T036, T037, T038, T039, T040, T041 can all run in parallel (different files)

---

## Parallel Example: Phase 2 (Foundational)

```text
# Launch all foundational tasks together (different files):
T005: Storecove API client → src/lib/peppol/storecove-client.ts
T006: Invoice mapper      → src/lib/peppol/invoice-mapper.ts
T007: Error mapper         → src/lib/peppol/invoice-mapper.ts (same file as T006, run sequentially)
T008: Webhook parser       → src/lib/peppol/webhook-parser.ts
T009: Tax category map     → src/lib/peppol/invoice-mapper.ts (same file as T006, run sequentially)
```

Parallel set: T005, T006+T007+T009 (same file), T008

## Parallel Example: Phase 3 (US1+US2 API Routes)

```text
# After mutations T010-T012 complete, launch API routes in parallel:
T013: Transmit route  → src/app/api/v1/sales-invoices/[invoiceId]/peppol/transmit/route.ts
T014: Retry route     → src/app/api/v1/sales-invoices/[invoiceId]/peppol/retry/route.ts
T015: Webhook handler → src/app/api/v1/peppol/webhook/route.ts
```

---

## Implementation Strategy

### MVP First (US1+US2 Only)

1. Complete Phase 1: Setup (schema + env vars + types)
2. Complete Phase 2: Foundational (Storecove client + mappers)
3. Complete Phase 3: US1+US2 (transmit pipeline + UI wiring)
4. **STOP and VALIDATE**: Test end-to-end in Storecove sandbox
5. Deploy if ready — invoices can now be sent via InvoiceNow

### Incremental Delivery

1. Setup + Foundational → Integration library ready
2. US1+US2 → **MVP: Invoice transmission works** → Deploy
3. US3 → Verify status badges (already functional) → Deploy
4. US4+US5 → Error handling + delivery confirmation → Deploy
5. US6 → Credit note creation + transmission → Deploy
6. US7+US8 → Timeline polish + business setup verification → Deploy
7. Polish → Usage limits, edge cases, build verification → Final deploy

### Recommended Execution Order (Single Developer)

T001 → T002 → T003+T004 (parallel) → T005+T006+T008 (parallel) → T007+T009 → T010 → T011+T012 (parallel) → T013+T014+T015 (parallel) → T016+T017 (parallel) → T018 → **MVP CHECKPOINT** → T019+T020 → T021+T022+T023 → T024 → T025+T026+T027 → T028 → T029+T030 (parallel) → T031+T032 → T033 → T034 → T035+T036 (parallel) → T037+T038+T039+T040+T041 (parallel) → T042 → T043 → T044

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story
- US1 and US2 merged because document generation (mapper) is integral to the transmission pipeline
- US3 (badges) and US7 (timeline) are mostly verification — existing UI shells have the logic
- US6 (credit notes) is the largest new work — can be parallelized with US1 after Phase 2
- Storecove sandbox testing (T044) should happen as early as possible — request sandbox access during Phase 1
- All Convex changes require `npx convex deploy --yes` — tracked in T002, T033, T043
- All API routes follow existing patterns from `src/app/api/v1/billing/webhooks/route.ts` and `src/app/api/v1/sales-invoices/[invoiceId]/send-email/route.ts`
