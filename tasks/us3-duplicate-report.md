# User Story 3: Batch Duplicate Report for Finance Admins

## Goal
Finance admins generate report of all potential duplicates for audit.

## Tasks

- [x] T032: Add `getDuplicateReport` query in `convex/functions/duplicateMatches.ts`
  - **Status**: Already exists with full implementation including date range filtering, status filtering, enriched match data with claim details, and summary statistics.

- [ ] T033: Create `duplicate-report` API route in `src/app/api/v1/expense-claims/duplicate-report/route.ts`
  - GET endpoint with query params: status, startDate, endDate, limit
  - Returns matches with summary statistics
  - Uses existing Convex `getDuplicateReport` query

- [ ] T034: Create `duplicate-report-page.tsx` page component
  - Page at `/expense-claims/duplicate-report`
  - Date range picker
  - Status filter dropdown
  - Export to CSV button
  - Integration with table component

- [ ] T035: Create `duplicate-report-table.tsx` component
  - Sortable table columns
  - Shows: Original claim info, Matched claim info, Match tier, Confidence, Status
  - Action buttons for reviewing duplicates
  - Follows semantic design system

## Implementation Notes

- T032 already exists with comprehensive implementation including:
  - Role-based access (owner, finance_admin, manager)
  - Date range filtering
  - Status filtering (pending, confirmed_duplicate, dismissed, all)
  - Enriched match data with submitter details
  - Summary statistics (total, by status, by tier, cross-user count)

## Review
(To be filled after completion)
