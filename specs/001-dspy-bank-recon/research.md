# Research: DSPy-Powered Bank Reconciliation

## Decision 1: DSPy Module Design for Bank Transaction Classification

**Decision**: Create `ClassifyBankTransaction` signature with ChainOfThought, Assert for COA validation and balance check.

**Rationale**: Mirrors the working `ClassifyFee` module from fee classification. ChainOfThought forces reasoning traces (critical for user trust — they can see WHY the AI picked an account). Assert ensures valid COA codes and balanced entries before results reach the user.

**Alternatives considered**:
- Plain `dspy.Predict` (no reasoning traces, lower user trust)
- `dspy.ReAct` (overkill for classification — ReAct is for multi-step tool-use tasks)

## Decision 2: Lambda Architecture — Extend vs New

**Decision**: Extend existing `fee-classifier-python` Lambda with new handlers `/classify_bank_transaction` and `/optimize_bank_recon_model`. Rename to `groot-finance-ai-classifier` in CDK.

**Rationale**: Both are text → GL account code classification. Same deps (dspy, boto3, gemini), same model (Flash-Lite), same S3 model storage pattern. Sharing a Lambda means one cold start serves both features. The fee classification code is ~240 lines — adding bank recon adds ~200 more. Total ~440 lines is manageable.

**Alternatives considered**:
- Separate `bank-recon-classifier` Lambda (cleaner isolation but duplicated boilerplate, double the cold starts)
- Unified "DSPy service" Lambda serving all features (einvoice CUA needs Chromium — incompatible runtime)

## Decision 3: Tier 1 Rule Engine — Convex vs Lambda

**Decision**: Tier 1 rules run in Convex (TypeScript), not Lambda. Same pattern as `convex/lib/feeClassifier.ts`.

**Rationale**: Rules are per-business, stored in Convex. Running them in Convex avoids a Lambda cold start for 60-80% of transactions. Only the "long tail" (Tier 1 unclassified) triggers Lambda.

**Alternatives considered**:
- All classification in Lambda (unnecessary latency + cost for known patterns)
- Rules in Lambda loaded from S3 (adds complexity, Convex already has the data)

## Decision 4: Correction Storage — Convex Table

**Decision**: New `bank_recon_corrections` Convex table. Corrections passed to Lambda as parameters on each classification call.

**Rationale**: Same pattern as `fee_classification_corrections`. Convex is the source of truth for business data. Lambda is stateless — receives corrections as input, doesn't store them.

**Alternatives considered**:
- Corrections in S3 alongside models (breaks Convex-as-source-of-truth pattern)
- Corrections in Lambda memory (lost on cold start)

## Decision 5: Model Storage — S3 Per-Business

**Decision**: Optimized models stored at `s3://finanseal-bucket/dspy-models/{businessId}/bank-recon/v{N}.json`. Same pattern as fee classification.

**Rationale**: S3 is cheap, persistent, versioned. Lambda loads from S3 on each invocation (model JSON is ~5-20KB, fast to load). Per-business isolation ensures one business's corrections don't affect another.

## Decision 6: GL Posting — Draft Journal Entry via Convex

**Decision**: When user confirms an AI classification, Convex mutation creates a draft journal entry using existing `journalEntries.createInternal`. Bank transaction is linked via `sourceId`.

**Rationale**: Follows IFRS double-entry standard. Draft status gives user control to review before posting. Uses existing journal entry infrastructure — no new GL logic needed.

**Alternatives considered**:
- Auto-post (bypasses user review — risky for accounting data)
- Batch-post at period end (too late for real-time reconciliation feedback)

## Decision 7: Replacing Old Categorize Flow

**Decision**: Remove the 4-option categorize dropdown (Bank Charges, Interest, Non-Business, Other). Replace with AI-suggested GL accounts + user override from full COA.

**Rationale**: The 4 categories were a placeholder for missing GL posting. Now that AI suggests specific COA account codes, the old flow is redundant and limiting. The full COA as target space allows the system to learn ANY account mapping, not just 4.

**Migration**: The `bank_transactions.category` field and `reconciliationStatus: "categorized"` status are deprecated. Existing categorized transactions will be treated as "unclassified" and re-processed through the new AI classification flow.
