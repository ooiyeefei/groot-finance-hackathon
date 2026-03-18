# Research: DSPy Vendor Item Matcher

**Date**: 2026-03-17
**Feature**: 001-dspy-vendor-item-matcher

## Decision 1: Lambda Architecture — Reuse Existing Container

**Decision**: Add `vendor_item_matcher.py` and `vendor_item_optimizer.py` to the existing `fee-classifier-python/` Lambda Docker container. Add new handler routes in `handler.py`.

**Rationale**: All 4 existing DSPy features (fee classification, bank recon, AR matching, PO matching) share one Lambda Docker container with route-based dispatching. Creating a separate Lambda would waste resources and diverge from the established pattern.

**Alternatives considered**:
- New standalone Lambda → Rejected: unnecessary CDK stack, duplicate Docker image, separate cold starts
- Convex action with inline AI → Rejected: CLAUDE.md mandates MCP as single intelligence engine; Convex actions can't run Python/DSPy

**Implementation**:
- handler.py: Add routes `match_vendor_items` and `optimize_vendor_item_model`
- New files: `vendor_item_matcher.py` (Signature + Module), `vendor_item_optimizer.py` (MIPROv2)
- No CDK changes needed — existing Lambda handles all routes

## Decision 2: 5 DSPy Components — Exact Pattern Match

**Decision**: Follow the identical 5-component structure used by `bank_recon_module.py`:

| Component | Vendor Item Matcher Implementation |
|-----------|-----------------------------------|
| **Signature** | `MatchVendorItems(dspy.Signature)` — item_a_desc, item_b_desc, item_a_vendor, item_b_vendor → is_match, confidence, reasoning |
| **Module** | `VendorItemMatcher(dspy.Module)` — wraps ChainOfThought |
| **ChainOfThought** | Generates reasoning traces for WHY items match or don't |
| **Assert** | Assert: items must be from different vendors; Assert: if specs detectable, specs must be compatible |
| **Suggest** | Suggest: matched items should have similar price ranges (0.5x-2x as soft guidance) |
| **BootstrapFewShot** | Inline when ≥20 corrections exist; compiles user confirmations/rejections into few-shot demos |

**Rationale**: Proven pattern with 4 successful implementations. ChainOfThought is critical for vendor items because reasoning traces ("Both are M8 bolts but different naming conventions") help users trust suggestions.

## Decision 3: Corrections Table — Per-Business Model

**Decision**: New `vendor_item_matching_corrections` table following `order_matching_corrections` pattern. Per-business scope.

**Rationale**: AR matching uses per-business models because customer naming patterns are business-specific. Vendor item naming patterns are similarly business-specific (different industries use different conventions).

**Schema key fields**:
- `businessId` (partition key)
- `itemDescriptionA`, `itemDescriptionB` (the pair)
- `vendorIdA`, `vendorIdB` (vendor context)
- `normalizedPairKey` (lowercase+trimmed concat for dedup — prevents re-suggestion of rejected pairs)
- `isMatch` (boolean ground truth)
- `correctedBy`, `createdAt`

## Decision 4: Optimization Threshold — 20 Corrections / 10 Unique Pairs

**Decision**: Lower threshold than AR matching (100) and fee classification (100).

**Rationale**:
- SMEs have fewer distinct items than customers (smaller matching space)
- Each correction is higher-signal (explicit "same/different" judgment vs AR's implicit match)
- The task is simpler (description similarity) vs AR matching (customer alias + amount + date)
- 20 corrections with 10 unique pairs provides enough diversity for BootstrapFewShot to generalize

**Comparison**:
| Feature | Correction Threshold | Diversity Threshold | Per-X |
|---------|---------------------|--------------------|----|
| Fee Classification | 100 | 10 unique fee names | Per-platform |
| Bank Recon | 20 | 10 unique descriptions | Per-business |
| AR Matching | 100 | 15 unique customers | Per-business |
| **Vendor Item Matching** | **20** | **10 unique pairs** | **Per-business** |

## Decision 5: Hybrid Trigger — On-Demand + Auto-Suggest

**Decision**: Two trigger paths:
1. **On-demand**: User clicks "Suggest Matches" on Price Intelligence page → Convex action → Lambda
2. **Auto-suggest**: After invoice processing, if a new item's Tier 1 Jaccard score is 40-79% against an existing cross-vendor group item → trigger DSPy Tier 2 for that specific pair

**Rationale**: On-demand gives users control. Auto-suggest catches obvious matches without user effort. The 40-79% Jaccard threshold avoids calling Lambda for items that Tier 1 already handles (≥80%) or clearly don't match (<40%).

**Bandwidth impact**: Auto-suggest only calls Lambda for items in the "uncertain" Jaccard range (40-79%), which is typically 5-15% of items. At ~1 Lambda call per uncertain item, this adds negligible cost.

## Decision 6: S3 Model State Key Pattern

**Decision**: `dspy-models/vendor_item_match_{businessId}/v{version}.json`

**Rationale**: Follows existing pattern (`dspy-models/ar_match_{businessId}/`, `dspy-models/bank_recon_{businessId}/`). Per-business directory allows independent model lifecycles. Version number in filename enables rollback.

## Decision 7: Confidence Capping

**Decision**: 80% cap for base model (no corrections), uncapped for optimized model.

**Rationale**: Matches existing pattern in fee classification (`FALLBACK_CONFIDENCE_CAP = 0.80`). The cap signals to users that the system hasn't been validated yet for their specific data.
