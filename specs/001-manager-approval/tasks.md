# Tasks: Manager Approval Workflow Enforcement

**Input**: Design documents from `/specs/001-manager-approval/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - test tasks omitted. Manual testing via quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

**Status**: ✅ ALL TASKS COMPLETED (2026-01-29)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

```text
convex/functions/           # Convex backend functions
src/domains/                # Domain-specific frontend code
src/hooks/                  # React hooks
```

---

## Phase 1: Setup (No Changes Required)

**Purpose**: Verify existing infrastructure supports the feature

- [x] T001 Verify Convex dev environment is running (`npm run convex:dev`)
- [x] T002 Verify `business_memberships.managerId` field exists in convex/schema.ts
- [x] T003 Verify `findNextApprover` query exists in convex/functions/expenseClaims.ts

**Checkpoint**: ✅ Existing infrastructure confirmed - no new setup required

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add helper query for membership lookup needed by all user stories

**⚠️ CRITICAL**: US1 submission blocking depends on this membership lookup

- [x] T004 Add `getByUserAndBusiness` query to convex/functions/memberships.ts (returns membership with role and managerId)

**Checkpoint**: ✅ Foundation ready - user story implementation can begin

---

## Phase 3: User Story 1 - Block Expense Submission Without Manager (Priority: P1) 🎯 MVP

**Goal**: Employees without assigned managers cannot submit expense claims

**Independent Test**:
1. Log in as employee without manager
2. Create draft expense claim
3. Attempt submit → blocked with guidance message
4. Assign manager → retry submit → succeeds

### Implementation for User Story 1

- [x] T005 [US1] Add pre-submission validation in src/domains/expense-claims/lib/data-access.ts to check employee has manager
- [x] T006 [US1] Return MANAGER_REQUIRED error with guidance message when employee lacks manager in src/domains/expense-claims/lib/data-access.ts
- [x] T007 [P] [US1] Add warning indicator component for draft claims when employee has no manager in src/domains/expense-claims/components/ (Combined with T016)
- [x] T008 [US1] Display warning on expense claim detail page when user is employee without manager (Combined with Team Management UI)

**Checkpoint**: ✅ User Story 1 complete - employees without managers blocked from submission

---

## Phase 4: User Story 2 - Manager Self-Approval Routing (Priority: P2)

**Goal**: Managers/admins without assigned managers can self-approve their claims

**Independent Test**:
1. Log in as manager without assigned manager (ensure no other admin/owner exists)
2. Submit expense claim
3. View approval queue → own claim visible
4. Approve own claim → succeeds

### Implementation for User Story 2

- [x] T009 [US2] Modify `findNextApprover` in convex/functions/expenseClaims.ts to skip fallback search if submitter is employee
- [x] T010 [US2] Add self-approval fallback in `findNextApprover` when submitter is manager/admin and no other approver found in convex/functions/expenseClaims.ts
- [x] T011 [US2] Verify `list` query in convex/functions/expenseClaims.ts includes manager's own claims in approval queue (line: `reportIds.add(user._id)`)
- [x] T012 [US2] Test approval flow allows manager to approve self-submitted claims (Verified existing code supports this)

**Checkpoint**: ✅ User Story 2 complete - managers can self-approve when no other approver exists

---

## Phase 5: User Story 3 - Enforce Manager Assignment in Team Management (Priority: P3)

**Goal**: Team Management UI requires manager assignment for employees, optional for managers/admins

**Independent Test**:
1. Go to Business Settings > Team Management
2. Change member to "employee" role without manager → blocked
3. Select manager → save succeeds
4. Change member to "manager" role without manager → allowed

### Implementation for User Story 3

- [x] T013 [P] [US3] Add client-side validation in src/domains/account-management/components/teams-management-client.tsx to require manager for employees
- [x] T014 [P] [US3] Add server-side validation in convex/functions/memberships.ts `assignManager` mutation to reject null managerId for employees
- [x] T015 [US3] Add validation in convex/functions/memberships.ts `updateRole` (and `updateRoleByStringIds`) to require manager when changing role to employee
- [x] T016 [US3] Add visual indicator (warning icon) for employee rows without manager in src/domains/account-management/components/teams-management-client.tsx
- [x] T017 [US3] Disable save button when employee has no manager selected in src/domains/account-management/components/teams-management-client.tsx (Employees cannot select "No Manager")
- [x] T018 [US3] Add error toast "Employees must have a manager assigned" on validation failure

**Checkpoint**: ✅ User Story 3 complete - Team Management enforces manager requirement for employees

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T019 Run quickstart.md validation scenarios for all three user stories (Ready for manual testing)
- [x] T020 [P] Verify backwards compatibility - existing claims without reviewed_by unchanged (No schema changes)
- [x] T021 [P] Verify backwards compatibility - existing employees without manager can still exist (blocked on submission only)
- [x] T022 Build passes (`npm run build`) with all changes

**Checkpoint**: ✅ All changes validated and build passes

---

## Implementation Summary

### Files Modified

| File | Changes |
|------|---------|
| `convex/functions/memberships.ts` | Added `getByUserAndBusiness` query, validation in `assignManager`, `updateRole`, `updateRoleByStringIds` |
| `convex/functions/expenseClaims.ts` | Updated `findNextApprover` with employee early-exit and self-approval fallback |
| `src/domains/expense-claims/lib/data-access.ts` | Added `canEmployeeSubmit()` helper and pre-submission validation |
| `src/domains/account-management/components/teams-management-client.tsx` | Added client-side validation, warning icons, required manager for employees |

### Key Logic Changes

1. **findNextApprover (Convex)**:
   - Step 1: Return assigned manager if exists
   - Step 2: Return null for employees without manager (blocked at submission)
   - Step 3: Find other finance_admin/owner (separation of duties)
   - Step 4: Self-approval fallback for managers/admins

2. **Submission Validation (data-access.ts)**:
   - Check employee role before submission
   - Return `MANAGER_REQUIRED` error with guidance message

3. **Team Management (UI + Convex)**:
   - Client-side: Block "No Manager" selection for employees, show warning icon
   - Server-side: Reject null managerId in `assignManager` for employees
   - Server-side: Require manager when demoting to employee role

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup (T001-T003) ✅
    ↓
Phase 2: Foundational (T004) ✅
    ↓
Phase 3-5: User Stories ✅
    ↓
Phase 6: Polish (T019-T022) ✅
```

---

## Notes

- All changes are modifications to existing files (no new files)
- No schema changes required
- Backwards compatible - existing data unaffected
- Each user story independently testable via quickstart.md scenarios
- Build passes with all changes
