# User Story 2: Visual Duplicate Indicators for Managers

**Goal**: Managers see duplicate badges in expense list, can dismiss false positives.

## Tasks

### T024: Verify getDuplicateMatches query
- [x] Review existing `convex/functions/duplicateMatches.ts`
- [x] Verify `getDuplicateMatches` query works correctly
- Already implemented and functional

### T025: Create duplicate-badge.tsx component
- [ ] Create component in `src/domains/expense-claims/components/`
- [ ] Props: status, matchCount, onClick
- [ ] Use semantic colors: red (confirmed), orange (potential), green (dismissed)

### T026: Create duplicate-comparison-panel.tsx component
- [ ] Create side-by-side comparison component
- [ ] Props: originalClaim, matchedClaims, onDismiss, onConfirm
- [ ] Show matched fields, confidence scores

### T027: Create dismiss-duplicate API route
- [ ] POST `/api/v1/expense-claims/[id]/dismiss-duplicate/route.ts`
- [ ] Body: { matchId, reason? }
- [ ] Call Convex dismissDuplicate mutation

### T028: Create confirm-duplicate API route
- [ ] POST `/api/v1/expense-claims/[id]/confirm-duplicate/route.ts`
- [ ] Body: { matchId }
- [ ] Call Convex confirmDuplicate mutation

### Build Verification
- [ ] Run `npm run build` to verify no errors

## Review
(To be filled after completion)
