# Quickstart: Timesheet & Attendance for Payroll

**Branch**: `018-timesheet-attendance` | **Date**: 2026-02-20

## Build Sequence

The implementation follows a bottom-up approach: schema → backend functions → library logic → hooks → UI components → integration points.

### Phase 1: Foundation (Schema + Core Backend)

**Step 1.1: Schema & Validators**
1. Add status constants to `src/lib/constants/statuses.ts`
2. Add validators to `convex/lib/validators.ts`
3. Add 6 new tables to `convex/schema.ts` (attendance_records, work_schedules, overtime_rules, timesheets, payroll_adjustments, pay_period_configs)
4. Add `isAttendanceTracked` and `workScheduleId` fields to `business_memberships`
5. Deploy schema: `npx convex deploy --yes`

**Step 1.2: Work Schedule & OT Rules Functions**
1. Create `convex/functions/workSchedules.ts` (CRUD: list, getById, create, update, remove)
2. Create `convex/functions/overtimeRules.ts` (CRUD: list, create, update)
3. Create `convex/functions/payPeriodConfigs.ts` (getActive, createOrUpdate)

**Step 1.3: Attendance Records Functions**
1. Create `convex/functions/attendanceRecords.ts`
2. Implement: checkIn, checkOut, getMyToday, getMyRecords, getTeamToday, getTeamRecords, manualEntry, waiveDeduction
3. Implement: autoCloseIncompleteSessions (internalMutation for cron)

### Phase 2: Timesheet Engine (Core Business Logic)

**Step 2.1: Library Functions**
1. Create `src/domains/timesheet-attendance/lib/overtime-calculator.ts` — OT classification logic
2. Create `src/domains/timesheet-attendance/lib/attendance-classifier.ts` — lateness/early departure detection
3. Create `src/domains/timesheet-attendance/lib/timesheet-generator.ts` — period aggregation logic
4. Create `src/domains/timesheet-attendance/lib/timesheet-workflow.ts` — status state machine

**Step 2.2: Timesheet Functions**
1. Create `convex/functions/timesheets.ts`
2. Implement queries: getMyTimesheets, getById, getPendingForManager, getBusinessTimesheets
3. Implement mutations: confirm, editEntry, approve, reject
4. Implement internal: generateTimesheets, autoConfirmPastDeadline

**Step 2.3: Payroll Adjustments**
1. Create `convex/functions/payrollAdjustments.ts` (listForPeriod, create)

**Step 2.4: Cron Jobs**
1. Add to `convex/crons.ts`:
   - Daily midnight UTC: autoCloseIncompleteSessions
   - Daily 1:00 AM UTC: generateTimesheets
   - Daily 2:00 AM UTC: autoConfirmPastDeadline

### Phase 3: Domain Module (Types + Hooks)

**Step 3.1: Types**
1. Create `src/domains/timesheet-attendance/types/index.ts`
2. Define interfaces, status constants, default configs

**Step 3.2: Hooks**
1. Create `src/domains/timesheet-attendance/hooks/use-attendance.ts` (check-in/out, daily records)
2. Create `src/domains/timesheet-attendance/hooks/use-timesheets.ts` (CRUD, approval)
3. Create `src/domains/timesheet-attendance/hooks/use-work-schedules.ts` (config management)
4. Create `src/domains/timesheet-attendance/hooks/use-overtime-rules.ts` (config management)
5. Create `src/domains/timesheet-attendance/hooks/use-pay-period.ts` (config management)
6. Create `src/domains/timesheet-attendance/hooks/index.ts` (barrel export)

### Phase 4: UI Components

**Step 4.1: Employee Views**
1. Create `timesheet-page-content.tsx` — main employee page
2. Create `check-in-widget.tsx` — dashboard check-in/out button
3. Create `my-timesheets.tsx` — timesheet list with status badges
4. Create `timesheet-detail.tsx` — single timesheet with daily entries

**Step 4.2: Manager Views**
1. Create `timesheet-approvals-content.tsx` — exception-based review dashboard
2. Create `team-attendance-summary.tsx` — team daily attendance view

**Step 4.3: Admin Settings**
1. Create `timesheet-settings.tsx` — work schedules, OT rules, pay period config
2. Create `attendance-tracking-toggle.tsx` — per-employee tracking assignment

### Phase 5: Integration Points

**Step 5.1: Page Routes**
1. Create `src/app/[locale]/timesheet/page.tsx` — employee timesheet page
2. Add sidebar navigation entry for "Timesheet"

**Step 5.2: Manager Approval Tab**
1. Add "Timesheets" tab to existing manager approval dashboard
2. Lazy-load `TimesheetApprovalsContent` component

**Step 5.3: Business Settings Tab**
1. Add "Timesheet" tab to existing business settings
2. Lazy-load `TimesheetSettings` component

**Step 5.4: Dashboard Widget**
1. Add check-in/out widget to employee dashboard

### Phase 6: Payroll Export

**Step 6.1: Export Module Extension**
1. Add "timesheet" to ExportModule type
2. Create timesheet field definitions in `src/domains/exports/lib/field-definitions.ts`
3. Create pre-built templates (SQL_PAYROLL_TIMESHEET, GENERIC_TIMESHEET)
4. Add timesheet data access in `src/domains/exports/lib/data-access-filter.ts`

**Step 6.2: Payroll Export UI**
1. Add "Timesheet" option to module selector in exports page
2. Support timesheet-specific filters (period, status)

### Phase 7: Notifications + Polish

**Step 7.1: Email Notifications**
1. Extend notification API for timesheet events (submitted, approved, anomaly alert)
2. Add notification triggers in timesheet mutations

**Step 7.2: CLAUDE.md Documentation**
1. Create `src/domains/timesheet-attendance/CLAUDE.md`

## Key Files to Create

```
# New Convex functions
convex/functions/attendanceRecords.ts
convex/functions/timesheets.ts
convex/functions/workSchedules.ts
convex/functions/overtimeRules.ts
convex/functions/payPeriodConfigs.ts
convex/functions/payrollAdjustments.ts

# New domain module
src/domains/timesheet-attendance/
├── CLAUDE.md
├── components/
│   ├── index.ts
│   ├── timesheet-page-content.tsx
│   ├── check-in-widget.tsx
│   ├── my-timesheets.tsx
│   ├── timesheet-detail.tsx
│   ├── timesheet-approvals-content.tsx
│   ├── team-attendance-summary.tsx
│   ├── timesheet-settings.tsx
│   └── attendance-tracking-toggle.tsx
├── hooks/
│   ├── index.ts
│   ├── use-attendance.ts
│   ├── use-timesheets.ts
│   ├── use-work-schedules.ts
│   ├── use-overtime-rules.ts
│   └── use-pay-period.ts
├── lib/
│   ├── overtime-calculator.ts
│   ├── attendance-classifier.ts
│   ├── timesheet-generator.ts
│   └── timesheet-workflow.ts
└── types/
    └── index.ts

# New page routes
src/app/[locale]/timesheet/page.tsx

# Modified files
convex/schema.ts                          (add 6 tables + extend business_memberships)
convex/crons.ts                           (add 3 cron jobs)
convex/lib/validators.ts                  (add new validators)
src/lib/constants/statuses.ts             (add new status constants)
src/domains/exports/lib/field-definitions.ts  (add timesheet fields)
src/domains/exports/types/index.ts        (extend ExportModule)
src/domains/account-management/components/tabbed-business-settings.tsx  (add tab)
src/domains/expense-claims/components/expense-approval-dashboard.tsx    (add tab)
```

## Dependencies

- No new npm packages required
- All functionality built on existing Convex + React + Next.js stack
- Browser Geolocation API (built-in, no dependency) for optional location tracking
