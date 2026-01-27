# User Story 2: Visual Duplicate Indicators for Managers

**Goal**: Managers see duplicate badges in expense list, can dismiss false positives.

## Tasks

### T024: Verify getDuplicateMatches query
- [x] Review existing `convex/functions/duplicateMatches.ts`
- [x] Verify `getDuplicateMatches` query works correctly
- Already implemented and functional

### T025: Create duplicate-badge.tsx component
- [x] Create component in `src/domains/expense-claims/components/`
- [x] Props: status, matchCount, onClick
- [x] Use semantic colors: red (confirmed), orange (potential), green (dismissed)
- Already implemented with DuplicateBadge and DuplicateIndicator exports

### T026: Create duplicate-comparison-panel.tsx component
- [x] Create side-by-side comparison component
- [x] Props: originalClaim, matchedClaims, onDismiss, onConfirm
- [x] Show matched fields, confidence scores
- Already implemented with full comparison view and action buttons

### T027: Create dismiss-duplicate API route
- [x] POST `/api/v1/expense-claims/[id]/dismiss-duplicate/route.ts`
- [x] Body: { matchId, reason? }
- [x] Call Convex dismissDuplicate mutation
- Already implemented with validation and error handling

### T028: Create confirm-duplicate API route
- [x] POST `/api/v1/expense-claims/[id]/confirm-duplicate/route.ts`
- [x] Body: { matchId }
- [x] Call Convex confirmDuplicate mutation
- Already implemented with validation and error handling

### T029: Wire up comparison panel modal in duplicate report
- [x] Add modal state management to duplicate-report-page.tsx
- [x] Connect "Review" button to open comparison panel
- [x] Add dismiss/confirm handlers that call API routes
- Already implemented with full modal integration

### T030: Add navigation to duplicate report from approval dashboard
- [x] Add "Duplicate Expense Report" card to Reports tab
- [x] Link to /expense-claims/duplicate-report

### Build Verification
- [x] Run `npm run build` to verify no errors

## Review

### Summary of Changes
All User Story 2 tasks are now complete:

1. **T024**: `getDuplicateMatches` query verified and working in Convex
2. **T025**: `duplicate-badge.tsx` component with semantic colors (red/orange/yellow for exact/strong/fuzzy)
3. **T026**: `duplicate-comparison-panel.tsx` with side-by-side comparison, matched field highlighting
4. **T027**: `dismiss-duplicate` API route calling Convex mutation with reason
5. **T028**: `confirm-duplicate` API route calling Convex mutation
6. **T029**: Comparison panel modal wired up in duplicate report page
7. **T030**: Navigation added from approval dashboard Reports tab

### Files Modified/Created
- `src/domains/expense-claims/components/duplicate-badge.tsx` - Visual badge component
- `src/domains/expense-claims/components/duplicate-comparison-panel.tsx` - Side-by-side comparison
- `src/domains/expense-claims/components/duplicate-report-page.tsx` - Full report page with modal
- `src/domains/expense-claims/components/duplicate-report-table.tsx` - Table component
- `src/domains/expense-claims/components/expense-approval-dashboard.tsx` - Added navigation link
- `src/app/api/v1/expense-claims/[id]/dismiss-duplicate/route.ts` - Dismiss API
- `src/app/api/v1/expense-claims/[id]/confirm-duplicate/route.ts` - Confirm API
- `src/app/api/v1/expense-claims/duplicate-report/route.ts` - Report API
- `src/app/[locale]/expense-claims/duplicate-report/page.tsx` - Report page route

### Access Points
- Managers can access duplicate report via: Approval Dashboard > Reports tab > Duplicate Expense Report
- Direct URL: `/expense-claims/duplicate-report`
- In expense lists, duplicate badges show on claims with detected duplicates
- **Manager approval modal**: When reviewing a submitted expense, duplicate info shows directly in the popup with "Review Duplicates" button
- **User dashboard**: Draft expense cards show duplicate badges when duplicates are detected

### Bug Fix (2025-01-27)
- Fixed `duplicateStatus` not being mapped in `use-expense-claims-realtime.tsx` hook
- Added duplicate review functionality to `unified-expense-details-modal.tsx` for managers
- Wired up "Review Duplicates" button with DuplicateComparisonPanel modal
