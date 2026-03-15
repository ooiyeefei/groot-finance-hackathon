# Tasks: DSPy-Powered Self-Improving E-Invoice CUA System

## Phase 1: Schema & Foundation (Pre-requisite for all features)

- [x] T001 Extend `convex/schema.ts` — add DSPy fields to `einvoice_request_logs`: reconDescription, generatedHint, hintEffectivenessOutcome, confidenceGateScore, confidenceGateDecision, failureCategory, perFieldResults, buyerProfileMatchResult, dspyModuleVersion. Add `by_merchantName_status` index.
- [x] T002 Extend `convex/schema.ts` — add DSPy fields to `merchant_einvoice.formConfig`: tier1FailureCount, lastReconDescription, lastOptimizedAt, formChangeDetectedAt.
- [x] T003 Deploy Convex schema: `npx convex deploy --yes`
- [x] T004 Update `convex/functions/system.ts` — modify `reportEinvoiceFormFillResult` mutation to accept new DSPy fields (reconDescription, generatedHint, confidenceGateScore, etc.)
- [x] T005 Add Convex evaluation query `getEinvoiceMetricsByMerchant` in `system.ts` — aggregate request logs by merchantName to produce per-merchant scorecards (success rate, avg cost, tier distribution, hint effectiveness rate)
- [x] T006 Add Convex mutation `updateHintEffectiveness` in `system.ts` — given a merchantName, find the most recent log with hintEffectivenessOutcome="pending" and update to "helped" or "not_helped" based on the current attempt's outcome

**Checkpoint**: Schema deployed. Convex functions ready to receive DSPy data. All existing functionality unchanged.

---

## Phase 2: DSPy Module Definitions (P0 + P1 features)

- [x] T007 Create `src/lambda/einvoice-form-fill-python/dspy_modules/__init__.py` — package init
- [x] T008 Create `dspy_modules/module_loader.py` — S3 module cache loader: download latest.json from `finanseal-bucket/dspy-modules/{module_name}/`, cache in `/tmp/`, fallback to baseline if S3 fails or module missing
- [x] T009 Create `dspy_modules/troubleshooter.py` — MIPROv2-compatible FormDiagnosis signature with DSPy module wrapper. Define metric function `hint_effectiveness()`. Support both optimized (loaded from S3) and baseline (hardcoded) modes.
- [x] T010 Create `dspy_modules/recon.py` — BootstrapFewShot-compatible ReconToInstructions signature. Accepts form screenshot description, merchant type, buyer details. Returns CUA instructions with few-shot examples.
- [x] T011 Create `dspy_modules/instruction_guard.py` — CUA instruction generation with dspy.Assert (required fields: email, company, TIN) and dspy.Suggest (prefer CSS selectors). Max 3 backtrack retries. Fallback to unguarded generation.
- [x] T012 Create `dspy_modules/confidence_gate.py` — Tier 1 confidence prediction. Takes saved CSS selectors + page HTML snippet (first 2KB). Returns confidence score (0-1) and proceed/skip decision. Threshold: 0.7 (configurable).
- [x] T013 Create `dspy_modules/buyer_matcher.py` — ChainOfThought buyer profile matching. TIN exact match → fuzzy name match → recency disambiguation. Returns selected profile + step-by-step reasoning.

**Checkpoint**: All DSPy modules defined and importable. Not yet integrated into handler.py.

---

## Phase 3: Integration into Form Fill Handler (Wire up DSPy modules)

- [x] T014 Integrate `module_loader.py` into handler.py — lazy-load optimized modules from S3 on first use (not at import time, to avoid cold start penalty). Cache loaded modules in module-level variables.
- [x] T015 Integrate `troubleshooter.py` into handler.py Tier 3 — replace existing `dspy.Predict(FormDiagnosis)` call with the new module. Save generatedHint to request log. Call `updateHintEffectiveness` mutation for previous attempt.
- [x] T016 Integrate `recon.py` into handler.py recon step — save reconDescription to request log. Use bootstrapped examples when available.
- [x] T017 Integrate `instruction_guard.py` into handler.py CUA instruction generation — wrap instruction building with Assert/Suggest constraints before Tier 2 CUA call.
- [x] T018 Integrate `confidence_gate.py` into handler.py before Tier 1 — call confidence gate, log score and decision. Skip Tier 1 if confidence < 0.7.
- [x] T019 Integrate `buyer_matcher.py` into handler.py buyer profile selection — replace existing TIN-only match with ChainOfThought matcher for account-gated merchants.
- [x] T020 Update handler.py `report_result()` — pass all new DSPy fields (reconDescription, generatedHint, confidenceGateScore, failureCategory, perFieldResults, dspyModuleVersion) to the Convex mutation.

**Checkpoint**: All 6 DSPy features integrated. Form fill handler uses optimized modules when available, falls back to baseline otherwise.

---

## Phase 4: Offline Optimization Pipeline

- [x] T021 Create `src/lambda/einvoice-form-fill-python/optimization/__init__.py` — package init
- [x] T022 Create `optimization/data_collector.py` — query Convex einvoice_request_logs to extract training datasets. Build hint-effectiveness pairs (failed attempt + hint + next attempt outcome). Build recon-success pairs (recon description + CUA instructions + outcome).
- [x] T023 Create `optimization/optimizer.py` — MIPROv2 optimization for troubleshooter + BootstrapFewShot for recon. Serialize optimized modules to JSON. Compare against baseline using metric function.
- [x] T024 Create `optimization/evaluator.py` — DSPy Evaluate wrapper. Compute per-merchant scorecards from Convex data. Output evaluation report. Support baseline vs optimized comparison.
- [x] T025 Create optimizer Lambda handler — new Lambda that runs the optimization pipeline. Entry point: `optimization_handler.handler`. Triggered by EventBridge every 3 days.
- [x] T026 Update `infra/lib/document-processing-stack.ts` — add optimizer Lambda (Python 3.11 Docker, same image as form fill). Add EventBridge rule (every 3 days). Add S3 write permission for `dspy-modules/` prefix. Add S3 read permission to form fill Lambda for `dspy-modules/` prefix.
- [x] T027 Deploy CDK: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2`

**Checkpoint**: Full optimization pipeline deployed. EventBridge triggers every 3 days. Optimized modules uploaded to S3.

---

## Phase 5: Testing & Validation

- [x] T028 Deploy Convex functions: `npx convex deploy --yes`
- [x] T029 Deploy CDK stack with new Lambda + EventBridge rule
- [ ] T030 Test form fill end-to-end: upload a Sterling Station receipt, verify QR detection + form fill + DSPy fields logged in einvoice_request_logs
- [ ] T031 Test confidence gate: verify Tier 1 confidence score appears in logs for merchants with formConfig
- [ ] T032 Test troubleshooter: trigger a form fill failure, verify generatedHint is logged and hintEffectivenessOutcome is "pending"
- [x] T033 Test evaluation query: call `getEinvoiceMetricsByMerchant` and verify per-merchant scorecard returns correct aggregations
- [ ] T034 Verify no regression: existing form fill success for known merchants (FamilyMart, Jaya Grocer) still works with DSPy enhancements layered on

**Checkpoint**: All 6 features verified end-to-end. No regression in existing functionality.

---

## Review

_To be filled after implementation._
