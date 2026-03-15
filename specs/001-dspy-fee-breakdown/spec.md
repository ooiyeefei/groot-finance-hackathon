# Feature Specification: Hybrid Fee Breakdown Detection (Rules + DSPy)

**Feature Branch**: `001-dspy-fee-breakdown`
**Created**: 2026-03-15
**Status**: Draft
**Input**: GitHub Issue #294 — Hybrid fee breakdown detection for AR reconciliation

## Prior Work Analysis

The `001-hybrid-fee-detection` branch implemented substantial infrastructure that this spec builds upon. Understanding what exists vs. what's missing is critical context.

### Already Built (Reusable)

- **Tier 1 Rules Engine**: `convex/lib/feeClassifier.ts` — keyword-based fee classification with platform-specific rules, confidence scoring (0.98 exact, 0.90 substring)
- **Convex Tables**: `fee_classification_rules` (keyword mappings), `fee_classification_corrections` (user feedback), `sales_orders.classifiedFees` array field
- **Balance Validation**: `validateFeeBalance()` — ensures gross = net + fees within ±0.01
- **Confidence UI**: Green/yellow/red dots on AR reconciliation rows, "show only needs review" filter, inline correction dropdowns
- **Fee Rules Manager**: Admin UI for CRUD on keyword-to-account-code mappings per platform
- **Journal Entry Creation**: Per-fee-category GL lines (debit 5801–5810, credit 1200 AR)
- **User Corrections**: `recordCorrection()` mutation storing training data

### Not Built (Scope of This Spec)

- **DSPy modules**: No BootstrapFewShot, MIPROv2, Assert, or Suggest code exists
- **Self-optimization pipeline**: Current Tier 2 is simple Qwen3-8B prompting (wrong model) with corrections as context — NOT DSPy
- **Training data management**: No pipeline to curate, version, or optimize training examples
- **Metric-based evaluation**: No way to measure classification accuracy over time
- **Batch retraining**: No scheduled optimization of the classification model

### Cleanup Needed

- Remove unused `dspy>=2.6.0` from `requirements.txt` (document-processor Lambda — wrong location)
- Current Tier 2 in `feeClassificationActions.ts` incorrectly uses `callLLMJson` (Qwen3-8B) — must be replaced with DSPy module using Gemini 3.1 Flash-Lite as the LM. Qwen3-8B is reserved for the chat agent only

## Clarifications

### Session 2026-03-15

- Q: Should DSPy models be per-business, shared, or hybrid? → A: Hybrid — shared base model per platform (Shopee, Lazada, TikTok, etc.) trained on pooled corrections across all businesses, fine-tuned per-business for account code mapping preferences. Platform is the primary segmentation axis because fee naming patterns are platform-specific, while account code assignments differ by business.
- Q: What happens when DSPy Tier 2 is unavailable? → A: Fall back to Gemini 3.1 Flash-Lite prompt-based classification (non-DSPy). Gemini 3.1 Flash-Lite is the LM for both DSPy and the fallback path. Qwen3-8B is reserved for the chat agent only — never used for fee classification.
- Q: Minimum corrections before DSPy activates per platform? → A: 20 corrections per platform. Below threshold, use Gemini 3.1 Flash-Lite direct prompting as Tier 2.
- Q: Should the system support platforms beyond the 5 defaults? → A: Yes — configurable. 5 default platforms (Shopee, Lazada, TikTok Shop, Stripe, GrabPay) plus user-defined custom platforms. Each custom platform gets its own Tier 1 rules and DSPy training pool.

## User Scenarios & Testing

### User Story 1 — Bulk Fee Classification During CSV Import (Priority: P1)

A bookkeeper imports a CSV settlement file from Shopee containing 500 transaction rows. Each row has fee columns (commission, shipping, service fees). The system automatically classifies every fee into the correct expense account code using Tier 1 rules. The bookkeeper sees the AR reconciliation screen with confidence indicators — most rows are green (auto-accepted), a few are yellow or red requiring review.

**Why this priority**: This is the core value loop. Without reliable automated classification, bookkeepers must manually map every fee to an account code — a process that takes hours for 500+ rows. Tier 1 rules handle ~80% of fees with near-perfect accuracy and zero cost.

**Independent Test**: Import a Shopee CSV with known fee columns. Verify that all standard fee names (Commission Fee, Shipping Fee, Service Fee, Transaction Fee) are correctly mapped to account codes 5801–5810 with ≥0.90 confidence.

**Acceptance Scenarios**:

1. **Given** a Shopee CSV with 500 rows containing standard fee columns, **When** the bookkeeper imports it, **Then** ≥80% of fees are classified with ≥0.90 confidence and correct account codes
2. **Given** a fee name that exactly matches a keyword rule, **When** classification runs, **Then** confidence is 0.98 and the fee is shown as green (auto-accepted)
3. **Given** a fee name that partially matches a keyword rule via substring, **When** classification runs, **Then** confidence is 0.90 and the fee is shown as green
4. **Given** a fee name with no matching rule, **When** classification runs, **Then** the fee is marked as unclassified (confidence 0.0) and highlighted red for review

---

### User Story 2 — Confidence-Based Review and Correction (Priority: P1)

After import, the bookkeeper opens the AR reconciliation review screen. They use the "Show only items needing review" filter to skip the 450 green entries and focus on the 50 that need attention. For each yellow/red entry, they see the proposed account code, confidence score, and can correct it via a dropdown. Each correction is saved as training data for future classifications.

**Why this priority**: The review-and-correct loop is the human-in-the-loop safety net. Without it, misclassifications post silently to the GL. This also generates the training data that powers DSPy optimization (Story 3).

**Independent Test**: Import a CSV with a mix of known and unknown fees. Use the filter to isolate low-confidence items. Correct 5 fees. Verify corrections are saved and used as context in the next import.

**Acceptance Scenarios**:

1. **Given** 500 imported rows with mixed confidence levels, **When** the bookkeeper clicks "Show only items needing review", **Then** only rows with any fee below 0.90 confidence are shown
2. **Given** a red-highlighted fee with confidence 0.0, **When** the bookkeeper selects the correct account code from the dropdown, **Then** the correction is saved with the original fee name, platform, and corrected account code
3. **Given** a fee previously corrected in a prior import, **When** the same fee name appears in a new import, **Then** the Tier 2 classifier uses that correction as a training example and assigns higher confidence
4. **Given** a fee marked with "NEW" badge (never seen before), **When** the bookkeeper reviews it, **Then** the badge is visually distinct from low-confidence fees (first-time vs. uncertain)

---

### User Story 3 — DSPy-Powered Tier 2 Classification (Priority: P2)

When Tier 1 rules fail to classify a fee (confidence 0.0), the system invokes a DSPy module that uses accumulated user corrections as training data. The model uses a hybrid approach: a shared base model per platform (e.g., one for Shopee, one for Lazada) trained on pooled corrections from all businesses on that platform, plus per-business fine-tuning for account code mapping preferences. The DSPy module uses BootstrapFewShot to learn the mapping pattern from correction examples, and Assert/Suggest to enforce that the total fee breakdown balances (gross = net + fees). The classification includes a confidence score that drives the UI highlighting.

**Why this priority**: Tier 1 handles the known 80%. This story handles the "long tail" — unusual fee names like "Seller Subsidy Type B" or "Platform Service Charge (Promo)" that vary by country, season, and platform updates. DSPy's self-improvement means the system gets smarter with every user correction.

**Independent Test**: Create 30+ correction examples for a specific platform. Import a CSV with fee names not in Tier 1 rules but similar to corrected examples. Verify DSPy classifies them with ≥0.70 confidence after training.

**Acceptance Scenarios**:

1. **Given** 30+ accumulated corrections for Shopee fees, **When** a new Shopee CSV contains an unknown fee name similar to corrected examples, **Then** the DSPy module classifies it with ≥0.70 confidence
2. **Given** a DSPy classification, **When** the Assert constraint checks balance validation, **Then** any breakdown where gross ≠ net + fees is flagged and confidence is reduced
3. **Given** a fee name never seen in any correction, **When** DSPy attempts classification, **Then** it returns a best-guess classification with confidence <0.70 and marks it as "NEW"
4. **Given** a DSPy module with 50+ corrections, **When** compared to the same fees classified with only 10 corrections, **Then** average confidence improves by ≥15 percentage points

---

### User Story 4 — Automated DSPy Optimization (Priority: P3)

On a weekly schedule, the system runs MIPROv2 optimization on the DSPy module using all accumulated corrections. This retrains the few-shot examples to maximize classification accuracy. After optimization, the system logs the accuracy improvement and updates the active model version.

**Why this priority**: Manual correction is the immediate feedback loop (Story 2). MIPROv2 is the batch optimization that compounds those corrections into better overall performance. This is deferrable because the system works without it — just with lower accuracy on the long tail.

**Independent Test**: Accumulate 100+ corrections. Run MIPROv2 optimization. Compare classification accuracy before and after on a held-out test set of 20 fee names.

**Acceptance Scenarios**:

1. **Given** 100+ corrections accumulated over multiple imports, **When** the weekly MIPROv2 optimization runs, **Then** classification accuracy on a held-out test set improves by ≥10%
2. **Given** an optimization run completes, **When** the admin views the optimization log, **Then** they see the before/after accuracy metrics and the number of training examples used
3. **Given** an optimization run fails, **When** the system detects the failure, **Then** it falls back to the previous model version and alerts the admin

---

### User Story 5 — Fee Balance Enforcement at Period Close (Priority: P1)

When the bookkeeper closes an accounting period, the system validates that every sales order has a balanced fee breakdown (gross amount = net amount + sum of all fees). If any order is unbalanced, the period close is blocked with a clear error listing the affected orders. The bookkeeper must resolve discrepancies before closing.

**Why this priority**: Unbalanced journal entries are a hard accounting violation. This is the final safety gate before fees become permanent GL entries.

**Independent Test**: Import a CSV where one order has fees that don't sum correctly. Attempt to close the period. Verify the close is blocked with the specific order identified.

**Acceptance Scenarios**:

1. **Given** all sales orders in a period have balanced fee breakdowns, **When** the bookkeeper closes the period, **Then** journal entries are created with per-fee-category debit lines and period is locked
2. **Given** one sales order has fees summing to less than the expected total, **When** the bookkeeper attempts period close, **Then** the close is blocked with an error showing the order ID and discrepancy amount
3. **Given** a closed period, **When** a bookkeeper tries to modify fee classifications, **Then** modifications are blocked — corrections must be made via adjustment entries in a new period

---

### Edge Cases

- What happens when a CSV has fee columns with zero amounts? System includes them in the breakdown with 0.00 amount and skips classification (no account code needed for zero-amount fees)
- What happens when the same fee name maps to different account codes on different platforms? Tier 1 rules are platform-specific, so "Commission Fee" on Shopee maps to 5801 while "Commission" on Stripe maps to 5810 — this is correct behavior
- What happens when a business has no chart of accounts entries for fee categories? System uses default account codes (5801–5810) and allows the business to customize later
- What happens when DSPy optimization produces worse results than the previous model? System rolls back to the previous version automatically (Story 4, Scenario 3)
- What happens when a CSV has fee columns not in the expected format (e.g., combined "Total Fees" instead of individual breakdowns)? System flags the row as "unable to break down" and requires manual fee entry
- What happens when the correction training data is contradictory (same fee name corrected to different codes by different users)? System uses the most recent correction and flags the conflict for admin review

## Requirements

### Functional Requirements

#### Tier 1 — Rules Engine
- **FR-001**: System MUST classify fees using platform-specific keyword rules before invoking any AI model
- **FR-002**: System MUST support keyword rules per platform with priority ordering. Default platforms: Shopee, Lazada, TikTok Shop, Stripe, GrabPay. Admins MUST be able to add custom platforms (e.g., Taobao, Amazon, local payment gateways) that each get their own Tier 1 rules and DSPy training pool
- **FR-003**: System MUST assign confidence scores: 0.98 for exact keyword match, 0.90 for substring match, 0.0 for no match
- **FR-004**: Admins MUST be able to create, edit, and delete keyword-to-account-code rules per platform
- **FR-005**: System MUST provide a "seed default rules" action that populates standard platform fee mappings for new businesses

#### Tier 2 — DSPy Classification
- **FR-006**: System MUST invoke Tier 2 classification for any fee with confidence 0.0 after Tier 1 processing. If the platform has ≥20 accumulated corrections, use the DSPy module; otherwise, use Gemini 3.1 Flash-Lite direct prompting
- **FR-007**: The DSPy module MUST use a hybrid model architecture: shared base model per platform (trained on pooled corrections from all businesses on that platform) with per-business fine-tuning for account code mapping. BootstrapFewShot is used with user corrections as training examples
- **FR-008**: The DSPy module MUST use Assert constraints to validate that fee breakdowns balance (gross = net + fees)
- **FR-009**: The DSPy module MUST return a confidence score between 0.0 and 1.0 for each classification
- **FR-010**: The DSPy module MUST mark fee names never seen in any correction as "NEW"
- **FR-010a**: When the DSPy service is unavailable, the system MUST fall back to direct Gemini 3.1 Flash-Lite prompt-based classification. Fallback classifications MUST be flagged with a lower confidence ceiling (max 0.80) to indicate reduced optimization

#### Confidence & Review
- **FR-011**: System MUST color-code fees by confidence: green (≥0.90), yellow (0.70–0.89), red (<0.70), red "NEW" badge (never seen)
- **FR-012**: Users MUST be able to filter the review list to show only items needing review (confidence <0.90 or "NEW")
- **FR-013**: Users MUST be able to correct any fee's account code via inline dropdown
- **FR-014**: Every correction MUST be stored with: original fee name, original account code, corrected account code, platform, user who corrected, timestamp

#### Balance & Accounting
- **FR-015**: System MUST validate fee balance (gross = net + sum of fees) within ±0.01 tolerance before allowing period close
- **FR-016**: System MUST create separate journal entry lines per fee category when posting (e.g., one debit line per distinct account code)
- **FR-017**: System MUST block period close if any sales order has an unbalanced fee breakdown, showing affected order IDs and discrepancy amounts

#### Optimization Pipeline
- **FR-018**: System MUST support scheduled (weekly) MIPROv2 optimization using accumulated corrections
- **FR-019**: System MUST log optimization results: before/after accuracy, training example count, timestamp
- **FR-020**: System MUST automatically roll back to the previous model version if optimization produces worse accuracy

### Key Entities

- **Fee Classification Rule**: A platform-specific keyword mapping that translates a fee name substring to an account code. Has priority for conflict resolution when multiple rules match.
- **Classified Fee**: A single fee line item within a sales order, containing the fee name, amount, assigned account code, confidence score, classification tier (1 or 2), and whether it's newly encountered.
- **Fee Correction**: A user's correction of a classified fee, linking the original fee name to the corrected account code. Serves as training data for DSPy optimization.
- **DSPy Module Version**: A trained version of the classification model, scoped to a specific platform (shared base) or platform+business (fine-tuned). Contains metadata about training examples used, accuracy metrics, and active/rollback status.
- **Sales Order**: A settlement transaction from a platform, containing gross amount, net amount, and an array of classified fees that must balance.
- **Accounting Period**: A time-bounded window (month) within which fee classifications can be reviewed and corrected. Once closed, modifications require adjustment entries.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Tier 1 rules correctly classify ≥80% of fee line items across all supported platforms with ≥0.90 confidence
- **SC-002**: After 50 user corrections, Tier 2 (DSPy) correctly classifies ≥90% of previously unknown fees with ≥0.70 confidence
- **SC-003**: 100% of unbalanced fee breakdowns are caught before period close (zero unbalanced journal entries post to GL)
- **SC-004**: Bookkeepers can review and correct 500 fee items in under 15 minutes using confidence-based filtering (vs. 2+ hours manually)
- **SC-005**: Weekly optimization improves Tier 2 classification accuracy by ≥10% over the first 3 months of usage
- **SC-006**: System handles CSV imports with 5,000+ rows without timeout or degradation in classification quality

## Assumptions

- Businesses use a standard chart of accounts with fee categories in the 5800–5899 range (customizable per business)
- CSV settlement files from each platform have a consistent column structure within a platform (though columns vary across platforms)
- The existing CSV parser and column mapping infrastructure handles the platform-specific column mapping before fee classification begins
- DSPy runtime will be hosted on a Python Lambda or Modal endpoint, invoked from Convex via HTTP — the TypeScript application layer will not run DSPy natively
- User corrections are authoritative — when a user corrects a fee classification, that correction is treated as ground truth for training
- Gemini 3.1 Flash-Lite is the underlying LM for both the DSPy module and the non-DSPy fallback. Qwen3-8B is reserved for the chat agent only and must not be used for fee classification
- When DSPy Tier 2 is unavailable (timeout, error), the system falls back to direct Gemini 3.1 Flash-Lite prompt-based classification (non-DSPy) rather than leaving fees unclassified
