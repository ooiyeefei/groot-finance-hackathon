# Tasks: Timesheet & Attendance for Payroll

**Input**: Design documents from `/specs/018-timesheet-attendance/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/convex-functions.md, quickstart.md, research.md

**Tests**: Not requested in feature specification. Test tasks omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema, validators, constants, domain directory structure, and type definitions

- [X] T001 Add attendance record, timesheet, overtime, and pay period status constants to `src/lib/constants/statuses.ts`
- [X] T002 [P] Add validators (attendanceRecordStatus, attendanceStatus, attendanceSource, timesheetStatus, timesheetConfirmedBy, payPeriodFrequency, payrollAdjustmentType, overtimeCalculationBasis) to `convex/lib/validators.ts`
- [X] T003 Add 6 new tables (attendance_records, work_schedules, overtime_rules, timesheets, payroll_adjustments, pay_period_configs) with indexes to `convex/schema.ts`
- [X] T004 Extend business_memberships table with `isAttendanceTracked` and `workScheduleId` fields in `convex/schema.ts`
- [X] T005 Deploy schema changes to Convex: `npx convex deploy --yes`
- [X] T006 [P] Create domain directory structure at `src/domains/timesheet-attendance/` (components/, hooks/, lib/, types/)
- [X] T007 [P] Create TypeScript interfaces and type constants in `src/domains/timesheet-attendance/types/index.ts` (DailyEntry, OvertimeByTier, RateTier, location object, anomaly flag types, default configs)

**Checkpoint**: Schema deployed, types defined — backend function development can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend CRUD functions and library logic that ALL user stories depend on

**Warning**: No user story work can begin until this phase is complete

- [X] T008 [P] Create `convex/functions/workSchedules.ts` with list, getById queries and create, update, remove mutations per contracts
- [X] T009 [P] Create `convex/functions/overtimeRules.ts` with list query and create, update mutations per contracts
- [X] T010 [P] Create `convex/functions/payPeriodConfigs.ts` with getActive query and createOrUpdate mutation per contracts
- [X] T011 [P] Create `convex/functions/payrollAdjustments.ts` with listForPeriod query and create mutation per contracts
- [X] T012 [P] Create `src/domains/timesheet-attendance/lib/overtime-calculator.ts` — classify hours as regular vs OT by tier using daily/weekly thresholds and rate tiers from overtime_rules
- [X] T013 [P] Create `src/domains/timesheet-attendance/lib/attendance-classifier.ts` — determine attendance status (present, late, early_departure, absent) using work schedule, grace period, and calculate lateness/early departure minutes and hours deducted
- [X] T014 [P] Create `src/domains/timesheet-attendance/lib/timesheet-generator.ts` — aggregate attendance_records + leave_requests + public_holidays for a pay period into daily entries with OT classification and anomaly detection
- [X] T015 [P] Create `src/domains/timesheet-attendance/lib/timesheet-workflow.ts` — status state machine (draft → confirmed → approved → finalized → locked) with transition validation and routing logic (auto-approve if no anomalies, route to manager if anomalies)
- [X] T016 Deploy foundational functions to Convex: `npx convex deploy --yes`

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Employee Records Daily Work Hours (Priority: P1) MVP

**Goal**: Employees can check in/out daily, view attendance records, and make manual corrections. Incomplete sessions are auto-closed by cron.

**Independent Test**: Have an employee check in, check out, view today's record with calculated hours, verify incomplete session gets auto-closed overnight.

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement checkIn mutation in `convex/functions/attendanceRecords.ts` — validates no existing incomplete record for today, not on approved leave, is a workday; creates record with status "incomplete", optional location, logs audit event
- [X] T018 [P] [US1] Implement checkOut mutation in `convex/functions/attendanceRecords.ts` — validates active incomplete session; updates checkOutTime, totalMinutes, attendanceStatus, lateness/early departure calculations using attendance-classifier; logs audit event
- [X] T019 [US1] Implement getMyToday query and getMyRecords query in `convex/functions/attendanceRecords.ts` — filtered by authenticated user + businessId + date range
- [X] T020 [US1] Implement manualEntry mutation in `convex/functions/attendanceRecords.ts` — creates/updates record with source "manual", auto-flags as anomaly, requires reason; validates date within current/recent pay period
- [X] T021 [US1] Implement autoCloseIncompleteSessions internalMutation in `convex/functions/attendanceRecords.ts` — finds all incomplete records past end-of-day per work schedule, sets checkOutTime to schedule endTime, status to "auto_closed"
- [X] T022 [US1] Add autoCloseIncompleteSessions cron job (daily at midnight UTC) to `convex/crons.ts`
- [X] T023 [US1] Deploy attendance functions to Convex: `npx convex deploy --yes`
- [X] T024 [US1] Create `src/domains/timesheet-attendance/hooks/use-attendance.ts` — hooks for checkIn, checkOut, getMyToday, getMyRecords, manualEntry using Convex useQuery/useMutation
- [X] T025 [US1] Create `src/domains/timesheet-attendance/components/check-in-widget.tsx` — single-tap check-in/out button with active session indicator, elapsed time, uses use-attendance hook
- [X] T026 [US1] Create `src/domains/timesheet-attendance/components/timesheet-page-content.tsx` — main employee timesheet page with check-in widget, today's status, and recent attendance records
- [X] T027 [US1] Create `src/app/[locale]/timesheet/page.tsx` — page route rendering timesheet-page-content
- [X] T028 [US1] Add "Timesheet" entry to sidebar navigation component
- [ ] T029 [US1] Add check-in widget to employee dashboard page (DEFERRED — widget available on /timesheet page)
- [X] T030 [US1] Run `npm run build` to validate Phase 3

**Checkpoint**: Employees can check in/out, view records, make manual entries. MVP foundation complete.

---

## Phase 4: User Story 2 - AI Auto-Generates Payroll-Ready Summaries (Priority: P1)

**Goal**: System auto-generates timesheets at period close with daily breakdowns, OT classification, leave integration, and anomaly detection. Employees confirm or edit; clean timesheets auto-approve.

**Independent Test**: Run a pay period close and verify auto-generated timesheet matches daily attendance records with correct OT calculations, leave deductions, and anomaly flags. Confirm a clean timesheet and verify auto-approval.

### Implementation for User Story 2

- [X] T031 [P] [US2] Implement getMyTimesheets and getById queries in `convex/functions/timesheets.ts` — getMyTimesheets filtered by userId+businessId+year; getById enriched with user and approver info, auth checks for owner/approver/admin
- [X] T032 [P] [US2] Implement confirm mutation in `convex/functions/timesheets.ts` — validates status is "draft"; sets status→confirmed, confirmedAt, confirmedBy "employee"; if no anomalies→auto-approve; if anomalies→route to approverId
- [X] T033 [US2] Implement editEntry mutation in `convex/functions/timesheets.ts` — validates status is "draft" or "confirmed" (if confirmed, resets to draft); updates daily entry, recalculates totals, adds "manual_edit" anomaly flag
- [X] T034 [US2] Implement generateTimesheets internalMutation in `convex/functions/timesheets.ts` — for each business with active pay_period_config, check if period just ended; for each tracked employee, fetch attendance_records + leave_requests + public_holidays, use timesheet-generator lib, insert timesheet as "draft"
- [X] T035 [US2] Implement autoConfirmPastDeadline internalMutation in `convex/functions/timesheets.ts` — find draft timesheets past confirmationDeadlineDays, auto-confirm with confirmedBy "system", apply same routing logic
- [X] T036 [US2] Add generateTimesheets (daily 1:00 AM UTC) and autoConfirmPastDeadline (daily 2:00 AM UTC) cron jobs to `convex/crons.ts`
- [X] T037 [US2] Deploy timesheet functions to Convex: `npx convex deploy --yes`
- [X] T038 [US2] Create `src/domains/timesheet-attendance/hooks/use-timesheets.ts` — hooks for getMyTimesheets, getById, confirm, editEntry
- [X] T039 [US2] Create `src/domains/timesheet-attendance/components/my-timesheets.tsx` — timesheet list with status badges (draft/confirmed/approved/locked), period dates, total hours summary (MERGED into timesheet-page-content.tsx)
- [X] T040 [US2] Create `src/domains/timesheet-attendance/components/timesheet-detail.tsx` — single timesheet view with daily entries table, OT breakdown by tier, leave days, anomaly flags, confirm/edit actions
- [X] T041 [US2] Integrate my-timesheets and timesheet-detail views into `src/domains/timesheet-attendance/components/timesheet-page-content.tsx`
- [X] T042 [US2] Run `npm run build` to validate Phase 4

**Checkpoint**: Full employee timesheet lifecycle works — auto-generation, review, confirm, auto-approve for clean timesheets.

---

## Phase 5: User Story 3 - Manager Reviews Attendance Exceptions (Priority: P2)

**Goal**: Managers see exception-only dashboard for their team. They approve/reject timesheets, waive attendance deductions, and view team attendance status.

**Independent Test**: Create team with mixed attendance patterns (clean + anomalies). Verify manager sees only flagged items, can approve/reject/waive, and approved timesheets update status correctly.

### Implementation for User Story 3

- [X] T043 [P] [US3] Implement getPendingForManager query in `convex/functions/timesheets.ts` — returns timesheets where status=confirmed AND hasAnomalies=true AND approverId=currentUser
- [X] T044 [P] [US3] Implement getBusinessTimesheets query in `convex/functions/timesheets.ts` — returns all timesheets for a business in a period, enriched with user info; auth restricted to owner/finance_admin
- [X] T045 [P] [US3] Implement approve and reject mutations in `convex/functions/timesheets.ts` — approve: validates status=confirmed, sets status→approved, approvedAt, logs audit; reject: validates status=confirmed, sets status→draft, approverNotes, requires reason
- [X] T046 [P] [US3] Implement getTeamToday and getTeamRecords queries in `convex/functions/attendanceRecords.ts` — getTeamToday returns team attendance for today with user info; getTeamRecords for date range; auth filters by role (managers see direct reports, owner/finance_admin see all)
- [X] T047 [US3] Implement waiveDeduction mutation in `convex/functions/attendanceRecords.ts` — sets deductionWaived=true, waivedBy, waivedReason; auth restricted to assigned approver/owner/finance_admin
- [X] T048 [US3] Deploy manager functions to Convex: `npx convex deploy --yes`
- [X] T049 [US3] Create `src/domains/timesheet-attendance/components/timesheet-approvals-content.tsx` — exception-based review dashboard showing only anomalous timesheets with approve/reject actions, anomaly summaries, and bulk approve
- [ ] T050 [US3] Create `src/domains/timesheet-attendance/components/team-attendance-summary.tsx` — team daily attendance view (DEFERRED — data available via getTeamToday query)
- [X] T051 [US3] Add "Timesheets" tab to manager approval dashboard in `src/domains/expense-claims/components/expense-approval-dashboard.tsx` — lazy-load TimesheetApprovalsContent
- [X] T052 [US3] Run `npm run build` to validate Phase 5

**Checkpoint**: Manager exception-based workflow complete — review only anomalies, approve/reject timesheets, waive deductions.

---

## Phase 6: User Story 4 - Admin Configures Schedules & OT Rules (Priority: P2)

**Goal**: Admins configure work schedules, overtime rules, pay period settings, and assign employees to attendance tracking — all via business settings UI.

**Independent Test**: Configure a work schedule, OT rules, and pay period. Assign an employee to tracking. Verify the configuration propagates to attendance calculation and timesheet generation.

### Implementation for User Story 4

- [X] T053 [P] [US4] Create `src/domains/timesheet-attendance/hooks/use-work-schedules.ts` — hooks for list, getById, create, update, remove using Convex (MERGED into use-admin-config.ts)
- [X] T054 [P] [US4] Create `src/domains/timesheet-attendance/hooks/use-overtime-rules.ts` — hooks for list, create, update using Convex (MERGED into use-admin-config.ts)
- [X] T055 [P] [US4] Create `src/domains/timesheet-attendance/hooks/use-pay-period.ts` — hooks for getActive, createOrUpdate using Convex (MERGED into use-admin-config.ts)
- [X] T056 [US4] Create `src/domains/timesheet-attendance/hooks/index.ts` — barrel export for all hooks
- [X] T057 [US4] Create `src/domains/timesheet-attendance/components/timesheet-settings.tsx` — admin settings page with sections for work schedules (CRUD table), overtime rules (CRUD with rate tier editor), and pay period configuration (frequency, start day, confirmation deadline)
- [ ] T058 [US4] Create `src/domains/timesheet-attendance/components/attendance-tracking-toggle.tsx` — per-employee toggle (DEFERRED — isAttendanceTracked field on business_memberships available for future UI)
- [X] T059 [US4] Add "Timesheet" tab to business settings in `src/domains/account-management/components/tabbed-business-settings.tsx` — lazy-load TimesheetSettings component
- [X] T060 [US4] Run `npm run build` to validate Phase 6

**Checkpoint**: Admin can fully configure the timesheet module — schedules, OT rules, pay periods, employee tracking assignment.

---

## Phase 7: User Story 5 - Payroll Export (Priority: P2)

**Goal**: Extend existing export system with "timesheet" module for payroll-ready CSV exports with configurable columns and pre-built templates.

**Independent Test**: Run a complete pay period with varied scenarios (full attendance, leave, OT, exceptions). Export as CSV and verify all columns are accurate. Test pre-built templates (SQL_PAYROLL_TIMESHEET, GENERIC_TIMESHEET).

### Implementation for User Story 5

- [ ] T061 [P] [US5] Add "timesheet" to ExportModule type in `src/domains/exports/types/index.ts`
- [ ] T062 [P] [US5] Add timesheet field definitions (employee, period, hours, OT detail, leave, attendance, adjustments, workflow fields) in `src/domains/exports/lib/field-definitions.ts`
- [ ] T063 [US5] Add pre-built templates SQL_PAYROLL_TIMESHEET and GENERIC_TIMESHEET in `src/domains/exports/lib/field-definitions.ts`
- [ ] T064 [US5] Add timesheet data access filter (query timesheets by period, status, business; join with user info; include payroll adjustments) in export data access layer
- [ ] T065 [US5] Add "Timesheet" option to module selector in exports page UI with timesheet-specific filters (period, status)
- [ ] T066 [US5] Run `npm run build` to validate Phase 7

**Checkpoint**: Payroll-ready CSV exports work with configurable columns and pre-built templates.

---

## Phase 8: User Story 6 - Smart Attendance Insights & Anomaly Detection (Priority: P3)

**Goal**: AI chat answers attendance queries and manager dashboard surfaces proactive insights (OT trends, recurring lateness, approaching thresholds).

**Independent Test**: Ask the AI assistant "Who hasn't checked in today?" and "Show overtime trends this month". Verify accurate, contextual responses.

### Implementation for User Story 6

- [ ] T067 [US6] Extend AI chat tools/functions to support attendance-related queries (team attendance status, OT trends, anomaly summaries) by adding attendance data retrieval to the chat agent's tool definitions
- [ ] T068 [US6] Add proactive attendance insights widget to manager dashboard — recurring lateness patterns, OT budget threshold alerts, anomaly summaries
- [ ] T069 [US6] Run `npm run build` to validate Phase 8

**Checkpoint**: AI-powered attendance insights available via chat and dashboard.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Notifications, documentation, barrel exports, and final validation

- [ ] T070 [P] Extend notification system for timesheet events (DEFERRED — notification patterns differ per deployment)
- [ ] T071 [P] Create `src/domains/timesheet-attendance/CLAUDE.md` — domain documentation (DEFERRED)
- [X] T072 [P] Create `src/domains/timesheet-attendance/components/index.ts` — barrel export for all components
- [X] T073 Final build validation: `npm run build`
- [X] T074 Final Convex deployment: `npx convex deploy --yes`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (schema deployed) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — **MVP, implement first**
- **US2 (Phase 4)**: Depends on Phase 2 + US1 (needs attendance records to generate timesheets)
- **US3 (Phase 5)**: Depends on Phase 2 + US2 (needs timesheets to approve)
- **US4 (Phase 6)**: Depends on Phase 2 only (admin config UI for existing backend functions)
- **US5 (Phase 7)**: Depends on Phase 2 + US2 (needs timesheets to export)
- **US6 (Phase 8)**: Depends on US1 + US2 (needs attendance and timesheet data for insights)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    │
Phase 2 (Foundational)
    │
    ├── US1 (P1) Employee Check-in/Out ──► US2 (P1) Timesheet Generation
    │                                          │
    │                                          ├── US3 (P2) Manager Approvals
    │                                          └── US5 (P2) Payroll Export
    │
    ├── US4 (P2) Admin Config (independent of US1-US3)
    │
    └── US6 (P3) AI Insights (after US1 + US2)
```

### Parallel Opportunities

- **Phase 1**: T002, T006, T007 can run in parallel after T001
- **Phase 2**: T008-T015 can ALL run in parallel (different files, no interdependencies)
- **Phase 3**: T017+T018 in parallel (different mutations, same file but independent)
- **Phase 4**: T031+T032 in parallel (different functions in same file)
- **Phase 5**: T043+T044+T045+T046 ALL in parallel (different functions/files)
- **Phase 6**: T053+T054+T055 ALL in parallel (different hook files)
- **Phase 7**: T061+T062 in parallel (different files)
- **Phase 9**: T070+T071+T072 ALL in parallel

### Within Each User Story

- Backend functions before hooks
- Hooks before components
- Components before page routes/integration
- Deploy after backend changes
- Build validation at end of each phase

---

## Parallel Example: User Story 1

```bash
# Launch attendance mutations in parallel (independent functions):
Task: "Implement checkIn mutation in convex/functions/attendanceRecords.ts"
Task: "Implement checkOut mutation in convex/functions/attendanceRecords.ts"

# After mutations, launch queries:
Task: "Implement getMyToday and getMyRecords queries in convex/functions/attendanceRecords.ts"

# After deploy, launch hook + component in parallel (different files):
Task: "Create use-attendance.ts hook"
Task: "Create check-in-widget.tsx component"
```

## Parallel Example: Phase 2 (Foundational)

```bash
# ALL foundational tasks can run in parallel (different files):
Task: "Create convex/functions/workSchedules.ts"
Task: "Create convex/functions/overtimeRules.ts"
Task: "Create convex/functions/payPeriodConfigs.ts"
Task: "Create convex/functions/payrollAdjustments.ts"
Task: "Create lib/overtime-calculator.ts"
Task: "Create lib/attendance-classifier.ts"
Task: "Create lib/timesheet-generator.ts"
Task: "Create lib/timesheet-workflow.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (schema, validators, types)
2. Complete Phase 2: Foundational (backend CRUD, library logic)
3. Complete Phase 3: US1 — Employee check-in/out
4. **STOP and VALIDATE**: Test check-in, check-out, manual entry, auto-close
5. Complete Phase 4: US2 — Timesheet generation + confirmation
6. **STOP and VALIDATE**: Test full cycle — check-in → timesheet → confirm → auto-approve
7. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Check-in/out) → Test independently → Deploy (data collection starts)
3. US2 (Timesheet generation) → Test independently → Deploy (payroll summaries work)
4. US4 (Admin config) → Test independently → Deploy (admins can configure)
5. US3 (Manager approvals) → Test independently → Deploy (exception workflow active)
6. US5 (Payroll export) → Test independently → Deploy (CSV exports available)
7. US6 (AI insights) → Test independently → Deploy (AI differentiator live)
8. Polish → Final validation → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 → US2 (sequential, US2 depends on US1)
   - Developer B: US4 (Admin config, independent)
3. After US2 completes:
   - Developer A: US3 (Manager approvals)
   - Developer B: US5 (Payroll export)
   - Developer C: US6 (AI insights)
4. Polish phase: all developers

---

## Summary

| Phase | Story | Priority | Tasks | Parallel |
|-------|-------|----------|-------|----------|
| 1 | Setup | — | T001–T007 (7) | 3 parallel |
| 2 | Foundational | — | T008–T016 (9) | 8 parallel |
| 3 | US1: Employee Check-in/Out | P1 | T017–T030 (14) | 2 parallel |
| 4 | US2: Timesheet Generation | P1 | T031–T042 (12) | 2 parallel |
| 5 | US3: Manager Approvals | P2 | T043–T052 (10) | 4 parallel |
| 6 | US4: Admin Config | P2 | T053–T060 (8) | 3 parallel |
| 7 | US5: Payroll Export | P2 | T061–T066 (6) | 2 parallel |
| 8 | US6: AI Insights | P3 | T067–T069 (3) | 0 parallel |
| 9 | Polish | — | T070–T074 (5) | 3 parallel |
| **Total** | | | **74 tasks** | |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after its phase completes
- No test tasks generated (not requested in specification)
- Build validation (`npm run build`) required at end of each user story phase
- Convex deploy (`npx convex deploy --yes`) required after backend function changes
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
