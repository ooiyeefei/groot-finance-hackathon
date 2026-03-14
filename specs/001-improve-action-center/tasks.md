# Tasks: Improve AI Action Center

## Task 1: Add category name resolution helper (actionCenterJobs.ts)
- [x] Add `resolveCategoryName()` function with IFRS code lookup + custom category lookup + fallback
- [x] Add fallback: strip `_[a-z0-9]+$` suffix, capitalize first letter
- [x] Wire into `runAnomalyDetection`, `analyzeNewTransaction`, and `getBusinessSummary`

## Task 2: Add domain classification + fix vendor detection (actionCenterJobs.ts)
- [x] Add `classifyEntryDomain()` helper using vendorId presence
- [x] Fix `runVendorConcentration` to only analyze AP entries (has vendorId)
- [x] Fix `runVendorSpendingChanges` to only analyze AP entries
- [x] Fix terminology: "vendor" → "supplier" in all insight titles/descriptions
- [x] Fix `getBusinessSummary` to separate topSuppliers (AP) from topMerchants (expense claims)

## Task 3: Add materiality-based priority scoring (actionCenterJobs.ts)
- [x] Add `computeMaterialityPriority()` helper
- [x] Wire into `runAnomalyDetection` priority logic
- [x] Wire into `analyzeNewTransaction` priority logic
- [x] Suppress anomalies below 0.1% of monthly expenses

## Task 4: Consolidate pattern-level insights into summary cards (actionCenterJobs.ts)
- [x] Refactor `runVendorConcentration` to collect all findings, create ONE summary card
- [x] Refactor `runVendorSpendingChanges` to consolidate into one summary card
- [x] Store consolidated entity list in metadata.consolidatedEntities

## Task 5: Add keyword-overlap dedup for LLM insights (actionCenterInsights.ts)
- [x] Add Jaccard similarity tokenizer with stopword removal
- [x] Wire into `internalCreate` for LLM-discovered insights (check metadata.aiDiscovered)
- [x] Reject new insights with Jaccard >0.6 against existing titles

## Task 6: Improve LLM prompts (actionCenterJobs.ts)
- [x] Fix `enrichInsight` prompt: domain separation rules, supplier/merchant terminology
- [x] Fix `runAIDiscovery` prompt: materiality rules, domain separation, no generic vendor advice
- [x] Fix `getBusinessSummaryByStringId` to use domain-separated data

## Task 7: Ask AI prepopulated prompt + suggestion chips (InsightCard.tsx)
- [x] Change handleAskAI to dispatch `draftMessage` instead of `message`
- [x] Add `getQuestionChips()` function with category-specific suggestions
- [x] Dispatch suggestion chips in event detail
- [x] Update ChatWidget to handle `draftMessage` (set input, don't send) and render chips
- [x] Update ChatWindow to accept draftMessage, suggestionChips, insightContext props
- [x] Add chip UI below input area

## Task 8: One-time migration script (actionCenterInsights.ts)
- [x] Add `resetBusinessInsights` internalMutation
- [ ] Run migration on prod after Convex deploy

## Task 9: Build verification + deploy
- [x] `npx convex typecheck` passes
- [x] `next build` passes
- [ ] `npx convex deploy --yes` (requires prod access)
- [ ] Run migration on prod
