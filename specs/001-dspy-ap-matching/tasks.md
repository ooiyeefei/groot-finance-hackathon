# Implementation Tasks: Self-Improving AI AP 3-Way Matching

**Branch**: `001-dspy-ap-matching`
**Generated**: 2026-03-16
**Total Tasks**: 12

## Phase 1: Schema & Backend Foundation

### T001: Add po_match_corrections table to Convex schema
- **File**: `convex/schema.ts`
- **Action**: Add `po_match_corrections` table with fields: businessId, matchId, vendorName, originalPoLineDescription, originalInvoiceLineDescription, originalConfidence, correctedPoLineDescription, correctedInvoiceLineDescription, correctionType, createdBy, createdAt. Add indexes: by_businessId, by_businessId_vendor.
- **Deps**: None
- **Priority**: P1

### T002: Extend po_matches table with AI fields
- **File**: `convex/schema.ts`
- **Action**: Add optional fields to po_matches: aiMatchTier, aiModelVersion, aiReasoningTrace, aiVarianceDiagnosis, aiMatchedAt, aiConfidenceOverall.
- **Deps**: None
- **Priority**: P1

### T003: Extend matching_settings with AI toggle and usage counter
- **File**: `convex/schema.ts`
- **Action**: Add optional fields to matching_settings: aiEnabled, aiCallsThisMonth, aiCallsResetAt.
- **Deps**: None
- **Priority**: P1

## Phase 2: Python DSPy Module

### T004: Create PO matching DSPy module
- **File**: `src/lambda/fee-classifier-python/po_matching_module.py` (NEW)
- **Action**: Create `MatchPOInvoiceLines` signature (inputs: po_lines, invoice_lines, vendor_name; outputs: pairings JSON, reasoning, constraint_violations). Create `POMatchingModule` class with `dspy.ChainOfThought`, `dspy.Assert` (line totals must balance), `dspy.Suggest` (explain UOM conversions). Add `po_matching_metric()` for evaluation. Add `create_po_matching_training_examples()` for corrections → dspy.Example conversion.
- **Deps**: None
- **Priority**: P1

### T005: Add Lambda handler routes for PO matching
- **File**: `src/lambda/fee-classifier-python/handler.py`
- **Action**: Add `/match_po_invoice` route (accepts PO + invoice lines, corrections, model S3 key; returns pairings with confidence + reasoning). Add `/diagnose_variance` route (accepts matched pair with variance; returns diagnosis). Add `/optimize_po_matching_model` route (accepts corrections; runs MIPROv2; returns accuracy). Follow existing `/classify_fees` and `/classify_bank_transaction` patterns.
- **Deps**: T004
- **Priority**: P1

## Phase 3: Convex Tier 2 Integration

### T006: Create poMatchingAI internalAction
- **File**: `convex/functions/poMatchingAI.ts` (NEW)
- **Action**: Create `matchWithAI` internalAction that: checks AI enabled + monthly quota, calls Lambda via `callMCPTool("match_po_invoice", ...)`, returns AI pairings. Create `diagnoseVariance` internalAction for P2 variance diagnosis. Include Gemini direct fallback when Lambda fails (follow feeClassificationActions.ts pattern). Cap confidence at 0.80 when no optimized model.
- **Deps**: T001, T002, T003, T005
- **Priority**: P1

### T007: Integrate Tier 2 trigger into poMatches.ts
- **File**: `convex/functions/poMatches.ts`
- **Action**: In `tryAutoMatchInternal`, after Tier 1 `pairLineItems()`, check if any pairing has confidence < 0.6. If so, schedule `poMatchingAI.matchWithAI` via `ctx.scheduler.runAfter(0, ...)`. In `updateMatchFromAI` internalMutation, merge AI pairings into match record with aiMatchTier, aiModelVersion, aiReasoningTrace fields. Add correction capture logic to `reviewMatch` mutation (on approve/reject, insert into po_match_corrections).
- **Deps**: T006
- **Priority**: P1

## Phase 4: Optimization Pipeline

### T008: Create poMatchOptimization.ts
- **File**: `convex/functions/poMatchOptimization.ts` (NEW)
- **Action**: Create `getTrainingCorrections` internalQuery (query po_match_corrections by business). Create `triggerOptimization` internalAction (check min 20 corrections + 10 unique descriptions, call Lambda `/optimize_po_matching_model`, update dspy_model_versions). Create `manualOptimize` mutation (admin-triggered). Follow bankReconOptimization.ts pattern exactly.
- **Deps**: T001, T005
- **Priority**: P1

### T009: Add weekly cron for PO matching optimization
- **File**: `convex/crons.ts`
- **Action**: Add Sunday 4AM UTC cron (1 hour after bank recon) that calls `poMatchOptimization.triggerOptimization` for each business with sufficient corrections.
- **Deps**: T008
- **Priority**: P1

### T010: Add optimizer route to handler.py
- **File**: `src/lambda/fee-classifier-python/optimizer.py`
- **Action**: Add `optimize_po_matching()` function following the `optimize_bank_recon()` pattern: load corrections → create training examples → 80/20 split → MIPROv2 compile → evaluate before/after → save to S3 if improved → return metrics.
- **Deps**: T004
- **Priority**: P1

## Phase 5: Frontend

### T011: Add AI reasoning display to match review panel
- **File**: `src/domains/payables/components/match-review.tsx`
- **Action**: Display `aiReasoningTrace` and `aiVarianceDiagnosis` fields in the match review side panel. Show AI tier badge (Tier 1 / Tier 2). Show AI confidence as a colored bar. Add correction capture: on Approve, call mutation that records approval correction. On Reject + manual override, call mutation that records rejection correction with corrected pairing.
- **Deps**: T007
- **Priority**: P2

### T012: Add AI metrics to matching dashboard + usage meter
- **File**: `src/domains/payables/components/matching-summary.tsx`, `src/domains/payables/components/ai-usage-meter.tsx` (NEW)
- **Action**: Extend matching summary to show: auto-match rate, Tier 2 usage count, average AI confidence, top vendors by failure rate. Create AI usage meter component showing current month usage vs plan limit (150/500/unlimited). Show in matching settings or dashboard tab.
- **Deps**: T007
- **Priority**: P3
