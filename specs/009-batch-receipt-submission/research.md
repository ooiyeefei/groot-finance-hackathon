# Research: Batch Expense Submission

**Feature Branch**: `009-batch-receipt-submission`
**Date**: 2026-02-09

## R1: Naming Convention — "Expense Submission" vs "Expense Report"

**Decision**: Use **"Expense Submission"** as the grouping container term.

**Rationale**:
- The codebase already uses "report" extensively for analytics: `monthly-report-generator.tsx`, `/api/v1/expense-claims/reports`, `formatted-expense-report.tsx`, `duplicate-report-page.tsx`
- Industry trend: Modern SaaS tools (Ramp, Brex, BILL) are moving away from "expense report" terminology
- "Submission" is action-oriented and universally understood in SEA markets (target audience)
- The existing component `expense-submission-flow.tsx` already uses "submission" in its name

**Alternatives considered**:
- "Expense Report" — Rejected: naming collision with existing analytics reports
- "Expense Batch" — Rejected: too technical, not user-friendly
- "Expense Package" — Rejected: not standard in the industry

## R2: Submission as Universal Container (Replacing Single-Claim Flow)

**Decision**: Replace the current single-claim `ExpenseSubmissionFlow` modal entirely. All new expenses go through a submission, even single claims.

**Rationale**:
- Simplifies the mental model: one way to create expenses
- Eliminates the need to maintain two parallel flows (individual + batch)
- The submission detail page at `/expense-claims/submissions/[id]` handles both single and multi-claim scenarios
- Existing draft claims (pre-migration) get auto-wrapped in individual submissions

**Alternatives considered**:
- New "Submissions" tab alongside existing flow — Rejected: creates two UX paths, confusing
- Separate page at `/expense-claims/submissions` — Rejected: fragments navigation

## R3: Approval Model — All-or-Nothing

**Decision**: Submissions are approved or rejected as a unit. No partial approval.

**Rationale**:
- Matches industry standard (SAP Concur, Expensify Classic)
- Simpler state management — no "partially approved" state on the submission entity
- Managers can add per-claim notes when rejecting to guide corrections
- Reduces approval dashboard complexity

**Alternatives considered**:
- Partial approval (approve some, reject others) — Rejected: introduces complex "partially approved" state, splits submission into fragments
- All-or-nothing without per-claim notes — Rejected: managers need to explain which specific claims have issues

## R4: Submission Lifecycle & Reimbursement Tracking

**Decision**: Submission owns lifecycle through approval (`draft → submitted → approved/rejected`). Reimbursement tracked per-claim with a derived progress indicator on the submission.

**Rationale**:
- Finance processes reimbursements per-claim (different currencies, payment methods, timelines)
- Submission derives reimbursement progress from its claims (e.g., "3 of 5 reimbursed")
- Submission automatically transitions to terminal "reimbursed" when all claims are individually reimbursed
- No workflow change for finance team

**Alternatives considered**:
- Full submission-level reimbursement tracking — Rejected: blocks whole submission if one claim has payment issues
- No reimbursement tracking on submission — Rejected: employees lose visibility into overall payment status

## R5: Submission Detail UX — Page + Drawer

**Decision**: Full dedicated page at `/expense-claims/submissions/[id]` with a slide-out drawer for individual claim details.

**Rationale**:
- 10+ claims with processing states, totals, upload area — too much for a modal
- Dedicated page allows direct linking (from notification emails, manager dashboard)
- Claim detail drawer reuses existing `EditExpenseModalNew` component pattern (receipt preview + form fields + line items)
- Drawer keeps submission context visible while viewing a single claim

**Alternatives considered**:
- Large modal/dialog — Rejected: insufficient space for claim list + upload area + totals
- Sidebar panel — Rejected: insufficient width for receipt image preview + form fields

## R6: Stale Draft Cleanup

**Decision**: Auto-delete empty draft submissions (zero claims) after 24 hours. Display a transient, closeable warning banner.

**Rationale**:
- Since every "New Expense" action creates a submission, accidental clicks create empty drafts
- 24 hours gives ample time for intentional drafts while preventing list clutter
- Drafts with at least one claim are never auto-deleted (user invested effort)
- Convex crons pattern already exists (`convex/crons.ts`) — can add a daily cleanup job

**Alternatives considered**:
- No cleanup — Rejected: will clutter submission list with abandoned empty drafts
- Shorter expiry (1 hour) — Rejected: too aggressive, user may step away during lunch

## R7: Convex Schema Extension Strategy

**Decision**: Add new `expense_submissions` table and extend `expense_claims` with a `submissionId` field.

**Rationale**:
- New table follows existing pattern (separate entities with referencing IDs)
- `submissionId` on expense_claims is required for new claims, nullable for migration compatibility
- Convex schema supports `v.optional()` for backward compatibility during migration
- Index `by_submissionId` enables efficient query of all claims in a submission

**Key findings from codebase research**:
- Schema location: `convex/schema.ts`
- Mutation pattern: `create`, `update`, `updateStatus` mutations with `resolveById` for ID resolution
- Auth pattern: `getAuthenticatedUser(ctx)` → verify business membership → RBAC check
- File storage: S3 with presigned URLs, CloudFront signed URLs for retrieval
- Processing: Trigger.dev jobs called via system mutations in `convex/functions/system.ts`

## R8: Existing Cron Job Pattern for Auto-Delete

**Decision**: Use Convex `crons.interval()` to run cleanup every hour, querying empty drafts older than 24 hours.

**Key findings**:
- Existing crons in `convex/crons.ts`: `crons.interval("proactive analysis", { hours: 4 }, ...)`, `crons.daily("deadline tracking", { hourUTC: 6 }, ...)`
- Pattern: Cron calls an `internalMutation` or `internalAction` defined in a functions file
- The cleanup mutation queries `expense_submissions` where `status === "draft"` and claim count is 0 and `_creationTime < Date.now() - 24h`

## R9: UI Component Gap — Drawer/Sheet

**Decision**: Create or install a Sheet/Drawer component for the claim detail slide-out.

**Key findings**:
- No existing `drawer.tsx` or `sheet.tsx` in `src/components/ui/`
- Existing modal pattern uses `createPortal()` with overlay backdrop
- `EditExpenseModalNew` uses a full-page portal with receipt preview + form layout
- Shadcn's Sheet component (based on Radix Dialog) would be the standard choice, consistent with existing UI library usage

## R10: Notification System for Submission Approval/Rejection

**Decision**: Extend existing email service to support submission-level notifications.

**Key findings**:
- Email service: `src/lib/services/email-service.ts` using AWS SES (primary) + Resend (fallback)
- Existing methods: `sendInvitation()`, `sendLeaveNotification()`, `sendFeedbackNotification()`
- No existing expense-specific notification — this needs to be built
- User email preferences stored on `users.emailPreferences` in Convex
- Pattern: Create `sendExpenseSubmissionNotification()` method with submission details (title, claim count, total, status)

## R11: Approver Routing for Submissions

**Decision**: Route entire submission to employee's designated manager using existing routing logic. Store `designatedApproverId` on the submission entity.

**Key findings**:
- Current routing in `updateStatus` mutation (lines 896-935 of `expenseClaims.ts`):
  1. Check assigned manager from `business_memberships.managerId`
  2. If employee without manager → find any finance_admin/owner
  3. If manager/admin → self-approval allowed
- The same logic applies at submission level — resolve approver once, store on submission
- Individual claims within the submission inherit the submission's approver (no per-claim routing needed)

## R12: Migration Strategy for Pre-Existing Claims

**Decision**: Run a one-time migration that wraps each existing unlinked draft claim in an auto-created submission.

**Key findings**:
- Convex supports migration scripts via `internalMutation`
- Can query all `expense_claims` where `submissionId` is undefined and `status === "draft"`
- Create one `expense_submission` per claim with auto-generated title
- Claims with non-draft statuses (submitted, approved, reimbursed) keep `submissionId` as undefined — they're already in terminal/processing states and don't need the batch UX
