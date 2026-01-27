# Duplicate Expense Detection

**Feature ID**: 007-duplicate-expense-detection
**Status**: Implemented
**Last Updated**: 2026-01-27

## Overview

The duplicate expense detection system prevents fraudulent or accidental double-submissions of expense claims. It operates at three checkpoints in the expense lifecycle and uses rule-based matching (not LLM) for deterministic, auditable results.

## Detection Phases

### Phase 1: User Draft Level
When a user creates or edits an expense claim, the system checks for duplicates **before submission**.

**Trigger**: Auto-check on form load (edit mode) or manual check before submit
**UI**: Warning modal with matched expenses, requires justification to proceed

### Phase 2: Manager Review Level
When a manager reviews a submitted expense, duplicate indicators are visible.

**Trigger**: Manager opens expense for approval
**UI**: Duplicate badge on expense cards, detailed comparison in review modal

### Phase 3: Monthly Report Level
Finance/Admin can view a consolidated duplicate report across all business expenses.

**Trigger**: Monthly report generation
**UI**: Duplicate report table with filtering and bulk actions

## Detection Algorithm

### Three-Tier Matching

| Tier | Confidence | Matching Criteria |
|------|------------|-------------------|
| **Exact** | 100% | Same reference/receipt number |
| **Strong** | 90% | Same vendor + date + amount (exact) |
| **Fuzzy** | 70% | Similar vendor (normalized) + date (±1 day) + amount (±1%) |

### Vendor Normalization

The system normalizes vendor names to handle common variations:

```typescript
// Examples of normalization
"STARBUCKS COFFEE #1234" → "starbucks"
"ABC Sdn. Bhd." → "abc"
"XYZ PTE LTD" → "xyz"
```

**SE Asian business suffixes removed**: Sdn Bhd, Pte Ltd, Co Ltd, Corp, Inc, LLC, etc.

## Data Model

### ExpenseClaim Fields

| Field | Type | Description |
|-------|------|-------------|
| `duplicateStatus` | `'none' \| 'potential' \| 'confirmed' \| 'dismissed'` | Detection status |
| `duplicateOverrideReason` | `string \| null` | User justification when overriding |
| `isSplitExpense` | `boolean` | User acknowledged split expense |

### DuplicateMatch Entity

Stores detected duplicate relationships for audit:

| Field | Type | Description |
|-------|------|-------------|
| `sourceClaimId` | `Id<'expenseClaims'>` | Claim being submitted |
| `matchedClaimId` | `Id<'expenseClaims'>` | Existing matched claim |
| `matchTier` | `'exact' \| 'strong' \| 'fuzzy'` | Detection tier |
| `matchedFields` | `string[]` | Fields that matched |
| `confidenceScore` | `number` | 0.0-1.0 confidence |
| `isCrossUser` | `boolean` | Match is from another user |
| `status` | `'pending' \| 'confirmed_duplicate' \| 'dismissed'` | Resolution |

## User Flows

### Creating New Expense (with duplicates found)

```
1. User fills expense form
2. User clicks "Submit"
3. System runs duplicate check
4. Duplicates found → Warning modal appears
5. Modal shows:
   - Current expense (marked with ★ Current tag)
   - Matched expenses (clickable to view)
   - Cross-user warning if applicable
   - Split expense checkbox
   - Justification textarea (required)
6. User provides justification → Proceeds with submission
   OR User cancels → Returns to edit
```

### Editing Existing Expense

```
1. User opens edit modal
2. System auto-runs duplicate check on load
3. If duplicates found → Warning banner appears
4. User can view matches via "View Matches" button
5. Same modal flow as above
```

### Clicking Duplicate Card

```
1. User clicks on a matched expense card
2. System checks expense status:
   - Draft/Failed → Opens edit modal
   - Submitted/Approved/etc. → Opens view-only modal
3. Navigation is same-window (not new tab)
```

## API Endpoints

### Check Duplicates

```
POST /api/v1/expense-claims/check-duplicates

Request:
{
  vendorName: string,
  transactionDate: string,  // YYYY-MM-DD
  totalAmount: number,
  currency: string,
  referenceNumber?: string,
  excludeClaimId?: string   // Exclude current claim (edit mode)
}

Response:
{
  success: true,
  data: {
    hasDuplicates: boolean,
    matches: DuplicateMatchPreview[],
    highestTier: 'exact' | 'strong' | 'fuzzy' | null
  }
}
```

### Confirm/Dismiss Duplicate

```
POST /api/v1/expense-claims/{id}/confirm-duplicate
POST /api/v1/expense-claims/{id}/dismiss-duplicate

Request:
{
  matchedClaimId: string,
  reason?: string  // Required for dismiss
}
```

## Key Files

### Types
- `src/domains/expense-claims/types/duplicate-detection.ts` - Type definitions

### Detection Logic
- `src/domains/expense-claims/lib/duplicate-detection.ts` - Core algorithm
- `src/domains/expense-claims/lib/vendor-normalizer.ts` - Vendor name normalization

### Hooks
- `src/domains/expense-claims/hooks/use-duplicate-detection.ts` - API hook
- `src/domains/expense-claims/hooks/use-expense-form.ts` - Form integration

### Components
- `src/domains/expense-claims/components/duplicate-warning-modal.tsx` - Warning modal
- `src/domains/expense-claims/components/duplicate-badge.tsx` - Status badge

### API Routes
- `src/app/api/v1/expense-claims/check-duplicates/route.ts` - Check endpoint

### Convex
- `convex/functions/expenseClaims.ts` - `checkDuplicates` query
- `convex/functions/duplicateMatches.ts` - Match storage

## Configuration

No configuration required. Detection thresholds are hardcoded:

```typescript
const DETECTION_CONFIG = {
  dateTolerance: 1,      // ±1 day for fuzzy matching
  amountTolerance: 0.01, // ±1% for fuzzy matching
}
```

## Related Documentation

- [Expense Claims Overview](./overview.md)
- [Approval Workflow](./approval-workflow.md)
- [Specs: 007-duplicate-expense-detection](../../../specs/007-duplicate-expense-detection/)
