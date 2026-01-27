# Phase 6: Correct & Resubmit Flow (FR-011)

## Goal
Users can resubmit rejected claims with corrections.

## Tasks

- [ ] T039: Add `resubmitRejectedClaim` mutation in `convex/functions/expenseClaims.ts`
- [ ] T040: Create `resubmit` API route in `src/app/api/v1/expense-claims/[id]/resubmit/route.ts`
- [ ] T041: Create `correct-resubmit-button.tsx` component in `src/domains/expense-claims/components/`
- [ ] Build verification

## Implementation Details

### T039 - resubmitRejectedClaim mutation
- Verify claim exists and is in 'rejected' status
- Create new claim with data from original (or updated data)
- Set resubmittedFromId on new claim (reference to original)
- Set resubmittedToId on original claim (reference to new)
- Return new claim ID

### T040 - resubmit API route
- POST /api/v1/expense-claims/[id]/resubmit
- Validates user owns the original claim
- Calls resubmitRejectedClaim mutation
- Returns new claim ID

### T041 - correct-resubmit-button.tsx
- Only visible when status === 'rejected'
- Shows confirmation dialog
- Option to edit before resubmitting
- Links to new draft after creation

## Review
(To be filled after completion)
