# Tasks: Accounts Receivable & Debtor Management

**Input**: Design documents from `/specs/010-ar-debtor-management/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/payments.md, contracts/debtors.md, quickstart.md

**Tests**: Not explicitly requested — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `convex/` (Convex functions, schema, lib)
- **Frontend**: `src/` (Next.js app with domain-driven structure)
- **Domain**: `src/domains/sales-invoices/` (extending existing domain)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema changes, shared constants, validators, and types that all user stories depend on

- [ ] T001 Add `payments` table definition with indexes to `convex/schema.ts` per data-model.md (fields: businessId, customerId, userId, type, amount, currency, paymentDate, paymentMethod, paymentReference, notes, reversesPaymentId, allocations array with invoiceId/amount/allocatedAt, updatedAt, deletedAt; indexes: by_businessId, by_businessId_customerId, by_businessId_paymentDate, by_reversesPaymentId)
- [ ] T002 [P] Add `PAYMENT_TYPES` constant (`payment`, `reversal`) to `src/lib/constants/statuses.ts` and export `PaymentType` type
- [ ] T003 [P] Add `paymentTypeValidator` and `paymentMethodValidator` using `literalUnion()` in `convex/lib/validators.ts`
- [ ] T004 [P] Add `Payment`, `PaymentAllocation`, `PaymentType`, `DebtorSummary`, `DebtorDetail`, `AgingBuckets`, `StatementTransaction` TypeScript interfaces to `src/domains/sales-invoices/types/index.ts`
- [ ] T005 [P] Add i18n translation keys for debtor management (debtors tab label, aging bucket labels, payment type labels, statement labels, report labels, empty states, error messages) to `src/messages/en.json`, `src/messages/th.json`, `src/messages/id.json`, `src/messages/zh.json`
- [ ] T006 Create shared aging bucket calculation utility `calculateAgingBucket(dueDate: string, asOfDate?: string)` and `calculateAgingBuckets(invoices)` in `src/domains/sales-invoices/lib/aging-calculations.ts` — returns { current, days1to30, days31to60, days61to90, days90plus } per FR-014

**Checkpoint**: Schema deployed, constants/types/validators ready. Run `npx convex dev --once` to verify schema.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Convex mutations/queries that all UI stories depend on. MUST complete before any user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Create `convex/functions/payments.ts` with `recordPayment` mutation per contracts/payments.md — validates finance_admin, amount > 0, allocations sum = amount, each allocation ≤ invoice.balanceDue, currency match, payable state; creates payment record; patches each invoice's amountPaid/balanceDue/status; sets paidAt and updates accounting entry status when fully paid
- [ ] T008 Add `recordReversal` mutation to `convex/functions/payments.ts` per contracts/payments.md — validates finance_admin, original payment exists and is type "payment", no existing reversal; creates reversal record mirroring allocations; decrements each invoice's amountPaid, recalculates balanceDue, reverts status; updates accounting entries back to "pending"
- [ ] T009 Add `listByInvoice` query to `convex/functions/payments.ts` per contracts/payments.md — returns all payments allocated to a specific invoice with allocatedAmount per payment
- [ ] T010 Add `listByCustomer` query to `convex/functions/payments.ts` per contracts/payments.md — returns payments for a customer within optional date range, with totalPaid and totalReversed sums
- [ ] T011 Deprecate the existing `recordPayment` mutation in `convex/functions/salesInvoices.ts` — redirect or remove to avoid dual payment paths; update any existing callers to use the new `payments.recordPayment` mutation instead

**Checkpoint**: All Convex payment functions working. Deploy with `npx convex dev --once` and test via Convex dashboard.

---

## Phase 3: User Story 1 — Payment-Invoice Linkage & History (Priority: P1) 🎯 MVP

**Goal**: Finance admins can record payments with full details linked to specific invoices, view payment history per invoice, and record reversals to correct mistakes.

**Independent Test**: Record 3 separate payments against 2 invoices for the same customer. Verify each payment is stored individually. Verify one payment can split across 2 invoices. Verify invoice amountPaid/balanceDue update correctly.

### Implementation for User Story 1

- [ ] T012 [US1] Modify `src/domains/sales-invoices/components/payment-recorder.tsx` to support multi-invoice allocation — add invoice selector (for customer's payable invoices), allocation table with per-invoice amount inputs, validation that allocations sum to payment amount, validation that each allocation ≤ invoice.balanceDue; call new `payments.recordPayment` mutation instead of `salesInvoices.recordPayment`
- [ ] T013 [US1] Add `usePaymentsByInvoice(invoiceId)` and `usePaymentsByCustomer(customerId, dateFrom?, dateTo?)` hooks to `src/domains/sales-invoices/hooks/use-sales-invoices.ts` — wrapping the new `payments.listByInvoice` and `payments.listByCustomer` Convex queries
- [ ] T014 [US1] Add payment history section to the invoice detail view — show list of payments with date, amount, method, reference, type (payment/reversal) for each invoice; use `usePaymentsByInvoice` hook; display in expandable section below invoice details (identify and modify the existing invoice detail component)
- [ ] T015 [US1] Add reversal recording UI — from payment history, add "Reverse" button on each payment row (type="payment" only, not already reversed); confirmation dialog; calls `payments.recordReversal` mutation; shows reversal in payment history as distinct entry with visual indicator

**Checkpoint**: Payment recording with multi-invoice allocation works. Payment history visible on invoices. Reversals functional. US1 independently testable.

---

## Phase 4: User Story 2 — Debtor List with Aging Analysis (Priority: P2)

**Goal**: Finance admins see a "Debtors" tab showing all customers with outstanding invoices, aging breakdown, filtering, and sorting.

**Independent Test**: Create 5 customers with varying outstanding invoices at different aging stages. Verify debtor list shows correct totals, aging breakdown. Filter "overdue only" works.

### Implementation for User Story 2

- [ ] T016 [US2] Add `getDebtorList` query to `convex/functions/payments.ts` per contracts/debtors.md — query all sales_invoices with balanceDue > 0, group by customerId, compute per-customer aging buckets using dueDate, compute summary totals; support filter (overdueOnly, minOutstanding, currency) and sort (outstanding, daysOverdue, customerName)
- [ ] T017 [US2] Add `useDebtorList(filter?, sort?)` hook in new file `src/domains/sales-invoices/hooks/use-debtor-management.ts` — wraps `payments.getDebtorList` query; returns debtors array + summary + loading state
- [ ] T018 [US2] Create `src/domains/sales-invoices/components/debtor-list.tsx` — table/list component showing per-debtor rows (customer name, total outstanding, open invoice count, oldest overdue days, aging mini-bars); aging summary header showing Current/1-30/31-60/61-90/90+ totals; filter controls (overdue only toggle, minimum amount input); sort controls (outstanding, days overdue, customer name); empty state for no debtors; click row navigates to debtor detail; uses semantic design tokens
- [ ] T019 [US2] Add "Debtors" as third tab in `src/domains/invoices/components/invoices-tab-container.tsx` — lazy-load DebtorList component with Suspense; add Users icon from lucide-react; tab value "debtors"

**Checkpoint**: Debtors tab visible in Invoices page. List shows correct aging data. Filtering and sorting work. US2 independently testable.

---

## Phase 5: User Story 3 — Debtor Detail & Invoice History (Priority: P3)

**Goal**: Finance admins click a debtor to see all their invoices with payment status, payment history per invoice, and running balance.

**Independent Test**: Select a customer with 3 invoices (1 paid, 1 partially paid, 1 overdue). Verify all invoices appear with correct status/amounts. Verify running balance adds up.

### Implementation for User Story 3

- [ ] T020 [US3] Add `getDebtorDetail` query to `convex/functions/payments.ts` per contracts/debtors.md — fetch customer info, all their invoices with payment history per invoice, compute summary (totalInvoiced, totalPaid, totalOutstanding, overdueCount), compute chronological running balance (invoices as debits, payments as credits)
- [ ] T021 [US3] Add `useDebtorDetail(customerId)` hook to `src/domains/sales-invoices/hooks/use-debtor-management.ts` — wraps `payments.getDebtorDetail` query
- [ ] T022 [US3] Create `src/domains/sales-invoices/components/debtor-detail.tsx` — full-page debtor detail component with: summary header (total invoiced, total paid, total outstanding, overdue count), invoice table with expandable rows showing payment history per invoice (date, amount, method, reference, type), running balance section showing chronological debit/credit/balance ledger; back navigation to debtor list; uses semantic design tokens and formatCurrency/formatBusinessDate utilities
- [ ] T023 [US3] Add debtor detail route — create page at `src/app/[locale]/invoices/debtors/[customerId]/page.tsx` that renders DebtorDetail component with customerId from URL params

**Checkpoint**: Debtor detail page accessible from list. Invoice + payment history displays correctly. Running balance reconciles. US3 independently testable.

---

## Phase 6: User Story 4 — Debtor Statement Generation (Priority: P4)

**Goal**: Finance admins generate a debtor statement for a customer + date range with opening/closing balance, download as PDF, and email to customer.

**Independent Test**: For a customer with 4 invoices and 3 payments in Jan-Feb 2026, plus 1 invoice from Dec 2025, generate statement for Jan 1 - Feb 28. Verify opening balance, transactions, closing balance. Download PDF.

### Implementation for User Story 4

- [ ] T024 [US4] Add `getDebtorStatement` query to `convex/functions/payments.ts` per contracts/debtors.md — accepts customerId + dateFrom + dateTo; computes opening balance (outstanding before dateFrom); collects invoices issued and payments dated within range; builds chronological transaction list with running balance; computes closing balance and totals
- [ ] T025 [US4] Add `useDebtorStatement(customerId, dateFrom, dateTo)` hook to `src/domains/sales-invoices/hooks/use-debtor-management.ts` — wraps `payments.getDebtorStatement` query
- [ ] T026 [US4] Create statement data computation utility in `src/domains/sales-invoices/lib/statement-generator.ts` — helper functions for formatting statement data for PDF rendering: `formatStatementForPdf(statementData)` returns structured object ready for the HTML template
- [ ] T027 [US4] Create `src/domains/sales-invoices/components/debtor-statement.tsx` — statement view component with: date range picker (dateFrom/dateTo), statement preview showing business name, customer details, period, opening balance, transaction table (date, description, debit, credit, running balance), closing balance, totals; "Download PDF" button using html2pdf.js pattern from `use-invoice-pdf.ts`; "Email to Customer" button (calls email mutation or placeholder); uses professional statement layout similar to bank statements; accessible from debtor detail page
- [ ] T028 [US4] Create `useStatementPdf()` hook in `src/domains/sales-invoices/hooks/use-debtor-management.ts` — adapts the html2pdf.js pattern from `use-invoice-pdf.ts` for statement PDF generation; targets the statement HTML element by ID; A4 portrait, professional layout

**Checkpoint**: Statement generates with correct opening/closing balances. PDF download works. US4 independently testable.

---

## Phase 7: User Story 5 — AR Aging Report (Priority: P5)

**Goal**: Finance admins see a summary AR aging report with per-debtor breakdown and CSV export.

**Independent Test**: With 8 customers at various aging stages, verify bucket totals, per-debtor breakdown, CSV export.

### Implementation for User Story 5

- [ ] T029 [US5] Add `getAgingReport` query to `convex/functions/payments.ts` per contracts/debtors.md — accepts optional asOfDate (defaults to today); computes aging buckets per invoice by dueDate vs asOfDate; aggregates per customer; computes summary totals; sorts debtors by total descending
- [ ] T030 [US5] Add `useAgingReport(asOfDate?)` hook to `src/domains/sales-invoices/hooks/use-debtor-management.ts` — wraps `payments.getAgingReport` query
- [ ] T031 [US5] Create `src/domains/sales-invoices/components/aging-report.tsx` — aging report component with: summary row (Current, 1-30, 31-60, 61-90, 90+, Total), per-debtor breakdown table with expandable rows, "Export CSV" button using existing `csv-generator.ts` from `src/domains/exports/lib/`; accessible from debtor list (button) or as separate view within Debtors tab; uses semantic design tokens
- [ ] T032 [US5] Add CSV export function for aging report in `src/domains/sales-invoices/lib/aging-calculations.ts` — `exportAgingReportCsv(reportData)` uses `generateCsv()` from `src/domains/exports/lib/csv-generator.ts` with field mappings for customer name + each aging bucket + total; triggers browser download

**Checkpoint**: Aging report shows correct bucket totals. Per-debtor breakdown matches. CSV export works. US5 independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, edge cases, and integration polish

- [ ] T033 Handle multi-currency edge case in debtor list and aging report — ensure debtors with invoices in different currencies appear as separate entries per currency (not summed); update `getDebtorList` and `getAgingReport` queries if needed
- [ ] T034 Handle concurrent payment edge case — add optimistic concurrency check in `recordPayment` mutation to verify invoice.balanceDue hasn't changed since the form was loaded; reject with clear error if balanceDue < allocation amount
- [ ] T035 [P] Add empty state components for debtor list (no outstanding receivables), debtor detail (no invoices), and statement (no transactions in range) with appropriate illustrations and messages
- [ ] T036 [P] Add loading skeletons for debtor list, debtor detail, and aging report components using existing skeleton patterns
- [ ] T037 Run `npm run build` to verify no TypeScript errors across all new and modified files
- [ ] T038 Deploy Convex schema and functions with `npx convex dev --once` and verify all queries/mutations work
- [ ] T039 Run quickstart.md validation scenarios (Scenarios 1-7) to verify end-to-end functionality

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion (schema must be deployed first) — BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Phase 2 completion
  - US1 (P1): Can start after Phase 2
  - US2 (P2): Can start after Phase 2 (no dependency on US1)
  - US3 (P3): Can start after Phase 2, but integrates with US1 payment history display
  - US4 (P4): Depends on US3 (debtor detail provides the entry point for statement generation)
  - US5 (P5): Can start after Phase 2 (no dependency on US1-US4; reuses aging-calculations.ts from Phase 1)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1 (Setup) → Phase 2 (Foundational)
                    ├── US1 (Payment Linkage) ─────────────┐
                    ├── US2 (Debtor List) ──────────────────┤
                    ├── US3 (Debtor Detail) → US4 (Statement)
                    └── US5 (Aging Report) ─────────────────┤
                                                             └── Phase 8 (Polish)
```

### Within Each User Story

- Convex query/mutation before frontend hook
- Frontend hook before UI component
- Core component before integration (routing, tab registration)

### Parallel Opportunities

- **Phase 1**: T002, T003, T004, T005 can all run in parallel (different files)
- **Phase 3-7**: US1, US2, and US5 can run in parallel after Phase 2 (no inter-dependencies)
- **Phase 8**: T035 and T036 can run in parallel (different components)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all parallel setup tasks together:
Task: T002 "Add PAYMENT_TYPES to statuses.ts"
Task: T003 "Add payment validators to validators.ts"
Task: T004 "Add Payment types to types/index.ts"
Task: T005 "Add i18n translations to message files"
```

## Parallel Example: After Phase 2

```bash
# Launch independent user stories in parallel:
Task: US1 "Payment-Invoice Linkage" (Phase 3)
Task: US2 "Debtor List with Aging" (Phase 4)
Task: US5 "AR Aging Report" (Phase 7)
```

---

## Implementation Strategy

### MVP First (User Stories 1-2 Only)

1. Complete Phase 1: Setup (schema, constants, types, validators)
2. Complete Phase 2: Foundational (Convex mutations/queries)
3. Complete Phase 3: US1 — Payment recording with multi-invoice allocation
4. **STOP and VALIDATE**: Test payment recording end-to-end
5. Complete Phase 4: US2 — Debtor list with aging
6. **STOP and VALIDATE**: Test debtor list with real payment data
7. Deploy/demo MVP

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Payments) → Test → Deploy (MVP!)
3. Add US2 (Debtor List) → Test → Deploy
4. Add US3 (Debtor Detail) → Test → Deploy
5. Add US4 (Statement) → Test → Deploy
6. Add US5 (Aging Report) → Test → Deploy
7. Polish → Final deploy

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Payments) + US4 (Statement)
   - Developer B: US2 (Debtor List) + US3 (Debtor Detail)
   - Developer C: US5 (Aging Report) + Polish
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The existing `recordPayment` in salesInvoices.ts must be deprecated (T011) to avoid dual payment paths
- All components must use semantic design tokens (bg-card, text-foreground, etc.) per CLAUDE.md
- All number formatting via formatCurrency/formatNumber utilities
- All date display via formatBusinessDate utility
