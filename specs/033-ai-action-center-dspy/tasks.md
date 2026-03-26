# Tasks: Self-Improving Action Center (DSPy Feedback Loops)

**Input**: Design documents from `/specs/033-ai-action-center-dspy/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted. Manual UAT via finance.hellogroot.com.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Schema & Infrastructure)

**Purpose**: Add new table and fields to Convex schema — required before any feature work.

- [x] T001 Add `userFeedback` optional string field to `actionCenterInsights` table in `convex/schema.ts`
- [x] T002 Create `action_center_corrections` table in `convex/schema.ts` with fields: insightId (id), insightType (string), category (string), priority (string), isUseful (boolean), feedbackText (optional string), originalContext (any), businessId (id), userId (string), consumed (boolean, default false), consumedAt (optional number), consumedByVersion (optional string), createdAt (number). Add indexes: by_business [businessId], by_business_consumed [businessId, consumed], by_business_category [businessId, category], by_insightType [insightType], by_createdAt [createdAt]
- [x] T003 Add `by_module_business_status` index to `dspy_model_versions` table in `convex/schema.ts` with fields [module, businessId, status] for per-business model lookup. Also add optional `businessId` field if not already present.
- [x] T004 Deploy Convex schema changes: `npx convex deploy --yes` (deferred — deploy from main after merge)

**Checkpoint**: Schema ready — all new tables and fields deployed to production.

---

## Phase 2: User Story 1 — Dismiss Insight with Feedback (Priority: P1) 🎯 MVP

**Goal**: Finance admin can dismiss an insight with optional feedback text; a correction record is created automatically.

**Independent Test**: Dismiss an insight on finance.hellogroot.com, then check the `action_center_corrections` table in Convex dashboard for the new record with `isUseful: false` and the feedback text.

### Implementation for User Story 1

- [x] T005 [US1] Create internal mutation `createCorrection` in `convex/functions/actionCenterInsights.ts` that accepts insightId + isUseful + feedbackText, reads the insight document, and inserts a record into `action_center_corrections` with denormalized context (title, description, category, priority, affectedEntities, recommendedAction, insightType from metadata). Extract insightType from `metadata.insightType` field (falling back to category if not present).
- [x] T006 [US1] Extend `updateStatus` mutation in `convex/functions/actionCenterInsights.ts`: add optional `feedbackText` arg (v.optional(v.string())). When status="dismissed", store feedbackText as `userFeedback` on the insight record, then call `createCorrection` with isUseful=false. When status="dismissed" without feedbackText, still call `createCorrection` with isUseful=false and empty feedbackText.
- [x] T007 [US1] Add dismiss feedback dialog to `src/domains/analytics/components/action-center/InsightCard.tsx`: when user clicks the dismiss (X) button, show a small dialog/popover with a textarea labeled "Why is this not useful? (optional)" and two buttons: "Submit & Dismiss" (sends feedbackText) and "Skip" (dismisses without feedback). Both call updateStatus with status="dismissed". The dialog should be lightweight — not a full modal, preferably an inline expansion or small popover.
- [x] T008 [US1] Deploy Convex changes: `npx convex deploy --yes`
- [x] T009 [US1] Verify on finance.hellogroot.com: log in as admin (yeefei+test2@hellogroot.com), navigate to dashboard, dismiss an insight with feedback text, then check `action_center_corrections` table in Convex dashboard.

**Checkpoint**: Dismiss-with-feedback flow works end-to-end. Corrections table populates with negative signals.

---

## Phase 3: User Story 2 — Confirm Insight as Useful (Priority: P1)

**Goal**: When finance admin marks an insight as "actioned" or "reviewed", a positive correction record is created automatically.

**Independent Test**: Action an insight on finance.hellogroot.com, then check `action_center_corrections` for `isUseful: true`.

### Implementation for User Story 2

- [x] T010 [US2] Extend `updateStatus` mutation in `convex/functions/actionCenterInsights.ts`: when status="actioned" or status="reviewed", call `createCorrection` with isUseful=true. No feedbackText needed for positive signals (user already expressed intent by actioning).
- [x] T011 [US2] Deploy Convex changes: `npx convex deploy --yes`
- [x] T012 [US2] Verify on finance.hellogroot.com: action an insight, then check `action_center_corrections` table for the positive correction record.

**Checkpoint**: Both positive and negative feedback captured. Corrections table has balanced signals.

---

## Phase 4: User Story 3 — System Learns from Feedback (Priority: P2)

**Goal**: Weekly optimization pipeline trains a DSPy relevance classifier from corrections, quality-gates it, and promotes if accuracy improves.

**Independent Test**: Seed 20+ corrections via Convex dashboard, trigger optimization manually, verify model version created in `dspy_model_versions` table.

### Implementation for User Story 3

- [x] T013 [P] [US3] Create `convex/functions/actionCenterOptimization.ts` with `checkReadiness` internalQuery: accepts businessId, queries `action_center_corrections` for that business (last 6 months via createdAt filter), counts total corrections, counts unconsumed corrections (consumed=false), counts unique category values using Set, returns readyToOptimize boolean (≥20 corrections AND ≥10 unique contexts AND unconsumed > 0) plus stats object per category.
- [x] T014 [P] [US3] Add `getTrainingData` internalQuery to `convex/functions/actionCenterOptimization.ts`: accepts businessId and trainSplitRatio (default 0.8), fetches unconsumed corrections for business (last 6 months), groups by category, splits each group 80/20 (stratified), returns { train: Correction[], validation: Correction[], totalCorrections, categorySplit }.
- [x] T015 [P] [US3] Create DSPy relevance classifier module at `src/lambda/fee-classifier-python/action_center_relevance.py`. Define `ActionCenterRelevanceClassifier` DSPy module with signature: input=(insightType, category, priority, title, description, affectedEntities) → output=(relevant: bool, confidence: float). Define `create_action_center_training_examples` function that converts corrections into DSPy examples. Define `action_center_relevance_metric` function that compares predicted relevance vs actual isUseful. Follow pattern from `chat_intent_module.py`.
- [x] T016 [US3] Add action center optimization handler to `src/lambda/fee-classifier-python/handler.py`: add new case for `module="action-center-relevance"` that imports ActionCenterRelevanceClassifier, create_action_center_training_examples, and action_center_relevance_metric; runs BootstrapFewShot optimizer (max_bootstrapped_demos=4, max_labeled_demos=8); evaluates candidate on validation set; returns quality gate result with accuracy comparison. Follow exact pattern of existing chat-agent-intent handler.
- [x] T017 [US3] Add `prepareAndRun` internalAction to `convex/functions/actionCenterOptimization.ts`: orchestrates the full pipeline — (1) call checkReadiness, skip if not ready; (2) call getTrainingData; (3) invoke `finanseal-dspy-optimizer` Lambda with module="action-center-relevance" + training data; (4) create model version in dspy_model_versions with status="candidate"; (5) if quality gate passed: promote to "promoted", supersede previous, mark corrections consumed; (6) if quality gate failed: set status to "rejected"; (7) log to dspy_optimization_logs. Follow pattern from `chatOptimizationNew.ts`.
- [x] T018 [US3] Add `getActiveModel` internalQuery to `convex/functions/actionCenterOptimization.ts`: accepts businessId + module, queries `dspy_model_versions` with `by_module_business_status` index for status="promoted", returns { hasModel, version: { versionId, s3Key, accuracy, promotedAt } } or null.
- [x] T019 [US3] Add `markCorrectionsConsumed` internalMutation to `convex/functions/actionCenterOptimization.ts`: accepts array of correction IDs + versionId, patches each correction with consumed=true, consumedAt=Date.now(), consumedByVersion=versionId.
- [x] T020 [US3] Add EventBridge rule for weekly action center optimization in `infra/lib/scheduled-intelligence-stack.ts`: add new entry to the schedules array with module='action-center-dspy-optimization', schedule='cron(0 2 ? * SUN *)', description='Weekly Action Center DSPy relevance optimization'. Follow exact pattern of existing 'chat-agent-optimization' entry.
- [x] T021 [US3] Add action center dispatch handler to the scheduled intelligence Lambda dispatcher: in the Lambda handler that processes EventBridge events, add a case for module='action-center-dspy-optimization' that loops through all active businesses and calls `prepareAndRun` for each. Follow pattern of existing chat-agent-optimization dispatch.
- [x] T022 [US3] Deploy infrastructure: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`
- [x] T023 [US3] Deploy Convex changes: `npx convex deploy --yes`

**Checkpoint**: Optimization pipeline can be triggered (manually or via EventBridge). Model versions appear in dspy_model_versions table.

---

## Phase 5: User Story 4 — Fewer False Positives Over Time (Priority: P2)

**Goal**: Use the trained model as a post-filter to suppress noise insights during generation.

**Independent Test**: With an active model in dspy_model_versions, run the detection pipeline and verify suppressed insights are logged but not surfaced.

### Implementation for User Story 4

- [x] T024 [P] [US4] Extend `src/lib/ai/dspy/model-version-loader.ts` with business-scoped model loading: add `loadActiveModelForBusiness(module: string, businessId: string)` function that queries `getActiveModel` from actionCenterOptimization, loads the model artifact from S3 if available, caches with 5min TTL keyed by `${module}:${businessId}`. Return the OptimizedPromptArtifact or null if no model exists.
- [x] T025 [US4] Add post-filter step to insight generation in `convex/functions/actionCenterJobs.ts`: after each detection algorithm generates candidate insights (before the `ctx.db.insert` call), load the active model for that business using `getActiveModel`. If a model exists, call the DSPy relevance classifier (via the MCP server or direct Gemini call with the optimized prompt) for each candidate. Only insert candidates classified as relevant. Log the count of suppressed candidates (e.g., `console.log(\`[ActionCenter] Suppressed ${suppressed}/${total} insights for business ${businessId}\`)`).
- [x] T026 [US4] Deploy Convex changes: `npx convex deploy --yes`

**Checkpoint**: Businesses with trained models see fewer insights. Suppression counts visible in Convex logs.

---

## Phase 6: User Story 5 — Per-Business Learning (Priority: P3)

**Goal**: Ensure corrections and models are strictly isolated per business.

**Independent Test**: Create corrections for two different businesses, verify each business's model reflects only its own corrections.

### Implementation for User Story 5

- [x] T027 [US5] Verify per-business isolation in all queries: audit `checkReadiness`, `getTrainingData`, `getActiveModel`, and `markCorrectionsConsumed` to confirm every query filters by businessId. Ensure no query can return corrections or models from another business. Add explicit businessId checks where missing.
- [x] T028 [US5] Verify post-filter loads the correct per-business model in `actionCenterJobs.ts`: ensure the post-filter step passes the current businessId to `getActiveModel`, not a hardcoded or global value. Businesses without a model should skip filtering (all candidates surfaced).
- [x] T029 [US5] Deploy Convex changes if any fixes needed: `npx convex deploy --yes`

**Checkpoint**: Multi-tenant isolation verified. Business A's corrections never affect Business B.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final quality pass, build verification, and documentation.

- [x] T030 Run `npm run build` and fix any TypeScript/build errors introduced by the feature
- [x] T031 [P] Update `CLAUDE.md` documentation: add Action Center DSPy section documenting the corrections table, optimization pipeline, model loading, and EventBridge schedule. Follow pattern of existing "DSPy Self-Improvement System" section.
- [x] T032 [P] Verify no Convex bandwidth regressions: check that all optimization queries use internalQuery (not reactive query), corrections table queries are indexed, and no `.collect()` without limits on large tables.
- [x] T033 Final Convex deploy: `npx convex deploy --yes`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Setup completion
- **US2 (Phase 3)**: Depends on Setup completion (can run in parallel with US1 if desired, but T010 modifies same file as T006)
- **US3 (Phase 4)**: Depends on US1 + US2 (needs corrections data to exist)
- **US4 (Phase 5)**: Depends on US3 (needs trained model to filter with)
- **US5 (Phase 6)**: Can start after US3 (audit task, no new features)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Can start after Setup → MVP milestone
- **US2 (P1)**: Can start after Setup → completes feedback capture
- **US3 (P2)**: Needs corrections from US1/US2 → builds learning loop
- **US4 (P2)**: Needs model from US3 → closes the feedback loop
- **US5 (P3)**: Audit task after US3 → verifies isolation

### Within Each User Story

- Schema changes before mutations
- Mutations before UI
- Convex deploy before UAT verification

### Parallel Opportunities

- T013, T014, T015 can run in parallel (different files: Convex queries vs Python Lambda)
- T024 can run in parallel with T025 (different files: model-version-loader vs actionCenterJobs)
- T031, T032 can run in parallel (documentation vs audit)

---

## Parallel Example: User Story 3

```bash
# Launch these three in parallel (different files, no dependencies between them):
Task T013: "Create checkReadiness query in convex/functions/actionCenterOptimization.ts"
Task T014: "Create getTrainingData query in convex/functions/actionCenterOptimization.ts"
Task T015: "Create DSPy module in src/lambda/fee-classifier-python/action_center_relevance.py"
```

Note: T013 and T014 are in the same file but can still be parallelized since they're independent functions that don't reference each other.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: User Story 1 (T005-T009)
3. **STOP and VALIDATE**: Dismiss an insight with feedback on production, verify correction record
4. This alone delivers value — feedback capture enables future learning

### Incremental Delivery

1. Setup + US1 → Feedback capture works → Deploy (MVP!)
2. Add US2 → Positive signals captured → Deploy
3. Add US3 → Optimization pipeline ready → Deploy
4. Add US4 → Post-filter active → Deploy (full loop closed!)
5. Add US5 → Multi-tenant audit → Deploy (hardened)

### Recommended Execution

Single developer, sequential: **Setup → US1 → US2 → US3 → US4 → US5 → Polish**

Total estimated tasks: 33

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Build must pass (`npm run build`) before considering any phase complete
- Deploy Convex (`npx convex deploy --yes`) after any Convex-related changes
