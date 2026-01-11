# Fix Manager Approvals Total Claims Count

## Problem
The Manager Approvals page shows "Total Claims = 3" but all 3 claims are in draft status. Manager approvals should only count claims that have been submitted onwards (submitted, approved, rejected, reimbursed).

## Root Cause
In `convex/functions/expenseClaims.ts:442`, the `totalClaims` is calculated as `claims.length` which includes ALL claims regardless of status, including drafts.

## Solution
Filter claims to exclude pre-submission statuses when calculating `totalClaims` for manager analytics:
- Exclude: `draft`, `uploading`, `processing`, `failed`
- Include: `submitted`, `pending`, `approved`, `rejected`, `reimbursed`

## Tasks
- [x] Update `getAnalytics` query in `convex/functions/expenseClaims.ts` to filter out draft/pre-submission statuses from totalClaims
- [x] Run `npm run build` to verify no TypeScript errors
- [x] Deploy Convex changes with `npx convex deploy --yes`

## Review

### Changes Made
**File:** `convex/functions/expenseClaims.ts` (lines 419-464)

1. Added `preSubmissionStatuses` array: `["draft", "uploading", "processing", "failed"]`
2. Modified analytics loop to skip pre-submission claims for amount/category calculations
3. Added `submittedClaims` filter to count only claims in the approval workflow
4. Updated `totalClaims` to use `submittedClaims.length` instead of `claims.length`
5. Updated `averageAmount` to use `submittedClaims.length`

### Security Review
- BusinessId filtering already correct - uses resolved `business._id` from membership check
- Only `owner` and `admin` roles can access analytics (line 388)
- No data leakage risk between businesses

### Impact
- Manager Approvals page "Total Claims" now shows 0 for draft-only claims
- `totalAmount`, `categoryTotals`, and `averageAmount` now exclude draft claims
- `statusCounts` still shows all statuses for visibility/debugging
