# Quickstart: Duplicate Expense Claim Detection

**Feature**: 007-duplicate-expense-detection
**Date**: 2026-01-25

## Prerequisites

- Node.js 18+
- Convex CLI (`npm i -g convex`)
- Access to Convex dev environment (`harmless-panther-50`)

## Setup

```bash
# 1. Ensure you're on the feature branch
git checkout 007-duplicate-expense-detection

# 2. Install dependencies
npm install

# 3. Start Convex dev server (syncs schema changes)
npx convex dev

# 4. Start Next.js dev server
npm run dev
```

## Key Files to Modify

### Phase 1: Schema & Types (Data Layer)

1. **`convex/schema.ts`** - Add duplicate fields to expenseClaims, create duplicateMatches table
2. **`src/domains/expense-claims/types/expense-claims.ts`** - Add TypeScript interfaces

### Phase 2: Core Logic (Business Layer)

3. **`src/domains/expense-claims/lib/duplicate-detection.ts`** - NEW: Core detection algorithm
4. **`src/domains/expense-claims/lib/vendor-normalizer.ts`** - NEW: Vendor name normalization
5. **`convex/functions/expenseClaims.ts`** - Add checkDuplicates query

### Phase 3: API (Integration Layer)

6. **`src/domains/expense-claims/lib/data-access.ts`** - Enhance createExpenseClaim with detection
7. **`src/app/api/v1/expense-claims/check-duplicates/route.ts`** - NEW: Pre-check endpoint
8. **`src/app/api/v1/expense-claims/[id]/resubmit/route.ts`** - NEW: Resubmit endpoint

### Phase 4: UI (Presentation Layer)

9. **`src/domains/expense-claims/hooks/use-duplicate-detection.ts`** - NEW: Detection hook
10. **`src/domains/expense-claims/components/duplicate-warning-modal.tsx`** - NEW: Warning dialog
11. **`src/domains/expense-claims/components/create-expense-page-new.tsx`** - Add pre-submit check
12. **`src/domains/expense-claims/components/correct-resubmit-button.tsx`** - NEW: Resubmit button

## Testing the Feature

### Manual Testing Flow

1. **Test Exact Duplicate (Tier 1)**:
   ```
   a. Create expense claim with reference "TEST-001"
   b. Try to create another claim with same reference
   c. Verify duplicate warning modal appears
   d. Test "Cancel" and "Proceed with justification" flows
   ```

2. **Test Strong Duplicate (Tier 2)**:
   ```
   a. Create claim: Vendor="Test Corp", Date="2025-01-25", Amount=100.00
   b. Create another claim with same vendor/date/amount but no reference
   c. Verify duplicate warning with "Strong match" indicator
   ```

3. **Test Cross-User Duplicate**:
   ```
   a. Login as User A, create claim
   b. Login as User B (same business), create matching claim
   c. Verify "Potential Shared Expense" warning
   d. Test "This is a split expense" checkbox
   ```

4. **Test Resubmit Rejected Claim**:
   ```
   a. Create and submit expense claim
   b. As manager, reject the claim
   c. As employee, view rejected claim
   d. Click "Correct & Resubmit"
   e. Verify new draft created with pre-filled data
   ```

### Unit Tests

```bash
# Run duplicate detection tests
npm run test -- --filter=duplicate-detection

# Run all expense claims tests
npm run test -- --filter=expense-claims
```

## Debug Commands

```bash
# Check Convex schema deployed
npx convex dashboard

# View duplicate matches in Convex
# Navigate to: Dashboard > Data > duplicateMatches

# Check API logs
npm run dev -- --turbo
# Look for [duplicate-detection] log entries
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Schema not syncing | Run `npx convex dev --once` to force sync |
| Type errors after schema change | Restart TypeScript server in VSCode |
| Detection not triggering | Check `duplicateStatus` field is being set |
| Cross-user detection not working | Verify both users are in same business |

## Build Verification

```bash
# MANDATORY: Run build before committing
npm run build

# If build fails, fix errors before proceeding
# Common issues:
# - Missing type imports
# - Convex function signature mismatches
# - Missing null checks on optional fields
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    User Submits Form                     │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  use-duplicate-detection.ts (Client-side hook)          │
│  - Calls /api/v1/expense-claims/check-duplicates        │
│  - Returns DuplicateDetectionResult                     │
└─────────────────────────┬───────────────────────────────┘
                          │ hasDuplicates?
              ┌───────────┴───────────┐
              │ Yes                   │ No
              ▼                       ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│ duplicate-warning-modal │ │ Submit to API           │
│ - Show matches          │ │ POST /expense-claims    │
│ - Override option       │ └─────────────────────────┘
│ - Split expense checkbox│
└─────────────┬───────────┘
              │ User proceeds
              ▼
┌─────────────────────────────────────────────────────────┐
│  data-access.ts::createExpenseClaim()                   │
│  - Server-side duplicate check (belt & suspenders)      │
│  - Create duplicateMatch records                        │
│  - Set duplicateStatus on claim                         │
└─────────────────────────────────────────────────────────┘
```

## Next Steps

After implementation:
1. Run `/speckit.tasks` to generate task breakdown
2. Follow TDD: Write tests first, then implement
3. Run `npm run build` after each change
4. Push to GitHub for Vercel preview deployment
