# Quickstart: Batch Expense Submission

**Feature Branch**: `009-batch-receipt-submission`

## Prerequisites

- Node.js 20.x
- Convex CLI: `npx convex dev` running locally
- AWS credentials configured (for S3/CloudFront file storage)
- Clerk authentication configured

## Development Setup

```bash
# 1. Checkout feature branch
git checkout 009-batch-receipt-submission

# 2. Install dependencies
npm install

# 3. Start Convex dev server (auto-syncs schema & functions)
npx convex dev

# 4. Start Next.js dev server
npm run dev

# 5. Verify at http://localhost:3000/en/expense-claims
```

## Implementation Order

### Step 1: Schema & Backend (Convex)

1. Add `expense_submissions` table to `convex/schema.ts`
2. Add `submissionId` field to `expense_claims` table
3. Create `convex/functions/expenseSubmissions.ts` with queries and mutations
4. Add cron job to `convex/crons.ts` for empty draft cleanup
5. Extend `convex/functions/system.ts` with system mutations for submission processing

**Verify**: `npx convex dev` deploys without errors

### Step 2: REST API Layer

1. Create `src/app/api/v1/expense-submissions/` route handlers
2. Follow existing patterns from `src/app/api/v1/expense-claims/`
3. Wire routes to Convex functions via `fetchQuery`/`fetchMutation`

**Verify**: Test endpoints with curl or API client

### Step 3: UI Components

1. Create Sheet/Drawer component in `src/components/ui/sheet.tsx`
2. Create submission detail page at `src/app/[locale]/expense-claims/submissions/[id]/page.tsx`
3. Create `SubmissionDetailPage` component with:
   - Upload area (reuse `ReceiptUploadStep` pattern)
   - Claim list with status indicators
   - Currency-grouped totals
   - Submit/delete buttons
4. Create `ClaimDetailDrawer` that wraps existing `EditExpenseModalNew` in a slide-out drawer
5. Update `PersonalExpenseDashboard` to show submissions list
6. Update `ExpenseApprovalDashboard` to show grouped submissions

**Verify**: Create a submission, upload receipts, verify extraction, submit for approval

### Step 4: Approval Flow

1. Update manager approval dashboard to show submissions
2. Implement approve/reject mutations with accounting entry creation
3. Add notification email for approval/rejection
4. Verify all-or-nothing approval behavior

**Verify**: Full end-to-end flow — create → submit → approve → accounting entries created

### Step 5: Derived States & Cleanup

1. Implement reimbursement progress indicator on approved submissions
2. Wire auto-transition to "reimbursed" when all claims paid
3. Verify cron job deletes empty drafts after 24h
4. Add warning banner on empty draft pages

**Verify**: `npm run build` passes

## Key Files to Create/Modify

### New Files
- `convex/functions/expenseSubmissions.ts` — Queries, mutations, internal functions
- `src/app/[locale]/expense-claims/submissions/[id]/page.tsx` — Submission detail page
- `src/domains/expense-claims/components/submission-detail-page.tsx` — Main submission component
- `src/domains/expense-claims/components/claim-detail-drawer.tsx` — Slide-out claim detail
- `src/domains/expense-claims/components/submission-list.tsx` — Submissions list view
- `src/domains/expense-claims/hooks/use-expense-submissions.tsx` — Data fetching hook
- `src/components/ui/sheet.tsx` — Shadcn Sheet component
- `src/app/api/v1/expense-submissions/` — REST API routes

### Modified Files
- `convex/schema.ts` — Add expense_submissions table, extend expense_claims
- `convex/crons.ts` — Add empty draft cleanup cron
- `convex/functions/expenseClaims.ts` — Extend updateStatus for submission-level transitions
- `src/domains/expense-claims/components/personal-expense-dashboard.tsx` — Show submissions
- `src/domains/expense-claims/components/expense-approval-dashboard.tsx` — Show grouped submissions
- `src/lib/services/email-service.ts` — Add submission notification method

## Build Verification

```bash
# Must pass before marking feature complete
npm run build
```

## Deployment

```bash
# Deploy Convex schema + functions to production
npx convex deploy --yes

# Run migration for existing draft claims
# (via Convex dashboard or CLI invocation of migrateDraftClaims)
```
