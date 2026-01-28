# Data Model: Duplicate Expense Claim Detection

**Feature**: 007-duplicate-expense-detection
**Date**: 2026-01-25

## Entity Changes

### 1. ExpenseClaim (Enhanced)

**Table**: `expenseClaims` (Convex)

**New Fields**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `duplicateStatus` | `'none' \| 'potential' \| 'confirmed' \| 'dismissed'` | Yes | `'none'` | Duplicate detection status |
| `duplicateGroupId` | `string \| null` | No | `null` | Groups claims identified as duplicates |
| `duplicateOverrideReason` | `string \| null` | No | `null` | User justification when overriding |
| `duplicateOverrideAt` | `number \| null` | No | `null` | Timestamp of override |
| `isSplitExpense` | `boolean` | Yes | `false` | User acknowledged split expense |
| `resubmittedFromId` | `Id<'expenseClaims'> \| null` | No | `null` | Reference to rejected claim this was created from |
| `resubmittedToId` | `Id<'expenseClaims'> \| null` | No | `null` | Reference to new claim created from this rejected claim |

**New Index**:

```typescript
// For optimized duplicate detection queries
.index('by_business_vendor_date', ['businessId', 'vendorName', 'transactionDate'])
.index('by_business_reference', ['businessId', 'referenceNumber'])
```

**State Transitions (duplicateStatus)**:

```
                    ┌─────────────────┐
                    │      none       │ (initial state)
                    └────────┬────────┘
                             │ duplicate detected
                             ▼
                    ┌─────────────────┐
                    │    potential    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │ user/manager confirms       │ user dismisses with reason
              ▼                             ▼
     ┌─────────────────┐           ┌─────────────────┐
     │    confirmed    │           │    dismissed    │
     └─────────────────┘           └─────────────────┘
```

---

### 2. DuplicateMatch (New Entity)

**Table**: `duplicateMatches` (Convex)

**Purpose**: Stores detected duplicate relationships for audit and display

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | `Id<'duplicateMatches'>` | Yes | Primary key (auto) |
| `_creationTime` | `number` | Yes | Created timestamp (auto) |
| `businessId` | `Id<'businesses'>` | Yes | Business scope |
| `sourceClaimId` | `Id<'expenseClaims'>` | Yes | The claim being submitted |
| `matchedClaimId` | `Id<'expenseClaims'>` | Yes | The existing claim matched against |
| `matchTier` | `'exact' \| 'strong' \| 'fuzzy'` | Yes | Detection tier |
| `matchedFields` | `string[]` | Yes | Fields that matched: `['referenceNumber']`, `['vendorName', 'transactionDate', 'totalAmount']` |
| `confidenceScore` | `number` | Yes | 0.0-1.0 confidence |
| `isCrossUser` | `boolean` | Yes | Whether match is cross-user |
| `status` | `'pending' \| 'confirmed_duplicate' \| 'dismissed'` | Yes | Resolution status |
| `overrideReason` | `string \| null` | No | User justification if dismissed |
| `resolvedBy` | `Id<'users'> \| null` | No | User who resolved |
| `resolvedAt` | `number \| null` | No | Resolution timestamp |

**Indexes**:

```typescript
.index('by_source_claim', ['sourceClaimId'])
.index('by_matched_claim', ['matchedClaimId'])
.index('by_business_status', ['businessId', 'status'])
```

**Validation Rules**:

- `confidenceScore` must be between 0.0 and 1.0
- `matchTier` determines confidence: exact=1.0, strong=0.9, fuzzy=0.7
- `sourceClaimId` !== `matchedClaimId` (no self-matches)

---

## TypeScript Interfaces

```typescript
// src/domains/expense-claims/types/duplicate-detection.ts

export type DuplicateStatus = 'none' | 'potential' | 'confirmed' | 'dismissed'
export type MatchTier = 'exact' | 'strong' | 'fuzzy'
export type MatchStatus = 'pending' | 'confirmed_duplicate' | 'dismissed'

export interface DuplicateMatch {
  _id: string
  _creationTime: number
  businessId: string
  sourceClaimId: string
  matchedClaimId: string
  matchTier: MatchTier
  matchedFields: string[]
  confidenceScore: number
  isCrossUser: boolean
  status: MatchStatus
  overrideReason: string | null
  resolvedBy: string | null
  resolvedAt: number | null
}

export interface DuplicateDetectionResult {
  hasDuplicates: boolean
  matches: DuplicateMatchPreview[]
  highestTier: MatchTier | null
}

export interface DuplicateMatchPreview {
  matchedClaimId: string
  matchedClaimRef: string  // For display: "REP-A001014/2025"
  matchTier: MatchTier
  matchedFields: string[]
  confidenceScore: number
  isCrossUser: boolean
  matchedClaim: {
    vendorName: string
    transactionDate: string
    totalAmount: number
    currency: string
    status: string
    submittedBy: string  // User name
    createdAt: number
  }
}

export interface DuplicateOverride {
  reason: string
  isSplitExpense: boolean
}
```

---

## Convex Schema Changes

```typescript
// convex/schema.ts (additions)

expenseClaims: defineTable({
  // ... existing fields ...

  // NEW: Duplicate detection fields
  duplicateStatus: v.optional(v.union(
    v.literal('none'),
    v.literal('potential'),
    v.literal('confirmed'),
    v.literal('dismissed')
  )),
  duplicateGroupId: v.optional(v.string()),
  duplicateOverrideReason: v.optional(v.string()),
  duplicateOverrideAt: v.optional(v.number()),
  isSplitExpense: v.optional(v.boolean()),

  // NEW: Resubmission tracking
  resubmittedFromId: v.optional(v.id('expenseClaims')),
  resubmittedToId: v.optional(v.id('expenseClaims')),
})
  // Existing indexes...
  .index('by_business_vendor_date', ['businessId', 'vendorName', 'transactionDate'])
  .index('by_business_reference', ['businessId', 'referenceNumber']),

// NEW: Duplicate matches table
duplicateMatches: defineTable({
  businessId: v.id('businesses'),
  sourceClaimId: v.id('expenseClaims'),
  matchedClaimId: v.id('expenseClaims'),
  matchTier: v.union(
    v.literal('exact'),
    v.literal('strong'),
    v.literal('fuzzy')
  ),
  matchedFields: v.array(v.string()),
  confidenceScore: v.number(),
  isCrossUser: v.boolean(),
  status: v.union(
    v.literal('pending'),
    v.literal('confirmed_duplicate'),
    v.literal('dismissed')
  ),
  overrideReason: v.optional(v.string()),
  resolvedBy: v.optional(v.id('users')),
  resolvedAt: v.optional(v.number()),
})
  .index('by_source_claim', ['sourceClaimId'])
  .index('by_matched_claim', ['matchedClaimId'])
  .index('by_business_status', ['businessId', 'status']),
```

---

## Migration Strategy

**Approach**: Additive schema changes (no data migration required)

1. **Phase 1**: Add new optional fields to `expenseClaims`
   - All existing claims default to `duplicateStatus: 'none'`
   - `resubmittedFromId`/`resubmittedToId` default to `null`

2. **Phase 2**: Add `duplicateMatches` table
   - New table, no migration
   - Backfill optional (run batch detection on historical data)

3. **Phase 3**: Add indexes
   - Convex handles index creation automatically
   - May take time on large datasets

**Rollback Plan**: All fields are optional, can be ignored if feature disabled
