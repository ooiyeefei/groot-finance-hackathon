# Tasks: Expense Approval Audit Trail

**Input**: Design documents from `/specs/025-expense-approval-audit-trail/`
**Tests**: Not requested — manual regression testing only.

## Phase 1: Schema + Backend (Blocking)

- [ ] T001 Add `approvalNotes` field to `expense_submissions` in `convex/schema.ts` — `v.optional(v.string())`
- [ ] T002 Fix approve mutation in `convex/functions/expenseSubmissions.ts` — persist `args.notes` to `submission.approvalNotes` in the approve handler (currently accepted but discarded)
- [ ] T003 Add duplicate override acceptance to `submitForApproval` mutation in `convex/functions/expenseSubmissions.ts` — accept optional `duplicateOverrides` arg (array of `{ claimId, reason, isSplitExpense }`), patch each flagged claim with `duplicateStatus: 'potential'`, `duplicateOverrideReason`, `duplicateOverrideAt`, `isSplitExpense`
- [ ] T004 Deploy Convex: `npx convex deploy --yes`

**Checkpoint**: Schema deployed, mutations accept and persist approval notes + duplicate overrides.

---

## Phase 2: User Story 1 — Batch Submission Duplicate Check (P1)

- [ ] T005 [US1] Add pre-submit duplicate check to `src/domains/expense-claims/components/submission-detail-page.tsx` — before calling `submitForApproval`, loop through all claims in the submission, call `checkDuplicates` query for each, collect flagged claims
- [ ] T006 [US1] Show `DuplicateWarningModal` for flagged claims in `submission-detail-page.tsx` — if any claims have duplicates, show the modal with the flagged claims, collect justification + split-bill selection per claim, then proceed with submit passing overrides
- [ ] T007 [US1] Pass duplicate overrides to `submitForApproval` mutation call in `submission-detail-page.tsx` — include the collected overrides so the mutation persists them on each flagged claim

**Checkpoint**: "Submit for Approval" button intercepts duplicates, shows warning modal, requires justification before submission proceeds.

---

## Phase 3: User Story 2 — Manager Justification Context (P1)

- [ ] T008 [US2] Add employee justification display to duplicate section in `src/domains/expense-claims/components/unified-expense-details-modal.tsx` — when `duplicateStatus` is `potential` or `confirmed`, show: justification reason (`duplicateOverrideReason`), split-bill flag (`isSplitExpense`), override timestamp (`duplicateOverrideAt`). Display automatically on modal load, not behind a button.
- [ ] T009 [US2] Show matched claim details in duplicate section — display each matched claim's vendor, amount, date, and submitter name (not just raw IDs)

**Checkpoint**: Manager sees employee's justification, split-bill flag, and matched claim details automatically when opening a flagged claim.

---

## Phase 4: User Story 3 — Admin Approval History (P2)

- [ ] T010 [US3] Add "Approval History" section to `unified-expense-details-modal.tsx` — shown for all roles, displays timeline: (1) Submitted by [employee] on [date], (2) Duplicate justification: [reason] (if any), (3) Approved/Rejected by [manager] on [date] with notes: [notes], (4) Reimbursed on [date] (if applicable). Assemble from existing fields: `submittedAt`, `approvedAt`, `approvedBy`, `approvalNotes`, `duplicateOverrideReason`, `duplicateOverrideAt`.
- [ ] T011 [US3] Include `approvalNotes` and approver name in submission detail query — ensure `expenseSubmissions.getById` returns `approvalNotes` and enriched approver info (name, not just ID)

**Checkpoint**: Finance admin sees full approval chain: employee justification → manager notes → timestamps.

---

## Phase 5: Polish

- [ ] T012 Deploy Convex and run `npm run build` to verify
- [ ] T013 Commit and push to main

---

## Dependencies

- Phase 1 (schema) blocks all other phases
- Phase 2 (US1) and Phase 3 (US2) can run in parallel after Phase 1
- Phase 4 (US3) depends on Phase 1 (needs `approvalNotes` field)
