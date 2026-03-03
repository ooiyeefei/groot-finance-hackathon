# Tasks: PDPA Data Retention Cleanup

**Input**: Design documents from `/specs/001-pdpa-data-retention-cleanup/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted. Verification via Convex dashboard and `npm run build`.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: No setup needed — existing project structure, no schema changes, no new dependencies.

(No tasks — all infrastructure already exists)

---

## Phase 2: Foundational

**Purpose**: No foundational blocking work needed — existing cron infrastructure, indexes, and deletion patterns are sufficient.

(No tasks — existing Convex crons, indexes, and internalMutation patterns are ready)

**Checkpoint**: Foundation ready — user story implementation can begin immediately.

---

## Phase 3: User Story 1 — Automated Chat Data Cleanup (Priority: P1) MVP

**Goal**: Add daily cron that permanently deletes chat conversations and messages older than 2 years (730 days).

**Independent Test**: Create conversation with backdated `lastMessageAt`, run cleanup function in Convex dashboard, verify conversation and messages are deleted.

### Implementation for User Story 1

- [ ] T001 [US1] Add `deleteExpired` internalMutation to `convex/functions/conversations.ts` — query conversations where `lastMessageAt ?? _creationTime` < 730 days ago, delete all associated messages via `by_conversationId` index, then delete conversation. Batch limit 500. Log structured summary with counts.
- [ ] T002 [US1] Register chat cleanup cron in `convex/crons.ts` — daily at 3:30 AM UTC calling `internal.functions.conversations.deleteExpired`

**Checkpoint**: Chat conversation cleanup is independently functional and testable.

---

## Phase 4: User Story 2 — Automated Export History Cleanup (Priority: P1)

**Goal**: Add daily cron that permanently deletes export history records older than 1 year (365 days), including associated Convex storage files.

**Independent Test**: Check Convex dashboard for export_history records older than 1 year after cron runs. Verify storage files are also removed.

### Implementation for User Story 2

- [ ] T003 [US2] Add `deleteExpired` internalMutation to `convex/functions/exportHistory.ts` — query export_history where `_creationTime` < 365 days ago, delete Convex storage file (if `storageId` exists) before deleting record. Skip record if file deletion fails (FR-009). Batch limit 500. Log structured summary.
- [ ] T004 [US2] Register export history cleanup cron in `convex/crons.ts` — daily at 4:30 AM UTC calling `internal.functions.exports.deleteExpired`

**Checkpoint**: Export history cleanup is independently functional and testable.

---

## Phase 5: User Story 3 — Automated Audit Log Cleanup (Priority: P2)

**Goal**: Add daily cron that permanently deletes audit event records older than 3 years (1,095 days).

**Independent Test**: Check Convex dashboard for audit_events records older than 3 years after cron runs.

### Implementation for User Story 3

- [ ] T005 [US3] Add `deleteExpired` internalMutation to `convex/functions/audit.ts` — query audit_events where `_creationTime` < 1095 days ago. Batch limit 500. Log structured summary.
- [ ] T006 [US3] Register audit log cleanup cron in `convex/crons.ts` — daily at 4:00 AM UTC calling `internal.functions.audit.deleteExpired`

**Checkpoint**: Audit log cleanup is independently functional and testable.

---

## Phase 6: User Story 4 — Data Retention Policy Document (Priority: P2)

**Goal**: Create formal data retention policy document covering all data types across MY and SG jurisdictions.

**Independent Test**: Review document covers all 12 data types from spec's Cross-Jurisdiction Retention Schedule.

### Implementation for User Story 4

- [ ] T007 [US4] Create `docs/compliance/data-retention-policy.md` — formal retention policy covering all data types, legal basis (MY/SG), retention periods, automated cleanup schedule, and guidance for adding new data types.

**Checkpoint**: Policy document is complete and matches actual system behavior.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Build verification, deployment, and final validation.

- [ ] T008 Run `npm run build` and fix any TypeScript errors
- [ ] T009 Run `npx convex deploy --yes` to deploy all Convex changes to production
- [ ] T010 Verify new cron jobs appear in Convex dashboard Crons tab

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1-2**: Skipped (no work needed)
- **Phase 3 (US1)**: Can start immediately — no dependencies
- **Phase 4 (US2)**: Can start immediately — independent of US1
- **Phase 5 (US3)**: Can start immediately — independent of US1/US2
- **Phase 6 (US4)**: Can start immediately — documentation only
- **Phase 7 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Chat cleanup)**: Independent — only touches `conversations.ts` + `crons.ts`
- **US2 (Export cleanup)**: Independent — only touches `exportHistory.ts` + `crons.ts`
- **US3 (Audit cleanup)**: Independent — only touches `audit.ts` + `crons.ts`
- **US4 (Policy doc)**: Independent — documentation only
- **US5 (S3 cleanup)**: Deferred to future iteration per research.md R7

### Parallel Opportunities

- T001 and T003 and T005 can run in parallel (different function files)
- T002, T004, T006 all modify `crons.ts` — must be sequential or batched
- T007 (policy doc) can run in parallel with all implementation tasks

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Implement T001 (conversations.deleteExpired)
2. Implement T002 (register cron)
3. Build + Deploy → Chat cleanup is live

### Full Delivery (Recommended)

1. T001 → T003 → T005 (all deleteExpired functions)
2. T002 + T004 + T006 (all cron registrations in one batch)
3. T007 (policy document)
4. T008 → T009 → T010 (build, deploy, verify)

---

## Notes

- All new functions are `internalMutation` (not exposed to frontend — least privilege)
- Cron entries append to existing `convex/crons.ts` (10 existing crons)
- No schema changes — leverages existing indexes
- `npm run build` must pass before deployment
- `npx convex deploy --yes` is mandatory after all Convex changes
