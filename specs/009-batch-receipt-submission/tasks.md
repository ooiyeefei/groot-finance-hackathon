# Tasks: Batch Expense Submission

**Input**: Design documents from `/specs/009-batch-receipt-submission/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks are omitted. Build verification (`npm run build`) is used as the quality gate.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Schema changes, shared types, and UI primitives needed by all stories

- [ ] T001 Add `expense_submissions` table definition to `convex/schema.ts` per data-model.md (all fields, status validator, 6 indexes)
- [ ] T002 Add `submissionId` optional field and `by_submissionId` index to `expense_claims` table in `convex/schema.ts`
- [ ] T003 Add submission-related TypeScript types (ExpenseSubmission, SubmissionStatus, SubmissionWithClaims) to `src/domains/expense-claims/types/expense-claims.ts`
- [ ] T004 [P] Install and configure Shadcn Sheet component at `src/components/ui/sheet.tsx` (Radix Dialog-based slide-out drawer)
- [ ] T005 Verify Convex schema deploys cleanly with `npx convex dev` — fix any schema validation errors

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Convex backend functions that ALL user stories depend on. No frontend work can begin until these are complete.

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Implement `create` mutation in `convex/functions/expenseSubmissions.ts` — authenticate user, resolve businessId, auto-generate title, insert record with status "draft"
- [ ] T007 Implement `getById` query in `convex/functions/expenseSubmissions.ts` — resolve submission, verify access (RBAC), fetch claims via `by_submissionId` index, compute totals/currency grouping, enrich with user names
- [ ] T008 Implement `list` query in `convex/functions/expenseSubmissions.ts` — role-based filtering (employee own, manager direct reports, admin all), status filter, pagination, computed fields (claimCount, totalsByCurrency)
- [ ] T009 Implement `update` mutation in `convex/functions/expenseSubmissions.ts` — verify ownership, verify draft status, patch title/description
- [ ] T010 Implement `softDelete` mutation in `convex/functions/expenseSubmissions.ts` — verify ownership, verify draft status, soft-delete linked claims, set submission deletedAt
- [ ] T011 Implement `removeClaim` mutation in `convex/functions/expenseSubmissions.ts` — verify submission ownership, verify draft status, soft-delete claim and clear submissionId
- [ ] T012 Extend `create` mutation in `convex/functions/expenseClaims.ts` to accept optional `submissionId` parameter and set it on the new claim record
- [ ] T013 [P] Create REST API route `GET/POST /api/v1/expense-submissions` in `src/app/api/v1/expense-submissions/route.ts` — list submissions (GET) and create new submission (POST) per rest-api.md contracts
- [ ] T014 [P] Create REST API route `GET/PUT/DELETE /api/v1/expense-submissions/[id]` in `src/app/api/v1/expense-submissions/[id]/route.ts` — get detail (GET), update metadata (PUT), soft-delete (DELETE) per rest-api.md contracts
- [ ] T015 [P] Create REST API route `POST /api/v1/expense-submissions/[id]/claims` in `src/app/api/v1/expense-submissions/[id]/claims/route.ts` — add receipt to submission (multipart upload, create claim with submissionId, trigger processing)
- [ ] T016 [P] Create REST API route `DELETE /api/v1/expense-submissions/[id]/claims/[claimId]` in `src/app/api/v1/expense-submissions/[id]/claims/[claimId]/route.ts` — remove claim from submission
- [ ] T017 Create `useExpenseSubmissions` hook in `src/domains/expense-claims/hooks/use-expense-submissions.tsx` — TanStack Query hooks for list, getById, create, update, delete, addClaim, removeClaim mutations with optimistic updates

**Checkpoint**: Backend foundation ready — Convex functions and REST API operational, data hook available for frontend

---

## Phase 3: User Story 1 — Create and Submit a Batch of Expenses (Priority: P1) MVP

**Goal**: Employee can create a submission, upload multiple receipts, review extracted claims, and submit the entire group for manager approval.

**Independent Test**: Create a new submission → upload 3+ receipts → see AI extraction per claim → edit a claim in the drawer → submit for approval. Verify all claims change to "submitted" status.

### Implementation for User Story 1

- [ ] T018 [US1] Create submission detail page server component at `src/app/[locale]/expense-claims/submissions/[id]/page.tsx` — auth check, locale handling, render SubmissionDetailPage client component
- [ ] T019 [US1] Implement `SubmissionDetailPage` component in `src/domains/expense-claims/components/submission-detail-page.tsx` — layout with: header (title, status badge, edit title), receipt upload area, claims list table (vendor, amount, category, status per row), currency-grouped totals summary, and action buttons (Submit for Approval, Delete Draft)
- [ ] T020 [US1] Implement multi-file receipt upload within `SubmissionDetailPage` — reuse `ReceiptUploadStep` pattern (drag-and-drop, camera capture, file validation: 10MB max, JPEG/PNG/WebP/PDF), call `POST /api/v1/expense-submissions/[id]/claims` per file, show per-claim processing status (uploading → classifying → analyzing → draft/failed)
- [ ] T021 [US1] Implement `ClaimDetailDrawer` component in `src/domains/expense-claims/components/claim-detail-drawer.tsx` — Sheet/drawer that wraps existing `EditExpenseModalNew` layout (receipt image preview left, form fields + line items right), opens on claim row click, saves edits and recalculates submission total on close
- [ ] T022 [US1] Implement `submit` mutation in `convex/functions/expenseSubmissions.ts` — validate ≥1 claim and no processing claims, resolve designatedApproverId using existing routing logic from `expenseClaims.updateStatus`, transition submission to "submitted", transition all claims to "submitted" with submittedAt and designatedApproverId
- [ ] T023 [US1] Create REST API route `POST /api/v1/expense-submissions/[id]/submit` in `src/app/api/v1/expense-submissions/[id]/submit/route.ts` — call submit mutation, return submission status and approver info
- [ ] T024 [US1] Wire "Submit for Approval" button in `SubmissionDetailPage` — validate no processing/failed claims (disable button with tooltip if not ready), call submit mutation, show success toast with approver name, redirect to submissions list
- [ ] T025 [US1] Add empty draft warning banner in `SubmissionDetailPage` — transient, closeable Alert component shown when submission has zero claims, informing user the draft will be auto-deleted in 24 hours
- [ ] T026 [US1] Update "New Expense" button in `src/domains/expense-claims/components/personal-expense-dashboard.tsx` — replace `ExpenseSubmissionFlow` modal with: call create submission mutation → redirect to `/expense-claims/submissions/[newId]`
- [ ] T027 [US1] Run `npm run build` and fix any TypeScript/build errors

**Checkpoint**: User Story 1 complete — employees can create submissions, upload multiple receipts, review/edit claims, and submit for approval

---

## Phase 4: User Story 2 — Manager Reviews and Approves a Batch Submission (Priority: P2)

**Goal**: Manager can see grouped submissions in approval queue, review all claims within a submission, and approve or reject the entire submission as a unit.

**Independent Test**: Submit a batch (from US1) → log in as manager → see submission in approval queue → open submission detail → review claims in drawer → approve all (verify accounting entries created) OR reject with reason + per-claim notes (verify submission returns to draft).

### Implementation for User Story 2

- [ ] T028 [US2] Implement `approve` mutation in `convex/functions/expenseSubmissions.ts` — verify designatedApproverId, for each claim: set status "approved", set approvedBy/approvedAt, create accounting entry (reuse logic from `expenseClaims.updateStatus` lines 954-1048), link accountingEntryId; set submission status "approved"
- [ ] T029 [US2] Implement `reject` mutation in `convex/functions/expenseSubmissions.ts` — verify designatedApproverId, reset all claims to "draft", set submission rejectionReason/claimNotes/rejectedAt, transition submission back to "draft"
- [ ] T030 [US2] Implement `getPendingApprovals` query in `convex/functions/expenseSubmissions.ts` — query submissions where designatedApproverId === currentUser and status === "submitted", enrich with submitterName/claimCount/totals
- [ ] T031 [P] [US2] Create REST API route `POST /api/v1/expense-submissions/[id]/approve` in `src/app/api/v1/expense-submissions/[id]/approve/route.ts` per rest-api.md contract
- [ ] T032 [P] [US2] Create REST API route `POST /api/v1/expense-submissions/[id]/reject` in `src/app/api/v1/expense-submissions/[id]/reject/route.ts` per rest-api.md contract
- [ ] T033 [P] [US2] Create REST API route `GET /api/v1/expense-submissions/pending-approvals` in `src/app/api/v1/expense-submissions/pending-approvals/route.ts` per rest-api.md contract
- [ ] T034 [US2] Update `src/domains/expense-claims/components/expense-approval-dashboard.tsx` — replace individual claim cards in Expenses tab with grouped submission cards (showing submitter name, title, claim count, total amount, submission date), clicking a card navigates to `/expense-claims/submissions/[id]`
- [ ] T035 [US2] Add manager approval actions to `SubmissionDetailPage` — show "Approve All" and "Reject" buttons when current user is designatedApproverId and status is "submitted"; "Reject" opens a dialog for reason + optional per-claim notes
- [ ] T036 [US2] Handle rejection display in `SubmissionDetailPage` — when submission has rejectedAt + rejectionReason, show a rejection banner with the reason and per-claim notes (if any), allow employee to edit claims and resubmit
- [ ] T037 [US2] Run `npm run build` and fix any TypeScript/build errors

**Checkpoint**: User Story 2 complete — managers can review, approve, or reject batch submissions; accounting entries created on approval; rejected submissions return to employee for correction

---

## Phase 5: User Story 3 — Track Submission Status and History (Priority: P3)

**Goal**: Employee can see all their submissions with current status and drill into any submission to see individual claim details.

**Independent Test**: Create submissions in various states (draft, submitted, approved, rejected) → verify list view shows correct status badges, claim counts, totals, and sort order → click through to detail views.

### Implementation for User Story 3

- [ ] T038 [US3] Implement `SubmissionList` component in `src/domains/expense-claims/components/submission-list.tsx` — table/card list showing: title, status badge (color-coded), claim count, total amount by currency, submission date; sorted by most recent; filterable by status; paginated
- [ ] T039 [US3] Update `src/domains/expense-claims/components/personal-expense-dashboard.tsx` — replace Overview/History tabs content with SubmissionList component, show submission-level summary cards (Total Submissions, Pending Approval, Approved, Drafts) instead of individual claim cards
- [ ] T040 [US3] Add status-specific views in `SubmissionDetailPage` — visual distinction for each status: draft (editable, blue), submitted (pending, yellow), approved (green, show reimbursement progress), rejected (red, show rejection reason with edit capability)
- [ ] T041 [US3] Run `npm run build` and fix any TypeScript/build errors

**Checkpoint**: User Story 3 complete — employees have full visibility into submission lifecycle with status tracking and drill-down

---

## Phase 6: User Story 4 — Migrate Existing Draft Claims (Priority: P4)

**Goal**: Pre-existing draft claims are wrapped in auto-created submissions so they appear in the new unified flow.

**Independent Test**: Verify existing draft claims appear as individual submissions in the submission list after migration runs.

### Implementation for User Story 4

- [ ] T042 [US4] Implement `migrateDraftClaims` internal mutation in `convex/functions/expenseSubmissions.ts` — query expense_claims where submissionId undefined and status "draft", create one submission per claim with auto-title, link via submissionId
- [ ] T043 [US4] Document migration execution steps in `specs/009-batch-receipt-submission/quickstart.md` — how to trigger via Convex dashboard or CLI, expected output, rollback strategy
- [ ] T044 [US4] Run `npm run build` and fix any TypeScript/build errors

**Checkpoint**: User Story 4 complete — all pre-existing draft claims accessible through the new submission flow

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Automated cleanup, notifications, reimbursement tracking, and final hardening

- [ ] T045 [P] Implement `cleanupEmptyDrafts` internal mutation in `convex/functions/expenseSubmissions.ts` — query draft submissions, count claims per submission, hard-delete if zero claims and older than 24 hours
- [ ] T046 Add empty draft cleanup cron to `convex/crons.ts` — `crons.interval("cleanup empty draft submissions", { hours: 1 }, internal.functions.expenseSubmissions.cleanupEmptyDrafts)`
- [ ] T047 [P] Implement `checkReimbursementComplete` internal mutation in `convex/functions/expenseSubmissions.ts` — check if all claims in an approved submission are reimbursed, auto-transition submission to "reimbursed"
- [ ] T048 Wire `checkReimbursementComplete` trigger — call from `expenseClaims.updateStatus` when a claim transitions to "reimbursed" and has a `submissionId`, pass submissionId to check
- [ ] T049 [P] Add reimbursement progress indicator to `SubmissionDetailPage` — for approved submissions, show "X of Y claims reimbursed" progress bar/text derived from claim statuses
- [ ] T050 [P] Add `sendExpenseSubmissionNotification` method to `src/lib/services/email-service.ts` — send email on submission approval/rejection with submission title, claim count, total amount, and status
- [ ] T051 Wire notification sends in `approve` and `reject` mutations in `convex/functions/expenseSubmissions.ts` — call email service after successful status transitions
- [ ] T052 Final `npm run build` verification — ensure zero TypeScript errors and successful production build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (schema must exist before functions)
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion
- **User Story 2 (Phase 4)**: Depends on Phase 2 (can also start after Phase 2, but US1 needed for E2E testing)
- **User Story 3 (Phase 5)**: Depends on Phase 2 (can start in parallel with US1/US2 if staffed)
- **User Story 4 (Phase 6)**: Depends on Phase 2 (independent of US1-US3)
- **Polish (Phase 7)**: Depends on US1 and US2 being complete (cron/notification/reimbursement are enhancements)

### User Story Dependencies

- **User Story 1 (P1)**: Depends only on Foundational (Phase 2) — no other story dependencies
- **User Story 2 (P2)**: Depends only on Foundational (Phase 2) — independently testable, but needs US1 data for E2E validation
- **User Story 3 (P3)**: Depends only on Foundational (Phase 2) — can start in parallel
- **User Story 4 (P4)**: Depends only on Foundational (Phase 2) — fully independent

### Within Each User Story

- Backend mutations/queries before REST API routes
- REST API routes before frontend components (or in parallel if using the Convex hook directly)
- Core UI before polish/edge-case handling
- Build verification as final task per phase

### Parallel Opportunities

- T004 (Sheet component) can run in parallel with T001-T003 (schema/types)
- T013-T016 (REST API routes) can all run in parallel after T006-T012
- T031-T033 (US2 API routes) can all run in parallel
- T045, T047, T049, T050 (Polish tasks) can all run in parallel
- US2, US3, US4 can theoretically start in parallel after Phase 2, but sequential P1→P2→P3→P4 is recommended for a single developer

---

## Parallel Example: Phase 2 (Foundational)

```bash
# After T006-T012 complete, launch all API routes in parallel:
Task T013: "Create GET/POST /api/v1/expense-submissions route"
Task T014: "Create GET/PUT/DELETE /api/v1/expense-submissions/[id] route"
Task T015: "Create POST /api/v1/expense-submissions/[id]/claims route"
Task T016: "Create DELETE /api/v1/expense-submissions/[id]/claims/[claimId] route"
```

## Parallel Example: Phase 7 (Polish)

```bash
# All polish tasks can run in parallel:
Task T045: "Implement cleanupEmptyDrafts internal mutation"
Task T047: "Implement checkReimbursementComplete internal mutation"
Task T049: "Add reimbursement progress indicator to SubmissionDetailPage"
Task T050: "Add sendExpenseSubmissionNotification to email service"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T017)
3. Complete Phase 3: User Story 1 (T018-T027)
4. **STOP and VALIDATE**: Test full flow — create submission → upload receipts → review → submit
5. Deploy/demo MVP

### Incremental Delivery

1. Setup + Foundational → Backend operational
2. Add User Story 1 → Employees can batch-create and submit → **Deploy MVP**
3. Add User Story 2 → Managers can approve/reject → **Deploy**
4. Add User Story 3 → Status tracking dashboard → **Deploy**
5. Add User Story 4 → Migration of existing claims → **Deploy**
6. Polish → Cleanup cron, notifications, reimbursement tracking → **Deploy**

### Single Developer Path (Recommended)

Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4) → Phase 7 (Polish)

Total: **52 tasks** across 7 phases.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- `npm run build` is the quality gate — run at end of each user story phase
- Convex schema changes (T001-T002) must deploy before any function work begins
- The accounting entry creation logic in T028 (approve) should reuse the existing pattern from `expenseClaims.updateStatus` lines 954-1048 — do not rewrite
