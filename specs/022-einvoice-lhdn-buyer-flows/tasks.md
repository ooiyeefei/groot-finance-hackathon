# Tasks: LHDN E-Invoice Buyer Flows

**Input**: Design documents from `/specs/022-einvoice-lhdn-buyer-flows/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Schema & LHDN Client Extensions)

**Purpose**: Extend schema and LHDN client with shared types/methods needed by all stories

- [x] T001 Extend `lhdnStatus` union on `sales_invoices` table to add `"rejected"` and `"cancelled_by_buyer"` in convex/schema.ts
- [x] T002 Add new fields to `sales_invoices`: `lhdnRejectedAt`, `lhdnStatusReason`, `lhdnReviewRequired`, `lhdnPdfDeliveredAt`, `lhdnPdfDeliveredTo` in convex/schema.ts
- [x] T003 Extend `einvoice_received_documents` status union to add `"rejected"`, add `rejectedAt`, `rejectionReason`, `rejectedByUserId` fields in convex/schema.ts
- [x] T004 Add `einvoiceRejectionWarning` optional boolean field to `expense_claims` table in convex/schema.ts
- [x] T005 Add `einvoiceAutoDelivery` and `einvoiceBuyerNotifications` optional boolean fields to `businesses` table in convex/schema.ts
- [x] T006 [P] Add `LhdnRejectRequest` type and extend `LhdnDocumentStatus` with `"rejected"` in src/lib/lhdn/types.ts
- [x] T007 [P] Add `rejectDocument()` method to LHDN client (mirrors `cancelDocument()`, PUT with `status: "rejected"`) in src/lib/lhdn/client.ts
- [x] T008 [P] Add `getDocumentDetails()` method to LHDN client (GET document by UUID for status check) in src/lib/lhdn/client.ts
- [x] T009 Deploy schema changes to Convex: `npx convex deploy --yes`

**Checkpoint**: Schema deployed, LHDN client has reject + status check methods. All stories can now proceed.

---

## Phase 2: User Story 1 — Detect Buyer Rejections/Cancellations on Issued Invoices (Priority: P1) MVP

**Goal**: Poll LHDN for status changes on issued e-invoices within the 72-hour window. Detect buyer rejections and external cancellations. Send in-app notifications.

**Independent Test**: Submit an e-invoice to LHDN sandbox, reject it via LHDN portal, verify Groot detects the change within 10 minutes and shows a notification + review-required flag.

### Implementation for User Story 1

- [x] T010 [US1] Add Convex query `getIssuedInvoicesForStatusPolling` in convex/functions/salesInvoices.ts — returns invoices with `lhdnStatus: "valid"` and `lhdnValidatedAt` within 72 hours
- [x] T011 [US1] Add Convex mutation `updateLhdnStatusFromPoll` in convex/functions/salesInvoices.ts — updates status to `"rejected"` or `"cancelled_by_buyer"`, sets `lhdnRejectedAt`, `lhdnStatusReason`, `lhdnReviewRequired` (true if journal entries exist for this invoice), creates notification
- [x] T012 [US1] Extend LHDN polling Lambda with second pass for issued document status changes in src/lambda/lhdn-polling/handler.ts — after existing received-document polling, query Convex for invoices in 72h window, check each submission's status for rejection/cancellation fields, call `updateLhdnStatusFromPoll` on changes
- [x] T013 [US1] Add "LHDN Rejected — Review Required" warning badge to sales invoice list and detail views in src/domains/sales-invoices/components/ — show badge when `lhdnReviewRequired === true`, with tooltip explaining the user should reverse, void, or re-issue
- [x] T014 [US1] Run `npm run build` to verify no type errors from schema + mutation changes

**Checkpoint**: Status polling detects rejections/cancellations. Issued invoice records update automatically. Notification and review badge visible.

---

## Phase 3: User Story 2 — Reject Received E-Invoices from Suppliers (Priority: P2)

**Goal**: Allow users to reject received e-invoices through Groot within 72 hours. File rejection with LHDN. Update linked expense claims.

**Independent Test**: Receive a test e-invoice in sandbox, reject it through the UI, verify status changes to "rejected" in both Groot and LHDN.

### Implementation for User Story 2

- [x] T015 [US2] Add Convex mutation `rejectReceivedDocument` in convex/functions/einvoiceReceivedDocuments.ts — update document status to "rejected", set rejectedAt/rejectionReason/rejectedByUserId, if linked expense claim: set `einvoiceRejectionWarning: true` and clear e-invoice attachment fields, create notification for claim submitter
- [x] T016 [US2] Create API route POST /api/v1/einvoice-received/[uuid]/reject in src/app/api/v1/einvoice-received/[uuid]/reject/route.ts — Clerk auth (owner/finance_admin/manager), validate document exists and status is "valid", validate 72h window, authenticate with LHDN, call `rejectDocument()`, call Convex mutation
- [x] T017 [US2] Create rejection dialog component in src/domains/sales-invoices/components/einvoice-reject-dialog.tsx — reason text input (required), 72h countdown display, confirmation message, loading/error states
- [x] T018 [US2] Add "Reject E-Invoice" button to received e-invoice display in expense claims UI — show only for valid docs within 72h window and users with appropriate roles, opens rejection dialog
- [x] T019 [US2] Add "E-Invoice Rejected" warning badge to expense claims that have `einvoiceRejectionWarning === true` in expense claims list/detail views
- [x] T020 [US2] Run `npm run build` to verify no type errors

**Checkpoint**: Users can reject received e-invoices end-to-end. Linked expense claims show warning. LHDN reflects rejection.

---

## Phase 4: User Story 3 — Validated E-Invoice PDF with LHDN QR Code + Auto-Delivery (Priority: P3)

**Goal**: Embed LHDN QR code and validation stamp in invoice PDF. Auto-email to buyer on validation.

**Independent Test**: Submit e-invoice, wait for validation, verify PDF has QR code, verify buyer receives email with PDF attached.

### Implementation for User Story 3

- [x] T021 [P] [US3] Extend invoice PDF template to include LHDN validation block (QR code image, UUID, validation timestamp, "Validated by LHDN" badge) — conditional on `lhdnStatus === "valid"` and `lhdnLongId` present — in src/domains/sales-invoices/components/invoice-templates/pdf-document.tsx
- [x] T022 [P] [US3] Create buyer notification service in src/lib/services/buyer-notification-service.ts — `sendBuyerNotification()` function that composes email content for validation/cancellation/rejection events and calls the existing email service
- [x] T023 [US3] Add "Download E-Invoice (LHDN)" button to sales invoice detail page — renders only when `lhdnStatus === "valid"`, generates PDF client-side with LHDN block, triggers download
- [x] T024 [US3] Auto-delivery trigger: Convex internalAction `triggerAutoDelivery` → calls Next.js API route `/api/v1/sales-invoices/[invoiceId]/lhdn/deliver` → server-side PDF generation via `renderToBuffer()` → email via existing SES service
- [x] T025 [US3] Update `sales_invoices` with `lhdnPdfDeliveredAt` and `lhdnPdfDeliveredTo` after successful delivery via `updateLhdnDeliveryStatus` mutation
- [x] T026 [US3] Run `npm run build` to verify no type errors

**Checkpoint**: Validated invoices have downloadable PDFs with LHDN QR. Auto-delivery sends email to buyer.

---

## Phase 5: User Story 4 — Buyer Notifications on Lifecycle Events (Priority: P4)

**Goal**: Email buyers when their e-invoice is validated, cancelled, or rejection confirmed.

**Independent Test**: Trigger each lifecycle event and verify buyer receives the corresponding email.

### Implementation for User Story 4

- [x] T027 [US4] Extend buyer notification service to handle cancellation and rejection-confirmed events in src/lib/services/buyer-notification-service.ts — add email templates for cancellation (with reason) and rejection confirmation
- [x] T028 [US4] Wire cancellation notification into existing cancel API route — after successful LHDN cancellation in src/app/api/v1/sales-invoices/[invoiceId]/lhdn/cancel/route.ts, check buyer notification setting, send email to buyer if enabled
- [ ] T029 [US4] Buyer email notification on rejection detection — in-app notification works via `updateLhdnStatusFromPoll`. Email notification can reuse the same `triggerAutoDelivery` pattern but for rejection events. Low priority — in-app notification covers the issuer side.
- [x] T030 [US4] Add business settings UI for `einvoiceAutoDelivery` and `einvoiceBuyerNotifications` toggles in business settings/LHDN configuration section
- [x] T031 [US4] Run `npm run build` to verify no type errors

**Checkpoint**: Buyers receive emails on all three lifecycle events when enabled. Business can toggle notifications.

---

## Phase 6: User Story 5 — E-Invoice Compliance Dashboard (Priority: P5)

**Goal**: Dashboard tab showing submission metrics, charts, error breakdown, and CSV export.

**Independent Test**: With a mix of e-invoice statuses, verify dashboard shows correct metrics and charts render.

### Implementation for User Story 5

- [x] T032 [US5] Add Convex query `getEinvoiceAnalytics` in convex/functions/salesInvoices.ts
- [x] T033 [US5] Create compliance dashboard component in src/domains/sales-invoices/components/einvoice-dashboard.tsx
- [x] T034 [US5] Add "E-Invoice Compliance" tab to sales invoices page
- [x] T035 [US5] Implement CSV export — client-side generation from query results
- [x] T036 [US5] Run `npm run build` to verify no type errors

**Checkpoint**: Dashboard shows accurate metrics. Charts render. CSV export works. Date filter updates all views.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, build, deploy

- [x] T037 Run full `npm run build` — fix any remaining type errors or build failures
- [x] T038 Deploy Convex to production: `npx convex deploy --yes`
- [x] T039 Deploy Lambda changes (polling Lambda was modified with Pass 2): `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`
- [x] T040 Update LHDN e-invoice documentation in CLAUDE.md to reflect new status values, buyer rejection flow, auto-delivery, and dashboard

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1 - Status Polling)**: Depends on Phase 1 schema + client changes
- **Phase 3 (US2 - Buyer Rejection)**: Depends on Phase 1; independent of US1
- **Phase 4 (US3 - PDF + Auto-Delivery)**: Depends on Phase 1; benefits from US1 (polling triggers delivery)
- **Phase 5 (US4 - Buyer Notifications)**: Depends on Phase 1 + US3 (notification service); integrates with US1 (polling triggers)
- **Phase 6 (US5 - Dashboard)**: Depends on Phase 1; benefits from all status data flowing
- **Phase 7 (Polish)**: Depends on all desired phases complete

### User Story Dependencies

- **US1 (P1)**: Foundation — other stories integrate with its polling
- **US2 (P2)**: Independent of US1 (different flow direction)
- **US3 (P3)**: Integrates with US1 (auto-delivery triggered by validation detection)
- **US4 (P4)**: Depends on US3 (reuses notification service); integrates with US1 (polling triggers)
- **US5 (P5)**: Independent — queries data, doesn't produce events
