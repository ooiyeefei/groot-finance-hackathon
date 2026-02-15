# Tasks: Smart AP Vendor Management

**Input**: Design documents from `/specs/013-ap-vendor-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/convex-functions.md, quickstart.md

**Tests**: Not explicitly requested. Test tasks omitted. Verification via `npm run build` and manual testing.

**Organization**: Tasks grouped by user story. Backend tasks batched in Phase 2 (Foundational) for efficient Convex deployment. Frontend tasks in Phase 3+ organized by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create domain directory structure and shared configuration

- [x] T001 Create payables domain directory structure: `src/domains/payables/{components,components/spend-analytics,components/price-intelligence,hooks,lib}`
- [x] T002 [P] Create currency-specific price alert threshold configuration in `src/domains/payables/lib/price-thresholds.ts` — define stable currency thresholds (SGD/MYR/USD/EUR: 5%/10%/20%) and high-inflation thresholds (IDR/VND/PHP/THB: 8%/15%/25%), minimum observation count (2), and lookback window (90 days)

---

## Phase 2: Foundational (All Backend — Schema, Functions, Cron)

**Purpose**: All Convex schema changes, queries, mutations, and cron job. MUST complete before ANY frontend user story work begins.

**Why batched**: Convex deploys all functions at once. Batching backend work minimizes deploy cycles and ensures all queries are available when frontend starts.

### Schema Changes

- [x] T003 Extend `vendors` table in `convex/schema.ts` — add fields: `paymentTerms` (optional paymentTermsValidator), `customPaymentDays` (optional number), `defaultCurrency` (optional string), `contactPerson` (optional string), `website` (optional string), `notes` (optional string), `bankDetails` (optional object with bankName, accountNumber, routingCode, accountHolderName)
- [x] T004 Extend `accounting_entries` table in `convex/schema.ts` — add fields: `paidAmount` (optional number, default 0), `paymentHistory` (optional array of PaymentRecord objects with amount, paymentDate, paymentMethod, notes, recordedAt). Create PaymentRecord validator.
- [x] T005 Add new indexes to `accounting_entries` in `convex/schema.ts` — `by_businessId_dueDate` on [businessId, dueDate] and `by_businessId_vendorId_status` on [businessId, vendorId, status]. Evaluate against Convex index limits.
- [x] T006 Deploy schema changes: `npx convex deploy --yes`

### Vendor Functions

- [x] T007 Extend vendor `update` mutation in `convex/functions/vendors.ts` — accept and validate new fields (paymentTerms, customPaymentDays, defaultCurrency, contactPerson, website, notes, bankDetails). Validate: if paymentTerms="custom", customPaymentDays must be > 0.
- [x] T008 Add `getVendorContext` query in `convex/functions/vendors.ts` — accepts vendorId + businessId, returns vendor name/terms/currency + outstanding payable count/amount + suggested due date. See contracts/convex-functions.md for full signature.

### Accounting Entry Functions

- [x] T009 [P] Add `recordPayment` mutation in `convex/functions/accountingEntries.ts` — accepts entryId, amount, paymentDate, paymentMethod, notes. Validates entry is pending/overdue and amount <= outstanding balance. Appends to paymentHistory array, updates paidAmount, updates paymentDate/paymentMethod. Sets status="paid" when paidAmount >= originalAmount. See contracts/convex-functions.md.
- [x] T010 [P] Add `markOverduePayables` internal mutation in `convex/functions/accountingEntries.ts` — queries pending Expense/COGS entries with dueDate < today, updates status to "overdue". Creates Action Center insight (category: "deadline", priority: "high") summarizing newly overdue count and total amount.

### Analytics Queries

- [x] T011 Add `getAgedPayablesByVendor` query in `convex/functions/analytics.ts` — fetches pending/overdue Expense/COGS entries, groups by vendorId (null → "Unassigned Vendor"), classifies into aging buckets using entry.dueDate (respecting vendor payment terms), converts to home currency, returns vendor array + totals. See contracts/convex-functions.md.
- [x] T012 Add `getVendorPayablesDrilldown` query in `convex/functions/analytics.ts` — fetches unpaid entries for a specific vendorId (or null for unassigned), returns individual entries with outstanding balance, daysOverdue, sorted by dueDate ascending.
- [x] T013 Add `getAPUpcomingPayments` query in `convex/functions/analytics.ts` — accepts businessId + daysAhead (7|14|30), returns pending/overdue entries due within window, overdue entries at top, sorted by dueDate. Includes vendor name lookup, original + home currency amounts.
- [x] T014 Add `getVendorSpendAnalytics` query in `convex/functions/analytics.ts` — accepts businessId + periodDays (30|90|365), aggregates Expense/COGS entries with status in [paid, pending, overdue] (excludes cancelled/disputed). Returns topVendors (top 10 by spend), categoryBreakdown, monthlyTrend (12 months), totalSpend. All in home currency.

### Price Intelligence Queries

- [x] T015 [P] Add `detectPriceChanges` query in `convex/functions/vendorPriceHistory.ts` — accepts vendorId + lineItems array, normalizes descriptions, looks up latest confirmed price per item, calculates % change, applies currency-specific thresholds from price-thresholds config, finds cheapest cross-vendor alternative. Returns array with alertLevel (none|info|warning|alert) + cheaperVendor details. See contracts/convex-functions.md.
- [x] T016 [P] Add `getCrossVendorComparison` query in `convex/functions/vendorPriceHistory.ts` — accepts businessId + normalizedDescription, finds all vendor prices for that item, groups by vendor (latest confirmed price each), marks cheapest, sorts by price ascending.

### Cron Job

- [x] T017 Register `mark-overdue-payables` daily cron in `convex/crons.ts` — schedule at { hourUTC: 0, minuteUTC: 5 } (5 min after AR overdue job), calls `internal.functions.accountingEntries.markOverduePayables`

### Deploy All Backend

- [x] T018 Deploy all Convex functions and cron: `npx convex deploy --yes`

**Checkpoint**: All backend queries, mutations, and cron are deployed. Frontend implementation can begin. All 10 user stories have their backend support ready.

---

## Phase 3: User Story 1 — Vendor Payment Terms & Profile (Priority: P1) 🎯 MVP

**Goal**: Business owners can view and edit vendor profiles with payment terms, bank details (masked), and metadata. Payment terms auto-calculate due dates for new payables.

**Independent Test**: Open a vendor profile → set payment terms to "Net 60" → create an accounting entry from that vendor → verify due date is transaction date + 60 days.

### Implementation for User Story 1

- [x] T019 [P] [US1] Create vendor bank details component with click-to-reveal masking in `src/domains/payables/components/vendor-bank-details.tsx` — shows last 4 digits of account number and routing code by default, full details on click. Uses `bg-card` token, `text-muted-foreground` for masked text.
- [x] T020 [US1] Create vendor profile panel component in `src/domains/payables/components/vendor-profile-panel.tsx` — displays and edits: payment terms (dropdown using PAYMENT_TERMS_OPTIONS), custom days input (shown when terms="custom"), default currency, contact person, website, notes. Uses `useQuery(api.functions.vendors.getVendorContext)` and `useMutation(api.functions.vendors.update)`. Includes VendorBankDetails sub-component (T019). Action button: `bg-primary hover:bg-primary/90`.

**Checkpoint**: Vendor profile panel renders with payment terms editing and masked bank details. Vendor data persists on save.

---

## Phase 4: User Story 2 — Vendor-Level Creditor Aging (Priority: P1)

**Goal**: Business owners see aged payables broken down by vendor with drill-down to individual bills. Aging respects vendor-specific payment terms.

**Independent Test**: Create pending accounting entries across 3 vendors with different payment terms → view vendor aging table → verify buckets classify entries relative to each vendor's due date, not blanket 30 days.

### Implementation for User Story 2

- [x] T021 [US2] Create use-vendor-aging hook in `src/domains/payables/hooks/use-vendor-aging.ts` — wraps `useQuery(api.functions.analytics.getAgedPayablesByVendor)` and `useQuery(api.functions.analytics.getVendorPayablesDrilldown)`. Exposes: vendorAgingData, drilldownData, selectedVendorId, setSelectedVendorId, loading states.
- [x] T022 [US2] Create vendor aging table component in `src/domains/payables/components/vendor-aging-table.tsx` — table with columns: Vendor Name, Current, 1-30, 31-60, 61-90, 90+, Total Outstanding. Uses risk-based coloring (green→amber→orange→red matching existing AgedPayablesWidget pattern). "Unassigned Vendor" row for entries without vendorId. Click row → opens drilldown. Shows empty state when no payables. Uses `formatCurrency()` for amounts.
- [x] T023 [US2] Create vendor aging drilldown component in `src/domains/payables/components/vendor-aging-drilldown.tsx` — modal or slide-over showing individual unpaid bills for selected vendor. Columns: Reference, Amount (original + home currency), Transaction Date, Due Date, Days Overdue/Remaining, Status. Sorted by due date ascending. "Record Payment" action per row (opens US4 dialog). Uses `formatBusinessDate()` for dates.

**Checkpoint**: Vendor aging table renders with correct bucket classifications per vendor payment terms. Drill-down shows individual bills. "Unassigned Vendor" row appears for vendorless entries.

---

## Phase 5: User Story 3 — Upcoming Payments View (Priority: P1)

**Goal**: Business owners see a list of bills due in the next 7/14/30 days, sorted by urgency, with multi-currency display.

**Independent Test**: Create entries with due dates at 3, 10, and 25 days out → filter by 7 days → only the 3-day entry appears → filter by 30 days → all appear.

### Implementation for User Story 3

- [x] T024 [US3] Create use-upcoming-payments hook in `src/domains/payables/hooks/use-upcoming-payments.ts` — wraps `useQuery(api.functions.analytics.getUpcomingPayments)`. Exposes: payments array, periodDays, setPeriodDays (7|14|30), loading state.
- [x] T025 [US3] Create upcoming payments table component in `src/domains/payables/components/upcoming-payments-table.tsx` — period filter buttons (7/14/30 days), table with columns: Vendor Name, Amount (original currency), Home Currency Amount, Due Date, Days Remaining. Overdue entries at top with `text-destructive` styling and overdue badge. Positive days = "X days" in `text-muted-foreground`. "Record Payment" action per row. Empty state: "No payments due in the next X days." Uses `formatCurrency()` and `formatBusinessDate()`.

**Checkpoint**: Upcoming payments table shows correct entries per filter period. Overdue entries appear first with visual indicator.

---

## Phase 6: User Story 4 — Quick Payment Recording (Priority: P1)

**Goal**: Business owners can record full or partial payments against pending/overdue payables in under 3 clicks.

**Independent Test**: Open a pending entry → click "Record Payment" → amount pre-filled with full balance → submit → status changes to "paid". Repeat with partial amount → status stays "pending" with reduced balance.

### Implementation for User Story 4

- [x] T026 [US4] Create use-payment-recorder hook in `src/domains/payables/hooks/use-payment-recorder.ts` — wraps `useMutation(api.functions.accountingEntries.recordPayment)`. Exposes: recordPayment(entryId, amount, paymentDate, paymentMethod, notes), isRecording, error. Handles optimistic updates.
- [x] T027 [US4] Create payment recorder dialog component in `src/domains/payables/components/payment-recorder-dialog.tsx` — modal dialog with fields: Amount (pre-filled with outstanding balance, editable for partial), Payment Date (default today, date picker), Payment Method (dropdown: bank_transfer, cash, cheque, card, other), Notes (optional). Shows entry context: vendor name, original amount, outstanding balance, entry reference. Primary action button: "Record Payment" (`bg-primary`). Cancel: `bg-secondary`. Validation: amount > 0 and <= outstanding balance. On success: close dialog, show toast confirmation.

**Checkpoint**: Payment recording works for both full and partial payments. Status updates correctly. Entry disappears from outstanding views when fully paid.

---

## Phase 7: User Story 5 — Overdue AP Auto-Detection (Priority: P1)

**Goal**: System automatically marks overdue pending payables daily. No frontend changes needed — fully covered by Phase 2 backend (T010 + T017).

**Independent Test**: Create a pending Expense entry with dueDate in the past → trigger the cron via Convex dashboard → verify status changes to "overdue" and an Action Center insight is generated.

> **Note**: This user story is fully implemented in Phase 2 (Foundational) — T010 creates the `markOverduePayables` mutation, T017 registers the cron job, T018 deploys it. The overdue insights appear in the existing ProactiveActionCenter widget. No additional frontend tasks required.

**Checkpoint**: Overdue cron is registered and functional. Newly overdue entries generate Action Center insights.

---

## Phase 8: User Story 6 — Vendor Spend Analytics (Priority: P2)

**Goal**: Business owners see top vendors by spend, spend by category, and monthly spend trends for a selectable period.

**Independent Test**: Create 10+ Expense/COGS entries across 5 vendors and 3 categories → view spend analytics → verify top vendors ranking, category percentages, and monthly trend chart display correctly.

### Implementation for User Story 6

- [x] T028 [US6] Create use-spend-analytics hook in `src/domains/payables/hooks/use-spend-analytics.ts` — wraps `useQuery(api.functions.analytics.getVendorSpendAnalytics)`. Exposes: topVendors, categoryBreakdown, monthlyTrend, totalSpend, periodDays, setPeriodDays (30|90|365), loading state.
- [x] T029 [P] [US6] Create top vendors chart component in `src/domains/payables/components/spend-analytics/top-vendors-chart.tsx` — horizontal bar chart showing top 10 vendors by spend. Each bar shows vendor name, spend amount (`formatCurrency()`), transaction count, and % of total. Period selector (30/90/365 days) at top. Use semantic tokens for chart colors.
- [x] T030 [P] [US6] Create category breakdown chart component in `src/domains/payables/components/spend-analytics/category-breakdown.tsx` — donut or pie chart showing spend by category. Each slice shows category name, total, and percentage. Legend below chart.
- [x] T031 [P] [US6] Create spend trend chart component in `src/domains/payables/components/spend-analytics/spend-trend.tsx` — line chart showing monthly spend aggregation for last 12 months. X-axis: months (MMM YY). Y-axis: spend amount in home currency. Single line with data points.

**Checkpoint**: All three analytics charts render with correct data. Period selector updates all charts simultaneously.

---

## Phase 9: User Story 7 — Price Increase Detection Alerts (Priority: P2)

**Goal**: Invoice review shows inline price change alerts when line item prices exceed historical thresholds.

**Independent Test**: Record 3 price observations for "Widget X" from Vendor A at SGD 10.00 → process new invoice with "Widget X" at SGD 11.50 → verify "+15% warning" badge appears next to line item.

### Implementation for User Story 7

- [x] T032 [US7] Create use-price-intelligence hook in `src/domains/payables/hooks/use-price-intelligence.ts` — wraps `useQuery(api.functions.vendorPriceHistory.detectPriceChanges)` and `useQuery(api.functions.vendorPriceHistory.getCrossVendorComparison)`. Accepts vendorId + lineItems. Exposes: priceAlerts (per line item with alertLevel + percentChange + cheaperVendor), loading state.
- [x] T033 [US7] Create price alert badge component in `src/domains/payables/components/price-intelligence/price-alert-badge.tsx` — inline badge shown next to line items during invoice review. Displays: "Price +X% vs last order". Color-coded by alertLevel: `text-blue-500` (info), `text-amber-500` (warning), `text-destructive` (alert). Shows "insufficient data" tooltip when < 2 observations. Compact design to fit within line item rows.

**Checkpoint**: Price alerts appear correctly during invoice review with appropriate severity coloring.

---

## Phase 10: User Story 8 — Cross-Vendor Price Comparison (Priority: P2)

**Goal**: Invoice review shows when cheaper alternatives exist from other vendors for the same item.

**Independent Test**: Record price for "A4 Paper" from Vendor A (SGD 12.00) and Vendor B (SGD 10.50) → review new invoice from Vendor A for "A4 Paper" → verify note: "Vendor B offers this for 12.5% less".

### Implementation for User Story 8

- [x] T034 [US8] Create vendor comparison note component in `src/domains/payables/components/price-intelligence/vendor-comparison-note.tsx` — displays below price alert badge when a cheaper vendor exists. Shows: "Vendor [name] offers this for X% less (currency price)". Links to vendor name. Only shown when current vendor is NOT the cheapest. Uses `text-muted-foreground` styling with a subtle savings icon.

**Checkpoint**: Cross-vendor comparisons appear correctly during invoice review when cheaper alternatives exist.

---

## Phase 11: User Story 9 — Dedicated AP Dashboard (Priority: P2)

**Goal**: Business owners have a single page showing all AP information: summary cards, vendor aging, upcoming payments, spend analytics, and recent activity.

**Independent Test**: Navigate to `/en/payables` → verify summary cards show correct totals → verify aged payables table, upcoming payments, and spend charts all render.

**Dependencies**: Requires components from US2 (T022-T023), US3 (T024-T025), US4 (T027), US6 (T028-T031) to be complete.

### Implementation for User Story 9

- [x] T035 [US9] Create summary cards component in `src/domains/payables/components/summary-cards.tsx` — four KPI cards: Total Outstanding, Amount Overdue, Due This Week, Due This Month. All amounts in home currency via `formatCurrency()`. Uses `bg-card` background, card icons. Overdue card uses `text-destructive` styling. Mirrors existing KPI card pattern from `complete-dashboard.tsx`.
- [x] T036 [US9] Create AP dashboard layout in `src/domains/payables/components/ap-dashboard.tsx` — composes: SummaryCards (top row) → VendorAgingTable (full width) → two-column grid: UpcomingPaymentsTable + TopVendorsChart → SpendTrendChart (full width) → CategoryBreakdown. Uses Suspense boundaries with ComponentLoader fallback (matching analytics dashboard pattern). Passes businessId and homeCurrency down.
- [x] T037 [US9] Create AP dashboard page at `src/app/[locale]/payables/page.tsx` — server component that renders APDashboard client component. Restrict to finance admin role (matching invoices page pattern). Set page title/metadata.
- [x] T038 [US9] Add Payables navigation item to sidebar in `src/components/ui/sidebar.tsx` — add to `financeGroup` array after "Transactions" entry. Icon: `CreditCard` from lucide-react. Label: "Payables". Href: `/${locale}/payables`. Admin-only visibility.

**Checkpoint**: AP dashboard page is accessible from sidebar. All widgets render with real data. Summary cards show correct totals.

---

## Phase 12: User Story 10 — Enhanced Invoice Review with Vendor Context (Priority: P2)

**Goal**: OCR invoice review shows vendor payment terms, outstanding balance, unpaid bill count, price alerts, and cross-vendor comparisons. "Create Record" relabeled to "Create Payable".

**Independent Test**: Upload an invoice from a vendor with "Net 30" terms and 3 unpaid bills → review screen shows vendor terms, "3 unpaid bills — MYR X outstanding", price alerts on line items → click "Create Payable" → accounting entry created with correct due date.

**Dependencies**: Requires US1 (T019-T020 vendor profile), US7 (T033 price badge), US8 (T034 comparison note) components to be complete.

### Implementation for User Story 10

- [x] T039 [P] [US10] Add vendor context panel to invoice documents list in `src/domains/invoices/components/documents-list.tsx` — when a document has a matched vendor, show a collapsible context section: vendor payment terms, outstanding balance (`formatCurrency()`), unpaid bill count. Uses `useQuery(api.functions.vendors.getVendorContext)`. Only visible when vendor is identified from OCR. Compact design within existing document row or analysis modal.
- [x] T040 [P] [US10] Enhance accounting entry form modal in `src/domains/accounting-entries/components/accounting-entry-edit-modal.tsx` — (1) auto-calculate dueDate from vendor payment terms when creating from invoice (use precedence: invoice due date > vendor terms > 30-day default), (2) relabel "Create Record" button to "Create Payable" when source is invoice, (3) show price alert badges (PriceAlertBadge + VendorComparisonNote) next to line items when vendor price history data available.
- [x] T041 [P] [US10] Enhance document-to-accounting-entry mapper in `src/domains/invoices/lib/document-to-accounting-entry-mapper.ts` — when mapping OCR data to accounting entry, look up vendor's payment terms and calculate dueDate. Add vendorId to mapped data if vendor is matched. Maintain backward compatibility with existing mapping logic.

**Checkpoint**: Invoice review shows vendor context. Due dates auto-calculate from vendor terms. Price intelligence badges appear on line items. "Create Payable" label is used.

---

## Phase 13: Polish & Build Verification

**Purpose**: Final build check, deployment, and cleanup

- [x] T042 Run `npm run build` and fix all TypeScript errors — repeat until clean build
- [x] T043 Run `npx convex deploy --yes` — final production deploy (if any functions changed during frontend work)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 for domain structure — BLOCKS all user stories
- **User Stories (Phase 3-12)**: All depend on Phase 2 backend completion (T018 deploy)
  - P1 stories (US1-US5) can proceed in parallel
  - P2 stories (US6-US8) can proceed in parallel with each other and with P1
  - US9 (Dashboard) depends on: US2 + US3 + US6 components
  - US10 (Invoice Review) depends on: US1 + US7 + US8 components
- **Polish (Phase 13)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 2 (Backend)
    │
    ├── US1 (Vendor Profile) ─────────────────────┐
    ├── US2 (Creditor Aging) ──────────┐           │
    ├── US3 (Upcoming Payments) ───────┤           │
    ├── US4 (Payment Recording)        │           │
    ├── US5 (Overdue Detection) ✅     │           │
    ├── US6 (Spend Analytics) ─────────┤           │
    ├── US7 (Price Alerts) ────────────┼───────────┤
    ├── US8 (Price Comparison) ────────┼───────────┤
    │                                  │           │
    │                          US9 (Dashboard) ◄───┘ (composes US2+US3+US6)
    │                                  │
    └──────────────────────── US10 (Invoice Review) (uses US1+US7+US8)
```

### Within Each User Story

- Hook task before component tasks (hook provides data)
- Standalone/presentational components can be [P] parallel
- Integration components depend on their sub-components

### Parallel Opportunities

**Cross-story parallelism** (once Phase 2 is complete):

```
Agent 1: US1 (T019-T020) → US9 (T035-T038)
Agent 2: US2 (T021-T023) → US10 (T039-T041)
Agent 3: US3 (T024-T025) + US4 (T026-T027)
Agent 4: US6 (T028-T031) + US7 (T032-T033) + US8 (T034)
```

**Within-story parallelism**:
- US1: T019 [P] can run while T020 is being built
- US6: T029, T030, T031 [P] all run in parallel after T028
- US10: T039, T040, T041 [P] all modify different files

---

## Parallel Example: Phase 2 Backend

```bash
# These pairs modify different files and can run in parallel:
# Pair 1: convex/functions/vendors.ts (T007, T008)
# Pair 2: convex/functions/accountingEntries.ts (T009, T010)
# These run in parallel ↑

# Then:
# Pair 3: convex/functions/analytics.ts (T011-T014) — sequential within file
# Pair 4: convex/functions/vendorPriceHistory.ts (T015-T016) — sequential within file
# Pairs 3 and 4 run in parallel ↑

# Then T017 (cron) → T018 (deploy)
```

## Parallel Example: User Story 6

```bash
# First: create hook (required by all charts)
Task T028: "Create use-spend-analytics hook"

# Then: all three charts in parallel (different files)
Task T029: "Create top vendors chart"      # [P]
Task T030: "Create category breakdown"     # [P]
Task T031: "Create spend trend chart"      # [P]
```

---

## Implementation Strategy

### MVP First (User Stories 1-5 — P1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational backend (T003-T018)
3. Complete Phase 3: US1 — Vendor Payment Terms (T019-T020)
4. Complete Phase 4: US2 — Creditor Aging (T021-T023)
5. Complete Phase 5: US3 — Upcoming Payments (T024-T025)
6. Complete Phase 6: US4 — Payment Recording (T026-T027)
7. Phase 7: US5 already done in Phase 2
8. **STOP and VALIDATE**: All P1 stories independently functional
9. Run `npm run build` to verify

### Incremental Delivery (Add P2 Features)

10. Add US6: Spend Analytics (T028-T031)
11. Add US7: Price Alerts (T032-T033)
12. Add US8: Price Comparison (T034)
13. Add US9: AP Dashboard (T035-T038) — composes all previous
14. Add US10: Enhanced Invoice Review (T039-T041) — enriches existing flow
15. Polish: Build + Deploy (T042-T043)

### Single Developer Sequential Path

T001 → T002 → T003-T018 (all backend) → T019-T020 (US1) → T021-T023 (US2) → T024-T025 (US3) → T026-T027 (US4) → T028-T031 (US6) → T032-T033 (US7) → T034 (US8) → T035-T038 (US9) → T039-T041 (US10) → T042-T043 (Polish)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- US5 (Overdue Detection) has no frontend tasks — fully implemented in Phase 2 backend
- US9 (Dashboard) is a composition layer — it composes widgets from US2, US3, US6. Build those first.
- US10 (Invoice Review) modifies existing files — higher risk of merge conflicts. Do last.
- All schema changes are optional fields — backward compatible with existing data
- Remember to use semantic design tokens (bg-card, text-foreground) — never hardcode colors
- Use `formatCurrency()` for all monetary amounts, `formatBusinessDate()` for all dates
- Action buttons must use `bg-primary hover:bg-primary/90 text-primary-foreground`
