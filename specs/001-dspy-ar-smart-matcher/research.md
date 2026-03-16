# Research: DSPy Smart Matcher for AR Order-to-Invoice Reconciliation

## R1: DSPy Signature Design — Ranker vs Classifier

**Decision**: Use a ranker/selector signature where the module receives one order + N candidate invoices and outputs a ranked match list with reasoning.

**Rationale**: The existing DSPy modules (fee classification, bank recon) are classifiers (input → category). AR matching is fundamentally different — it's a pairing/assignment problem (input + candidates → best match). A ranker signature gives the LLM the full candidate context to reason about relative fitness.

**Alternatives considered**:
- Pairwise classifier (score each order-invoice pair independently): Rejected — loses cross-candidate context (e.g., can't detect "Invoice A is better than Invoice B because amounts are closer")
- Two-stage: filter then classify: Over-engineered for the candidate set sizes (10-50 invoices)

## R2: DSPy Module Architecture — Single vs Batch

**Decision**: Process orders individually (one DSPy call per unmatched order), with candidate invoices passed as a JSON array in the input field (max 50 candidates).

**Rationale**: Matches the existing bank recon pattern (one transaction per classify call). Individual calls enable per-order reasoning traces and simpler error handling. Batch parallelism handled at the Convex action level (multiple concurrent MCP calls).

**Alternatives considered**:
- Batch all orders in one DSPy call: Rejected — reasoning traces would be tangled, single failure would block entire batch
- Hierarchical (group by customer first): Premature optimization — add later if performance requires

## R3: Assert vs Suggest Mapping

**Decision**:
- **Assert** (hard, with backtracking): Sum of matched invoice amounts must be within tolerance of payment amount (FR-007)
- **Assert** (hard): Each matched invoice must exist in the candidate list (prevent hallucination)
- **Suggest** (soft): Customer name should match between order and suggested invoice (FR-008)
- **Suggest** (soft): When payment exceeds matched invoices, look for additional related orders

**Rationale**: DSPy Assert triggers backtracking retry (up to 3 attempts with modified prompt including the failed constraint). This is critical for amount balance — an unbalanced match would create bad journal entries. Customer name mismatch is a soft signal (legit cross-entity payments exist), so Suggest logs but doesn't block.

**Alternatives considered**:
- All constraints as Assert: Too strict — would reject valid matches where customer names legitimately differ
- All constraints as Suggest: Too lenient — could produce unbalanced matches that poison accounting

## R4: Correction Table Schema Design

**Decision**: Follow exact pattern of `bank_recon_corrections` table — per-business, captures original AI output + user's correction + context fields. Key difference: AR corrections include both order-side and invoice-side data for training.

**Rationale**: Proven pattern in production. The `bank_recon_corrections` table successfully feeds BootstrapFewShot (≥20 corrections) and MIPROv2 (≥100 corrections) optimization pipelines.

**Fields**:
- `businessId`, `orderReference`, `orderCustomerName`, `orderAmount`, `orderDate`
- `originalSuggestedInvoiceId`, `originalConfidence`, `originalReasoning`
- `correctedInvoiceId`, `correctedInvoiceNumber`, `correctedInvoiceCustomerName`, `correctedInvoiceAmount`
- `correctionType`: "wrong_match" | "missed_match" | "false_positive"
- `createdBy`, `createdAt`

## R5: Model Versioning & S3 Storage

**Decision**: Reuse existing `dspy_model_versions` table with `domain="ar_matching"` and `platform="ar_match_{businessId}"`. Model state saved to S3 at `dspy-models/ar_match_{businessId}/v{N}.json`.

**Rationale**: Identical to bank recon pattern. The `dspy_model_versions` table already supports multi-domain via the `domain` field added in the bank recon feature.

## R6: 1-to-N Split Match Implementation

**Decision**: The DSPy module outputs a JSON array of matched invoices (max 5) with per-invoice allocated amounts. The Assert constraint validates that allocations sum to the payment amount (within tolerance).

**Rationale**: The LLM can reason about invoice combinations naturally ("These 3 invoices from the same customer sum to the payment amount"). The 5-invoice cap keeps the search space manageable for the 60-second batch target.

**Output format**:
```json
{
  "matches": [
    {"invoiceId": "...", "invoiceNumber": "INV-201", "allocatedAmount": 1000.00},
    {"invoiceId": "...", "invoiceNumber": "INV-202", "allocatedAmount": 1050.00}
  ],
  "totalAllocated": 2050.00,
  "confidence": 0.88,
  "reasoning": "Payment of RM 2,050 matches sum of INV-201 + INV-202 for customer ABC Corp",
  "matchType": "split"
}
```

## R7: UI Integration — Bulk Approve Pattern

**Decision**: Extend existing `ar-reconciliation.tsx` orders table with:
1. A new `matchMethod` value: `"ai_suggested"` (distinct from `"exact_reference"`, `"fuzzy"`, `"manual"`)
2. Confidence dot indicator (reuse existing fee confidence pattern)
3. Inline reasoning preview (truncated, expand on click)
4. Checkbox column for AI-suggested rows
5. Floating "Approve Selected (N)" action bar (similar to bank recon batch actions)

**Rationale**: The AR reconciliation UI already has the row structure, detail sheet, and status filters. Adding AI suggestions follows the existing fee classification confidence pattern. The batch actions bar pattern exists in bank recon (Phase 6).

## R8: Optimization Thresholds

**Decision**: Follow existing tier thresholds:
- ≥20 corrections: BootstrapFewShot inline (max_bootstrapped_demos=4, max_labeled_demos=8)
- ≥100 corrections with ≥15 unique customer names: MIPROv2 weekly optimization
- Accuracy gating: new model only activates if afterAccuracy > beforeAccuracy
- Cold-start cap: 0.80 confidence maximum

**Rationale**: These thresholds are battle-tested in fee classification and bank recon. No reason to deviate for AR matching — the correction volume patterns are similar.
