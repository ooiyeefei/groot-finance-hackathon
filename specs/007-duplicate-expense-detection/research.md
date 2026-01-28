# Research: Duplicate Expense Claim Detection

**Feature**: 007-duplicate-expense-detection
**Date**: 2026-01-25

## Research Questions Resolved

### 1. Vendor Name Normalization Strategy

**Decision**: Simple rule-based normalization with Southeast Asian business suffixes

**Rationale**:
- Target users are SE Asian SMEs - need to handle local business suffixes
- Fuzzy string matching (Levenshtein) adds complexity without significant gain
- Simple normalization + exact comparison is deterministic and fast

**Implementation**:
```typescript
function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .replace(/[.,\-_]/g, '') // Remove punctuation
    // Remove SE Asian business suffixes
    .replace(/\b(sdn bhd|bhd|sendirian berhad|pte ltd|pt|co ltd|llc|inc|corp|corporation)\b/gi, '')
    .trim()
}
```

**Alternatives Considered**:
- Levenshtein distance: Too slow for real-time, complex threshold tuning
- Soundex/Metaphone: Designed for English names, not business names
- ML-based: Overkill, adds latency and cost

---

### 2. Amount Tolerance for Fuzzy Matching

**Decision**: ±1% OR ±1 unit of smallest currency denomination

**Rationale**:
- Currency conversion rounding can cause small differences
- Tax calculation rounding varies by system
- Fixed ±1 unit handles small receipts (e.g., RM 10.00 vs RM 10.01)
- Percentage handles large receipts (e.g., RM 1000.00 vs RM 1010.00 = 1%)

**Implementation**:
```typescript
function amountsMatch(a: number, b: number, currency: string): boolean {
  const percentTolerance = Math.abs(a - b) / Math.max(a, b) <= 0.01
  const absoluteTolerance = Math.abs(a - b) <= 1
  return percentTolerance || absoluteTolerance
}
```

**Alternatives Considered**:
- Exact match only: Too strict, misses legitimate duplicates
- ±5%: Too loose, high false positive rate
- Currency-specific tolerance: Adds complexity, marginal benefit

---

### 3. Date Range for Fuzzy Matching

**Decision**: ±1 day window for Tier 3 fuzzy matching

**Rationale**:
- Same receipt might have slightly different dates (transaction vs posting)
- Timezone differences between receipt generation and submission
- ±1 day is conservative enough to avoid false positives

**Implementation**:
```typescript
function datesMatch(date1: string, date2: string, tier: 'exact' | 'fuzzy'): boolean {
  if (tier === 'exact') return date1 === date2
  const d1 = new Date(date1), d2 = new Date(date2)
  const diffDays = Math.abs((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays <= 1
}
```

**Alternatives Considered**:
- Same day only: Too strict for timezone edge cases
- ±3 days: Too loose, high false positive rate
- Week-based: Not aligned with receipt behavior

---

### 4. Convex Query Optimization Strategy

**Decision**: Add compound index + bounded date range query

**Rationale**:
- Current implementation fetches ALL claims and filters in JS - O(n)
- With index, Convex can filter server-side - O(log n)
- 30-day window assumption reduces result set significantly

**Implementation**:
```typescript
// New Convex index
defineTable({
  // ... existing fields
}).index('by_business_vendor_date', ['businessId', 'vendorName', 'transactionDate'])

// Optimized query
const candidates = await ctx.db
  .query('expenseClaims')
  .withIndex('by_business_vendor_date', q =>
    q.eq('businessId', businessId)
  )
  .filter(q =>
    q.and(
      q.neq(q.field('status'), 'rejected'),
      q.neq(q.field('status'), 'failed'),
      q.gte(q.field('transactionDate'), thirtyDaysAgo)
    )
  )
  .collect()
```

**Alternatives Considered**:
- Full table scan: Current approach, too slow at scale
- External search service: Overkill for this use case
- In-memory cache: Adds complexity, stale data risk

---

### 5. Cross-User Duplicate Detection Scope

**Decision**: Check within same business, flag with different UX for same-user vs cross-user

**Rationale**:
- Same-user duplicate = likely mistake, block by default
- Cross-user duplicate = possible shared expense, warn but allow
- Per spec clarification: checkbox acknowledgment for split expenses

**Implementation**:
```typescript
interface DuplicateMatch {
  sourceClaimId: string
  matchedClaimId: string
  matchedUserId: string  // Compare with current user
  matchTier: 'exact' | 'strong' | 'fuzzy'
  isCrossUser: boolean   // Different warning UX
}
```

---

### 6. UI Pattern for Duplicate Warning

**Decision**: Modal dialog with claim comparison, not inline banner

**Rationale**:
- User must make an active decision (proceed/cancel)
- Modal prevents accidental form submission
- Comparison view helps user verify if truly duplicate
- Matches existing FinanSEAL modal patterns (shadcn Dialog)

**Alternatives Considered**:
- Inline banner: Too easy to ignore, doesn't block submission
- Toast notification: Not appropriate for blocking action
- Separate page: Disrupts flow unnecessarily

---

### 7. Rejected Claim Resubmission Flow

**Decision**: "Correct & Resubmit" button creates pre-filled draft linked to original

**Rationale**:
- Per spec clarification: new draft with original data pre-filled
- Link maintained for audit trail (resubmittedFromId/resubmittedToId)
- Original rejected claim preserved (not deleted)
- User can replace receipt or keep original

**Implementation Flow**:
```
1. User views rejected claim details
2. Clicks "Correct & Resubmit" button
3. System creates new draft with:
   - All financial data copied
   - Same receipt attached (can be replaced)
   - resubmittedFromId = rejected claim ID
4. Rejected claim updated: resubmittedToId = new claim ID
5. User edits and submits new claim
```

---

## Technology Decisions Summary

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Detection approach | Rule-based (not LLM) | Zero cost, <100ms latency, deterministic |
| Vendor normalization | Regex-based | Simple, handles SE Asian suffixes |
| Amount tolerance | ±1% or ±1 unit | Handles rounding, not too loose |
| Date tolerance | ±1 day (fuzzy tier only) | Handles timezone/posting differences |
| Query optimization | Convex index + 30-day window | O(log n) vs O(n) |
| Warning UI | Modal dialog | Forces decision, shows comparison |
| Resubmit flow | Pre-filled draft with link | Maintains audit trail |

## No Remaining Unknowns

All technical decisions resolved. Ready for Phase 1 design.
