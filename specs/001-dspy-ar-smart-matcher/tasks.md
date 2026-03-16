# Tasks: DSPy Smart Matcher for AR Order-to-Invoice Reconciliation

**Input**: Design documents from `/specs/001-dspy-ar-smart-matcher/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Schema & Infrastructure)

**Purpose**: Convex schema changes and DSPy module scaffolding that all stories depend on

- [x] T001 Add `order_matching_corrections` table to `convex/schema.ts` with fields: businessId, orderReference, orderCustomerName, orderAmount, orderDate, originalSuggestedInvoiceId (optional), originalConfidence (optional), originalReasoning (optional), correctedInvoiceId, correctedInvoiceNumber, correctedInvoiceCustomerName, correctedInvoiceAmount, correctionType, createdBy, createdAt. Indexes: by_businessId_createdAt, by_businessId_orderReference
- [x] T002 Extend `sales_orders` table in `convex/schema.ts` with new optional fields: aiMatchSuggestions (array), aiMatchModelVersion (string), aiMatchTier (number), aiMatchStatus (string)
- [ ] T003 Run `npx convex deploy --yes` to deploy schema changes to production

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Convex functions and Lambda module that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create `convex/functions/orderMatchingCorrections.ts` with CRUD mutations: `create` (user-facing, deduplicates by businessId+orderReference), `listByBusiness` (internal query for training data export, sorted by createdAt desc), `countByBusiness` (internal query returning total count + unique customer name count)
- [x] T005 [P] Create `src/lambda/fee-classifier-python/ar_match_module.py` with DSPy Signature `MatchOrderToInvoice` (InputFields: order_reference, customer_name, order_amount, order_date, candidate_invoices_json, max_split_invoices; OutputFields: matched_invoices_json, total_allocated, confidence, reasoning, match_type) and Module `OrderInvoiceMatcher` using `dspy.ChainOfThought(MatchOrderToInvoice)` with Assert (amount balance within tolerance) and Suggest (customer name alignment)
- [x] T006 Add `/match_orders` endpoint to `src/lambda/fee-classifier-python/handler.py` — register in the JSON-RPC router, accept request per contracts/ar-match-api.md, load model from S3 if modelS3Key provided, decide DSPy vs fallback (≥20 corrections = BootstrapFewShot, else raw Gemini with 0.80 cap), call OrderInvoiceMatcher.forward(), return response per contract
- [x] T007 Add `classifyUnmatchedOrdersWithAI` internalAction to `convex/functions/salesOrders.ts` — for each unmatched order after Tier 1: gather candidate invoices (unclaimed, same business), fetch corrections from orderMatchingCorrections, fetch active model from dspy_model_versions (domain="ar_matching"), call MCP tool "match_orders" via `convex/lib/mcpClient.ts`, update sales_order with aiMatchSuggestions, aiMatchTier=2, aiMatchStatus="pending_review"

**Checkpoint**: Foundation ready — Tier 2 AI matching can now be triggered and returns suggestions stored on sales_orders

---

## Phase 3: User Story 1 - AI-Assisted Fuzzy Matching (Priority: P1) MVP

**Goal**: Unmatched orders after Tier 1 automatically get AI match suggestions with reasoning traces, displayed with confidence highlighting and bulk approve

**Independent Test**: Import a CSV with fuzzy-match scenarios (nickname customers, slight amount variances), verify AI suggestions appear with reasoning, approve via bulk action

### Implementation for User Story 1

- [x] T008 [US1] Modify `runMatching()` in `convex/functions/salesOrders.ts` — after Phase 1 (exact reference) and Phase 2 (fuzzy), mark all orders with aiMatchTier=1 for Tier 1 matches and aiMatchTier=0 for unmatched. Then schedule `classifyUnmatchedOrdersWithAI` internalAction for the unmatched orders
- [x] T009 [US1] Add `approveAiMatches` mutation to `convex/functions/salesOrders.ts` — accepts array of salesOrderIds, for each: take top aiMatchSuggestion, populate matchedInvoiceId, matchConfidence, matchMethod="ai_suggested", matchStatus (matched if exact amount, variance if within tolerance), set aiMatchStatus="approved"
- [x] T010 [US1] Add `rejectAiMatch` mutation to `convex/functions/salesOrders.ts` — accepts salesOrderId, sets aiMatchStatus="rejected", clears aiMatchSuggestions, order stays unmatched for manual linking
- [x] T011 [US1] Update AR reconciliation table in `src/domains/sales-invoices/components/ar-reconciliation.tsx` — add new column for AI match status with confidence dot indicator (green ≥0.85, yellow 0.60-0.84, red <0.60), show condensed reasoning preview as tooltip on hover, add checkbox column for rows where aiMatchStatus="pending_review"
- [x] T012 [US1] Add floating batch action bar to `src/domains/sales-invoices/components/ar-reconciliation.tsx` — appears when 1+ AI suggestion checkboxes are selected, shows "Approve Selected (N)" button (bg-primary), "Reject Selected" button (bg-destructive), calls approveAiMatches/rejectAiMatch mutations. Follow existing bank recon batch actions bar pattern
- [x] T013 [US1] Add AI suggestion detail to the order detail Sheet in `src/domains/sales-invoices/components/ar-reconciliation.tsx` — when order has aiMatchSuggestions, show: suggested invoice(s) with allocated amounts, full reasoning trace (expandable), confidence score with color indicator, model version used, approve/reject buttons within the sheet
- [x] T014 [US1] Add "ai_suggested" to matchMethod filter and "pending_review" status filter pill in the existing filter bar of `src/domains/sales-invoices/components/ar-reconciliation.tsx`
- [x] T015 [US1] Update `src/domains/sales-invoices/hooks/use-reconciliation.ts` — add mutation refs for approveAiMatches, rejectAiMatch to useReconciliationMutations hook
- [x] T016 [US1] Run `npm run build` to verify TypeScript compilation passes

**Checkpoint**: User Story 1 complete — AI fuzzy matching works end-to-end with approval UI

---

## Phase 4: User Story 2 - Learning from User Corrections (Priority: P1)

**Goal**: When users manually match orders (overriding or supplementing AI), corrections are captured and feed the training pipeline

**Independent Test**: Make 5 manual corrections, verify correction records created. Import new batch, verify AI reasoning references learned patterns

### Implementation for User Story 2

- [x] T017 [US2] Add correction capture to manual match flow in `convex/functions/salesOrders.ts` — when `updateMatchStatus` is called to manually link an order that had aiMatchSuggestions, auto-create an orderMatchingCorrections record with correctionType="wrong_match" (if AI suggested different invoice) or "missed_match" (if AI had no suggestion)
- [x] T018 [US2] Add correction capture to reject flow — when `rejectAiMatch` is called with no alternative match, create correction with correctionType="false_positive"
- [x] T019 [US2] Update `classifyUnmatchedOrdersWithAI` in `convex/functions/salesOrders.ts` — pass corrections (up to 50 most recent) to the MCP match_orders call, pass active model S3 key if one exists
- [x] T020 [P] [US2] Create `src/lambda/fee-classifier-python/ar_match_optimizer.py` — MIPROv2 optimization function: accepts corrections array, splits 80/20 train/test, evaluates baseline, runs MIPROv2(auto="medium"), evaluates optimized model, saves to S3 if improved, returns accuracy metrics
- [x] T021 [US2] Add `/optimize_ar_match_model` endpoint to `src/lambda/fee-classifier-python/handler.py` — register in JSON-RPC router, call ar_match_optimizer, return result per contract
- [x] T022 [US2] Create `convex/functions/orderMatchingOptimization.ts` — internalAction `weeklyOptimization`: for each business with ≥100 corrections and ≥15 unique customer names and new corrections since lastCorrectionId on active model, export corrections, call MCP "optimize_ar_match_model", record result in dspy_model_versions (domain="ar_matching", platform="ar_match_{businessId}"), accuracy-gate activation
- [x] T023 [US2] Register weekly optimization cron in `convex/crons.ts` — add orderMatchingOptimization.weeklyOptimization to existing cron schedule (weekly or reuse existing 3-day EventBridge pattern)
- [x] T024 [US2] Update BootstrapFewShot inline training in `src/lambda/fee-classifier-python/ar_match_module.py` — when ≥20 corrections provided and no model S3 key, compile OrderInvoiceMatcher with BootstrapFewShot(max_bootstrapped_demos=4, max_labeled_demos=8) using corrections as training examples, with metric: exact match on invoiceId
- [x] T025 [US2] Run `npm run build` to verify TypeScript compilation passes

**Checkpoint**: User Story 2 complete — corrections captured, few-shot learning active at ≥20 corrections, MIPROv2 optimization pipeline ready at ≥100 corrections

---

## Phase 5: User Story 3 - N-to-N and Partial Payment Matching (Priority: P2)

**Goal**: AI can suggest split matches (1 payment → up to 5 invoices) and detect partial payments

**Independent Test**: Create a payment of RM 3,000 and three invoices of RM 1,000 each for the same customer, verify AI suggests 1-to-3 split match

### Implementation for User Story 3

- [x] T026 [US3] Extend OrderInvoiceMatcher in `src/lambda/fee-classifier-python/ar_match_module.py` — update Signature to output matched_invoices_json as array (max 5 entries), add Assert: sum of allocated amounts must be within tolerance of order amount, add Suggest: if order amount exceeds total matched, note "check for related orders or advance payments"
- [x] T027 [US3] Update `classifyUnmatchedOrdersWithAI` in `convex/functions/salesOrders.ts` — handle split match responses: store multiple invoiceId/allocatedAmount pairs in aiMatchSuggestions array, set matchType to "split"
- [ ] T028 [US3] Update `approveAiMatches` in `convex/functions/salesOrders.ts` — for split matches: set matchedInvoiceId to first invoice, store full split details in matchVariances, update matched invoice payment status to "partial" if allocatedAmount < invoice total
- [x] T029 [US3] Update AI suggestion display in order detail Sheet in `src/domains/sales-invoices/components/ar-reconciliation.tsx` — for split matches: show each matched invoice with its allocated amount in a mini-table, show total allocated vs order amount, highlight any variance
- [x] T030 [US3] Run `npm run build` to verify TypeScript compilation passes

**Checkpoint**: User Story 3 complete — split matching and partial payments work end-to-end

---

## Phase 6: User Story 4 - Reconciliation Integrity Constraints (Priority: P2)

**Goal**: Assert/Suggest constraints prevent the AI from producing accounting-invalid matches

**Independent Test**: Present AI with scenario where amounts don't balance, verify it retries or rejects rather than suggesting an unbalanced match

### Implementation for User Story 4

- [x] T031 [US4] Add `assert_transform_module` wrapper to OrderInvoiceMatcher in `src/lambda/fee-classifier-python/ar_match_module.py` — import from dspy.primitives.assertions, wrap module with backtrack_handler for retry on Assert failures (max 3 retries)
- [x] T032 [US4] Add constraint result reporting to match response in `src/lambda/fee-classifier-python/handler.py` — include constraintResults object in response: amountBalance (passed/failed), customerNameMatch (passed/soft_warning), invoiceExists (passed/failed)
- [ ] T033 [US4] Display constraint results in order detail Sheet in `src/domains/sales-invoices/components/ar-reconciliation.tsx` — show constraint badges (green check for passed, yellow warning for soft_warning, red X for failed) next to AI suggestion
- [x] T034 [US4] Run `npm run build` to verify TypeScript compilation passes

**Checkpoint**: User Story 4 complete — integrity constraints active with visual feedback

---

## Phase 7: User Story 5 - Matching Performance Dashboard (Priority: P3)

**Goal**: Finance managers see auto-match rate, correction rate, and time saved metrics

**Independent Test**: Run 3 batches with known outcomes, verify dashboard shows accurate aggregate metrics

### Implementation for User Story 5

- [x] T035 [US5] Add `getMatchingMetrics` query to `convex/functions/salesOrders.ts` — aggregate per-business metrics: total orders by aiMatchTier (0, 1, 2), count by aiMatchStatus (approved, rejected, corrected, pending_review), average matchConfidence for Tier 2, total corrections from orderMatchingCorrections. Calculate: auto-match rate, correction rate, estimated hours saved (count × 2 min)
- [x] T036 [US5] Add metrics summary cards to top of AR reconciliation page in `src/domains/sales-invoices/components/ar-reconciliation.tsx` — display: Auto-Match Rate (%), Tier 2 Precision (%), Corrections This Month, Est. Time Saved. Use existing summary card pattern from the page
- [x] T037 [US5] Run `npm run build` to verify TypeScript compilation passes

**Checkpoint**: User Story 5 complete — basic dashboard metrics visible

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final deployment, documentation, and verification

- [ ] T038 Deploy Convex changes: `npx convex deploy --yes`
- [ ] T039 [P] Deploy Lambda changes: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2` (if Lambda handler modified)
- [x] T040 Run final `npm run build` to verify complete build passes
- [x] T041 Update `CLAUDE.md` Recent Changes section with summary of DSPy Smart Matcher feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — schema changes first
- **Foundational (Phase 2)**: Depends on Phase 1 (schema deployed) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — core matching + approval UI
- **User Story 2 (Phase 4)**: Depends on Phase 3 (US1) — needs manual match flow to capture corrections from
- **User Story 3 (Phase 5)**: Depends on Phase 2 — can run in parallel with US2
- **User Story 4 (Phase 6)**: Depends on Phase 2 — can run in parallel with US2/US3
- **User Story 5 (Phase 7)**: Depends on Phase 3 (US1) — needs match data to aggregate
- **Polish (Phase 8)**: Depends on all desired user stories complete

### User Story Dependencies

- **US1 (P1)**: Start after Phase 2 — no other story dependencies
- **US2 (P1)**: Start after US1 — needs manual match flow to capture corrections from
- **US3 (P2)**: Start after Phase 2 — independent of US1/US2 (extends Lambda module)
- **US4 (P2)**: Start after Phase 2 — independent (adds constraint wrappers to Lambda)
- **US5 (P3)**: Start after US1 — needs match data to display metrics

### Parallel Opportunities

- T001 + T002 can run in parallel (different schema sections)
- T004 + T005 can run in parallel (Convex vs Lambda, different files)
- T011 + T012 + T013 + T014 can run in parallel (different UI sections, though same file — sequential recommended)
- T020 + T021 can run in parallel with T017-T019 (Lambda vs Convex)
- US3 + US4 can run in parallel after Phase 2 (different concerns)
- T038 + T039 can run in parallel (Convex deploy vs CDK deploy)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T007)
3. Complete Phase 3: User Story 1 (T008-T016)
4. **STOP and VALIDATE**: Import test CSV, verify AI suggestions appear with reasoning, test bulk approve
5. Deploy if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test independently → Deploy (MVP!)
3. Add US2 → Test corrections captured, verify learning → Deploy
4. Add US3 + US4 in parallel → Test split matching + constraints → Deploy
5. Add US5 → Test dashboard metrics → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- All UI changes are in the same file (`ar-reconciliation.tsx`) — mark sequential within a story
- Lambda changes (`handler.py`, `ar_match_module.py`) can run in parallel with Convex changes
- Must run `npx convex deploy --yes` after schema changes (T003) and after final changes (T038)
- Must run `npm run build` at each checkpoint to catch TypeScript errors early
