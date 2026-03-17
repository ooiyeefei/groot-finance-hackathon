# Tasks: AI Performance Widget

**Input**: Design documents from `/specs/001-ai-perf-widget/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No test tasks — not explicitly requested in spec.

**Organization**: Tasks grouped by user story. US1/US2/US3 are all P1 and tightly coupled (same widget), so they share a single phase. US4 (trends) and US5 (compact cards) are independent additions.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Exact file paths included in all descriptions

---

## Phase 1: Foundational (Convex Query)

**Purpose**: Create the backend query that all UI stories depend on

**⚠️ CRITICAL**: No UI work can begin until this phase is complete

- [X] T001 Create `getAIPerformanceMetrics` query in `convex/functions/aiPerformanceMetrics.ts` — aggregate AR matching data from `sales_orders` (aiMatchTier, aiMatchStatus, aiMatchSuggestions confidence), bank recon from `bank_transactions` (classificationTier, classificationConfidence, confirmedAt), fee classification from `sales_orders.classifiedFees` (tier, confidence), and corrections from `order_matching_corrections`, `bank_recon_corrections`, `fee_classification_corrections`. Accept args: `businessId` (string), `period` ("this_month" | "last_3_months" | "all_time"). Reuse TIME_SAVED constants from `convex/functions/aiDigest.ts`. Return shape per `specs/001-ai-perf-widget/data-model.md` AIPerformanceMetrics interface. Include period boundary calculation (current + previous period for trend comparison). Use businessId indexes on all table queries. Handle missing tables gracefully with try/catch (bank tables may not exist on all branches).
- [ ] T002 Deploy Convex query — run `npx convex deploy --yes` and verify `getAIPerformanceMetrics` is callable from Convex dashboard (BLOCKED: requires CONVEX_DEPLOYMENT env var — see Phase 5 notes)

**Checkpoint**: Query returns correct metrics for a known businessId. Verify by calling from Convex dashboard.

---

## Phase 2: User Stories 1+2+3 — Core Widget (Priority: P1) 🎯 MVP

**Goal**: Display the AI Performance widget on the analytics dashboard with all P1 metrics (confidence, edit/no-edit rate, automation rate, donut chart, hours saved hero, period selector)

**Independent Test**: Navigate to analytics dashboard → widget visible with correct metrics for "This Month", switch to "Last 3 Months" and "All Time" — metrics update. Empty state shows for businesses with no AI activity.

### Implementation

- [X] T003 [P] [US1] Create React hook `useAIPerformance` in `src/domains/analytics/hooks/use-ai-performance.ts` — wrap Convex `useQuery` for `aiPerformanceMetrics.getAIPerformanceMetrics` with period state (`this_month` default). Expose: `metrics` (AIPerformanceMetrics | undefined), `period`, `setPeriod`, `loading` (boolean), `isEmpty` (boolean). Derive `isEmpty` from `metrics?.totalAiDecisions === 0`.

- [X] T004 [P] [US1] Create `AIPerformanceWidget` component in `src/domains/analytics/components/ai-performance/AIPerformanceWidget.tsx`. Structure:
  1. **Header row**: "AI Performance" title + period selector dropdown (This Month / Last 3 Months / All Time) using `<select>` with `bg-muted text-foreground border rounded text-xs` styling (match existing dashboard selectors)
  2. **Hero metric section** [US3]: Large "Hours Saved" number with subtitle "X invoices automated, Y needed review". Use `estimatedHoursSaved`, `totalAiDecisions`, `decisionsRequiringReview` from metrics.
  3. **Donut chart** [US1]: recharts `PieChart` with `innerRadius` showing distribution (noEdit=green, edited=amber, missing=red). Reference `src/domains/expense-claims/einvoice/components/einvoice-dashboard.tsx` for recharts pattern. Use `ResponsiveContainer` width 120px.
  4. **Metric cards grid** (2x2): Overall Confidence, Edit Rate, No-Edit Rate, Automation Rate. Each card: large percentage, label, colored indicator. Use `bg-card text-card-foreground border rounded-lg p-card-padding` styling.
  5. **Empty state**: When `isEmpty` is true, show friendly message with Brain icon from lucide-react: "AI Performance metrics will appear here once you start using AI features like AR matching, bank reconciliation, or fee classification."
  6. **Loading state**: Skeleton shimmer matching card dimensions (use `animate-pulse` pattern from existing dashboard cards).
  Props: `businessId: string`. Use the `useAIPerformance` hook internally.

- [X] T005 [US1] Integrate `AIPerformanceWidget` into `src/domains/analytics/components/complete-dashboard.tsx` — import and render after `ProactiveActionCenter` block (after line ~237), before the KPI Metrics grid. Wrap in `{businessId && <AIPerformanceWidget businessId={businessId} />}`. Add lazy import with Suspense fallback using existing `ComponentLoader` pattern.

**Checkpoint**: Analytics dashboard shows AI Performance widget with all P1 features. Period selector works. Empty state renders for new businesses. `npm run build` passes.

---

## Phase 3: User Story 4 — Trend Indicators (Priority: P2)

**Goal**: Add up/down trend arrows with percentage deltas comparing current period to previous period

**Independent Test**: View widget with "This Month" selected → each metric shows green/red arrow with delta vs last month. Select "All Time" → no trend indicators shown.

### Implementation

- [X] T006 [US4] Extend `AIPerformanceWidget` in `src/domains/analytics/components/ai-performance/AIPerformanceWidget.tsx` — trend indicators already implemented in T004 — add trend indicators to each metric card. Use `metrics.trends` data (confidenceDelta, editRateDelta, automationRateDelta, hoursSavedDelta). When `trends` is null (All Time), hide indicators. Color logic: green up arrow for confidence/automation increases (good), red up arrow for edit rate increases (bad). Use `TrendingUp`/`TrendingDown` icons from lucide-react with `text-green-600 dark:text-green-400` and `text-destructive` classes (match existing dashboard trend pattern in `complete-dashboard.tsx` lines 105-144). Show "+X%" or "-X%" text next to arrow.

**Checkpoint**: Trend indicators visible on all metric cards. Color-coding correct (green for improvement, red for degradation). No indicators on "All Time".

---

## Phase 4: User Story 5 — Compact Widget on AP/AR Pages (Priority: P3)

**Goal**: Show feature-specific AI performance cards on the AR reconciliation and bank reconciliation pages

**Independent Test**: Navigate to AR recon page → compact card shows AR-specific confidence and edit rate. Navigate to bank recon page → card shows bank recon-specific metrics.

### Implementation

- [X] T007 [P] [US5] Create `CompactAIPerformanceCard` component in `src/domains/analytics/components/ai-performance/CompactAIPerformanceCard.tsx` — a smaller card showing feature-specific metrics: confidence rate, edit rate, total decisions. Props: `businessId: string`, `feature: "ar" | "bank" | "fee"`. Reuse `useAIPerformance` hook and extract `featureBreakdown[feature]` data. Style: single row card with `bg-card border rounded-lg p-3` matching the compact style of page-embedded cards. Show Brain icon + "AI Confidence: XX%" + "Edit Rate: X%".

- [X] T008 [US5] Integrate `CompactAIPerformanceCard` into AR reconciliation page — find the AR recon tab component (search for `ar-recon` or `ArReconciliation` in `src/domains/sales-invoices/`) and add `<CompactAIPerformanceCard businessId={businessId} feature="ar" />` at the top of the tab content.

- [X] T009 [US5] Integrate `CompactAIPerformanceCard` into bank reconciliation page — find the bank recon component in `src/domains/bank-reconciliation/` or `src/domains/sales-invoices/` and add `<CompactAIPerformanceCard businessId={businessId} feature="bank" />` at the top.

**Checkpoint**: Compact cards visible on AR and bank recon pages with feature-specific metrics.

---

## Phase 5: Polish & Build Verification

**Purpose**: Ensure everything builds and deploys correctly

- [ ] T010 Run `npm run build` and fix any TypeScript or build errors (BLOCKED: requires Convex types regeneration from T002)
- [ ] T011 Run `npx convex deploy --yes` to deploy Convex query to production (BLOCKED: requires CONVEX_DEPLOYMENT env var)
- [ ] T012 Verify widget renders correctly on the analytics dashboard at `http://localhost:3000/en` (or production URL) (BLOCKED: requires Convex deployment)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately
- **Phase 2 (Core Widget)**: Depends on T001 (Convex query). T003 and T004 can be parallel once T001 is done. T005 depends on T004.
- **Phase 3 (Trends)**: Depends on Phase 2 completion (T006 modifies the widget from T004)
- **Phase 4 (Compact Cards)**: Depends on Phase 1 only (T007 uses the same query). Can run in parallel with Phase 2/3.
- **Phase 5 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1+US2+US3 (P1)**: Depends on Foundational (Phase 1) only — no dependencies on other stories
- **US4 (P2)**: Depends on US1 (modifies the same widget component)
- **US5 (P3)**: Depends on Foundational only — independent of US1-US4

### Parallel Opportunities

- T003 and T004 can run in parallel (different files)
- T007 can run in parallel with Phase 2 tasks (different files, only needs T001)
- T008 and T009 can run in parallel (different pages)

---

## Parallel Example: Phase 2

```bash
# After T001 (Convex query) is complete, launch in parallel:
Task T003: "Create useAIPerformance hook in src/domains/analytics/hooks/use-ai-performance.ts"
Task T004: "Create AIPerformanceWidget in src/domains/analytics/components/ai-performance/AIPerformanceWidget.tsx"

# T005 depends on T004, so run after T004 completes
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2)

1. Complete Phase 1: Convex query (T001-T002)
2. Complete Phase 2: Core widget (T003-T005)
3. **STOP and VALIDATE**: Test widget on analytics dashboard
4. Build passes → ready to deploy

### Incremental Delivery

1. Phase 1 + 2 → Core widget with all P1 features → Deploy (MVP!)
2. Add Phase 3 → Trend indicators → Deploy
3. Add Phase 4 → Compact cards on AP/AR → Deploy
4. Phase 5 → Final build verification

---

## Notes

- All Convex queries use businessId indexes — no full table scans
- recharts is already installed — no new dependencies needed
- The `gatherAIActivity` bridge pattern in `aiDigest.ts` is the reference implementation — the new query follows the same approach with date-range support
- Empty state handling is critical — new businesses will see the widget before they have AI data
- TIME_SAVED constants are shared with the email digest for consistency

## Implementation Status (2026-03-16)

**Completed Tasks**: T001, T003, T004, T005, T006, T007, T008, T009 (9/12 tasks, 75%)

**Blocked Tasks**: T002, T010, T011, T012 (requires Convex deployment configuration)

### What Was Built

1. **Convex Query** (`convex/functions/aiPerformanceMetrics.ts`):
   - `getAIPerformanceMetrics` query with period filtering (this_month / last_3_months / all_time)
   - Aggregates AR matching (sales_orders), bank recon (bank_transactions), fee classification (classifiedFees), and corrections
   - Volume-weighted confidence averaging across features
   - Period-over-period trend comparison
   - TIME_SAVED constants for hours-saved calculation
   - Handles missing tables gracefully (try/catch for bank tables)

2. **React Hook** (`src/domains/analytics/hooks/use-ai-performance.ts`):
   - `useAIPerformance(businessId)` hook wrapping Convex useQuery
   - Period state management
   - Exposes: metrics, period, setPeriod, loading, isEmpty

3. **Main Widget** (`src/domains/analytics/components/ai-performance/AIPerformanceWidget.tsx`):
   - Hero metric: Hours Saved with "X automated, Y needed review" subtitle
   - Donut chart (recharts PieChart) showing distribution (noEdit/edited/missing)
   - 2x2 metric cards grid: Overall Confidence, Edit Rate, No-Edit Rate, Automation Rate
   - Trend indicators with up/down arrows and delta values (green=good, red=bad, inverted for edit rate)
   - Period selector dropdown (This Month / Last 3 Months / All Time)
   - Loading skeleton and empty state (Brain icon + friendly message)
   - Integrated into `complete-dashboard.tsx` after ProactiveActionCenter

4. **Compact Cards** (`src/domains/analytics/components/ai-performance/CompactAIPerformanceCard.tsx`):
   - Feature-specific compact cards showing confidence + edit rate
   - Props: businessId, feature ("ar" | "bank" | "fee")
   - Auto-hides if no AI activity for that feature
   - Integrated into AR reconciliation page (`ar-reconciliation.tsx`)
   - Integrated into bank reconciliation page (`bank-recon-tab.tsx`)

### What Remains

**To complete deployment** (requires Convex deployment URL in environment):

1. Configure CONVEX_DEPLOYMENT environment variable:
   ```bash
   # In .env.local or environment
   CONVEX_DEPLOYMENT=<your-convex-deployment-url>
   ```

2. Run Convex dev to regenerate types:
   ```bash
   npx convex dev
   # This will regenerate convex/_generated/api.ts with aiPerformanceMetrics types
   ```

3. Deploy to production:
   ```bash
   npx convex deploy --yes
   ```

4. Build and test:
   ```bash
   npm run build
   npm run dev
   # Navigate to http://localhost:3000/en → Analytics dashboard
   ```

### Type Error (Expected)

Current build fails with:
```
Property 'aiPerformanceMetrics' does not exist on type...
```

This is expected — Convex auto-generates TypeScript types from deployed functions. Once `npx convex dev` runs with a valid deployment URL, the types will be generated and the build will pass.

### Files Created/Modified

**New files**:
- `convex/functions/aiPerformanceMetrics.ts` (415 lines)
- `src/domains/analytics/hooks/use-ai-performance.ts` (60 lines)
- `src/domains/analytics/components/ai-performance/AIPerformanceWidget.tsx` (228 lines)
- `src/domains/analytics/components/ai-performance/CompactAIPerformanceCard.tsx` (58 lines)

**Modified files**:
- `src/domains/analytics/components/complete-dashboard.tsx` (added lazy import + Suspense wrapper)
- `src/domains/sales-invoices/components/ar-reconciliation.tsx` (added compact card import + render)
- `src/domains/accounting/components/bank-recon/bank-recon-tab.tsx` (added compact card import + render)
- `CLAUDE.md` (auto-updated by speckit agent context script)

**Total new code**: ~761 lines
