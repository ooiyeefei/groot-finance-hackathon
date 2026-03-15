# Tasks: DSPy Self-Improving E-Invoice CUA Pipeline Integration

**Input**: Design documents from `/specs/001-dspy-cua-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new files needed — verify existing scaffolding is correct

- [ ] T001 Verify all DSPy module files exist and import correctly by running `python -c "from dspy_modules import troubleshooter, recon, instruction_guard, buyer_matcher, confidence_gate, module_loader"` in `src/lambda/einvoice-form-fill-python/`
- [ ] T002 Verify optimization pipeline files exist and import by running `python -c "from optimization import optimizer, data_collector, evaluator"` in `src/lambda/einvoice-form-fill-python/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Convex query for raw training data — required by the optimization pipeline (US3, US5) and data logging (US1)

**CRITICAL**: No optimization can run until training data is collectible

- [ ] T003 Add `getEinvoiceRawTrainingData` query to `convex/functions/system.ts` — query `einvoice_request_logs` with `generatedHint` populated, pair consecutive merchant attempts to resolve `nextAttemptSucceeded`, return `hintPairs[]` and `reconPairs[]` per contract in `specs/001-dspy-cua-integration/contracts/convex-queries.md`
- [ ] T004 Update `src/lambda/einvoice-form-fill-python/optimization/data_collector.py` — replace empty `collect_hint_effectiveness_pairs()` and `collect_recon_success_pairs()` with actual Convex HTTP API calls to the new `getEinvoiceRawTrainingData` query

**Checkpoint**: Data collection pipeline returns real training pairs from Convex logs

---

## Phase 3: User Story 1 — Smarter Troubleshooting (Priority: P1) MVP

**Goal**: Replace inline `dspy.Predict(FormDiagnosis)` with `OptimizedTroubleshooter` module that loads MIPROv2-optimized weights from S3

**Independent Test**: Trigger a form fill failure, verify CloudWatch logs show `[DSPy] Troubleshooter loaded optimized state` or `using baseline`, and `dspyModuleVersion` is logged

### Implementation for User Story 1

- [ ] T005 [US1] Refactor `troubleshoot()` function in `src/lambda/einvoice-form-fill-python/handler.py` (lines 2168-2304): remove inline `FormDiagnosis` class definition (lines 2185-2206), import `create_troubleshooter` from `dspy_modules.troubleshooter` and `load_optimized_module` from `dspy_modules.module_loader`, create troubleshooter via `create_troubleshooter(load_optimized_module("troubleshooter"))`, call `module.forward()` with all 5 input fields (error_message, merchant_name, screenshot_description, previous_hints, tier_reached)
- [ ] T006 [US1] Add `previous_hints` and `tier_reached` parameters to the `troubleshoot()` function signature in `src/lambda/einvoice-form-fill-python/handler.py` and pass them from all call sites (search for `troubleshoot(` calls around lines 2803, 2977, 3023) — `previous_hints` comes from `fc.get("cuaHints", "")` and `tier_reached` from the current tier string
- [ ] T007 [US1] Log `dspyModuleVersion` in `_dspy_state` dict in `src/lambda/einvoice-form-fill-python/handler.py` — after creating the troubleshooter module, call `module_loader.get_module_version("troubleshooter")` and store in `_dspy_state["dspyModuleVersion"]`
- [ ] T008 [US1] Ensure fallback behavior: wrap module creation in try/except in `troubleshoot()`, if `create_troubleshooter` or `load_optimized_module` fails, fall back to `OptimizedTroubleshooter()` (baseline) and log `[DSPy] Fallback to baseline troubleshooter`

**Checkpoint**: Troubleshooter uses modular DSPy architecture with S3 cache + baseline fallback

---

## Phase 4: User Story 2 — Self-Healing Form Fill with Assert/Suggest (Priority: P1)

**Goal**: Wire `InstructionGuard` module into CUA instruction generation to enforce required buyer fields with backtrack-and-retry

**Independent Test**: Generate CUA instructions, verify logs show Assert validation and all 3 required fields (email, company, TIN) are present in the instruction text

### Implementation for User Story 2

- [ ] T009 [US2] Add DSPy instruction guard call in `run_tier2()` function in `src/lambda/einvoice-form-fill-python/handler.py` (after line ~1967 where `instruction` string is built): lazy-import `generate_guarded_instructions` from `dspy_modules.instruction_guard`, call it with `form_description=recon`, `buyer_details=json.dumps(buyer)`, `form_selectors=` (CSS selectors from formConfig if available), `cua_hints=merchant_hints`
- [ ] T010 [US2] Integrate guard result: if `result["fallback"]` is False, append the guard's validated instruction hints to the existing `instruction` string (do NOT replace — the existing instruction has receipt data, keyboard rules, etc.); if `result["fallback"]` is True, log warning and use existing instruction as-is
- [ ] T011 [US2] Configure DSPy LM for instruction guard: ensure `dspy.settings.configure(lm=..., adapter=dspy.JSONAdapter())` is called before `generate_guarded_instructions()` — reuse the same lazy-init pattern from `troubleshoot()` to avoid duplicate configuration

**Checkpoint**: CUA instructions are validated for required fields with Assert/Suggest, with graceful fallback

---

## Phase 5: User Story 3 — Cross-Merchant Learning via BootstrapFewShot (Priority: P2)

**Goal**: Wire `ReconModule` into Tier 2 recon-to-instructions flow so successful fill patterns generalize across merchants

**Independent Test**: After optimization runs with 5+ successful fills, new merchant recon produces structured ChainOfThought instructions referencing learned patterns

### Implementation for User Story 3

- [ ] T012 [US3] Wire `ReconModule` into `run_tier2()` in `src/lambda/einvoice-form-fill-python/handler.py` (after line ~1902 where `recon` text is obtained from `gemini_flash()`): lazy-import `create_recon_module` from `dspy_modules.recon` and `load_optimized_module` from `dspy_modules.module_loader`, pass the raw `recon` text through `recon_module.forward(recon_description=recon, merchant_name=..., buyer_details=json.dumps(buyer), previous_cua_hints=merchant_hints)` to get structured CUA instructions
- [ ] T013 [US3] Use ReconModule output: extract `cua_instructions` from the module result, append it to the `instruction` string as an additional `STRUCTURED CUA STRATEGY` section (below the existing `FORM FIELDS` section around line 1932)
- [ ] T014 [US3] Log `reconDescription` to `_dspy_state` in `src/lambda/einvoice-form-fill-python/handler.py` — after the `gemini_flash()` recon call (line ~1896), store `_dspy_state["reconDescription"] = recon[:2000]` for training data collection
- [ ] T015 [US3] Add fallback: wrap ReconModule call in try/except — if module fails, use raw `recon` text as before (current behavior) and log `[DSPy] Recon module failed, using raw recon`

**Checkpoint**: Tier 2 recon uses ChainOfThought reasoning with cross-merchant few-shot examples when optimized

---

## Phase 6: User Story 4 — ChainOfThought Reasoning (Priority: P2)

**Goal**: Ensure troubleshooter and recon modules use `dspy.ChainOfThought` instead of `dspy.Predict` for step-by-step reasoning

**Independent Test**: Verify troubleshooter output includes a `reasoning` field (ChainOfThought trace) before the diagnosis

### Implementation for User Story 4

- [ ] T016 [US4] Verify `dspy_modules/troubleshooter.py` — the `OptimizedTroubleshooter` currently uses `dspy.Predict(FormDiagnosis)` at line 45. Change to `dspy.ChainOfThought(FormDiagnosis)` so the module produces a reasoning trace before the diagnosis
- [ ] T017 [US4] Verify `dspy_modules/recon.py` — already uses `dspy.ChainOfThought(ReconToInstructions)` at line 50 — confirm this is correct and no changes needed
- [ ] T018 [US4] In `handler.py` troubleshoot() integration (from T005), log the reasoning trace: after calling `module.forward()`, check for `getattr(result, "reasoning", "")` and print `[Troubleshoot] Reasoning: {reasoning[:300]}` for CloudWatch observability

**Checkpoint**: Both troubleshooter and recon produce step-by-step reasoning before generating outputs

---

## Phase 7: User Story 5 — Quality Metrics & Evaluation (Priority: P3)

**Goal**: Deploy evaluation framework, track success rates per merchant, validate optimization improvements

**Independent Test**: Run optimization_handler manually, verify it produces evaluation scorecard with per-merchant stats

### Implementation for User Story 5

- [ ] T019 [US5] Verify `optimization/evaluator.py` calls the correct Convex query (`getEinvoiceMetricsByMerchant`) — this query should already exist in `convex/functions/system.ts`. Confirm it returns `successRate`, `avgCostUsd`, `hintEffectivenessRate`, `failureCategoryBreakdown` per merchant
- [ ] T020 [US5] Add evaluation result logging to `optimization_handler.py` — after `run_evaluation()` returns, log the full scorecard (overall stats + flagged merchants) as structured JSON to CloudWatch for operational visibility
- [ ] T021 [US5] Implement hint effectiveness resolution in `convex/functions/system.ts` — add a scheduled Convex cron or internal mutation that finds `einvoice_request_logs` entries with `hintEffectivenessOutcome: "pending"`, looks up the next attempt for the same merchant, and resolves to `"helped"` (if next succeeded) or `"not_helped"` (if next failed or 7+ days elapsed)
- [ ] T022 [US5] Add `dspyModuleVersion` logging to the Convex `saveEinvoiceRequestLog` mutation (or equivalent) in `convex/functions/system.ts` — ensure the field from `_dspy_state["dspyModuleVersion"]` is persisted when the form fill Lambda reports back

**Checkpoint**: Evaluation produces merchant scorecards, hint effectiveness is auto-resolved, optimization decisions are data-driven

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Integration testing, documentation, cleanup

- [ ] T023 [P] Update `src/domains/expense-claims/einvoice/CLAUDE.md` with the new DSPy integration architecture — document the 5 DSPy features, module loading flow, and optimization pipeline
- [ ] T024 [P] Verify `optimization_handler.py` end-to-end: manually invoke the Lambda with `{"source": "manual-test"}`, confirm it attempts data collection → optimization → evaluation (will produce `no_training_data` results until real data accumulates)
- [ ] T025 Run quickstart.md validation steps: test module loading, instruction guard, and optimization pipeline dry run per `specs/001-dspy-cua-integration/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS optimization pipeline (US5)
- **US1 (Phase 3)**: Depends on Setup only — can start immediately
- **US2 (Phase 4)**: Depends on Setup only — can start in parallel with US1
- **US3 (Phase 5)**: Depends on Foundational (needs training data query for optimization)
- **US4 (Phase 6)**: Can start after US1 (modifies same module file)
- **US5 (Phase 7)**: Depends on Foundational (needs data collection pipeline)
- **Polish (Phase 8)**: Depends on all user stories

### Parallel Opportunities

- US1 (Troubleshooter) and US2 (Instruction Guard) modify DIFFERENT parts of handler.py and can run in parallel
- T003 and T004 (Foundational) are independent and can run in parallel
- US4 (ChainOfThought) is a small change to troubleshooter.py — can be combined with US1

### Within Each User Story

- Models/modules before handler.py integration
- Handler integration before logging
- Core implementation before fallback handling

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (verify imports)
2. Complete Phase 3: US1 — Troubleshooter integration (highest impact)
3. Complete Phase 4: US2 — Instruction guard (prevents field-missing failures)
4. **STOP and VALIDATE**: Test form fills with both features
5. Deploy if stable

### Full Pipeline

1. MVP above
2. Phase 2: Foundational (training data query)
3. Phase 5: US3 — Recon module integration
4. Phase 6: US4 — ChainOfThought upgrade
5. Phase 7: US5 — Evaluation framework
6. Phase 8: Polish

---

## Notes

- All DSPy module files already exist — this is integration work, not greenfield
- handler.py is 3000+ lines — be precise with line numbers (they may shift after edits)
- Lazy imports are CRITICAL — Tier 1 fast path must never import DSPy
- Always wrap DSPy calls in try/except with fallback to current behavior
- The optimization pipeline won't produce results until real training data accumulates (10+ hint pairs, 5+ recon pairs)
