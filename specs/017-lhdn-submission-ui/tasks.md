# Tasks: LHDN MyInvois Submission UI

**Input**: Design documents from `/specs/017-lhdn-submission-ui/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Tests**: Not requested — manual testing via dev environment per quickstart.md.

**Organization**: Tasks grouped by user story. 5 user stories (3x P1, 2x P2). Each independently testable after foundational phase completes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install new dependencies needed for QR code generation

- [x] T001 Install qrcode library: `npm install qrcode @types/qrcode` for web QR rendering and PDF data URL generation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type extensions, Convex mutations, and shared components that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Extend SalesInvoice interface with LHDN fields in `src/domains/sales-invoices/types/index.ts` — add `lhdnSubmissionId`, `lhdnDocumentUuid`, `lhdnLongId`, `lhdnStatus`, `lhdnSubmittedAt`, `lhdnValidatedAt`, `lhdnValidationErrors`, `lhdnDocumentHash`, `einvoiceType` as optional fields. Import `LhdnStatus` and `EinvoiceType` types from `src/lib/constants/statuses.ts`. Also add `LhdnValidationError` type alias: `{ code: string; message: string; target?: string }`.
- [x] T003 [P] Create `LhdnStatusBadge` component in `src/domains/sales-invoices/components/lhdn-status-badge.tsx` — follow `invoice-status-badge.tsx` pattern with STATUS_CONFIG record mapping 5 LHDN statuses to color-coded Badge components: pending (gray), submitted (blue), valid (green), invalid (red), cancelled (yellow). Return null when status is undefined. Use `bg-{color}-500/10 text-{color}-600 dark:text-{color}-400 border border-{color}-500/30` pattern.
- [x] T004 [P] Add `submitToLhdn` and `resubmitToLhdn` mutations in `convex/functions/salesInvoices.ts` — follow `requireFinanceAdmin()` pattern for auth (owner + finance_admin only). `submitToLhdn`: validate invoice status is "sent" and lhdnStatus is undefined, verify business has lhdnTin + businessRegistrationNumber + msicCode, check customerSnapshot.tin (with useGeneralTin bypass), set lhdnStatus="pending" + lhdnSubmittedAt=Date.now() + auto-determined einvoiceType. `resubmitToLhdn`: same but requires lhdnStatus="invalid", clears lhdnValidationErrors + lhdnValidatedAt + lhdnDocumentUuid + lhdnLongId + lhdnDocumentHash. See `specs/017-lhdn-submission-ui/contracts/convex-mutations.md` for full contract.
- [x] T005 [P] Add `submitToLhdn()` and `resubmitToLhdn()` to mutation hooks in `src/domains/sales-invoices/hooks/use-sales-invoice-mutations.ts` — wrap the new Convex mutations following existing pattern with individual loading states.

**Checkpoint**: Foundation ready — types extended, badge component exists, mutations available. User story implementation can begin.

---

## Phase 3: User Story 1 — View LHDN Status on Invoice List (Priority: P1) 🎯 MVP

**Goal**: Business owners can see LHDN compliance status badges at a glance on the invoices list in both desktop and mobile views.

**Independent Test**: Set different `lhdnStatus` values on invoices via Convex dashboard. Open invoices list. Verify correct color-coded badge appears for each status (gray/blue/green/red/yellow). Verify no badge shows for invoices without lhdnStatus.

### Implementation for User Story 1

- [x] T006 [US1] Add "e-Invoice" column header and LHDN status badge cell to desktop table in `src/domains/sales-invoices/components/sales-invoice-list.tsx` — add `<th>` after the existing "Status" column header, add `<td>` with `<LhdnStatusBadge status={invoice.lhdnStatus} />` in the corresponding row. Use same `px-4 py-3 text-center` styling as Status column.
- [x] T007 [US1] Add LHDN status badge to mobile card layout in `src/domains/sales-invoices/components/sales-invoice-list.tsx` — in the `md:hidden` mobile card section, add `<LhdnStatusBadge>` below the existing `<InvoiceStatusBadge>` in the top-right area of each card. Only show when `lhdnStatus` is defined.

**Checkpoint**: User Story 1 complete — LHDN badges visible on list. This is the MVP increment.

---

## Phase 4: User Story 2 — Submit Invoice to LHDN (Priority: P1)

**Goal**: Business owners (Owner/Finance Admin only) can submit eligible "sent" invoices to LHDN with confirmation dialog, pre-flight validation (business config + customer TIN), loading state, and success/error notifications.

**Independent Test**: Open a "sent" invoice with no lhdnStatus. Click "Submit to LHDN". Confirm dialog appears. Confirm submission. Verify loading state, status updates to "pending", success toast shown. Test with missing business config — verify blocking message with navigation link. Test with Manager role — verify button hidden.

### Implementation for User Story 2

- [x] T008 [US2] Create `LhdnSubmitButton` component in `src/domains/sales-invoices/components/lhdn-submit-button.tsx` — accepts `invoice`, `business`, `userRole`, `onSubmitSuccess` props. Hidden when: invoice status is not "sent", lhdnStatus is already set (except "invalid" for resubmit), or user lacks `finance_admin` permission (use `useUserRole()` from `@/domains/security/lib/rbac-client`). Pre-flight checks: (1) business lhdnTin + businessRegistrationNumber + msicCode must be populated — if missing, show Card with `border-yellow-500/30 bg-yellow-500/5` listing missing fields + "Go to Settings" link to `/sales-invoices/settings`; (2) customerSnapshot.tin — if missing, show warning with option to proceed with general TIN "EI00000000000" or update customer. Inline confirmation Card (follow existing `showVoidConfirm` pattern from detail page). Loading state with `useState<boolean>` + disabled button + `<Loader2>` spinner. Call `submitToLhdn` mutation on confirm. Show `addToast()` for success/error. Shows "Resubmit to LHDN" label when lhdnStatus is "invalid" and calls `resubmitToLhdn` instead.
- [x] T009 [US2] Create `LhdnDetailSection` orchestrator in `src/domains/sales-invoices/components/lhdn-detail-section.tsx` — accepts `invoice`, `business`, `userRole` props. Wraps content in a `<Card>` with heading "LHDN e-Invoice". Conditionally renders: (1) document reference IDs (lhdnSubmissionId, lhdnDocumentUuid) when available as muted text, (2) `<LhdnSubmitButton>` when invoice is eligible for submission. This component will be extended by US3, US4, US5 to add more sections.
- [x] T010 [US2] Integrate `LhdnDetailSection` into invoice detail page at `src/app/[locale]/sales-invoices/[id]/page.tsx` — import `LhdnDetailSection`, `useUserRole` from RBAC, and business context. Add `<LhdnDetailSection invoice={invoice} business={business} userRole={userRole} />` in the detail layout, positioned after the existing invoice details section (within the `space-y-6` layout). Pass the business and userRole data already available from existing hooks (`useActiveBusiness`, `useBusinessProfile`, `useUserRole`).

**Checkpoint**: User Story 2 complete — Submit flow works end-to-end with all pre-flight validations and role gating.

---

## Phase 5: User Story 3 — View and Act on LHDN Validation Errors (Priority: P1)

**Goal**: When LHDN rejects an invoice (status "invalid"), business owners see the error details (code, message, target field) and can resubmit.

**Independent Test**: Set an invoice's `lhdnStatus` to "invalid" and `lhdnValidationErrors` to `[{code: "ERR001", message: "Invalid buyer TIN", target: "BuyerTIN"}, {code: "ERR002", message: "Missing address"}]` via Convex dashboard. Open invoice detail. Verify errors panel shows with both errors, target displayed for first error, no target for second. Verify "Resubmit to LHDN" button visible.

### Implementation for User Story 3

- [x] T011 [US3] Create `LhdnValidationErrors` component in `src/domains/sales-invoices/components/lhdn-validation-errors.tsx` — accepts `errors` array and `lhdnStatus`. Only renders when status is "invalid". Styled as a `<Card>` with `border-red-500/30 bg-red-500/5`. If errors array is empty, show generic message: "Validation failed — no error details available from LHDN". Otherwise, render a list/table showing: error code (monospace font), message (normal text), and target field (muted text, only if present). Use `<AlertTriangle>` icon from lucide-react in the header.
- [x] T012 [US3] Add `LhdnValidationErrors` to `LhdnDetailSection` in `src/domains/sales-invoices/components/lhdn-detail-section.tsx` — render `<LhdnValidationErrors errors={invoice.lhdnValidationErrors ?? []} lhdnStatus={invoice.lhdnStatus} />` conditionally when `lhdnStatus === "invalid"`. Position it prominently above the submit/resubmit button. The resubmit action is already handled by `LhdnSubmitButton` (which shows "Resubmit to LHDN" when status is "invalid").

**Checkpoint**: User Story 3 complete — Validation errors visible, resubmit action available for invalid invoices.

---

## Phase 6: User Story 4 — View LHDN Submission Timeline (Priority: P2)

**Goal**: Business owners see the complete LHDN lifecycle audit trail with timestamps on the invoice detail page.

**Independent Test**: Set various combinations of lhdnStatus + lhdnSubmittedAt + lhdnValidatedAt on invoices via Convex dashboard. Verify: pending-only shows first stage active; submitted shows two stages; valid shows green completion; invalid shows red rejection; cancelled shows full chain with yellow final stage. Verify timestamps formatted correctly.

### Implementation for User Story 4

- [x] T013 [US4] Create `LhdnSubmissionTimeline` component in `src/domains/sales-invoices/components/lhdn-submission-timeline.tsx` — accepts `lhdnStatus`, `lhdnSubmittedAt`, `lhdnValidatedAt` props. Renders a vertical timeline with stages: Pending → Submitted → Valid/Invalid/Cancelled. Each stage: circle indicator (filled for completed, outline for current, gray for future) + label + timestamp (formatted via `formatBusinessDate` or custom datetime format). Current stage highlighted with semantic color (green=valid, red=invalid, yellow=cancelled, blue=submitted, gray=pending). Future stages grayed out with `text-muted-foreground`. Use `<div className="flex gap-3">` for each step with a vertical line connector between circles.
- [x] T014 [US4] Add `LhdnSubmissionTimeline` to `LhdnDetailSection` in `src/domains/sales-invoices/components/lhdn-detail-section.tsx` — render `<LhdnSubmissionTimeline>` conditionally when `invoice.lhdnStatus` is defined. Position after validation errors (if any) and before QR code section.

**Checkpoint**: User Story 4 complete — Timeline visible with correct stages and timestamps.

---

## Phase 7: User Story 5 — View LHDN Verification QR Code (Priority: P2)

**Goal**: Validated invoices display a scannable QR code on both the web detail page and generated PDF that links to the LHDN MyInvois verification page.

**Independent Test**: Set `lhdnLongId` on an invoice via Convex dashboard. Open detail page — verify QR code renders with "LHDN e-Invoice Verification" label. Scan QR code — verify URL is `https://myinvois.hasil.gov.my/{lhdnLongId}/share`. Generate PDF — verify QR code appears in the PDF. Check invoice without lhdnLongId — verify no QR section.

### Implementation for User Story 5

- [x] T015 [P] [US5] Create `LhdnQrCode` component in `src/domains/sales-invoices/components/lhdn-qr-code.tsx` — accepts `lhdnLongId` prop (string | undefined). Returns null when undefined. Uses `qrcode` library's `toDataURL()` to generate a QR code encoding `https://myinvois.hasil.gov.my/${lhdnLongId}/share`. Renders QR code image (~120x120px) with label "LHDN e-Invoice Verification" and the verification URL as muted text below. Also export a `generateLhdnQrDataUrl(lhdnLongId: string): Promise<string>` utility function for PDF use.
- [x] T016 [US5] Add `LhdnQrCode` to `LhdnDetailSection` in `src/domains/sales-invoices/components/lhdn-detail-section.tsx` — render `<LhdnQrCode lhdnLongId={invoice.lhdnLongId} />` conditionally when `lhdnLongId` is defined. Position as the last section within the LHDN detail card.
- [x] T017 [US5] Add LHDN verification QR code to PDF template in `src/domains/sales-invoices/components/invoice-templates/pdf-document.tsx` — add a new section after the existing footer/payment-methods area. Import `generateLhdnQrDataUrl` from `lhdn-qr-code.tsx`. Generate the QR code data URL at PDF render time and render as `<Image src={qrDataUrl} style={{width: 60, height: 60}} />` with "LHDN e-Invoice Verification" text. Only render when `lhdnLongId` is present on the invoice data. Extend `PdfInvoiceData` interface to include `lhdnLongId?: string`. Thread `lhdnLongId` from the invoice through the PDF generation chain in `use-invoice-pdf.ts` if not already passed.

**Checkpoint**: User Story 5 complete — QR code renders on web and in PDF for validated invoices.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, deployment, and final validation across all stories

- [x] T018 Run `npm run build` and fix any TypeScript or build errors until build passes cleanly
- [x] T019 Run `npx convex deploy --yes` to deploy new submitToLhdn and resubmitToLhdn mutations to production
- [x] T020 Manual smoke test: walk through all 5 user stories per quickstart.md — verify badges on list (US1), submit flow with all pre-flight checks (US2), error display + resubmit (US3), timeline stages (US4), QR code on web + PDF (US5)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (qrcode installed) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (badge component + types)
- **US2 (Phase 4)**: Depends on Phase 2 (mutations + hooks + types)
- **US3 (Phase 5)**: Depends on Phase 4 (LhdnDetailSection exists from US2)
- **US4 (Phase 6)**: Depends on Phase 4 (LhdnDetailSection exists from US2)
- **US5 (Phase 7)**: Depends on Phase 4 (LhdnDetailSection exists from US2)
- **Polish (Phase 8)**: Depends on all prior phases

### User Story Dependencies

```
Phase 2 (Foundational)
  ├── US1 (Phase 3) — Independent, only touches list page
  └── US2 (Phase 4) — Independent, creates detail section
        ├── US3 (Phase 5) — Extends detail section with errors
        ├── US4 (Phase 6) — Extends detail section with timeline
        └── US5 (Phase 7) — Extends detail section with QR code + PDF
```

- **US1** and **US2** can run in **parallel** after Phase 2 (different pages)
- **US3, US4, US5** all modify `lhdn-detail-section.tsx` so must run **sequentially** after US2
- **US3, US4, US5** are independent of each other but each extends the same file — execute in priority order

### Parallel Opportunities

Within **Phase 2** (foundational):
```
T003 (LhdnStatusBadge) || T004 (Convex mutations) || T005 (mutation hooks)
```
All three tasks touch different files and can run in parallel after T002.

After **Phase 2** completes:
```
US1 (Phase 3 - list page) || US2 (Phase 4 - detail page)
```
These touch completely different files.

Within **US5** (Phase 7):
```
T015 (LhdnQrCode component) can start while US3/US4 are being completed
```
The component itself is a new file with no dependencies on the detail section.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Install qrcode
2. Complete Phase 2: Types + Badge + Mutations + Hooks
3. Complete Phase 3: US1 — LHDN badges on invoice list
4. **STOP and VALIDATE**: Verify badges render correctly for all 5 statuses + undefined
5. Deploy if MVP is sufficient

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready
2. US1 (badges on list) → Deploy — immediate compliance visibility
3. US2 (submit flow) → Deploy — core submission capability
4. US3 (error display) → Deploy — rejection handling complete
5. US4 (timeline) → Deploy — audit trail visible
6. US5 (QR code) → Deploy — full compliance with verification QR

### Recommended Single-Developer Execution Order

```
T001 → T002 → [T003 + T004 + T005] → [T006 + T007] → [T008 → T009 → T010]
→ [T011 → T012] → [T013 → T014] → [T015 → T016 → T017] → [T018 → T019 → T020]
```

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- No test tasks generated — manual testing per quickstart.md
- All new components follow existing patterns from research.md (badge colors, confirmation cards, toast notifications, RBAC hooks)
- Convex deploy (T019) is MANDATORY per CLAUDE.md before task is considered complete
- Build must pass (T018) per CLAUDE.md build-fix loop requirement
