# Data Model: DSPy Smart Matcher for AR Order-to-Invoice Reconciliation

## New Table: `order_matching_corrections`

Captures user corrections to AI-suggested matches for training the DSPy pipeline.

| Field | Type | Description |
|-------|------|-------------|
| `businessId` | string (FK) | Business this correction belongs to |
| `orderReference` | string | Sales order reference from CSV import |
| `orderCustomerName` | string | Customer name on the order |
| `orderAmount` | number | Gross amount on the order |
| `orderDate` | string | Order date (YYYY-MM-DD) |
| `originalSuggestedInvoiceId` | string (FK, optional) | Invoice the AI originally suggested (null if AI found no match) |
| `originalConfidence` | number (optional) | AI confidence of original suggestion (0-1) |
| `originalReasoning` | string (optional) | AI reasoning trace of original suggestion |
| `correctedInvoiceId` | string (FK) | Invoice the user manually matched to |
| `correctedInvoiceNumber` | string | Invoice number of the corrected match |
| `correctedInvoiceCustomerName` | string | Customer name on the corrected invoice |
| `correctedInvoiceAmount` | number | Total amount on the corrected invoice |
| `correctionType` | string | "wrong_match" (AI suggested wrong invoice), "missed_match" (AI found no match but user found one), "false_positive" (AI suggested a match but user rejected it with no alternative) |
| `createdBy` | string | Clerk user ID of the corrector |
| `createdAt` | number | Timestamp of correction |

**Indexes**:
- `by_businessId_createdAt`: (businessId, createdAt) — query corrections for training, sorted by recency
- `by_businessId_orderReference`: (businessId, orderReference) — deduplicate corrections per order

## Extended Table: `sales_orders`

New fields added to existing table to support Tier 2 matching.

| New Field | Type | Description |
|-----------|------|-------------|
| `aiMatchSuggestions` | array (optional) | Array of AI match suggestions, each containing: `invoiceId`, `invoiceNumber`, `allocatedAmount`, `confidence`, `reasoning`, `matchType` ("single" or "split") |
| `aiMatchModelVersion` | string (optional) | S3 key of the DSPy model version used for this match |
| `aiMatchTier` | number (optional) | 0 = unprocessed, 1 = Tier 1 (deterministic), 2 = Tier 2 (AI) |
| `aiMatchStatus` | string (optional) | "pending_review", "approved", "rejected", "corrected" — status of AI suggestion |

**Note**: Existing `matchStatus`, `matchConfidence`, `matchMethod`, `matchedInvoiceId` fields are preserved. When user approves an AI suggestion, these existing fields are populated from the approved suggestion.

## Extended Table: `dspy_model_versions` (existing)

No schema changes — uses existing fields with:
- `domain` = `"ar_matching"`
- `platform` = `"ar_match_{businessId}"`

## Extended Table: `dspy_optimization_logs` (existing)

No schema changes — uses existing fields with:
- `platform` = `"ar_match_{businessId}"`

## State Transitions

### AI Match Suggestion Lifecycle

```
[Order imported] → aiMatchStatus: null
    ↓ (Tier 1 runs)
[Tier 1 matched] → aiMatchStatus: null, matchStatus: "matched", aiMatchTier: 1
    OR
[Tier 1 unmatched] → aiMatchStatus: null, matchStatus: "unmatched", aiMatchTier: 0
    ↓ (Tier 2 runs automatically)
[AI suggestion created] → aiMatchStatus: "pending_review", aiMatchTier: 2
    ↓ (User reviews)
[User approves] → aiMatchStatus: "approved", matchStatus: "matched"/"variance", matchMethod: "ai_suggested"
    OR
[User rejects + corrects] → aiMatchStatus: "corrected", correction record created
    OR
[User rejects (no alt)] → aiMatchStatus: "rejected", matchStatus: "unmatched"
```

### Correction → Training Pipeline

```
[Correction created] → stored in order_matching_corrections
    ↓ (< 20 corrections)
[No training effect] → base model with 0.80 cap
    ↓ (≥ 20 corrections)
[BootstrapFewShot inline] → corrections used as few-shot examples per-call
    ↓ (≥ 100 corrections + ≥ 15 unique customers)
[MIPROv2 weekly optimization] → new model version created, accuracy-gated activation
```
