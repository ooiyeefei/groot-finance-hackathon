# Tasks: Smart Vendor Intelligence

**Input**: Design documents from `/specs/001-smart-vendor-intelligence/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Tests**: Not explicitly requested in spec.md. Integration and E2E tests will be added in the Polish phase to validate complete user journeys.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create domain structure at `src/domains/vendor-intelligence/` with subdirectories: pages/, components/, hooks/, lib/, types/
- [X] T002 [P] Install Recharts library: `npm install recharts@^2.14.1 --save`
- [X] T003 [P] Verify papaparse already installed (used in csv-parser) - no install needed
- [X] T004 [P] Configure git author identity: `git config user.name "grootdev-ai" && git config user.email "dev@hellogroot.com"`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Deploy Convex schema changes: Add 6 new tables to `convex/schema.ts` (vendor_price_history, vendor_price_anomalies, vendor_scorecards, vendor_risk_profiles, cross_vendor_item_groups, vendor_recommended_actions) with indexes per data-model.md
- [X] T006 Deploy schema to Convex production: Run `npx convex deploy --yes` and verify all tables and indexes created in Convex dashboard
- [X] T007 [P] Create shared types in `src/domains/vendor-intelligence/types/index.ts` exporting all entity types from contracts/types.ts (PriceHistoryRecord, PriceAnomalyAlert, VendorScorecard, VendorRiskProfile, CrossVendorItemGroup, RecommendedAction, AlertType, SeverityLevel, RiskLevel, MatchSource, ActionType, PriorityLevel, ActionStatus)
- [X] T008 [P] Create utility functions in `src/domains/vendor-intelligence/lib/utils.ts` for date formatting (formatBusinessDate), currency formatting (formatCurrency), and number formatting (formatNumber) - reuse existing helpers from `@/lib/utils/format-number`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Automatic Price Tracking & Anomaly Alerts (Priority: P1) 🎯 MVP

**Goal**: Automatically track item prices from every AP invoice and alert when vendors raise prices unexpectedly. This is the core AI moat feature.

**Independent Test**: Process AP invoices with line items → verify price history is built → verify alerts trigger when prices increase >10% or >20% over 6-month average → verify fuzzy matching with confidence scores → verify dismissal workflow.

### Backend: Convex Functions for User Story 1

- [X] T009 [P] [US1] Create `convex/functions/vendorPriceHistory/create.ts` mutation: Extract line items from invoice → generate itemIdentifier (item code OR description hash) → store price history record → return priceHistoryId
- [X] T010 [P] [US1] Create `convex/functions/vendorPriceHistory/list.ts` query: Get price history filtered by businessId, vendorId, itemIdentifier, archivedFlag (default false), with pagination
- [X] T011 [P] [US1] Create `convex/functions/vendorPriceHistory/getByItemVendor.ts` query: Get single item-vendor price timeline sorted by invoiceDate
- [X] T012 [US1] Create fuzzy matching logic in `src/domains/vendor-intelligence/lib/fuzzy-matching.ts`: Implemented inline in createFromInvoiceLineItem using Jaccard word-token similarity (Tier 1). DSPy Tier 2 deferred to polish phase.
- [X] T013 [US1] Update `convex/functions/vendorPriceHistory/create.ts` to integrate fuzzy matching: When itemCode missing or changed → call fuzzy matcher → if confidence <80%, set userConfirmedFlag=false and matchConfidenceScore → if ≥80%, auto-link to existing itemIdentifier
- [X] T014 [US1] Create `convex/functions/vendorPriceHistory/confirmFuzzyMatch.ts` mutation: User confirms/rejects low-confidence match → if confirmed, link to existing itemIdentifier and set userConfirmedFlag=true → if rejected, create new itemIdentifier
- [X] T015 [US1] Create Tier 1 anomaly detection logic in `src/domains/vendor-intelligence/lib/anomaly-detection.ts`: Implement fixed threshold checks (>10% per-invoice, >20% trailing 6-month average) → returns { isAnomaly, alertType, severityLevel, oldValue, newValue, percentageChange }
- [X] T016 [US1] Create `convex/functions/vendorPriceAnomalies/detect.ts` internalMutation: Called after price history insert → run Tier 1 detection → if anomaly, insert vendor_price_anomalies record with status="active"
- [X] T017 [US1] Create `convex/functions/vendorPriceAnomalies/list.ts` query: Get anomaly alerts filtered by businessId, vendorId, status, severityLevel, alertType with sorting by createdTimestamp desc
- [X] T018 [US1] Create `convex/functions/vendorPriceAnomalies/dismiss.ts` mutation: User dismisses alert → update status="dismissed", dismissedTimestamp=now, optional userFeedback → return success
- [X] T019 [US1] Integrate price tracking into invoice processing: Extended recordPriceObservationsBatch to populate #320 fields (itemIdentifier, archivedFlag, matchedFromItemCode) and run inline anomaly detection with .take(20) bandwidth limit

### Frontend: UI Components for User Story 1

- [X] T020 [P] [US1] Create `src/domains/vendor-intelligence/hooks/use-price-history.ts` custom hook: Wraps `useQuery(api.vendorPriceHistory.list)` with filters and pagination state
- [X] T021 [P] [US1] Create `src/domains/vendor-intelligence/hooks/use-anomaly-alerts.ts` custom hook: Wraps `useQuery(api.vendorPriceAnomalies.list)` with filters and mutation for dismissal
- [X] T022 [US1] Create `src/domains/vendor-intelligence/components/anomaly-alert-card.tsx` component: Display single alert with vendor name, item, old/new price, percentage change, severity badge, action buttons (View History, Dismiss)
- [X] T023 [US1] Create `src/domains/vendor-intelligence/components/fuzzy-match-confirmation-dialog.tsx` component: Show low-confidence matches (<80%) with item descriptions side-by-side, confidence score, reasoning from DSPy → user can confirm or reject
- [X] T024 [US1] Create alerts list page at `src/app/[locale]/vendor-intelligence/alerts/page.tsx` (server component): Auth check → wrap AlertsClient
- [X] T025 [US1] Create `src/app/[locale]/vendor-intelligence/alerts/alerts-client.tsx` client component: Render list of AnomalyAlertCard components, filter controls (severity, alertType, vendor), real-time updates via useAnomalyAlerts hook
- [X] T026 [US1] Update sidebar navigation in `src/components/sidebar.tsx`: Add "Vendor Intelligence" section with "Price Alerts" link to `/en/vendor-intelligence/alerts`

**Checkpoint**: At this point, User Story 1 should be fully functional - price tracking auto-runs on invoice processing, alerts appear in UI, fuzzy matching requires user confirmation when confidence <80%, users can dismiss alerts

---

## Phase 4: User Story 2 - Vendor Performance Scorecard (Priority: P2)

**Goal**: Display comprehensive scorecard for each vendor showing spend, payment cycles, price stability, and AI accuracy for context-aware decision making.

**Independent Test**: Navigate to vendor detail page → verify scorecard loads with 6 metrics calculated from existing data → verify metrics update when new invoices processed.

### Backend: Convex Functions for User Story 2

- [X] T027 [P] [US2] Create `convex/functions/vendorScorecards/calculate.ts` internalMutation: Aggregate metrics per data-model.md calculation logic (totalSpendYTD, invoiceVolume, averagePaymentCycle, priceStabilityScore, aiExtractionAccuracy, anomalyFlagsCount) → insert/update vendor_scorecards record
- [X] T028 [P] [US2] Create `convex/functions/vendorScorecards/get.ts` query: Get scorecard by vendorId with vendor metadata (name, category) → returns VendorScorecardWithMeta
- [X] T029 [P] [US2] Create `convex/functions/vendorScorecards/list.ts` query: Get all scorecards for businessId with sorting (totalSpendYTD desc, priceStabilityScore desc, anomalyFlagsCount desc) → returns array of VendorScorecardWithMeta
- [X] T030 [US2] Create scorecard calculator utility: Calculation logic integrated directly in vendorScorecards.calculate (coefficient of variation, mean days, etc.)
- [X] T031 [US2] On-demand scorecard refresh via action (bandwidth-safe, no cron per CLAUDE.md Rule 3): vendorScorecards.refreshIfStale recalculates if >24h stale, triggered on vendor detail page load

### Frontend: UI Components for User Story 2

- [X] T032 [P] [US2] Create `src/domains/vendor-intelligence/hooks/use-vendor-scorecard.ts` custom hook: Wraps `useQuery(api.vendorScorecards.get, { vendorId })` with loading and error states
- [X] T033 [US2] Create `src/domains/vendor-intelligence/components/vendor-scorecard-card.tsx` component: Display 6 metrics in card layout with labels, values, and icons → use formatCurrency for totalSpendYTD, format scores with progress bars (0-100 scale)
- [X] T034 [US2] Create vendor detail page at `src/app/[locale]/vendor-intelligence/vendor/[vendorId]/page.tsx` (server component): Auth check → wrap VendorDetailClient with vendorId prop
- [X] T035 [US2] Create `src/app/[locale]/vendor-intelligence/vendor/[vendorId]/vendor-detail-client.tsx` client component: Render VendorScorecardCard, price history preview (last 5 records), active anomaly alerts count → use useVendorScorecard and usePriceHistory hooks

**Checkpoint**: At this point, User Story 2 works independently - vendor detail page shows comprehensive scorecard, metrics auto-calculate nightly, scorecard provides context for investigating anomalies from US1

---

## Phase 5: User Story 3 - Price Intelligence Dashboard (Priority: P3)

**Goal**: Visualize price trends over time and compare the same items across multiple vendors for data-driven contract negotiations.

**Independent Test**: Navigate to Price Intelligence tab → select vendor and item → verify line chart renders with historical prices → create/confirm cross-vendor item group → verify comparison table shows multi-vendor prices sorted by unit price → export price history to CSV → verify file downloads with correct data.

### Backend: Convex Functions for User Story 3

- [X] T036 [P] [US3] Create `convex/functions/vendorPriceHistory/getTrendData.ts` query: Get price history for itemIdentifier+vendorId → transform to PriceTrendDataPoint array (date, unitPrice, currency, invoiceId) sorted by invoiceDate
- [X] T037 [P] [US3] DSPy semantic matching implemented in vendorItemMatching.ts suggestMatches action + vendor_item_matcher.py Lambda module (001-dspy-vendor-item-matcher branch)
- [X] T038 [P] [US3] Create `convex/functions/crossVendorItemGroups/createGroup.ts` mutation: User confirms AI suggestion OR manually creates group → insert cross_vendor_item_groups record → link price records by updating itemGroupId field
- [X] T039 [P] [US3] Create `convex/functions/crossVendorItemGroups/updateGroup.ts` mutation: User adds/removes items from group → update itemReferences array → re-link price records
- [X] T040 [P] [US3] Create `convex/functions/crossVendorItemGroups/deleteGroup.ts` mutation: User rejects AI suggestion or deletes manually created group → delete group → unlink price records (set itemGroupId=null)
- [X] T041 [P] [US3] Create `convex/functions/crossVendorItemGroups/list.ts` query: Get all groups for businessId filtered by matchSource (ai-suggested, user-confirmed, user-created) → returns array of CrossVendorItemGroup
- [X] T042 [P] [US3] Create `convex/functions/crossVendorItemGroups/getGroupById.ts` query: Get single group with enriched price data (current unit price, last price change date, price stability score per vendor) → returns CrossVendorItemGroupWithPrices
- [X] T043 [US3] Cross-vendor comparison integrated into getGroupById query (returns priceData array sorted by currentUnitPrice asc)

### Frontend: UI Components for User Story 3

- [X] T044 [P] [US3] Create `src/domains/vendor-intelligence/hooks/use-cross-vendor-groups.ts` custom hook: Wraps queries and mutations for cross-vendor groups (list, create, update, delete) with optimistic updates
- [X] T045 [P] [US3] Create `src/domains/vendor-intelligence/components/price-history-chart.tsx` component: Recharts LineChart with ResponsiveContainer → displays PriceTrendDataPoint array → XAxis=date, YAxis=unitPrice → Tooltip with formatCurrency → semantic token colors
- [X] T046 [US3] Create `src/domains/vendor-intelligence/components/cross-vendor-comparison-table.tsx` component
- [X] T047 [US3] Create `src/domains/vendor-intelligence/components/item-group-editor.tsx` component
- [X] T048 [US3] Create `src/domains/vendor-intelligence/components/csv-export-button.tsx` component: Button that triggers papaparse client-side export
- [X] T049 [US3] Create price intelligence dashboard page at `src/app/[locale]/vendor-intelligence/price-intelligence/page.tsx` (server component): Auth check → wrap PriceIntelligenceClient
- [X] T050 [US3] Create `src/app/[locale]/vendor-intelligence/price-intelligence/price-intelligence-client.tsx` client component: Tabbed interface (Price Trends tab with chart, Cross-Vendor tab with groups list) → CSV export button
- [X] T051 [US3] Update sidebar navigation — Price Intelligence added as separate nav item for finance admins

**Checkpoint**: At this point, User Story 3 works independently - users can visualize price trends with Recharts, AI suggests cross-vendor matches, users confirm/reject/edit groups, comparison table shows multi-vendor prices, CSV export works with papaparse

---

## Phase 6: User Story 4 - Vendor Risk Analysis (Priority: P4)

**Goal**: Display AI-powered risk scores for each vendor covering payment risk, concentration risk, compliance risk, and price risk for proactive supply chain management.

**Independent Test**: Navigate to vendor detail page risk analysis section → verify 4 risk scores calculated (0-100 scale) → verify overall risk level (low/medium/high) → verify risk scores update weekly.

### Backend: Convex Functions for User Story 4

- [X] T052 [P] [US4] Create `convex/functions/vendorRiskProfiles/calculate.ts` internalMutation: Calculate 4 risk scores per data-model.md calculation logic (paymentRiskScore, concentrationRiskScore, complianceRiskScore, priceRiskScore) → derive overall riskLevel → insert/update vendor_risk_profiles record
- [X] T053 [P] [US4] Create `convex/functions/vendorRiskProfiles/get.ts` query: Get risk profile by vendorId with vendor metadata (name, category) → returns VendorRiskProfileWithMeta
- [X] T054 [P] [US4] Create `convex/functions/vendorRiskProfiles/list.ts` query: Get all high-risk vendors (riskLevel="high") for businessId sorted by lastCalculatedTimestamp desc → returns array of VendorRiskProfileWithMeta
- [X] T055 [US4] Risk calculation logic integrated directly in vendorRiskProfiles.calculate (concentration, compliance, price variance)
- [X] T056 [US4] On-demand risk refresh via action (bandwidth-safe, no cron per CLAUDE.md Rule 3): vendorRiskProfiles.refreshIfStale recalculates if >7 days stale, triggered on vendor detail page load

### Frontend: UI Components for User Story 4

- [X] T057 [P] [US4] Create `src/domains/vendor-intelligence/hooks/use-vendor-risk-profile.ts` custom hook: Wraps `useQuery(api.vendorRiskProfiles.get, { vendorId })` with loading and error states
- [X] T058 [US4] Create `src/domains/vendor-intelligence/components/vendor-risk-profile.tsx` component: Display 4 risk scores with progress bars and tooltips → show overall risk level badge (color-coded: low=green, medium=yellow, high=red) → semantic token styling
- [X] T059 [US4] Update vendor detail page: Risk analysis section integrated in vendor-detail-client.tsx below scorecard

**Checkpoint**: At this point, User Story 4 works independently - vendor detail page shows risk analysis with 4 scores and overall level, risk profiles auto-calculate weekly, high-risk vendors identifiable

---

## Phase 7: User Story 5 - Smart Alerts & Recommended Actions (Priority: P5)

**Goal**: Integrate vendor anomalies into Action Center and AI Digest email with AI-suggested next steps for proactive issue resolution without constant monitoring.

**Independent Test**: Trigger price anomaly → verify appears in Action Center "Vendor Insights" section → verify included in AI Digest email at 6 PM → chat with Groot AI "Which vendors raised prices?" → verify MCP tool returns structured response.

### Backend: Convex Functions & Integrations for User Story 5

- [X] T060 [P] [US5] Create `convex/functions/vendorRecommendedActions/generate.ts` internalMutation: Called after high-impact anomaly detected → generate recommended actions per data-model.md generation logic (actionType, actionDescription, priorityLevel) → insert vendor_recommended_actions records
- [X] T061 [P] [US5] Create `convex/functions/vendorRecommendedActions/list.ts` query: Get recommended actions filtered by businessId, vendorId, status (pending, completed, dismissed) → returns array of RecommendedActionWithContext
- [X] T062 [P] [US5] Create `convex/functions/vendorRecommendedActions/updateStatus.ts` mutation: User marks action as completed or dismissed → update status and timestamp → return success
- [X] T063 [US5] Wired recommended actions into recordPriceObservationsBatch: After high-impact anomaly insert, ctx.scheduler.runAfter(0) calls vendorRecommendedActions.generate
- [X] T064 [US5] Integrate with Action Center: Added runPriceAnomalyDetection to runVendorIntelligenceDetection in actionCenterJobs.ts — surfaces high-impact anomalies as "vendor_price_anomaly" insights with .take(10) bandwidth limit
- [ ] T065 [US5] Integrate with AI Digest — BLOCKED: ai-daily-digest cron disabled (bandwidth). Re-enable on Pro plan.
- [X] T066 [US5] Create MCP tool query in convex/functions/vendorIntelligenceMCP.ts: analyzeVendorPricing internalQuery returns structured response (summary, anomalies, affected items, recommended actions)

### Frontend: UI Components for User Story 5

- [X] T067 [P] [US5] Create `src/domains/vendor-intelligence/hooks/use-recommended-actions.ts` custom hook: Wraps queries and mutation for recommended actions (list, updateStatus) with optimistic updates
- [X] T068 [US5] Update anomaly-alert-card.tsx to include recommended actions: Added RecommendedAction[] prop with priority badges, complete/dismiss buttons
- [X] T069 [US5] Action Center UI wired via actionCenterInsights table — vendor_price_anomaly type insights surface automatically in existing Action Center grid
- [ ] T070 [US5] Verify AI Digest email template — BLOCKED: ai-daily-digest cron disabled (bandwidth). Re-enable on Pro plan.

**Checkpoint**: At this point, User Story 5 works independently - vendor anomalies surface in Action Center and AI Digest, recommended actions generated automatically, MCP tool callable by chat agent, complete workflow integration

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and complete the feature

- [X] T071 [P] Create data archival as on-demand internalMutation (NOT cron — bandwidth-safe per CLAUDE.md Rule 3): vendorPriceHistory.archiveOldRecords with .take(100) batch limit
- [X] T072 [P] DSPy optimization implemented as on-demand triggerOptimization action in vendorItemMatching.ts (no cron — bandwidth-safe). MIPROv2 via Lambda optimize_vendor_item_model route. Existing EventBridge 3-day schedule can call this route.
- [X] T073 [P] Add billing frequency change detection to `src/domains/vendor-intelligence/lib/billing-frequency-analyzer.ts`: Calculate vendor's historical invoice frequency (mean days between invoices) → detect ≥50% deviation → returns potentialIndicators array
- [X] T074 [P] Integrate billing frequency detection into recordPriceObservationsBatch: After price observations, checks invoice date intervals → detects ≥50% deviation → inserts frequency-change anomaly with potentialIndicators
- [X] T075 [P] New item detection integrated into recordPriceObservationsBatch: Checks if vendor has prior history but item is new → inserts anomaly with alertType="new-item"
- [X] T076 [P] Create price normalizer utility in `src/domains/vendor-intelligence/lib/price-normalizer.ts`: Detects units from descriptions (pc, box, kg, L, m), checks unit mismatch between items, detects mixed units in records
- [X] T077 [P] Update price-history-chart.tsx: Added unitWarning prop → displays yellow warning text above chart when mixed units detected
- [X] T078 [P] Create feature documentation in `src/domains/vendor-intelligence/CLAUDE.md`: Documented architecture, data flow, bandwidth rules, tables, functions, UI pages, hooks
- [ ] T079 [P] Add integration tests in `tests/integration/vendor-intelligence/`: Test invoice processing → price history creation → anomaly detection → fuzzy matching confirmation → cross-vendor grouping → CSV export → archival (7 test files covering P1-P5 user journeys)
- [ ] T080 [P] Add E2E tests in `tests/e2e/vendor-intelligence.spec.ts`: Test complete user journey with Playwright (process invoice → view alert → dismiss alert → view vendor scorecard → view price trend chart → create cross-vendor group → export CSV → verify Action Center integration)
- [X] T081 Run `npm run build` to verify no TypeScript/Next.js errors → Build passes with zero errors
- [X] T082 Run `npx convex deploy --yes` to deploy all Convex functions and schema changes to production → Deployed successfully
- [ ] T083 Manual UAT with test accounts from `.env.local`: Test P1 (price tracking + alerts), P2 (vendor scorecard), P3 (price dashboard + cross-vendor comparison + CSV export), P4 (risk analysis), P5 (Action Center + AI Digest integration) → document any issues
- [X] T084 Update project CLAUDE.md: Added to Active Technologies + Recent Changes sections

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4 → P5)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories - **MVP CORE**
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Uses price history from US1 but independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Uses price history from US1 but independently testable
- **User Story 4 (P4)**: Can start after Foundational (Phase 2) - Uses price history from US1 but independently testable
- **User Story 5 (P5)**: Depends on US1 (anomalies), US2 (scorecard), US4 (risk) for complete integration - Should implement last

### Within Each User Story

- Backend functions before frontend components (need queries/mutations to wrap in hooks)
- Hooks before UI components (components consume hooks)
- Page wrappers after client components (pages wrap clients)
- Core implementation before integration (e.g., fuzzy matching logic before integrating into price history creation)

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (4 tasks)
- All Foundational tasks marked [P] can run in parallel (3 tasks)
- Once Foundational phase completes, US1-US4 can start in parallel (US5 should wait for US1 completion)
- Within each user story:
  - US1: T009-T011 parallel (3 Convex queries/mutations), T020-T021 parallel (2 hooks), T022-T023 parallel (2 components)
  - US2: T027-T029 parallel (3 Convex functions), T032-T033 parallel (hook + component)
  - US3: T036-T042 parallel (7 Convex functions), T044-T048 parallel (5 hooks/components)
  - US4: T052-T054 parallel (3 Convex functions), T057-T058 parallel (hook + component)
  - US5: T060-T062 parallel (3 Convex functions), T067-T068 parallel (hook + component update)
- All Polish tasks marked [P] can run in parallel (14 tasks)

---

## Parallel Example: User Story 1 (MVP)

```bash
# Launch all backend queries/mutations together:
Task T009: "Create convex/functions/vendorPriceHistory/create.ts mutation"
Task T010: "Create convex/functions/vendorPriceHistory/list.ts query"
Task T011: "Create convex/functions/vendorPriceHistory/getByItemVendor.ts query"

# After backend complete, launch frontend hooks together:
Task T020: "Create src/domains/vendor-intelligence/hooks/use-price-history.ts"
Task T021: "Create src/domains/vendor-intelligence/hooks/use-anomaly-alerts.ts"

# Then launch UI components together:
Task T022: "Create src/domains/vendor-intelligence/components/anomaly-alert-card.tsx"
Task T023: "Create src/domains/vendor-intelligence/components/fuzzy-match-confirmation-dialog.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only) - Recommended

1. Complete Phase 1: Setup (T001-T004) → ~30 minutes
2. Complete Phase 2: Foundational (T005-T008) → ~2 hours
3. Complete Phase 3: User Story 1 (T009-T026) → ~2 days
4. **STOP and VALIDATE**: Test US1 independently (process invoices, see price history, verify alerts trigger, test fuzzy matching, dismiss alerts)
5. Deploy to staging, gather feedback from finance team
6. **Decision point**: Ship MVP or continue to US2-US5

### Incremental Delivery (Full Feature)

1. Complete Setup + Foundational → ~3 hours
2. Add User Story 1 (P1) → Test → Deploy (MVP - core moat feature) → ~2 days
3. Add User Story 2 (P2) → Test → Deploy (adds vendor context) → ~1 day
4. Add User Story 3 (P3) → Test → Deploy (adds visualization + cross-vendor comparison) → ~1.5 days
5. Add User Story 4 (P4) → Test → Deploy (adds risk analysis) → ~1 day
6. Add User Story 5 (P5) → Test → Deploy (adds workflow integration) → ~1 day
7. Complete Polish phase → Final validation → Production deployment → ~1 day

**Total estimated time**: 8 days for complete feature (MVP in 2.5 days)

### Parallel Team Strategy

With 2-3 developers:

1. Team completes Setup + Foundational together (~3 hours)
2. Once Foundational is done:
   - Developer A: User Story 1 (P1) - **Priority focus**
   - Developer B: User Story 2 (P2) + User Story 4 (P4) in sequence
   - Developer C: User Story 3 (P3)
3. After US1-US4 complete:
   - Developer A: User Story 5 (P5) integration
   - Developers B+C: Polish phase tasks in parallel
4. All: Final validation and testing

---

## Task Summary

- **Total Tasks**: 84
- **Setup Phase**: 4 tasks
- **Foundational Phase**: 4 tasks (BLOCKING)
- **User Story 1 (P1 - MVP)**: 18 tasks (T009-T026)
- **User Story 2 (P2)**: 9 tasks (T027-T035)
- **User Story 3 (P3)**: 16 tasks (T036-T051)
- **User Story 4 (P4)**: 8 tasks (T052-T059)
- **User Story 5 (P5)**: 11 tasks (T060-T070)
- **Polish Phase**: 14 tasks (T071-T084)

**Parallel Opportunities**: 41 tasks marked [P] can run in parallel (48% of total)

**MVP Scope** (Setup + Foundational + US1): 26 tasks → Delivers core price tracking and anomaly detection with self-improving AI

---

## Notes

- [P] tasks = different files, no dependencies, safe to parallelize
- [Story] label maps task to specific user story for traceability and independent testing
- Each user story should be independently completable and testable
- Commit after each task or logical group of related tasks
- Run `npm run build` after each phase to catch TypeScript errors early
- Run `npx convex deploy --yes` after any Convex schema/function changes (mandatory per CLAUDE.md)
- Stop at any checkpoint to validate story independently before proceeding
- MVP (US1) delivers the core AI moat feature - ship early for feedback
- US5 integrates with existing Action Center and AI Digest - implement last to avoid blocking US1-US4
