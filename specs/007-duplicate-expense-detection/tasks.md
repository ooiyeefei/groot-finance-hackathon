# Tasks: Duplicate Expense Claim Detection

**Input**: Design documents from `/specs/007-duplicate-expense-detection/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md
**Branch**: `007-duplicate-expense-detection` (isolated from `001-ai-agent-optimization`)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3 (maps to spec.md user stories)
- All paths relative to repository root

---

## Phase 1: Setup (Schema & Types)

**Purpose**: Database schema changes and TypeScript types - foundation for all features

- [x] T001 Add duplicate detection fields to expenseClaims table in `convex/schema.ts`
- [x] T002 Add duplicateMatches table definition in `convex/schema.ts`
- [x] T003 Add indexes for optimized duplicate queries in `convex/schema.ts`
- [x] T004 [P] Create duplicate detection types in `src/domains/expense-claims/types/duplicate-detection.ts`
- [x] T005 [P] Add duplicate-related fields to ExpenseClaim interface in `src/domains/expense-claims/types/expense-claims.ts`
- [x] T006 Run `npx convex dev` to sync schema and verify no errors
- [x] T007 Run `npm run build` to verify TypeScript compilation

**Checkpoint**: Schema deployed, types available - core logic can begin ✅

---

## Phase 2: Foundational (Core Detection Logic)

**Purpose**: Reusable detection algorithm that ALL user stories depend on

**⚠️ CRITICAL**: User stories 1-3 all require this detection logic to function

- [x] T008 Create vendor name normalizer in `src/domains/expense-claims/lib/vendor-normalizer.ts`
- [x] T009 Create multi-tier duplicate detection algorithm in `src/domains/expense-claims/lib/duplicate-detection.ts`
- [x] T010 Add `checkDuplicates` query to `convex/functions/expenseClaims.ts`
- [x] T011 [P] Add `createDuplicateMatch` mutation to `convex/functions/duplicateMatches.ts`
- [x] T012 [P] Add `dismissDuplicate` mutation to `convex/functions/duplicateMatches.ts`
- [x] T013 Enhance existing duplicate check in `src/domains/expense-claims/lib/data-access.ts` to use new multi-tier logic
- [x] T014 Run `npm run build` to verify no compilation errors

**Checkpoint**: Detection algorithm ready - UI and API work can begin ✅

---

## Phase 3: User Story 1 - Prevent Accidental Re-submission (Priority: P1) 🎯 MVP

**Goal**: Employee sees duplicate warning before submitting, can override with justification

**Independent Test**: Upload same receipt twice → second upload shows warning with link to original

### Implementation for User Story 1

- [x] T015 [US1] Create `use-duplicate-detection.ts` hook in `src/domains/expense-claims/hooks/`
- [x] T016 [US1] Create `duplicate-warning-modal.tsx` component in `src/domains/expense-claims/components/`
- [x] T017 [US1] Create `check-duplicates` API route in `src/app/api/v1/expense-claims/check-duplicates/route.ts`
- [x] T018 [US1] Modify `use-expense-form.ts` to call duplicate check before submit in `src/domains/expense-claims/hooks/`
- [x] T019 [US1] Integrate duplicate warning modal into `create-expense-page-new.tsx` in `src/domains/expense-claims/components/`
- [x] T020 [US1] Add split expense checkbox for cross-user duplicates in `duplicate-warning-modal.tsx`
- [x] T021 [US1] Update `POST /api/v1/expense-claims` to accept `duplicateOverride` field in `src/app/api/v1/expense-claims/route.ts`
- [x] T022 [US1] Add audit logging for duplicate detection events in `src/domains/expense-claims/lib/data-access.ts`
- [x] T023 [US1] Run `npm run build` and test duplicate warning flow manually

**Checkpoint**: User Story 1 complete - employees see and can override duplicate warnings ✅

---

## Phase 4: User Story 2 - Visual Duplicate Indicators (Priority: P2)

**Goal**: Managers see duplicate badges in expense list, can dismiss false positives

**Independent Test**: Create 2 claims with same vendor+date+amount → both show "Potential Duplicate" badge

### Implementation for User Story 2

- [x] T024 [US2] Add `getDuplicateMatches` query for a claim in `convex/functions/duplicateMatches.ts`
- [x] T025 [P] [US2] Create `duplicate-badge.tsx` component in `src/domains/expense-claims/components/`
- [x] T026 [P] [US2] Create `duplicate-comparison-panel.tsx` component in `src/domains/expense-claims/components/`
- [x] T027 [US2] Create `dismiss-duplicate` API route in `src/app/api/v1/expense-claims/[id]/dismiss-duplicate/route.ts`
- [x] T028 [US2] Create `confirm-duplicate` API route in `src/app/api/v1/expense-claims/[id]/confirm-duplicate/route.ts`
- [x] T029 [US2] Add duplicate badge to expense list items in `src/domains/expense-claims/components/expense-list-item.tsx` (or equivalent)
- [x] T030 [US2] Integrate comparison panel into expense detail view
- [x] T031 [US2] Run `npm run build` and test badge display manually

**Checkpoint**: User Story 2 complete - managers see duplicate indicators and can resolve them ✅

---

## Phase 5: User Story 3 - Batch Duplicate Report (Priority: P3)

**Goal**: Finance admins generate report of all potential duplicates for audit

**Independent Test**: With 5 known duplicate pairs, report shows all 5 with confidence scores

### Implementation for User Story 3

- [x] T032 [US3] Add `getDuplicateReport` query in `convex/functions/duplicateMatches.ts`
- [x] T033 [US3] Create `duplicate-report` API route in `src/app/api/v1/expense-claims/duplicate-report/route.ts`
- [x] T034 [P] [US3] Create `duplicate-report-page.tsx` in `src/domains/expense-claims/components/` or `src/app/[locale]/expense-claims/duplicate-report/page.tsx`
- [x] T035 [P] [US3] Create `duplicate-report-table.tsx` component with filtering/sorting
- [x] T036 [US3] Add bulk "Mark as Reviewed" action to report table
- [x] T037 [US3] Add date range and status filters to report
- [x] T038 [US3] Run `npm run build` and test report generation manually

**Checkpoint**: User Story 3 complete - admins can audit historical duplicates ✅

---

## Phase 6: Correct & Resubmit Flow (FR-011)

**Goal**: Users can resubmit rejected claims with corrections

**Independent Test**: Reject a claim → "Correct & Resubmit" creates new draft with original data

- [x] T039 Add `resubmitRejectedClaim` mutation in `convex/functions/expenseClaims.ts`
- [x] T040 Create `resubmit` API route in `src/app/api/v1/expense-claims/[id]/resubmit/route.ts`
- [x] T041 [P] Create `correct-resubmit-button.tsx` component in `src/domains/expense-claims/components/`
- [x] T042 Add resubmit button to rejected claim detail view
- [x] T043 Implement receipt replacement option in resubmit flow (via draft editing)
- [x] T044 Run `npm run build` and test resubmit flow manually

**Checkpoint**: Rejected claims can be corrected and resubmitted with audit trail

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final quality improvements

- [x] T045 [P] Add loading states to duplicate warning modal (via useDuplicateDetection hook)
- [x] T046 [P] Add error handling for failed duplicate checks (fail-open pattern in hook)
- [x] T047 Verify all new API routes have proper authentication (getAuthenticatedConvex)
- [x] T048 Run `npx convex deploy --yes` to deploy schema to production
- [x] T049 Run full build verification: `npm run build`
- [ ] T050 Test complete flow per quickstart.md scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ─────────────────────────────────────────┐
                                                         │
Phase 2: Foundational ◄─────────────────────────────────┘
    │
    ├──► Phase 3: User Story 1 (P1) - MVP
    │         │
    ├──► Phase 4: User Story 2 (P2) - Can start after Phase 2
    │         │
    ├──► Phase 5: User Story 3 (P3) - Can start after Phase 2
    │         │
    └──► Phase 6: Correct & Resubmit - Can start after Phase 2
              │
              ▼
        Phase 7: Polish (after all desired phases complete)
```

### User Story Independence

| Story | Depends On | Can Start After |
|-------|------------|-----------------|
| US1 (P1) | Phase 1, 2 | T014 complete |
| US2 (P2) | Phase 1, 2 | T014 complete |
| US3 (P3) | Phase 1, 2 | T014 complete |
| Resubmit | Phase 1, 2 | T014 complete |

**Note**: US1-US3 can run in parallel after foundational phase, but MVP approach is sequential by priority.

---

## Parallel Execution Examples

### Phase 1 Parallel Tasks
```bash
# Launch together:
T004: Create duplicate detection types
T005: Add duplicate-related fields to ExpenseClaim interface
```

### Phase 2 Parallel Tasks
```bash
# Launch together:
T011: Add createDuplicateMatch mutation
T012: Add dismissDuplicate mutation
```

### User Story 1 - No parallelization (sequential flow)

### User Story 2 Parallel Tasks
```bash
# Launch together:
T025: Create duplicate-badge.tsx
T026: Create duplicate-comparison-panel.tsx
```

### User Story 3 Parallel Tasks
```bash
# Launch together:
T034: Create duplicate-report-page.tsx
T035: Create duplicate-report-table.tsx
```

---

## Implementation Strategy

### MVP First (Recommended)

1. ✅ Complete Phase 1: Setup (schema + types)
2. ✅ Complete Phase 2: Foundational (detection algorithm)
3. ✅ Complete Phase 3: User Story 1 (pre-submission warning)
4. **STOP**: Test US1 independently with quickstart.md scenarios
5. Deploy to staging, gather feedback

### Full Feature Delivery

1. Complete MVP (Phases 1-3)
2. Add User Story 2 (duplicate badges for managers)
3. Add User Story 3 (batch audit report)
4. Add Correct & Resubmit flow
5. Polish phase
6. Production deployment

---

## Branch Isolation Note

All development for this feature is on branch `007-duplicate-expense-detection`.

**Do NOT merge from or into `001-ai-agent-optimization`** - that branch has separate unrelated changes.

If you need to work on both features simultaneously, use git worktrees:
```bash
git worktree add ../finanseal-mvp-007 007-duplicate-expense-detection
git worktree add ../finanseal-mvp-001 001-ai-agent-optimization
```

---

## Task Summary

| Phase | Tasks | Parallel Opportunities |
|-------|-------|------------------------|
| Setup | 7 | 2 |
| Foundational | 7 | 2 |
| US1 (MVP) | 9 | 0 |
| US2 | 8 | 2 |
| US3 | 7 | 2 |
| Resubmit | 6 | 1 |
| Polish | 6 | 2 |
| **Total** | **50** | **11** |

**MVP Scope**: Tasks T001-T023 (23 tasks) delivers User Story 1 with full duplicate detection.
