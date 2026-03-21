# Tasks: Multi-Currency Display & Historical Trend Analysis

**Input**: Design documents from `/specs/031-multi-curr-history-analysis/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — extending existing codebase.

- [ ] T001 Extend `resolveDateRange()` in `src/lib/ai/utils/date-range-resolver.ts` to support quarter references ("Q1 2025", "Q2", "last quarter", "this quarter") and year-over-year patterns ("Q1 2025 vs Q1 2026")

**Checkpoint**: Date resolver handles all period expressions needed by the trend tool.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Convex aggregation action and currency conversion helper — needed by ALL user stories.

**CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Create Convex action `analyzeTrends` in `convex/functions/trendAnalysis.ts` that:
  - Accepts `businessId`, `mode` (compare/trend/growth), `metric` (revenue/expenses/profit/cash_flow), date range params, optional `granularity`
  - Queries `journal_entries` (posted only) filtered by date range using `by_businessId` index
  - Queries `journal_entry_lines` using `by_business_account` index, filters by journal entry IDs
  - Aggregates amounts by account code ranges: revenue (4000-4999 credits), expenses (5000-5999 debits), profit (derived), cash_flow (1000-1099 net)
  - Groups by period (month/quarter/year) based on `transactionDate`
  - Returns `MetricPeriodData` structure per `data-model.md`
- [ ] T003 Create currency conversion helper function in `convex/functions/trendAnalysis.ts` that:
  - Takes an array of period amounts and a target currency
  - Uses `currencyService.getCurrentRate()` for the current exchange rate
  - Returns amounts with `convertedAmount` and `exchangeRate` fields populated
  - Handles missing exchange rates gracefully (returns home currency only with warning)
- [ ] T004 Run `npx convex deploy --yes` to deploy the new Convex action

**Checkpoint**: `analyzeTrends` action can aggregate journal data by period and metric. Currency conversion helper works.

---

## Phase 3: User Story 1 — View Financial Data in a Different Currency (Priority: P1) MVP

**Goal**: Users can ask the chat agent to show any financial metric in MYR, SGD, USD, or THB with dual-currency display.

**Independent Test**: Ask "Show revenue in USD" — agent displays "Revenue: RM20,059 (~ USD 4,456)"

### Implementation for User Story 1

- [ ] T005 [US1] Add optional `display_currency` parameter to `AnalyzeCashFlowTool` in `src/lib/ai/tools/analyze-cashflow-tool.ts`:
  - Add `display_currency` to `getToolSchema()` properties
  - In `executeInternal()`, if `display_currency` provided and differs from `homeCurrency`, call `currencyService.convertAmount()` for each numeric result field
  - Include both home and converted amounts in the tool result data
- [ ] T006 [P] [US1] Add optional `display_currency` parameter to `ARSummaryTool` in `src/lib/ai/tools/ar-summary-tool.ts` (same pattern as T005)
- [ ] T007 [P] [US1] Add optional `display_currency` parameter to `APAgingTool` in `src/lib/ai/tools/ap-aging-tool.ts` (same pattern as T005)
- [ ] T008 [P] [US1] Add optional `display_currency` parameter to `BusinessTransactionsTool` in `src/lib/ai/tools/business-transactions-tool.ts` (same pattern as T005)
- [ ] T009 [US1] Verify `npm run build` passes with all currency display changes

**Checkpoint**: All existing financial tools support optional `display_currency`. Agent shows dual-currency when requested.

---

## Phase 4: User Story 2 — Compare Financial Periods (Priority: P1)

**Goal**: Users can compare two time periods ("Compare Q1 2025 vs Q1 2026") and see absolute change, percentage change, and trend direction.

**Independent Test**: Ask "Compare Q1 2025 vs Q1 2026" — agent shows side-by-side comparison with change metrics and a comparison action card.

### Implementation for User Story 2

- [ ] T010 [US2] Create `AnalyzeTrendsTool` class in `src/lib/ai/tools/analyze-trends-tool.ts`:
  - Extends `BaseTool`
  - `getToolName()` returns `'analyze_trends'`
  - `getDescription()` explains comparison, trend, and growth rate capabilities
  - `getToolSchema()` returns the schema from `contracts/tool-schemas.md` (mode, metric, period_a, period_b, date_range, granularity, display_currency)
  - `validateParameters()` checks: mode is valid, required params per mode (compare needs period_a + period_b, trend needs date_range, growth needs metric)
  - `executeInternal()`:
    - Resolves date ranges using `resolveDateRange()` for period_a and period_b
    - Calls `convex.action(api.functions.trendAnalysis.analyzeTrends, ...)` with resolved dates
    - If `display_currency` provided, applies currency conversion to results
    - For compare mode: calculates absoluteChange, percentageChange, direction
    - Returns structured result with `actionCard: { type: 'trend_comparison_card', data: {...} }`
- [ ] T011 [US2] Register `analyze_trends` tool in `src/lib/ai/tools/tool-factory.ts`:
  - Add import for `AnalyzeTrendsTool`
  - Add `'analyze_trends'` to `ToolName` union type
  - Add `this.registerTool('analyze_trends', () => new AnalyzeTrendsTool())` in static initializer
  - Add `'analyze_trends'` to `MANAGER_TOOLS` set (manager + finance_admin + owner access)
- [ ] T012 [US2] Create `trend-comparison-card.tsx` action card in `src/domains/chat/components/action-cards/trend-comparison-card.tsx`:
  - Accept `ActionCardProps` with `TrendComparisonCardData` from contracts
  - For comparison mode (`chartType: 'comparison'`): render side-by-side period values with absolute change, percentage change badge, and trend arrow (TrendingUp/TrendingDown icons)
  - Display dual-currency amounts when `displayCurrency` is present: "RM20,059 (~ USD 4,456)"
  - Use semantic tokens: `bg-card`, `border-border`, `text-foreground`
  - Use `formatCurrency()` from `@/lib/utils/format-number`
  - Call `registerActionCard('trend_comparison_card', TrendComparisonCard)` at module level
- [ ] T013 [US2] Add import for `trend-comparison-card` in `src/domains/chat/components/action-cards/index.tsx`
- [ ] T014 [US2] Run `npx convex deploy --yes` and verify `npm run build` passes

**Checkpoint**: "Compare Q1 2025 vs Q1 2026" shows comparison card with change metrics.

---

## Phase 5: User Story 3 — View Financial Trends Over Time (Priority: P2)

**Goal**: Users can ask for multi-period trends ("6-month expense trend") and see a structured summary plus a chart action card.

**Independent Test**: Ask "Show 6-month expense trend" — agent shows monthly breakdown table with chart.

### Implementation for User Story 3

- [ ] T015 [US3] Extend `AnalyzeTrendsTool.executeInternal()` in `src/lib/ai/tools/analyze-trends-tool.ts` to handle `mode: 'trend'`:
  - Resolve `date_range` using `resolveDateRange()`
  - Call `analyzeTrends` action with granularity param
  - Calculate `overallDirection` and `overallChangePercent` from first vs last period
  - Return `actionCard` with `chartType: 'trend'` and periods array
- [ ] T016 [US3] Extend `trend-comparison-card.tsx` in `src/domains/chat/components/action-cards/trend-comparison-card.tsx` to handle trend mode:
  - For `chartType: 'trend'`: render CSS-based vertical bar chart (follow `spending-time-series.tsx` pattern)
  - Show period labels on x-axis, amounts on y-axis
  - Add structured text summary above chart: table with period, amount, and % change from previous
  - Show overall trend arrow and percentage in header
  - Support dual-currency display in each bar's tooltip/label
- [ ] T017 [US3] Verify `npm run build` passes

**Checkpoint**: "Show 6-month expense trend" renders monthly bars with trend summary.

---

## Phase 6: User Story 4 — Calculate Growth Rates (Priority: P2)

**Goal**: Users can ask "What is our revenue growth rate?" and get a clear percentage with context.

**Independent Test**: Ask "Revenue growth rate" — agent responds "Revenue grew 12% compared to Q1 last year"

### Implementation for User Story 4

- [ ] T018 [US4] Extend `AnalyzeTrendsTool.executeInternal()` in `src/lib/ai/tools/analyze-trends-tool.ts` to handle `mode: 'growth'`:
  - If no `period_a` specified, default to most recent complete quarter vs same quarter last year
  - Call `analyzeTrends` action in compare mode with the two resolved periods
  - Calculate growth rate percentage: `((current - previous) / previous) * 100`
  - Return structured result with `growthRate`, `currentPeriod`, `previousPeriod`
  - Include text context for the LLM: "Revenue grew/declined X% compared to [period]"
- [ ] T019 [US4] Verify `npm run build` passes

**Checkpoint**: "Revenue growth rate" returns accurate percentage with comparison context.

---

## Phase 7: User Story 5 — Multi-Currency Trend Comparison (Priority: P3)

**Goal**: Currency conversion composes with trends and comparisons ("Compare Q1 vs Q2 revenue in USD").

**Independent Test**: Ask "Compare Q1 vs Q2 revenue in USD" — both periods show MYR and USD amounts.

### Implementation for User Story 5

- [ ] T020 [US5] Verify `display_currency` parameter flows through all `analyze_trends` modes (compare, trend, growth) in `src/lib/ai/tools/analyze-trends-tool.ts`:
  - Ensure currency conversion is applied after aggregation in all three modes
  - Ensure action card data includes both `amount` (home) and `convertedAmount` (display) per period
  - Ensure the chart labels in `trend-comparison-card.tsx` show dual-currency format
- [ ] T021 [US5] Verify `npm run build` passes

**Checkpoint**: Currency display works in combination with all analytical modes.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T022 Handle edge cases in `src/lib/ai/tools/analyze-trends-tool.ts`:
  - Unsupported currency: return error message with list of supported currencies
  - Zero-transaction period: return period with amount=0 and transactionCount=0 (not an error)
  - Unsupported metric: return error listing valid metrics
  - Date range > 24 months: return error suggesting a shorter range
- [ ] T023 Handle edge cases in `convex/functions/trendAnalysis.ts`:
  - Empty journal entries for a period: return zero-amount period entry
  - Business not found: return null
  - Auth check: verify user is active member of business
- [ ] T024 Final `npx convex deploy --yes` and `npm run build` verification
- [ ] T025 Manual UAT: test all 4 acceptance criteria from spec through the chat interface

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — can start after foundational
- **Phase 4 (US2)**: Depends on Phase 2 — can start in parallel with US1
- **Phase 5 (US3)**: Depends on Phase 4 (extends the same tool and card)
- **Phase 6 (US4)**: Depends on Phase 4 (extends the same tool)
- **Phase 7 (US5)**: Depends on Phase 3 + Phase 4 (composition of both)
- **Phase 8 (Polish)**: Depends on all stories complete

### User Story Dependencies

- **US1 (Currency Display)**: Independent — modifies existing tools only
- **US2 (Period Comparison)**: Independent — creates new tool and card
- **US3 (Trend Analysis)**: Depends on US2 (extends same tool and card)
- **US4 (Growth Rate)**: Depends on US2 (extends same tool)
- **US5 (Combined)**: Depends on US1 + US2 (composition)

### Parallel Opportunities

- T005, T006, T007, T008 (US1) can all run in parallel (different files)
- US1 and US2 can start in parallel after Phase 2
- US3 and US4 can start in parallel after US2

---

## Parallel Example: User Story 1

```bash
# Launch all currency display additions in parallel (different files):
Task: "Add display_currency to AnalyzeCashFlowTool in src/lib/ai/tools/analyze-cashflow-tool.ts"
Task: "Add display_currency to ARSummaryTool in src/lib/ai/tools/ar-summary-tool.ts"
Task: "Add display_currency to APAgingTool in src/lib/ai/tools/ap-aging-tool.ts"
Task: "Add display_currency to BusinessTransactionsTool in src/lib/ai/tools/business-transactions-tool.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup (date resolver extension)
2. Complete Phase 2: Foundational (Convex action + currency helper)
3. Complete Phase 3: US1 (currency display on existing tools)
4. Complete Phase 4: US2 (period comparison tool + card)
5. **STOP and VALIDATE**: Test both stories independently
6. Deploy if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (currency display) → Test → Deploy (MVP)
3. US2 (comparison) → Test → Deploy
4. US3 (trends) → Test → Deploy
5. US4 (growth) → Test → Deploy
6. US5 (combined) → Test → Deploy
7. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Convex changes require `npx convex deploy --yes` before testing
- All tools follow `BaseTool` pattern from existing codebase
- Action card follows `registerActionCard` side-effect import pattern
- RBAC: `analyze_trends` → `MANAGER_TOOLS`; currency display → unrestricted
