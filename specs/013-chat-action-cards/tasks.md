# Tasks: Chat Action Cards Expansion

**Input**: Design documents from `/specs/013-chat-action-cards/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/action-card-schemas.ts, quickstart.md

**Tests**: Not requested — no unit test framework for action cards. Verified via manual E2E chat widget testing.

**Organization**: Tasks are grouped by user story (US1–US8) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/` at repository root (Next.js monolith)
- Action cards: `src/domains/chat/components/action-cards/`
- Agent config: `src/lib/ai/agent/config/`
- Chat lib: `src/domains/chat/lib/`

---

## Phase 1: Setup

**Purpose**: Verify existing patterns and understand the 3-step card creation workflow.

- [x] T001 Review existing card pattern by reading `src/domains/chat/components/action-cards/expense-approval-card.tsx` (stateful card with mutation) and `src/domains/chat/components/action-cards/spending-chart.tsx` (read-only card with CSS charts) to confirm: registry import, data interface, registerActionCard call, isHistorical handling, semantic design tokens

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No blocking infrastructure needed — the action card registry, SSE streaming, and Convex mutations all exist.

**⚠️ NOTE**: All infrastructure is in place. Proceed directly to user story phases.

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Post OCR Invoice to Accounting (Priority: P1) 🎯 MVP

**Goal**: Render an interactive invoice_posting card from OCR-extracted invoice data with a "Post to Accounting" button that creates an accounting entry via `accountingEntries.create()`.

**Independent Test**: Ask "Show my recently processed invoices" or "Any invoices ready to post?" → card renders with vendor, amount, currency, date, confidence score, line items → click "Post to Accounting" → inline confirmation → accounting entry created → card shows "Posted" badge.

### Implementation for User Story 1

- [x] T002 [US1] Create invoice posting card component in `src/domains/chat/components/action-cards/invoice-posting-card.tsx`: define `InvoicePostingData` interface (per `contracts/action-card-schemas.ts`), implement state machine (ready → confirming → posting → posted/failed), use `useMutation(api.functions.accountingEntries.create)` with fields `{businessId, transactionType: "expense", originalAmount, originalCurrency, transactionDate, vendorName, lineItems, sourceRecordId: invoiceId, sourceDocumentType: "invoice", createdByMethod: "ocr"}`, show confidence warning badge when `confidenceScore < 0.7`, render "Posted" status badge with no buttons when `isHistorical`, call `registerActionCard('invoice_posting', InvoicePostingCard)` at module level
- [x] T003 [US1] Register invoice_posting card in `src/domains/chat/components/action-cards/index.tsx`: add `import './invoice-posting-card'` to the side-effect imports block
- [x] T004 [US1] Add invoice_posting emission rules to the ACTION CARD GENERATION PROTOCOL section in `src/lib/ai/agent/config/prompts.ts`: add numbered entry "5. **invoice_posting**" with trigger keywords ("Show invoices ready to post", "Any invoices ready to post?"), data schema (invoiceId, vendorName, amount, currency, invoiceDate, confidenceScore, lineItems, status: "ready"), and instruction to only emit when invoices have status "completed" with extractedData

**Checkpoint**: Invoice posting card is fully functional and testable independently.

---

## Phase 4: User Story 2 — Cash Flow Dashboard in Chat (Priority: P1)

**Goal**: Render a read-only cash_flow_dashboard card showing runway days, burn rate, projected balance, expense ratio, and severity-coded alert badges from the `analyze_cash_flow` tool result.

**Independent Test**: Ask "What's my cash flow situation?" or "How many days of runway do I have?" → dashboard card renders with 2x2 metric grid, alert badges, forecast period label.

### Implementation for User Story 2

- [x] T005 [P] [US2] Create cash flow dashboard card component in `src/domains/chat/components/action-cards/cash-flow-dashboard.tsx`: define `CashFlowDashboardData` interface (per `contracts/action-card-schemas.ts`), implement 2x2 metric grid layout (runway days, monthly burn rate, estimated balance, expense-to-income ratio), format numbers with `formatCurrency` from `@/lib/utils/format-number`, render alert badges with severity colors (critical=red, high=yellow, medium=blue), display forecast period label, read-only card (no mutations/state machine), `isHistorical` shows same layout, call `registerActionCard('cash_flow_dashboard', CashFlowDashboard)` at module level
- [x] T006 [US2] Register cash_flow_dashboard card in `src/domains/chat/components/action-cards/index.tsx`: add `import './cash-flow-dashboard'` to the side-effect imports block
- [x] T007 [US2] Add cash_flow_dashboard emission rules to ACTION CARD GENERATION PROTOCOL in `src/lib/ai/agent/config/prompts.ts`: add numbered entry "6. **cash_flow_dashboard**" with trigger keywords ("What's my cash flow?", "How many days of runway?", "Show cash flow"), data schema (runwayDays, monthlyBurnRate, estimatedBalance, totalIncome, totalExpenses, expenseToIncomeRatio, currency, forecastPeriod, alerts[]), instruction to emit after `analyze_cash_flow` tool returns structured data

**Checkpoint**: Cash flow dashboard card is fully functional and testable independently.

---

## Phase 5: User Story 3 — Tax & Compliance Alert Card (Priority: P2)

**Goal**: Render a compliance_alert card from RAG/Qdrant regulatory knowledge base results, showing country, authority, topic, requirements list, severity badge, and clickable citation links that open the existing citation overlay.

**Independent Test**: Ask "What are the GST registration requirements in Singapore?" → compliance_alert card renders with SG/IRAS header, requirements list, citation links → clicking a citation opens the CitationOverlay component.

### Implementation for User Story 3

- [x] T008 [US3] Create compliance alert card component in `src/domains/chat/components/action-cards/compliance-alert-card.tsx`: define `ComplianceAlertData` interface (per `contracts/action-card-schemas.ts`), render country flag emoji + authority header, severity badge (action_required=red, warning=yellow, for_information=blue), requirements as bullet list, citation links as clickable superscript buttons matching existing citation style in `message-renderer.tsx`, accept `onCitationClick` callback prop for citation interaction, `isHistorical` renders same layout (read-only, no mutations), call `registerActionCard('compliance_alert', ComplianceAlertCard)` at module level
- [x] T009 [US3] Wire citation click handler to compliance_alert cards in `src/domains/chat/components/message-renderer.tsx`: in the `actionCards` useMemo, pass `handleCitationClick` to card components via the `action.data` or as an additional prop — add optional `onCitationClick` to the CardComponent render call so compliance_alert can invoke the existing citation overlay
- [x] T010 [US3] Register compliance_alert card in `src/domains/chat/components/action-cards/index.tsx`: add `import './compliance-alert-card'` to the side-effect imports block
- [x] T011 [US3] Add compliance_alert emission rules to ACTION CARD GENERATION PROTOCOL in `src/lib/ai/agent/config/prompts.ts`: add numbered entry "7. **compliance_alert**" with trigger keywords ("GST registration", "tax compliance", "regulatory requirements"), data schema (country, countryCode, authority, topic, severity, requirements[], citationIndices[], effectiveDate, source), instruction to emit after `searchRegulatoryKnowledgeBase` or `analyze_cross_border_compliance` tool returns results with citations

**Checkpoint**: Compliance alert card is fully functional with citation overlay integration.

---

## Phase 6: User Story 4 — Budget Alert Card (Priority: P2)

**Goal**: Render a budget_alert card showing current month spending vs. rolling 3-month historical average per category, with CSS progress bars and color-coded status indicators (green/yellow/red).

**Independent Test**: Ask "Am I overspending this month?" or "Show my spending vs. average" → budget_alert card renders with category rows showing progress bars, status labels, and overall spending health.

### Implementation for User Story 4

- [x] T012 [P] [US4] Create budget alert card component in `src/domains/chat/components/action-cards/budget-alert-card.tsx`: define `BudgetAlertData` and `BudgetCategory` interfaces (per `contracts/action-card-schemas.ts`), render period header with overall status badge (on_track=green, above_average=yellow, overspending=red), category rows with name + CSS progress bars (bar width = `Math.min(percentOfAverage, 150)%` of container), per-category status label, format amounts with `formatCurrency`, show total summary row, read-only card, `isHistorical` renders same layout, call `registerActionCard('budget_alert', BudgetAlertCard)` at module level
- [x] T013 [US4] Register budget_alert card in `src/domains/chat/components/action-cards/index.tsx`: add `import './budget-alert-card'` to the side-effect imports block
- [x] T014 [US4] Add budget_alert emission rules to ACTION CARD GENERATION PROTOCOL in `src/lib/ai/agent/config/prompts.ts`: add numbered entry "8. **budget_alert**" with trigger keywords ("Am I overspending?", "Budget status", "Spending vs. average"), data schema (period, currency, categories[{name, currentSpend, averageSpend, percentOfAverage, status}], totalCurrentSpend, totalAverageSpend, overallStatus), instruction to fetch 4 months via `get_transactions`, aggregate by category, compute rolling 3-month average, classify status at 80%/100% thresholds

**Checkpoint**: Budget alert card is fully functional and testable independently.

---

## Phase 7: User Story 5 — Rich Content Panel for Complex Visualizations (Priority: P2)

**Goal**: Wire the existing `rich-content-panel.tsx` to action cards via a "View Details" button, allowing data-heavy cards to open an expanded side panel alongside the chat.

**Independent Test**: Ask "What's my cash flow situation?" → cash_flow_dashboard card renders with a "View Details" button → clicking it opens a slide-out panel with expanded metrics.

### Implementation for User Story 5

- [x] T015 [US5] Add optional `onViewDetails` callback to `ActionCardProps` in `src/domains/chat/components/action-cards/registry.ts`: extend the `ActionCardProps` interface with `onViewDetails?: (payload: { type: 'chart' | 'table' | 'dashboard'; title: string; data: unknown }) => void`
- [x] T016 [US5] Add rich content panel state and callback in `src/domains/chat/components/chat-window.tsx`: add `richContentData` state (null | RichContentPayload), create `handleViewDetails` callback that sets richContentData, render `<RichContentPanel>` conditionally when richContentData is non-null, pass `onClose` handler to clear state
- [x] T017 [US5] Forward `onViewDetails` callback to action card components in `src/domains/chat/components/message-renderer.tsx`: accept `onViewDetails` in `MessageRendererProps`, thread it into the `actionCards` useMemo so each `<CardComponent>` receives it as a prop
- [x] T018 [US5] Update `src/domains/chat/components/rich-content-panel.tsx`: ensure the component accepts the `RichContentPayload` shape and renders chart/table/dashboard types, add close button handler, verify it positions as a slide-out panel alongside the chat widget
- [x] T019 [US5] Add "View Details" button to `cash-flow-dashboard.tsx` and `budget-alert-card.tsx`: when `onViewDetails` is provided, render a small "View Details" link/button in the card footer that calls `onViewDetails({ type: 'dashboard', title: '...', data: cardData })`

**Checkpoint**: Rich content panel opens from cards and displays expanded visualizations.

---

## Phase 8: User Story 6 — Time-Series Spending Charts (Priority: P3)

**Goal**: Render a spending_time_series card with period-labeled vertical bar groups, multi-category display, and trend indicators using pure CSS.

**Independent Test**: Ask "Show spending trends for the last 6 months" → time-series chart renders with monthly bars, category colors, trend arrow in header.

### Implementation for User Story 6

- [x] T020 [P] [US6] Create time-series spending chart in `src/domains/chat/components/action-cards/spending-time-series.tsx`: define `SpendingTimeSeriesData` interface (per `contracts/action-card-schemas.ts`), render header with title + trend indicator (arrow + percentage), vertical bar groups per period with category stacking using CSS (reuse `BAR_COLORS` from spending-chart.tsx pattern), period labels below bars, optional category legend, read-only card, `isHistorical` renders same layout, call `registerActionCard('spending_time_series', SpendingTimeSeries)` at module level
- [x] T021 [US6] Register spending_time_series card in `src/domains/chat/components/action-cards/index.tsx`: add `import './spending-time-series'` to the side-effect imports block
- [x] T022 [US6] Add spending_time_series emission rules to ACTION CARD GENERATION PROTOCOL in `src/lib/ai/agent/config/prompts.ts`: add numbered entry "9. **spending_time_series**" with trigger keywords ("Spending trends", "Show spending over time", "Monthly spending comparison"), data schema (chartType: "time_series", title, currency, periods[{label, total, categories[]}], trendPercent, trendDirection), instruction to use `get_transactions` for multi-month data and group by period

**Checkpoint**: Time-series spending chart is fully functional.

---

## Phase 9: User Story 7 — Bulk Expense Approval / Invoice Posting (Priority: P3)

**Goal**: When 2+ approval-type cards (expense_approval or invoice_posting) are displayed, render a bulk action bar with checkboxes and batch approve/reject functionality with per-item progress tracking.

**Independent Test**: Have 3+ pending expenses, ask "Show all pending expenses" → multiple expense_approval cards render → select-all checkbox and "Approve Selected" bar appear → approve all → each card updates status individually.

### Implementation for User Story 7

- [x] T023 [P] [US7] Create bulk action bar wrapper component in `src/domains/chat/components/action-cards/bulk-action-bar.tsx`: define `BulkActionBarProps` with `actions: ChatAction[]`, `cardType: string`, `isHistorical: boolean`, manage selection state (Set of action IDs), render checkboxes per card + "Select All" toggle, render floating action bar with "Approve Selected (N)" / "Reject Selected (N)" buttons, show inline confirmation before execution, process mutations sequentially with per-item status (pending/processing/done/failed), handle partial failure with success/fail count summary + "Retry Failed" button
- [x] T024 [US7] Integrate bulk action bar in `src/domains/chat/components/message-renderer.tsx`: in the `actionCards` useMemo, detect when 2+ actions of the same approval type exist (expense_approval or invoice_posting), wrap those cards in `<BulkActionBar>` instead of rendering individually, pass `isHistorical` to disable bulk selection on historical messages
- [x] T025 [US7] Add "Approve Selected" and "Reject Selected" mutation logic in `src/domains/chat/components/action-cards/bulk-action-bar.tsx`: use `useMutation(api.functions.expenseSubmissions.approve)` for expense_approval type, use `useMutation(api.functions.accountingEntries.create)` for invoice_posting type, execute selected items sequentially with `await` between each to avoid Convex rate limits, update per-item status indicator on each completion

**Checkpoint**: Bulk actions process multiple items with clear progress feedback.

---

## Phase 10: User Story 8 — Export Data from Cards (Priority: P3)

**Goal**: Add a CSV export button to data-presenting cards (spending_chart, vendor_comparison, budget_alert) that generates and downloads a CSV file.

**Independent Test**: Ask "Show spending by category" → spending_chart card renders with a small download icon → click it → CSV file downloads with category names and amounts.

### Implementation for User Story 8

- [x] T026 [P] [US8] Create CSV export utility in `src/domains/chat/lib/csv-export.ts`: implement `exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void` that generates a CSV string with proper escaping (quotes around strings containing commas), creates a Blob with `text/csv` MIME type, triggers download via temporary `<a>` element, format numbers as plain values (no locale formatting) for spreadsheet compatibility
- [x] T027 [P] [US8] Add export button to `src/domains/chat/components/action-cards/spending-chart.tsx`: import `exportToCSV` from `../../lib/csv-export`, add a small `Download` icon button (from lucide-react) in the card header, on click call `exportToCSV('spending-breakdown.csv', ['Category', 'Amount', 'Percentage'], rows)` mapping card data to rows
- [x] T028 [P] [US8] Add export button to `src/domains/chat/components/action-cards/vendor-comparison-card.tsx`: import `exportToCSV`, add `Download` icon button in card header, call `exportToCSV('vendor-comparison.csv', ['Vendor', 'Avg Price', 'Transactions', 'Total Spend'], rows)` mapping vendor metrics to rows
- [x] T029 [US8] Add export button to `src/domains/chat/components/action-cards/budget-alert-card.tsx`: import `exportToCSV`, add `Download` icon button in card header, call `exportToCSV('budget-alert.csv', ['Category', 'Current Spend', 'Average Spend', '% of Average', 'Status'], rows)` mapping budget categories to rows (depends on T012 being complete)

**Checkpoint**: CSV export works on all data-presenting cards.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final consolidation, build verification, and manual testing.

- [x] T030 Consolidate and verify all card type emission rules in the ACTION CARD GENERATION PROTOCOL section of `src/lib/ai/agent/config/prompts.ts`: ensure entries 1–9 are numbered correctly, data schemas match `contracts/action-card-schemas.ts`, trigger keywords are distinct, rules section updated for new card types
- [x] T031 Run `npm run build` and fix any TypeScript errors until build passes with zero errors
- [x] T032 Manual chat testing per `specs/013-chat-action-cards/quickstart.md`: test each card type with suggested prompts, verify historical message rendering (reload + scroll), verify citation overlay from compliance_alert, verify CSV export download

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Nothing to do — all infrastructure exists
- **US1 (Phase 3)**: Can start immediately — no dependencies on other stories
- **US2 (Phase 4)**: Can start immediately — no dependencies on other stories
- **US3 (Phase 5)**: Can start immediately — depends on understanding citation handler in message-renderer.tsx
- **US4 (Phase 6)**: Can start immediately — no dependencies on other stories
- **US5 (Phase 7)**: Depends on US2 (T005) and US4 (T012) being complete (adds "View Details" to those cards in T019)
- **US6 (Phase 8)**: Can start immediately — no dependencies on other stories
- **US7 (Phase 9)**: Depends on US1 (T002) being complete (bulk action wraps invoice_posting cards)
- **US8 (Phase 10)**: T026-T028 can start immediately; T029 depends on US4 (T012) being complete
- **Polish (Phase 11)**: Depends on all story phases being complete

### User Story Dependencies

- **US1 (P1)**: Independent — start after Phase 1
- **US2 (P1)**: Independent — start after Phase 1, parallelizable with US1 (different files)
- **US3 (P2)**: Independent — modifies `message-renderer.tsx` (T009), coordinate with US7 (T024) which also modifies this file
- **US4 (P2)**: Independent — start after Phase 1
- **US5 (P2)**: Depends on US2 + US4 (for "View Details" in T019). Modifies `registry.ts`, `chat-window.tsx`, `message-renderer.tsx`
- **US6 (P3)**: Independent — start after Phase 1
- **US7 (P3)**: Depends on US1 (invoice_posting card must exist). Modifies `message-renderer.tsx`
- **US8 (P3)**: T029 depends on US4 (budget_alert card must exist). T027-T028 modify existing cards.

### Within Each User Story

- Card component created FIRST (T00X)
- Registration in index.tsx SECOND (T00Y) — same file modified by multiple stories, do sequentially
- Prompt update THIRD (T00Z) — same file modified by multiple stories, do sequentially

### Shared File Coordination

These files are modified by multiple user stories — tasks touching the same file must run sequentially:

| File | Modified by tasks |
|------|-------------------|
| `action-cards/index.tsx` | T003, T006, T010, T013, T021 |
| `prompts.ts` | T004, T007, T011, T014, T022, T030 |
| `message-renderer.tsx` | T009, T017, T024 |
| `chat-window.tsx` | T016 |
| `registry.ts` | T015 |

### Parallel Opportunities

Tasks creating different files can run in parallel:
- T002 (invoice-posting) ∥ T005 (cash-flow-dashboard) ∥ T008 (compliance-alert) ∥ T012 (budget-alert) ∥ T020 (time-series) ∥ T023 (bulk-action) ∥ T026 (csv-export)

---

## Parallel Example: P1 Cards (US1 + US2)

```text
# These create different files — run in parallel:
T002: Create invoice-posting-card.tsx
T005: Create cash-flow-dashboard.tsx

# Then run registration sequentially (same file: index.tsx):
T003: Register invoice_posting in index.tsx
T006: Register cash_flow_dashboard in index.tsx

# Then run prompt updates sequentially (same file: prompts.ts):
T004: Add invoice_posting to prompts.ts
T007: Add cash_flow_dashboard to prompts.ts
```

## Parallel Example: P2 Cards (US3 + US4)

```text
# These create different files — run in parallel:
T008: Create compliance-alert-card.tsx
T012: Create budget-alert-card.tsx

# Then sequentially:
T009: Wire citation handler in message-renderer.tsx
T010: Register compliance_alert in index.tsx
T013: Register budget_alert in index.tsx
T011: Add compliance_alert to prompts.ts
T014: Add budget_alert to prompts.ts
```

## Parallel Example: P3 Features (US6 + US7 + US8)

```text
# These create different files — run in parallel:
T020: Create spending-time-series.tsx
T023: Create bulk-action-bar.tsx
T026: Create csv-export.ts
T027: Add export to spending-chart.tsx
T028: Add export to vendor-comparison-card.tsx

# Then sequentially:
T021: Register spending_time_series in index.tsx
T024: Integrate bulk action bar in message-renderer.tsx
T029: Add export to budget-alert-card.tsx
T022: Add spending_time_series to prompts.ts
T025: Add mutation logic to bulk-action-bar.tsx (extends T023)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (review patterns)
2. Complete Phase 3: User Story 1 — Invoice Posting Card
3. Complete Phase 4: User Story 2 — Cash Flow Dashboard
4. **STOP and VALIDATE**: Test both cards independently in chat widget
5. Build passes → ready for demo

### Incremental Delivery

1. US1 + US2 (P1 cards) → Test → Build ✅ **MVP**
2. US3 + US4 (P2 cards) → Test → Build ✅
3. US5 (Rich panel) → Test → Build ✅
4. US6 + US7 + US8 (P3 features) → Test → Build ✅
5. Phase 11 (Polish) → Final build verification ✅

### Recommended Execution Order (Single Developer)

```text
T001 → T002 → T003 → T004 → T005 → T006 → T007          # P1 MVP
     → T008 → T009 → T010 → T011                          # US3
     → T012 → T013 → T014                                  # US4
     → T015 → T016 → T017 → T018 → T019                   # US5
     → T020 → T021 → T022                                  # US6
     → T023 → T024 → T025                                  # US7
     → T026 → T027 → T028 → T029                           # US8
     → T030 → T031 → T032                                  # Polish
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- `index.tsx` and `prompts.ts` are shared files — tasks touching them must be sequential
- Commit after each completed user story (natural integration point)
- Stop at any checkpoint to validate story independently
- No Convex schema changes → no `npx convex deploy` needed
- All cards must use semantic design tokens only (bg-card, text-foreground, bg-primary)
