# Data Model: DSPy Vendor Item Matcher

**Date**: 2026-03-17
**Feature**: 001-dspy-vendor-item-matcher
**Database**: Convex (document database)

## New Table: vendor_item_matching_corrections

**Purpose**: Stores user confirmations/rejections of cross-vendor item match suggestions. Training data for DSPy BootstrapFewShot and MIPROv2 optimization.

**Pattern**: Follows `order_matching_corrections` (AR) and `bank_recon_corrections` (bank recon).

```typescript
vendor_item_matching_corrections: defineTable({
  // Scoping
  businessId: v.id("businesses"),

  // Item Pair
  itemDescriptionA: v.string(),           // First item description
  itemDescriptionB: v.string(),           // Second item description
  vendorIdA: v.id("vendors"),             // First vendor
  vendorIdB: v.id("vendors"),             // Second vendor
  normalizedPairKey: v.string(),          // Dedup key: sorted normalized descriptions joined by "||"

  // Ground Truth
  isMatch: v.boolean(),                   // true = user confirmed match, false = user rejected

  // AI Context (what the model predicted before correction)
  originalConfidence: v.optional(v.number()),   // Model's confidence before user corrected
  originalReasoning: v.optional(v.string()),    // Model's reasoning before correction
  modelVersionUsed: v.optional(v.string()),     // Which model version made the prediction

  // Metadata
  correctedBy: v.string(),               // User ID who made the correction
  createdAt: v.number(),                  // Timestamp
})
  .index("by_businessId_createdAt", ["businessId", "createdAt"])
  .index("by_businessId_pairKey", ["businessId", "normalizedPairKey"])
```

**Indexes**:
- `by_businessId_createdAt`: Query corrections chronologically for optimization (BootstrapFewShot needs recent corrections)
- `by_businessId_pairKey`: Check if a pair was previously rejected (FR-007 dedup)

**normalizedPairKey generation**:
```typescript
function generatePairKey(descA: string, descB: string): string {
  const normA = descA.toLowerCase().trim().replace(/\s+/g, " ");
  const normB = descB.toLowerCase().trim().replace(/\s+/g, " ");
  // Sort alphabetically so (A,B) and (B,A) produce same key
  const sorted = [normA, normB].sort();
  return sorted.join("||");
}
```

## Existing Table: dspy_model_versions (NO CHANGES)

Already supports vendor item matching via the `platform` field:
- `platform: "vendor_item_matching"` — new value for this feature
- `domain: "vendor_item_matching"` — redundant with platform for this feature
- All other fields (version, s3Key, status, trainingExamples, accuracy, optimizerType, trainedAt) reused as-is

## Existing Table: cross_vendor_item_groups (NO CHANGES)

The `matchSource` field already supports `"ai-suggested"` which is set when DSPy suggests a match. No schema changes needed.

## Schema Deployment

Add to `convex/schema.ts`:
```typescript
vendor_item_matching_corrections: defineTable({
  businessId: v.id("businesses"),
  itemDescriptionA: v.string(),
  itemDescriptionB: v.string(),
  vendorIdA: v.id("vendors"),
  vendorIdB: v.id("vendors"),
  normalizedPairKey: v.string(),
  isMatch: v.boolean(),
  originalConfidence: v.optional(v.number()),
  originalReasoning: v.optional(v.string()),
  modelVersionUsed: v.optional(v.string()),
  correctedBy: v.string(),
  createdAt: v.number(),
})
  .index("by_businessId_createdAt", ["businessId", "createdAt"])
  .index("by_businessId_pairKey", ["businessId", "normalizedPairKey"]),
```
