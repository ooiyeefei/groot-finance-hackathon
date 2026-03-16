# Tasks: Conditional Auto-Approval for AR and AP Matching

**Input**: Design documents from `/specs/003-conditional-auto-approval/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Schema)

- [x] T001 Add `matching_settings` table to `convex/schema.ts` with fields: businessId (unique), enableAutoApprove (boolean), autoApproveThreshold (number), minLearningCycles (number), autoApproveDisabledReason (optional string), autoApproveDisabledAt (optional number), updatedBy (string), updatedAt (number). Index: by_businessId
- [x] T002 Add "auto_agent" to `SALES_ORDER_MATCH_METHODS` in `src/lib/constants/statuses.ts`
- [x] T003 Add optional `weight` field to `order_matching_corrections` table in `convex/schema.ts`

---

## Phase 2: Foundational (Backend Logic)

- [x] T004 Create `convex/functions/matchingSettings.ts` with: `getOrCreate` query (returns settings with defaults if none exist), `update` mutation (validates threshold 0.90-1.00, minCycles 1-50, clears disabledReason on re-enable)
- [x] T005 [P] Add `getLearningCyclesForAlias` internalQuery to `convex/functions/salesOrders.ts` — counts approved AI matches (matchMethod="ai_suggested", aiMatchStatus="approved") + corrections for normalized customer name. Normalization: lowercase, trim, remove "sdn bhd", "sdn. bhd.", "plt", "inc", "ltd", "corp"
- [x] T006 [P] Add `evaluateTripleLock` internalQuery to `convex/functions/salesOrders.ts` — takes businessId, confidence, customerName. Returns { pass, lock1, lock2, lock3 } with detailed results per lock

**Checkpoint**: Settings CRUD + Triple-Lock evaluation logic ready

---

## Phase 3: User Story 1+2 - Auto-Approval Settings + Triple-Lock Execution (Priority: P1) MVP

- [x] T007 [US1] Create `src/domains/sales-invoices/components/auto-approval-settings.tsx` — drawer component with: toggle switch for enableAutoApprove, slider for autoApproveThreshold (0.90-1.00), number input for minLearningCycles (1-50), save button (bg-primary), disabled-reason banner if safety valve triggered
- [x] T008 [US1] Add gear icon button + drawer integration to `src/domains/sales-invoices/components/ar-reconciliation.tsx` — opens AutoApprovalSettings drawer, next to existing fee rules gear icon
- [x] T009 [US1] Add `useMatchingSettings` hook to `src/domains/sales-invoices/hooks/use-reconciliation.ts` — query matchingSettings.getOrCreate, mutation for matchingSettings.update
- [x] T010 [US2] Modify `classifyUnmatchedOrdersWithAI` in `convex/functions/salesOrders.ts` — after storing AI suggestions, evaluate Triple-Lock for each suggestion. If all locks pass: auto-approve (set matchMethod="auto_agent", aiMatchStatus="auto_approved") and post journal entry via existing helpers. If any lock fails: standard "pending_review"
- [x] T011 [US2] Run `npm run build` to verify TypeScript compilation passes

**Checkpoint**: Auto-approval settings configurable + Triple-Lock auto-posting works end-to-end

---

## Phase 4: User Story 3 - Audit Trail + "Verified by Groot" Badge (Priority: P1)

- [x] T012 [US3] Add "auto_agent" to methodConfig in `src/domains/sales-invoices/components/ar-reconciliation.tsx` with "Verified by Groot" label, distinct cyan/teal styling
- [x] T013 [US3] Update journal entry creation in the auto-approval path — add `preparedBy: "groot_ai_agent"` and store Triple-Lock evaluation results + reasoning trace in journal entry description/metadata
- [x] T014 [US3] Add "Verified by Groot" badge display for auto-approved orders in the reconciliation table — visually distinct from "Matched" and "AI Suggested" badges
- [x] T015 [US3] Run `npm run build` to verify TypeScript compilation passes

**Checkpoint**: Auto-approved matches have full audit trail + visual distinction

---

## Phase 5: User Story 4 - Safety Valve (Reversal) (Priority: P2)

- [x] T016 [US4] Add `reverseAutoMatch` mutation to `convex/functions/salesOrders.ts` — validates matchMethod="auto_agent", creates reversal JE (opposite debits/credits via existing helpers), sets matchStatus="unmatched" + aiMatchStatus="reversed", creates CRITICAL_FAILURE correction (weight=5)
- [x] T017 [US4] Add safety valve check to `reverseAutoMatch` — count critical_failure corrections in last 30 days. If ≥3: set matching_settings.enableAutoApprove=false, set autoApproveDisabledReason="critical_failures_exceeded"
- [x] T018 [US4] Add "Reverse Auto-Match" button to order detail Sheet in `src/domains/sales-invoices/components/ar-reconciliation.tsx` — only visible for auto-approved orders (matchMethod="auto_agent"), bg-destructive styling, confirmation dialog before executing
- [x] T019 [US4] Add `reverseAutoMatch` mutation ref to `src/domains/sales-invoices/hooks/use-reconciliation.ts`
- [x] T020 [US4] Run `npm run build` to verify TypeScript compilation passes

**Checkpoint**: Reversal + safety valve working

---

## Phase 6: User Story 5 - Dashboard Metrics (Priority: P3)

- [ ] T021 [US5] Extend `getMatchingMetrics` query in `convex/functions/salesOrders.ts` — add: autoApprovalRate (% of Tier 2 auto-approved), criticalFailureCount (last 30 days), topVendorTrustScores (top 5 vendors with cycles/threshold)
- [ ] T022 [US5] Add auto-approval metrics card to AR reconciliation dashboard in `src/domains/sales-invoices/components/ar-reconciliation.tsx` — show auto-approval rate + critical failure count alongside existing AI metrics
- [ ] T023 [US5] Run `npm run build` to verify TypeScript compilation passes

---

## Phase 7: Polish

- [x] T024 Update `CLAUDE.md` Recent Changes section
- [x] T025 Final `npm run build` verification

---

## Dependencies

- **Phase 1**: No dependencies
- **Phase 2**: Depends on Phase 1
- **Phase 3**: Depends on Phase 2
- **Phase 4**: Depends on Phase 3 (needs auto-approval to exist before reversing it)
- **Phase 5**: Depends on Phase 3
- **Phase 6**: Depends on Phase 3
- **Phase 7**: All phases complete

## Implementation Strategy

### MVP (US1+US2+US3)
1. Phase 1: Schema (T001-T003)
2. Phase 2: Backend logic (T004-T006)
3. Phase 3: Settings UI + Triple-Lock execution (T007-T011)
4. Phase 4: Audit trail + badge (T012-T015)
5. **VALIDATE**: Enable auto-approval, import CSV, verify auto-posting

### Incremental
6. Phase 5: Reversal safety valve (T016-T020)
7. Phase 6: Dashboard metrics (T021-T023)
8. Phase 7: Polish (T024-T025)
