# Tasks: DSPy-Powered Bank Reconciliation with GL Integration

**Input**: Design documents from `/specs/001-dspy-bank-recon/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/convex-functions.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US7)

---

## Phase 1: Setup

**Purpose**: Schema changes, new Convex tables, Lambda module scaffolding

- [x] T001 Extend `bank_accounts` table in `convex/schema.ts` — add `glAccountId: v.optional(v.id("chart_of_accounts"))` field
- [x] T002 Extend `bank_transactions` table in `convex/schema.ts` — add classification fields: `suggestedDebitAccountId`, `suggestedCreditAccountId`, `classificationConfidence`, `classificationTier`, `classificationReasoning`, `journalEntryId`, `classifiedAt`, `classifiedBy`. Add new status `"classified"` and `"posted"` to reconciliation status validator. Remove deprecated `category` field usage.
- [x] T003 [P] Create `bank_recon_corrections` table in `convex/schema.ts` with fields: `businessId`, `bankTransactionDescription`, `bankName`, `originalDebitAccountCode`, `originalCreditAccountCode`, `correctedDebitAccountCode`, `correctedCreditAccountCode`, `correctionType`, `createdBy`, `createdAt`. Indexes: `by_businessId`, `by_businessId_createdAt`.
- [x] T004 [P] Create `bank_recon_classification_rules` table in `convex/schema.ts` with fields: `businessId`, `keyword`, `debitAccountId`, `creditAccountId`, `platform`, `priority`, `isActive`, `createdBy`, `createdAt`, `deletedAt`. Index: `by_businessId`.
- [x] T005 [P] Add `domain` field to existing `dspy_model_versions` table in `convex/schema.ts` — `v.optional(v.string())` defaulting to `"fee_classification"`.
- [x] T006 Deploy schema changes with `npx convex dev --once --typecheck=disable` and verify all new tables/indexes created.
- [x] T007 [P] Create DSPy module file `src/lambda/fee-classifier-python/bank_recon_module.py` — `ClassifyBankTransaction` signature with ChainOfThought, `BankTransactionClassifier` module with `dspy.Assert` for COA validation and `dspy.Suggest` for debit≠credit check.
- [x] T008 Run `npm run build` to verify TypeScript compilation passes with schema changes.

**Checkpoint**: Schema deployed, DSPy module scaffolded, build passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Tier 1 classifier, GL poster, corrections CRUD, Lambda handler extension — MUST complete before UI work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T009 Create Tier 1 rule-based classifier `convex/lib/bankReconClassifier.ts` — keyword matching against `bank_recon_classification_rules` table. Same pattern as `convex/lib/feeClassifier.ts`. Include default seed rules for common Malaysian bank patterns (service charges, interest, ATM).
- [x] T010 [P] Create GL posting helper `convex/lib/bankReconGLPoster.ts` — function to create draft journal entry from classification result using existing `journalEntries.createInternal`. Inputs: bank transaction, debit/credit account IDs, bank account's GL link. Output: journal entry ID. Validates double-entry balance.
- [x] T011 [P] Create `convex/functions/bankReconCorrections.ts` — CRUD mutations: `create` (internalMutation), `listForBusiness` (query), `getTrainingData` (internalQuery with afterCorrectionId filter, returns uniqueDescriptions count).
- [x] T012 [P] Extend `src/lambda/fee-classifier-python/handler.py` — add `classify_bank_transaction` handler that instantiates `BankTransactionClassifier`, applies BootstrapFewShot when ≥20 corrections, loads optimized model from S3, runs batch classification. Add `optimize_bank_recon_model` handler that calls optimizer.
- [x] T013 [P] Extend `src/lambda/fee-classifier-python/optimizer.py` — add `run_bank_recon_optimization()` function with MIPROv2 for bank recon domain. Include safeguards: min 10 unique descriptions, skip-if-recently-optimized (lastOptimizedCorrectionId), force flag, accuracy gating.
- [x] T014 Update CDK stack `infra/lib/fee-classifier-stack.ts` — rename Lambda function to `groot-finance-ai-classifier` (or add alias). Ensure IAM permissions for S3 `dspy-models/{businessId}/bank-recon/` prefix.

**Checkpoint**: Foundation ready — Tier 1 classifier, GL poster, corrections, Lambda handlers all in place.

---

## Phase 3: User Story 5 — Bank Account GL Linkage (Priority: P1) 🎯 MVP

**Goal**: Each bank account links to a COA entry for "Cash at Bank". This is the prerequisite for all GL posting.

**Independent Test**: Register a bank account, link to COA "1010 Cash at Bank". Verify link displays on account card.

### Implementation

- [x] T015 [US5] Extend `convex/functions/bankAccounts.ts` — add `glAccountId` to `create` and `update` mutations. Add `getGLAccount` helper that returns linked COA entry.
- [x] T016 [US5] Modify `src/domains/accounting/components/bank-recon/bank-accounts-manager.tsx` — add COA account selector dropdown (filtered to asset accounts) in the add/edit bank account form. Show warning badge on accounts without GL link.

**Checkpoint**: Bank accounts can be linked to COA entries.

---

## Phase 4: User Story 1 — AI-Classified GL Posting (Priority: P1)

**Goal**: Unmatched bank transactions get AI-suggested GL accounts and can be posted as draft journal entries.

**Independent Test**: Import a bank statement. Unmatched items show AI-suggested debit/credit accounts with confidence. User confirms → draft JE created with proper double-entry.

### Implementation

- [x] T017 [US1] Create `convex/functions/bankTransactions.classifyBatch` action — orchestrates Tier 1 → Tier 2 classification for a bank account. Calls `bankReconClassifier.ts` first, then Lambda for unclassified items. Updates `bank_transactions` with classification results.
- [x] T018 [US1] Create `convex/functions/bankTransactions.confirmClassification` mutation — creates draft JE via `bankReconGLPoster.ts`, links JE to bank transaction, sets status to `"posted"`.
- [x] T019 [P] [US1] Create `convex/functions/bankTransactions.rejectClassification` mutation — resets classification fields, sets status to `"unmatched"`, stores rejection as correction via `bankReconCorrections.create`.
- [x] T020 [P] [US1] Create `convex/functions/bankTransactions.overrideClassification` mutation — user picks different accounts, creates draft JE with overridden accounts, stores correction for DSPy training.
- [x] T021 [US1] Create `src/domains/accounting/components/bank-recon/gl-classification-panel.tsx` — new component showing AI-suggested debit/credit accounts with confidence badge, reasoning text, and override controls (COA dropdowns). Buttons: "Confirm & Post to GL", "Override", "Reject".
- [x] T022 [US1] Modify `src/domains/accounting/components/bank-recon/transaction-row.tsx` — replace old "Categorize" dropdown with classification UI. Show confidence badge (green/amber/red), AI suggestion inline. Click opens `gl-classification-panel.tsx`. Remove all references to old `category` field and `categorize`/`uncategorize` buttons.
- [x] T023 [US1] Modify `src/domains/accounting/components/bank-recon/bank-recon-tab.tsx` — trigger `classifyBatch` after import completes (replace old `runMatching` with combined match+classify). Update notification messages for classification results.
- [x] T024 [US1] Run `npm run build` and verify all TypeScript compilation passes.

**Checkpoint**: Unmatched bank transactions get AI classification and can be posted as draft JEs.

---

## Phase 5: User Story 2 — Tiered Intelligence (Priority: P1)

**Goal**: Common patterns handled by free rules, AI only for the long tail. BootstrapFewShot learns from corrections.

**Independent Test**: Import a mix of common (SERVICE CHARGE) and unusual (GRABPAY SETTLEMENT ADJ) transactions. Common ones classify instantly (Tier 1), unusual ones use AI (Tier 2).

### Implementation

- [x] T025 [US2] Seed default classification rules in `convex/functions/bankReconClassificationRules.ts` — CRUD mutations for admin rule management. Include `seedDefaultRules` internalMutation that creates common Malaysian bank patterns (service charge, interest, monthly fee, ATM withdrawal) for new businesses.
- [x] T026 [US2] Integrate BootstrapFewShot in `classifyBatch` action — when calling Lambda, pass all corrections from `bankReconCorrections.getTrainingData`. Lambda compiles inline when ≥20 corrections. Verify Tier 1 vs Tier 2 split is logged.
- [x] T027 [US2] Verify Tier 1/2 visual indicators in transaction-row.tsx — show "Rules" badge for Tier 1 classified items (instant, free), "AI" badge for Tier 2 items. Show which tier classified each transaction.

**Checkpoint**: Tiered classification working — rules handle known patterns, AI handles unknown.

---

## Phase 6: User Story 3 — Batch Operations (Priority: P1)

**Goal**: Batch confirm and post hundreds of transactions at once based on confidence levels.

**Independent Test**: Import 50+ row CSV. Click "Confirm All High-Confidence" → all ≥0.90 confirmed. Click "Post All to GL" → draft JEs created.

### Implementation

- [x] T028 [US3] Create `convex/functions/bankTransactions.batchConfirmHighConfidence` mutation — confirms all matched transactions with confidence ≥0.90 for a bank account. Returns count confirmed.
- [x] T029 [P] [US3] Create `convex/functions/bankTransactions.batchPostToGL` mutation — creates draft JEs for all confirmed classifications without existing JE. Uses `bankReconGLPoster.ts`. Returns count posted.
- [x] T030 [US3] Create `src/domains/accounting/components/bank-recon/batch-actions-bar.tsx` — component with "Confirm All High-Confidence (N)" and "Post All to GL (N)" buttons. Shows counts from dashboard query. Disabled states when nothing to confirm/post.
- [x] T031 [US3] Modify `src/domains/accounting/components/bank-recon/reconciliation-dashboard.tsx` — update summary cards to show new statuses (classified, posted). Add batch-actions-bar above transaction list. Update confidence badge colors (green ≥0.90, amber 0.70–0.89, red <0.70, gray unmatched). Add click-to-filter on status cards.

**Checkpoint**: Batch operations working — can confirm and post 100+ transactions in one click.

---

## Phase 7: User Story 4 — Weekly MIPROv2 Optimization (Priority: P2)

**Goal**: System automatically improves weekly from accumulated corrections.

**Independent Test**: Accumulate 20+ corrections. Trigger optimization. Verify accuracy improves and new model version is saved.

### Implementation

- [x] T032 [US4] Create `convex/functions/bankReconOptimization.ts` — `triggerWeekly` internalAction (cron entry point): iterates businesses, checks eligibility (≥20 corrections, ≥10 unique descriptions, new corrections since last optimization). `runForBusiness` internalAction: calls Lambda `/optimize_bank_recon_model`, stores result in `dspy_model_versions` with `domain: "bank_recon"`.
- [x] T033 [US4] Extend `convex/crons.ts` — add weekly cron job calling `bankReconOptimization.triggerWeekly`. Schedule: Sundays at 2:00 AM UTC.
- [x] T034 [US4] Implement "last optimized correction ID" pattern in `bankReconOptimization.ts` — after successful optimization, store the `_id` of the latest correction used. Next cron run only counts corrections created after that ID.
- [x] T035 [US4] Update `classifyBatch` action to load active model version from `dspy_model_versions` (domain: "bank_recon") and pass `modelS3Key` to Lambda. If no model exists, Lambda uses base prompt.

**Checkpoint**: Weekly optimization cron deployed. Accuracy improves with corrections.

---

## Phase 8: User Story 7 — Double-Entry Validation / Self-Healing (Priority: P2)

**Goal**: Assert guarantees every AI-generated JE is balanced with valid COA codes.

**Independent Test**: Feed AI a transaction that could produce invalid accounts. System retries with backtracking and produces valid entry.

### Implementation

- [x] T036 [US7] Verify `dspy.Assert` in `bank_recon_module.py` covers: debit account in available COA, credit account in available COA, debit ≠ credit. Test with invalid account codes — verify backtracking retries.
- [x] T037 [US7] Add server-side validation in `bankReconGLPoster.ts` — before creating JE, verify: both account IDs exist in `chart_of_accounts`, debit total == credit total, accounts are different. Reject with clear error if validation fails.
- [x] T038 [US7] Add validation feedback in `gl-classification-panel.tsx` — if classification fails validation, show error message with details (e.g., "Account 9999 not found in your Chart of Accounts").

**Checkpoint**: Zero unbalanced or invalid JEs can be created from AI classification.

---

## Phase 9: User Story 5 (continued) + User Story 6 — Reconciliation Summary (Priority: P2)

**Goal**: Generate reconciliation statement showing bank vs GL balance.

**Independent Test**: Complete reconciliation for a month. View summary showing bank closing balance, GL balance, difference, and outstanding items.

### Implementation

- [x] T039 [US6] Create `convex/functions/bankTransactions.getReconciliationSummary` query — for a bank account + date range: calculate bank closing balance (from imported transactions), count reconciled/classified/posted/unmatched, sum outstanding items.
- [x] T040 [US6] Create `src/domains/accounting/components/bank-recon/reconciliation-summary.tsx` — new component showing: bank statement closing balance, total reconciled, total posted to GL, total unmatched, remaining difference. Outstanding items list. Export button (CSV download).
- [x] T041 [US6] Integrate reconciliation-summary.tsx in bank-recon-tab.tsx — show below the transaction list when a bank account is selected and has imported transactions.

**Checkpoint**: Reconciliation summary displays correct bank vs GL balance.

---

## Phase 10: Polish & Cross-Cutting

**Purpose**: Build verification, cleanup, documentation

- [x] T042 Run `npm run build` to verify full TypeScript compilation passes
- [x] T043 Deploy Convex to production: `npx convex deploy --yes`
- [x] T044 Deploy Lambda to production: `cd infra && npx cdk deploy FeeClassifierStack --profile groot-finanseal --region us-west-2`
- [x] T045 UAT on production: import test CSV, verify Tier 1/2 classification, confirm GL posting, test batch operations
- [x] T046 Update `CLAUDE.md` Active Technologies section with new tables and Lambda rename
- [x] T047 [P] Update `src/domains/expense-claims/einvoice/CLAUDE.md` or relevant docs if bank recon architecture changes affect other features

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (schema must be deployed)
- **Phase 3 (US5 GL Linkage)**: Depends on Phase 2 (bank account mutations needed)
- **Phase 4 (US1 AI Classification)**: Depends on Phase 2 + Phase 3 (GL linkage needed for JE creation)
- **Phase 5 (US2 Tiered)**: Depends on Phase 4 (classification must work first)
- **Phase 6 (US3 Batch)**: Depends on Phase 4 (classification must work first)
- **Phase 7 (US4 Optimization)**: Depends on Phase 5 (corrections must be flowing)
- **Phase 8 (US7 Validation)**: Depends on Phase 4 (classification must produce entries)
- **Phase 9 (US6 Summary)**: Depends on Phase 4 (need reconciliation data)
- **Phase 10 (Polish)**: Depends on all prior phases

### Parallel Opportunities

After Phase 2 completes:
- Phase 5 (Tiered) and Phase 6 (Batch) can run in parallel
- Phase 7 (Optimization) and Phase 8 (Validation) can run in parallel
- Phase 9 (Summary) can run in parallel with Phase 7/8

---

## Implementation Strategy

### MVP First (Phase 1–4)

1. Phase 1: Schema + DSPy module
2. Phase 2: Foundation (classifier, GL poster, corrections, Lambda)
3. Phase 3: Bank account GL linkage
4. Phase 4: AI classification + GL posting
5. **STOP and VALIDATE**: Import CSV → see AI suggestions → confirm → draft JE created

### Incremental Delivery

6. Phase 5: Tiered intelligence (rules first, AI second)
7. Phase 6: Batch operations (confirm/post hundreds at once)
8. Phase 7: Weekly optimization (MIPROv2 cron)
9. Phase 8: Double-entry validation (Assert self-healing)
10. Phase 9: Reconciliation summary statement
11. Phase 10: Polish, deploy, UAT

---

## Notes

- Total tasks: 47
- P1 stories: US1 (8 tasks), US2 (3 tasks), US3 (4 tasks), US5 (2 tasks) = 17 tasks
- P2 stories: US4 (4 tasks), US6 (3 tasks), US7 (3 tasks) = 10 tasks
- Foundation: 14 tasks (setup + foundational)
- Polish: 6 tasks
- Suggested MVP: Phase 1-4 (T001-T024) = 24 tasks = minimum viable bank recon with AI + GL
