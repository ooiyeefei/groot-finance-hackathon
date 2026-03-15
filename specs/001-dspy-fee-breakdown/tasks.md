# Tasks: Hybrid Fee Breakdown Detection (Rules + DSPy)

**Input**: Design documents from `/specs/001-dspy-fee-breakdown/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Cherry-pick reusable code from `001-hybrid-fee-detection` branch and create new DSPy Lambda project structure

- [x] T001 Cherry-pick Tier 1 fee classification code from `001-hybrid-fee-detection` branch: `convex/lib/feeClassifier.ts`, `convex/functions/feeClassificationRules.ts`, `convex/functions/feeClassificationCorrections.ts`
- [x] T002 Cherry-pick schema changes from `001-hybrid-fee-detection`: add `fee_classification_rules`, `fee_classification_corrections` tables and `classifiedFees` fields on `sales_orders` to `convex/schema.ts`
- [ ] T003 Cherry-pick fee classification UI from `001-hybrid-fee-detection`: `src/domains/sales-invoices/components/fee-rules-manager.tsx`, `src/domains/sales-invoices/hooks/use-reconciliation.ts`, confidence UI changes in `src/domains/sales-invoices/components/ar-reconciliation.tsx`
- [x] T004 [P] Create Python Lambda project structure: `src/lambda/fee-classifier-python/Dockerfile`, `src/lambda/fee-classifier-python/requirements.txt` (dspy>=2.6, litellm, boto3), `src/lambda/fee-classifier-python/handler.py` (empty handler)
- [x] T005 [P] Clean up wrong-model references: remove `dspy>=2.6.0` from `src/lambda/document-processor-python/requirements.txt`, update `convex/functions/feeClassificationActions.ts` to remove Qwen3-8B `callLLMJson` calls (replace with TODO for DSPy Lambda call)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: CDK infrastructure, Convex schema additions, and DSPy module definition — MUST complete before user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Add `dspy_model_versions` and `dspy_optimization_logs` tables to `convex/schema.ts` per data-model.md
- [x] T007 Create CDK stack `infra/lib/fee-classifier-stack.ts`: Docker Python Lambda (`finanseal-fee-classifier`, ARM_64, 512MB, 5min timeout), IAM role with S3 read (`finanseal-bucket/dspy-models/*`), GEMINI_API_KEY env var from SSM, add Lambda permission for Vercel OIDC role
- [x] T008 [P] Create DSPy module definition in `src/lambda/fee-classifier-python/fee_module.py`: define `ClassifyFee` signature (inputs: fee_name, platform_name; outputs: account_code, confidence, reasoning), implement `FeeClassifier` module using `dspy.ChainOfThought` with `dspy.Assert` for balance validation
- [x] T009 [P] Create `convex/functions/dspyModelVersions.ts`: `getActiveModel` (internalQuery), `recordTrainingResult` (internalMutation with accuracy comparison + auto-rollback), `rollback` (internalMutation)
- [x] T010 [P] Add MCP route or API Gateway endpoint for fee classifier Lambda — either add to existing MCP API Gateway in `infra/lib/mcp-server-stack.ts` or create a new endpoint in `fee-classifier-stack.ts`

**Checkpoint**: Infrastructure deployed, DSPy module defined, Convex schema ready

---

## Phase 3: User Story 1 — Bulk Fee Classification During CSV Import (Priority: P1) 🎯 MVP

**Goal**: Import a CSV and have Tier 1 rules automatically classify ≥80% of fees with ≥0.90 confidence

**Independent Test**: Import a Shopee CSV with standard fee columns. Verify fees are classified with correct account codes and confidence scores. Green/yellow/red indicators display correctly.

### Implementation for User Story 1

- [ ] T011 [US1] Verify cherry-picked Tier 1 engine works: test `classifyFeesWithRules()` in `convex/lib/feeClassifier.ts` with standard Shopee fee names (Commission Fee, Shipping Fee, Service Fee) and confirm confidence 0.98 for exact match, 0.90 for substring
- [ ] T012 [US1] Verify cherry-picked `salesOrders.importBatch` in `convex/functions/salesOrders.ts` calls `classifyFeesWithRules()` during import and populates `classifiedFees` array on each sales order
- [ ] T013 [US1] Verify `validateFeeBalance()` runs during import and sets `balanceValidationStatus` and `balanceDiscrepancy` fields
- [ ] T014 [US1] Verify cherry-picked AR Reconciliation UI shows confidence dots (green/yellow/red) per row in `src/domains/sales-invoices/components/ar-reconciliation.tsx`
- [ ] T015 [US1] Add custom platform support to `convex/functions/feeClassificationRules.ts`: allow `create()` mutation to accept any platform string (not just the 5 defaults), update `seedDefaults()` to only seed for default platforms
- [ ] T016 [US1] Update `src/domains/sales-invoices/components/fee-rules-manager.tsx` to allow adding custom platform names via a text input (in addition to the 5 default platform tabs)
- [ ] T017 [US1] Deploy Convex changes: `npx convex deploy --yes`

**Checkpoint**: Tier 1 classification works end-to-end. CSV import → classified fees → confidence UI. Custom platforms supported.

---

## Phase 4: User Story 2 — Confidence-Based Review and Correction (Priority: P1)

**Goal**: Bookkeepers can filter to low-confidence items, correct them inline, and corrections are saved as training data

**Independent Test**: Import CSV with mixed fees. Filter to "needs review". Correct 5 fees. Verify corrections saved. Re-import same CSV and verify corrected fees now have higher confidence.

### Implementation for User Story 2

- [ ] T018 [US2] Verify cherry-picked "Show only items needing review" filter works in `src/domains/sales-invoices/components/ar-reconciliation.tsx` — filters to rows with any fee below 0.90 confidence or isNew=true
- [ ] T019 [US2] Verify cherry-picked inline correction dropdown works — user selects new account code, calls `recordCorrection()` in `convex/functions/feeClassificationCorrections.ts`
- [ ] T020 [US2] Verify correction storage includes all required fields per FR-014: original fee name, original account code, corrected account code, platform, correctedBy (Clerk user ID), timestamp
- [ ] T021 [US2] Verify "NEW" badge renders distinctly from low-confidence red highlighting — `isNew: true` fees show a red badge labeled "NEW", while low-confidence fees show a red dot without badge

**Checkpoint**: Review + correction loop works. Corrections saved as training data for DSPy.

---

## Phase 5: User Story 5 — Fee Balance Enforcement at Period Close (Priority: P1)

**Goal**: Period close is blocked if any sales order has unbalanced fees. Balanced orders create per-fee-category journal entries.

**Independent Test**: Import CSV with one unbalanced order. Attempt period close. Verify blocked with error. Fix the balance. Close successfully. Verify journal entries have separate debit lines per fee category.

### Implementation for User Story 5

- [ ] T022 [US5] Verify cherry-picked balance validation in period close — `closePeriod()` mutation checks all sales orders for `balanceValidationStatus === "unbalanced"` and blocks with error listing affected order IDs and discrepancy amounts
- [ ] T023 [US5] Verify cherry-picked journal entry creation in `convex/functions/integrations/arReconciliationIntegration.ts` creates separate debit lines per fee category (one line per distinct accountCode in classifiedFees)
- [ ] T024 [US5] Verify closed period blocks further fee classification modifications — corrections after period close must create adjustment entries in new period
- [ ] T025 [US5] Deploy Convex changes: `npx convex deploy --yes`

**Checkpoint**: All three P1 stories complete. Balance enforcement, review UI, and bulk classification all work independently.

---

## Phase 6: User Story 3 — DSPy-Powered Tier 2 Classification (Priority: P2)

**Goal**: Unclassified fees (confidence 0.0) are sent to DSPy Lambda for AI classification. DSPy uses BootstrapFewShot with user corrections. Confidence-based UI highlights apply.

**Independent Test**: Accumulate 20+ corrections for Shopee. Import CSV with unknown Shopee fees. Verify DSPy classifies them with ≥0.70 confidence. Below 20 corrections, verify Gemini fallback with confidence capped at 0.80.

### Implementation for User Story 3

- [x] T026 [US3] Implement `classify_fees` handler in `src/lambda/fee-classifier-python/handler.py`: parse JSON-RPC request, load DSPy model from S3 (or bundled default), call `FeeClassifier` module, return classifications with confidence scores per contract in `contracts/fee-classifier-lambda.md`
- [x] T027 [US3] Implement Gemini LM configuration in `src/lambda/fee-classifier-python/fee_module.py`: configure `dspy.LM("gemini/gemini-3.1-flash-lite-preview")` with API key from env var, set temperature=0.3
- [x] T028 [US3] Implement BootstrapFewShot training in `src/lambda/fee-classifier-python/handler.py`: accept `businessCorrections` array, convert to `dspy.Example` format, run `BootstrapFewShot` optimizer with `max_bootstrapped_demos=4, max_labeled_demos=8`
- [x] T029 [US3] Implement Assert constraint in `src/lambda/fee-classifier-python/fee_module.py`: `dspy.Assert(abs(sum_fees - expected_fees) < 0.01, "Fee breakdown doesn't balance")` within the `FeeClassifier.forward()` method
- [x] T030 [US3] Implement fallback logic in `src/lambda/fee-classifier-python/handler.py`: if corrections < 20, skip BootstrapFewShot and use raw `dspy.ChainOfThought` with corrections as prompt context, cap confidence at 0.80
- [x] T031 [US3] Implement "NEW" detection in `src/lambda/fee-classifier-python/handler.py`: check if fee name exists in any correction for the platform — if not, set `isNew: true`
- [x] T032 [US3] Update `convex/functions/feeClassificationActions.ts`: replace Qwen3-8B `callLLMJson` with `callMCPTool("classify_fees", ...)` using `convex/lib/mcpClient.ts`, pass business corrections and platform
- [x] T033 [US3] Implement correction count check in `convex/functions/feeClassificationActions.ts`: query `fee_classification_corrections` count for the platform, pass count to Lambda so it can decide DSPy vs fallback
- [x] T034 [US3] Implement DSPy unavailability fallback in `convex/functions/feeClassificationActions.ts`: if MCP call fails (timeout, error), retry once, then fall back to direct Gemini call via a simple HTTP fetch to Gemini API with corrections as prompt context, cap confidence at 0.80
- [ ] T035 [US3] Deploy fee classifier Lambda: `cd infra && npx cdk deploy FeeClassifierStack --profile groot-finanseal --region us-west-2`
- [ ] T036 [US3] Set `FEE_CLASSIFIER_ENDPOINT_URL` in Convex env: `npx convex env set --prod FEE_CLASSIFIER_ENDPOINT_URL <api-gw-url>`
- [ ] T037 [US3] Deploy Convex changes: `npx convex deploy --yes`
- [ ] T038 [US3] End-to-end test: import Shopee CSV with unknown fees, verify DSPy classifications appear with confidence scores and correct UI highlighting

**Checkpoint**: Tier 2 DSPy classification works. Unknown fees get AI-powered classification. Fallback handles DSPy unavailability.

---

## Phase 7: User Story 4 — Automated DSPy Optimization (Priority: P3)

**Goal**: Weekly MIPROv2 optimization retrains the DSPy model using accumulated corrections, with automatic rollback if results are worse.

**Independent Test**: Accumulate 100+ corrections. Trigger optimization manually. Verify new model version created in S3, accuracy logged, and active version updated in Convex.

### Implementation for User Story 4

- [x] T039 [US4] Implement `optimize_model` handler in `src/lambda/fee-classifier-python/optimizer.py`: load all corrections for platform, split 80/20 train/test, run `MIPROv2(auto="medium")`, save optimized model to S3 (`dspy-models/{platform}/v{N}.json`), return before/after accuracy
- [x] T040 [US4] Implement S3 model save/load in `src/lambda/fee-classifier-python/handler.py`: on cold start, load active model JSON from S3 key stored in request (or fall back to bundled default). Cache loaded model in module-level variable for warm starts
- [x] T041 [US4] Add `optimize_model` route to fee classifier Lambda handler in `src/lambda/fee-classifier-python/handler.py`: parse JSON-RPC for `optimize_model` tool name, delegate to `optimizer.py`
- [x] T042 [US4] Update Lambda timeout to 15 minutes in `infra/lib/fee-classifier-stack.ts` for MIPROv2 optimization runs (classification stays fast, optimization is a long-running batch job)
- [x] T043 [US4] Create `convex/functions/dspyOptimization.ts`: `triggerOptimization` internalAction that checks correction count ≥100, fetches all corrections for platform (pooled across businesses), gets current active model version, calls `optimize_model` MCP tool, records result via `dspyModelVersions.recordTrainingResult`
- [x] T044 [US4] Add weekly cron to `convex/crons.ts`: every Sunday at 02:00 UTC, for each platform with ≥100 corrections, call `dspyOptimization.triggerOptimization`
- [x] T045 [US4] Implement accuracy comparison and auto-rollback in `convex/functions/dspyModelVersions.ts` `recordTrainingResult`: if `afterAccuracy <= beforeAccuracy`, set new version status="failed", keep previous as "active", log warning
- [ ] T046 [US4] Deploy: `cd infra && npx cdk deploy FeeClassifierStack --profile groot-finanseal --region us-west-2` then `npx convex deploy --yes`

**Checkpoint**: Optimization pipeline works. Models versioned in S3. Auto-rollback on regression. Weekly cron scheduled.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, documentation, and deployment verification

- [ ] T047 [P] Update `src/domains/expense-claims/einvoice/CLAUDE.md` to remove stale DSPy CUA optimization references
- [ ] T048 [P] Update root `CLAUDE.md` documentation rules section to reference fee classifier Lambda in CDK stacks table
- [ ] T049 Run `npm run build` — fix any TypeScript build errors
- [ ] T050 Run full end-to-end flow: CSV import → Tier 1 classification → Tier 2 DSPy classification → review + correct → period close → journal entries with per-fee-category debits
- [ ] T051 Verify Gemini fallback path: temporarily break DSPy Lambda endpoint, import CSV, verify fees still get classified (confidence ≤0.80)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — cherry-pick from existing branch
- **Foundational (Phase 2)**: Depends on Setup — CDK stack and schema must be ready
- **User Stories 1, 2, 5 (Phases 3-5)**: All P1, depend on Foundational. Can run in parallel since they test different aspects (import, review, period close)
- **User Story 3 (Phase 6)**: P2, depends on Foundational + deployed Lambda (T035). Can start after Phase 2 but Lambda must be deployed before end-to-end test
- **User Story 4 (Phase 7)**: P3, depends on User Story 3 (DSPy must work before optimization makes sense)
- **Polish (Phase 8)**: Depends on all user stories

### User Story Dependencies

- **US1 (Bulk Classification)**: Phase 2 only — independent
- **US2 (Review & Correction)**: Phase 2 only — independent (uses same data as US1 but testable separately)
- **US5 (Balance Enforcement)**: Phase 2 only — independent
- **US3 (DSPy Tier 2)**: Phase 2 + deployed Lambda — independent of US1/US2/US5 but benefits from correction data (US2)
- **US4 (Optimization)**: Depends on US3 — cannot optimize without a working DSPy module

### Parallel Opportunities

- T004 + T005 (Setup: Lambda structure + cleanup) — different files
- T008 + T009 + T010 (Foundational: DSPy module + Convex functions + API route) — different services
- T011-T016 (US1 verification tasks) — can be done in parallel
- T018-T021 (US2 verification tasks) — can be done in parallel
- T047 + T048 (Polish: doc updates) — different files

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 5 — All P1)

1. Complete Phase 1: Setup (cherry-pick from existing branch)
2. Complete Phase 2: Foundational (CDK + schema + DSPy module definition)
3. Complete Phases 3-5: All P1 stories (bulk classification + review + balance enforcement)
4. **STOP and VALIDATE**: Full P1 flow works — import → classify → review → correct → period close
5. Deploy to production — Tier 1 rules provide immediate value

### Incremental Delivery

1. P1 stories → Tier 1 rules-only classification (immediate value, zero AI cost)
2. Add US3 (DSPy Tier 2) → Unknown fees now get AI classification
3. Add US4 (Optimization) → System self-improves weekly from user corrections

### Key Risk: Cherry-Pick Conflicts

The `001-hybrid-fee-detection` branch has diverged from main. Cherry-picking may have conflicts. If conflicts are severe, consider:
- Manually re-implementing Tier 1 logic (it's ~274 lines in feeClassifier.ts)
- Re-creating schema changes fresh (they're well-documented in data-model.md)
- Re-building UI components from the existing patterns (confidence dots are ~50 lines of JSX)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Cherry-pick tasks (T001-T003) may need manual conflict resolution
- All Convex deploys (`npx convex deploy --yes`) must happen before testing
- CDK deploys require `--profile groot-finanseal --region us-west-2`
- Gemini API key must be in SSM before Lambda deploy
- Total: 51 tasks across 8 phases
