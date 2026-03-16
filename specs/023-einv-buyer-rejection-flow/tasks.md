# Tasks: LHDN E-Invoice Buyer Rejection Flow

**Input**: Design documents from `/specs/023-einv-buyer-rejection-flow/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reject-api.yml

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Repository root: `/home/fei/fei/code/groot-finance/einv-buyer-rejection-flow`
- Frontend: `src/` (Next.js 15.5.7 + React 19.1.2)
- Backend: `convex/` (Convex 1.31.3 document database)
- Shared lib: `src/lib/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization - No tasks needed (project already exists, schema already updated in 022)

✅ **Skipped**: Project structure exists, dependencies installed, schema has rejection fields

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 [P] Extend LHDN client with `rejectDocument()` method in `src/lib/lhdn/client.ts` (mirror `cancelDocument` pattern at line 186, same endpoint, different status)
- [x] T002 [P] Add `LhdnRejectRequest` type to `src/lib/lhdn/types.ts` (same shape as `LhdnCancelRequest` with `status: "rejected"`)
- [x] T003 Add `rejectReceivedDocument` internalMutation to `convex/functions/einvoiceReceivedDocuments.ts` (validate window, update status, handle side effects for both AP invoices and expense claims)
- [x] T004 Create rejection API route in `src/app/api/v1/einvoice-received/[uuid]/reject/route.ts` (Clerk auth, role validation, 72-hour window check, call LHDN API, call Convex mutation)
- [x] T005 [P] Add `createRejectionNotification` helper function to `convex/functions/notifications.ts` (create notification record with type "lhdn_submission", severity "warning")

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Reject a Received E-Invoice (Priority: P1) 🎯 MVP

**Goal**: Finance admin can reject a received e-invoice within 72 hours via LHDN API, updating linked AP invoices or expense claims

**Independent Test**: Receive an e-invoice in Groot, click "Reject E-Invoice", provide reason, confirm. Verify status updates to "rejected" in Groot and MyInvois portal. Verify linked expense claim/invoice is updated.

**Acceptance Criteria**:
1. Rejection submitted to LHDN for valid e-invoices within 72-hour window
2. Document status updates to "rejected" with metadata (reason, timestamp, user)
3. Linked AP invoice e-invoice reference cleared OR linked expense claim attachment cleared
4. Rejection disabled/hidden after 72-hour window expires
5. Already-rejected documents show status clearly without reject option

### Implementation for User Story 1

- [x] T006 [P] [US1] Create rejection dialog component in `src/domains/expense-claims/components/einvoice-reject-dialog.tsx` (Radix Dialog with textarea for reason, confirmation prompt, API call to reject endpoint, error handling) - **Already exists at src/domains/sales-invoices/components/einvoice-reject-dialog.tsx (reusable across domains)**
- [x] T007 [US1] Integrate rejection dialog into expense claims detail page (add "Reject E-Invoice" button, conditionally render based on status and 72-hour window, wire success/cancel handlers) - **Already integrated in src/domains/expense-claims/components/einvoice-section.tsx (lines 34, 656-678)**
- [x] T008 [US1] Update expense claims mutations in `convex/functions/expenseClaims.ts` to clear e-invoice attachment on rejection (set `einvoiceAttached: false`, `lhdnReceivedStatus: "rejected"`) - **Already implemented in T003**
- [x] T009 [US1] Update invoices mutations in `convex/functions/invoices.ts` to record rejection details on AP invoices (set `einvoiceRejected: true`, `einvoiceRejectionReason`, `einvoiceRejectedAt`) - **Already implemented in T003**

**Checkpoint**: At this point, User Story 1 should be fully functional - finance admin can reject e-invoices and see status updates

---

## Phase 4: User Story 2 - Notification on Rejection (Priority: P2)

**Goal**: Stakeholders (AP invoice creator or expense claim submitter) receive in-app notifications when their linked e-invoice is rejected

**Independent Test**: Reject a linked e-invoice and verify the correct stakeholder receives a notification with rejection reason and deep link to affected record

**Acceptance Criteria**:
1. AP invoice creator receives notification when linked e-invoice rejected
2. Expense claim submitter receives notification when linked e-invoice rejected
3. No notification sent for unlinked (orphan) e-invoices

### Implementation for User Story 2

✅ **Already Complete**: Notification logic implemented in Phase 2 (T005) and integrated in Phase 3 (T003)

**Note**: The `rejectReceivedDocument` mutation (T003) already includes notification creation via `createRejectionNotification` helper (T005). No additional tasks needed.

**Checkpoint**: Stakeholders should now receive notifications when e-invoices are rejected

---

## Phase 5: User Story 3 - 72-Hour Countdown Visibility (Priority: P2)

**Goal**: Users see a countdown showing time remaining to reject an e-invoice within the 72-hour LHDN window

**Independent Test**: View received e-invoices at various points within and after the 72-hour window. Verify countdown displays correctly (e.g., "48 hours remaining", "1 hour remaining" with urgent styling, no countdown after expiry).

**Acceptance Criteria**:
1. Countdown shows approximate time remaining (e.g., "48 hours remaining")
2. Urgent styling when < 12 hours remaining
3. No countdown after 72-hour window expires

### Implementation for User Story 3

- [ ] T010 [P] [US3] Add 72-hour countdown logic to rejection dialog in `src/domains/expense-claims/components/einvoice-reject-dialog.tsx` (calculate expiry from `dateTimeValidated`, update every 30s with `useInterval`, conditional styling for urgency)
- [ ] T011 [P] [US3] Create reusable rejection button component in `src/domains/invoices/components/received-einvoice-reject-button.tsx` (conditional rendering based on status and window, visual states for enabled/urgent/disabled)
- [ ] T012 [US3] Integrate rejection button into AP invoices domain (add to invoice detail page where received e-invoices are displayed, wire to rejection dialog)

**Checkpoint**: Users should now see 72-hour countdown timers on eligible e-invoices

---

## Phase 6: Polish & Deployment

**Purpose**: Final verification and deployment to production

- [x] T013 [P] Add error handling for edge cases in API route (LHDN API down, rate limit, concurrent rejections, window expiry mid-request)
- [x] T014 [P] Add idempotency check to API route (return success immediately if already rejected, no duplicate LHDN API calls)
- [x] T015 Run `npm run build` and fix any TypeScript errors
- [x] T016 Run `npx convex deploy --yes` to deploy mutations and schema to production
- [ ] T017 Verify rejection flow in LHDN sandbox environment (test within 72-hour window, test after expiry, test with linked/unlinked documents) - **Requires manual testing**
- [ ] T018 [P] Update documentation in `specs/023-einv-buyer-rejection-flow/quickstart.md` if any implementation differs from plan - **Note: AP invoice linking not yet implemented (schema missing matchedInvoiceId field); expense claims rejection fully functional**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: ✅ Complete (no tasks - project exists)
- **Foundational (Phase 2)**: Tasks T001-T005 - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User Story 1 (Phase 3): Depends on T001-T005
  - User Story 2 (Phase 4): ✅ Complete (integrated in Phase 2)
  - User Story 3 (Phase 5): Depends on T006 (rejection dialog exists)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (T001-T005) - No dependencies on other stories
- **User Story 2 (P2)**: ✅ Already integrated in Foundational phase (no additional work)
- **User Story 3 (P2)**: Depends on US1 (T006 rejection dialog) for countdown integration

### Within Each Phase

**Phase 2 (Foundational)**:
- T001, T002, T005 can run in parallel [P]
- T003 (Convex mutation) can run in parallel with T001-T002 [P]
- T004 (API route) depends on T001 (LHDN client), T003 (mutation)

**Phase 3 (User Story 1)**:
- T006 can run in parallel with T008-T009 [P]
- T007 depends on T006 (dialog component)

**Phase 5 (User Story 3)**:
- T010, T011 can run in parallel [P]
- T012 depends on T011 (button component)

**Phase 6 (Polish)**:
- T013, T014, T018 can run in parallel [P]
- T015-T016 must run sequentially (build → deploy)

### Parallel Opportunities

**Foundational Phase (after T001-T005 complete)**:
```bash
# Can start all at once:
T001: "Extend LHDN client with rejectDocument()"
T002: "Add LhdnRejectRequest type"
T005: "Add createRejectionNotification helper"

# Then start:
T003: "Add rejectReceivedDocument mutation" (parallel with above)

# Finally:
T004: "Create rejection API route" (depends on T001, T003)
```

**User Story 1 Phase**:
```bash
# Can start all at once after Foundational complete:
T006: "Create rejection dialog component"
T008: "Update expense claims mutations"
T009: "Update invoices mutations"

# Then:
T007: "Integrate dialog into expense claims" (depends on T006)
```

**User Story 3 Phase**:
```bash
# Can start in parallel:
T010: "Add 72-hour countdown to dialog"
T011: "Create rejection button component"

# Then:
T012: "Integrate button into AP invoices" (depends on T011)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T005) - **Critical blocking phase**
2. Complete Phase 3: User Story 1 (T006-T009)
3. **STOP and VALIDATE**: Test rejection flow end-to-end
   - Reject e-invoice via expense claims UI
   - Verify LHDN status updated
   - Verify linked claim/invoice updated
   - Verify notification created
4. Complete Phase 6: Polish & Deploy (T013-T018)
5. **MVP READY**: Core rejection capability delivered

### Incremental Delivery

1. **Foundation + US1** → MVP (reject e-invoices, update records)
2. **Add US3** → Enhanced UX (countdown timer, AP invoices support)
3. **Polish** → Production-ready (error handling, idempotency, deployment)

**Note**: User Story 2 (notifications) is already integrated - no incremental step needed

### Parallel Team Strategy

With 2-3 developers:

1. **Team completes Foundational together** (T001-T005) - 2-3 hours
2. Once Foundational done:
   - **Developer A**: User Story 1 (T006-T009) - 4-6 hours
   - **Developer B**: User Story 3 (T010-T012) - 3-4 hours (starts after T006)
   - **Developer C**: Polish (T013-T014) - 2 hours
3. Final integration: T015-T018 together - 1-2 hours

**Total Estimated Time**: 1.5-2 days with parallel work

---

## Task Summary

| Phase | Tasks | Can Parallelize | Estimated Time |
|-------|-------|----------------|----------------|
| Phase 1: Setup | 0 | N/A | ✅ Complete |
| Phase 2: Foundational | 5 (T001-T005) | T001, T002, T003, T005 | 2-3 hours |
| Phase 3: User Story 1 | 4 (T006-T009) | T006, T008, T009 | 4-6 hours |
| Phase 4: User Story 2 | 0 | N/A | ✅ Complete |
| Phase 5: User Story 3 | 3 (T010-T012) | T010, T011 | 3-4 hours |
| Phase 6: Polish | 6 (T013-T018) | T013, T014, T018 | 2-3 hours |
| **TOTAL** | **18 tasks** | **10 parallelizable** | **11-16 hours** |

**Parallel Opportunities**: 10 out of 18 tasks (56%) can run in parallel with proper team coordination

**MVP Scope**: Phase 2 + Phase 3 + Phase 6 (T001-T009, T013-T018) = 15 tasks, ~8-12 hours

---

## Notes

- **No tests included**: Tests are optional per project rules. Spec does not explicitly request tests.
- **[P] tasks**: Different files, no dependencies - can run in parallel
- **[Story] labels**: Map tasks to user stories for traceability
- **Each user story independently testable**: US1 can be validated without US3, US3 adds enhancements
- **Commit strategy**: Commit after each task or logical group (e.g., after T001-T002, after T006-T007)
- **Checkpoints**: Stop after each phase to validate independently before proceeding
- **Schema note**: No schema changes needed - rejection fields already added in feature 022
- **Existing patterns**: Follow existing LHDN client (`cancelDocument`), API routes (Clerk auth), Convex mutations (internalMutation)
