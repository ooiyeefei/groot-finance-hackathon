# Data Model: Self-Improving AI AP 3-Way Matching

## New Table: `po_match_corrections`

Captures human corrections to AI-generated match pairings. Used as training data for BootstrapFewShot and MIPROv2 optimization.

| Field | Type | Description |
|-------|------|-------------|
| businessId | id("businesses") | Business context |
| matchId | id("po_matches") | The match record being corrected |
| vendorName | string | Vendor name (denormalized for training) |
| originalPoLineDescription | string | PO line item description from AI's original pairing |
| originalInvoiceLineDescription | string | Invoice line item description from AI's original pairing |
| originalConfidence | number | AI's confidence in the original pairing |
| correctedPoLineDescription | string | PO line item description from human's corrected pairing (or "REJECTED" if unmatched) |
| correctedInvoiceLineDescription | string | Invoice line item description from human's corrected pairing |
| correctionType | string | "rejection" (AI wrong, human fixed), "override" (AI partially right, human adjusted), "approval" (AI correct) |
| createdBy | string | Clerk user ID of the admin who made the correction |
| createdAt | number | Timestamp |

**Indexes**:
- `by_businessId` → (businessId) — query corrections for training
- `by_businessId_vendor` → (businessId, vendorName) — vendor-specific training

## Extended Table: `po_matches`

Add fields to existing `po_matches` table for AI matching metadata.

| New Field | Type | Description |
|-----------|------|-------------|
| aiMatchTier | optional(number) | 1 = deterministic only, 2 = AI-enhanced |
| aiModelVersion | optional(string) | S3 key or "baseline" for the DSPy model used |
| aiReasoningTrace | optional(string) | Human-readable reasoning from ChainOfThought |
| aiVarianceDiagnosis | optional(string) | AI explanation of variance causes |
| aiMatchedAt | optional(number) | Timestamp of Tier 2 AI completion |
| aiConfidenceOverall | optional(number) | Average confidence across all AI pairings |

## Extended Table: `dspy_model_versions` (existing)

No schema changes — reuse existing table with `domain: "po_matching"` to distinguish from fee classification and bank recon models.

## Extended Table: `matching_settings` (existing)

| New Field | Type | Description |
|-----------|------|-------------|
| aiEnabled | optional(boolean) | Master toggle for Tier 2 AI (default true) |
| aiCallsThisMonth | optional(number) | Counter for monthly AI call usage |
| aiCallsResetAt | optional(number) | Timestamp of last counter reset |

## State Transitions

### PO Match with AI Enhancement

```
Invoice completed with PO ref
  → Tier 1 deterministic matching runs
  → IF all pairings confidence ≥ 0.6 AND no tolerance violations:
      → Match created (tier=1, status based on tolerance check)
  → ELSE IF AI enabled AND monthly quota not exceeded:
      → Tier 2 AI invoked via Lambda
      → IF AI succeeds:
          → Match created/updated with AI pairings (tier=2)
          → Status: "auto_approved" if all within tolerance, else "pending_review"
      → IF AI fails/times out:
          → Match created with Tier 1 pairings (tier=1, status="pending_review")
  → ELSE (AI disabled or quota exceeded):
      → Match created with Tier 1 pairings (tier=1, status="pending_review")
```

### Correction Lifecycle

```
Match in "pending_review"
  → Admin reviews match
  → IF approves without changes:
      → Correction created (type="approval")
      → Match status → "approved"
  → IF rejects/overrides pairings:
      → Correction created (type="rejection" or "override")
      → Match updated with corrected pairings
      → Match status → "approved" (with human override)
  → Corrections accumulate per business
  → At ≥20 corrections: BootstrapFewShot used inline
  → Weekly: MIPROv2 optimization evaluates improvement
```
