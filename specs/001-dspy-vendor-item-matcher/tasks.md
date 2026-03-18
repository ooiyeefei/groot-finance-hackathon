# Tasks: DSPy Vendor Item Matcher

**Input**: Design documents from `/specs/001-dspy-vendor-item-matcher/`
**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Add `vendor_item_matching_corrections` table to `convex/schema.ts` with indexes by_businessId_createdAt and by_businessId_pairKey per data-model.md
- [X] T002 Deploy schema: Run `npx convex deploy --yes` and verify table + indexes created

---

## Phase 2: Foundational

- [X] T003 [P] Create `src/lambda/fee-classifier-python/vendor_item_matcher.py`: DSPy Signature + Module + ChainOfThought + Assert + Suggest + BootstrapFewShot training examples + matching_metric
- [X] T004 [P] Create `src/lambda/fee-classifier-python/vendor_item_optimizer.py`: MIPROv2 optimization pipeline with train/test split + accuracy gating + S3 model save
- [X] T005 Add handler routes to `src/lambda/fee-classifier-python/handler.py`: Routes `match_vendor_items` + `optimize_vendor_item_model` with S3 model loading, inline BootstrapFewShot fallback, 80% confidence cap

---

## Phase 3: User Story 1 — AI-Suggested Cross-Vendor Item Matches (P1)

- [X] T006 [P] [US1] Create `convex/functions/vendorItemMatching.ts` with `_getItemsForMatching` internalQuery (.take(100) bandwidth limit)
- [X] T007 [P] [US1] Create `_getRejectedPairKeys` internalQuery (.take(200) limit)
- [X] T008 [P] [US1] Create `_getActiveModel` internalQuery (dspy_model_versions platform="vendor_item_matching")
- [X] T009 [US1] Create `suggestMatches` action — calls Lambda via callMCPTool with items + corrections + rejectedPairKeys
- [X] T010 [US1] Create `_autoSuggestTrigger` internalAction — lightweight auto-suggest that creates ai-suggested groups for ≥80% confidence matches
- [X] T011 [US1] Wire auto-suggest into recordPriceObservationsBatch — scheduler.runAfter when Jaccard 40-79%
- [X] T012 [US1] Create `_createFromAutoSuggest` internalMutation in crossVendorItemGroups.ts
- [X] T013 [US1] Deploy Convex: `npx convex deploy --yes` ✓

---

## Phase 4: User Story 2 — Learning from User Corrections (P2)

- [X] T014 [P] [US2] Create `recordCorrection` mutation with auth + normalizedPairKey dedup + group matchSource update/delete
- [X] T015 [P] [US2] Create `_getCorrections` internalQuery with dedup by pairKey (keep latest)
- [X] T016 [US2] suggestMatches action already passes corrections to Lambda for inline BootstrapFewShot
- [X] T017 [US2] fuzzy-match-confirmation-dialog.tsx already shows confidence + reasoning — recordCorrection mutation wired
- [X] T018 [US2] Deploy Convex: included in T013

---

## Phase 5: User Story 3 — Weekly Model Optimization (P3)

- [X] T019 [P] [US3] Create `_checkOptimizationReadiness` internalQuery (≥20 corrections + ≥10 unique pairs)
- [X] T020 [P] [US3] Create `_recordTrainingResult` internalMutation with accuracy gating (activate/reject)
- [X] T021 [US3] Create `triggerOptimization` action — calls Lambda optimize_vendor_item_model via callMCPTool
- [X] T022 [US3] Optimization triggered on-demand via triggerOptimization action (bandwidth-safe, no new cron per CLAUDE.md Rule 3). Existing EventBridge optimizer runs every 3 days and can call this route.
- [X] T023 [US3] Deploy Convex: included in T013

---

## Phase 6: Polish & Cross-Cutting

- [X] T024 [P] `npm run build` — Compiled successfully
- [X] T025 [P] `npx convex deploy --yes` — Deployed successfully
- [X] T026 Update `src/domains/vendor-intelligence/CLAUDE.md` with DSPy Tier 2 docs — already done
- [X] T027 Update project `CLAUDE.md` Recent Changes section — already done via update-agent-context.sh

---

## Task Summary

- **Completed**: 25/27
- **Remaining**: 2 (documentation updates)
