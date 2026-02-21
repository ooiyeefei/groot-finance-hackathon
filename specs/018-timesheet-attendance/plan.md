# Implementation Plan: Timesheet & Attendance for Payroll

**Branch**: `018-timesheet-attendance` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-timesheet-attendance/spec.md`

## Summary

Add timesheet and attendance capabilities to FinanSEAL — the minimum needed for payroll calculation input data. Employees check in/out daily; the system auto-generates timesheets at period close with AI-powered anomaly detection. Only exception timesheets require manager review (approval-by-exception). Payroll-ready CSV exports extend the existing export system. The module is a purchasable feature with per-employee tracking assignment.

Key differentiators vs. QuickHR/Workday: no hardware dependencies, auto-generated timesheets, 90% auto-approval target, mobile-first check-in, and forward-adjustment correction model.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8
**Storage**: Convex (document database with real-time subscriptions)
**Testing**: Follows existing patterns (build-fix loop, `npm run build`)
**Target Platform**: Web (responsive mobile), PWA-capable
**Project Type**: Web application (Next.js + Convex backend)
**Performance Goals**: Check-in <5s, payroll export <1 min for 200 employees, 90% auto-approval rate
**Constraints**: No new npm packages, extend existing patterns, Convex deployment required after schema changes
**Scale/Scope**: Up to 200 employees per business, 6 SEA countries

## Constitution Check

*GATE: Constitution file is template-only (not project-specific). No gates to enforce.*

No violations. Proceeding with standard project conventions from CLAUDE.md:
- Semantic design tokens (no hardcoded colors)
- Button styling conventions (primary for actions, secondary for cancel)
- Number formatting via `formatNumber`/`formatCurrency`
- Date handling via `formatBusinessDate` (no timezone shift)
- Git author: grootdev-ai / dev@hellogroot.com
- Build must pass before completion
- Convex deploy required after schema changes

## Project Structure

### Documentation (this feature)

```text
specs/018-timesheet-attendance/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Research decisions
├── data-model.md        # Phase 1: Data model design
├── quickstart.md        # Phase 1: Build sequence
├── contracts/
│   └── convex-functions.md  # Phase 1: API contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
# New Convex backend functions
convex/functions/
├── attendanceRecords.ts     # Check-in/out, team view, manual entry
├── timesheets.ts            # Generation, confirmation, approval
├── workSchedules.ts         # Schedule profile CRUD
├── overtimeRules.ts         # OT rule CRUD
├── payPeriodConfigs.ts      # Pay period configuration
└── payrollAdjustments.ts    # Forward correction entries

# New domain module
src/domains/timesheet-attendance/
├── CLAUDE.md
├── components/              # 9 components (employee, manager, admin views)
├── hooks/                   # 6 hook files
├── lib/                     # 4 library files (OT calc, attendance classification, generation, workflow)
└── types/                   # TypeScript interfaces and constants

# New page route
src/app/[locale]/timesheet/page.tsx

# Modified files
convex/schema.ts                                          # 6 new tables + extend business_memberships
convex/crons.ts                                           # 3 new cron jobs
convex/lib/validators.ts                                  # New status validators
src/lib/constants/statuses.ts                             # New status constants
src/domains/exports/lib/field-definitions.ts              # Timesheet export fields
src/domains/exports/types/index.ts                        # Extend ExportModule
src/domains/account-management/components/tabbed-business-settings.tsx  # Add tab
src/domains/expense-claims/components/expense-approval-dashboard.tsx    # Add tab
```

**Structure Decision**: Follows existing domain module pattern established by leave-management. New domain at `src/domains/timesheet-attendance/` with standard subdirectories. Backend functions in `convex/functions/` following established naming and RBAC patterns. Integration into existing settings and approval dashboards via lazy-loaded tabs.

## Implementation Phases

### Phase 1: Foundation (Schema + Core Backend)
- Add 6 new Convex tables with validators and indexes
- Extend business_memberships with tracking fields
- Create work schedule, OT rule, and pay period config CRUD functions
- Deploy schema to Convex

### Phase 2: Timesheet Engine (Business Logic)
- Build library functions: overtime calculator, attendance classifier, timesheet generator, workflow state machine
- Create attendance records functions (check-in/out, team view, manual entry, waiver)
- Create timesheet functions (generation, confirmation, approval, rejection)
- Create payroll adjustment functions
- Add 3 cron jobs (auto-close sessions, generate timesheets, auto-confirm past deadline)

### Phase 3: Domain Module (Types + Hooks)
- Define TypeScript interfaces, status constants, default configs
- Create React hooks for all data operations (attendance, timesheets, schedules, OT rules, pay periods)

### Phase 4: UI Components
- Employee: check-in widget, timesheet page, timesheet detail, my timesheets list
- Manager: exception-based approval dashboard, team attendance summary
- Admin: settings page (schedules, OT rules, pay period), tracking assignment toggle

### Phase 5: Integration Points
- Page route: `/timesheet`
- Manager approval dashboard: add "Timesheets" tab
- Business settings: add "Timesheet" tab
- Dashboard: add check-in widget
- Sidebar: add navigation entry

### Phase 6: Payroll Export
- Extend export module with "timesheet" type
- Create field definitions and pre-built templates
- Add timesheet data access filters

### Phase 7: Notifications + Polish
- Email notifications for timesheet events
- Domain CLAUDE.md documentation

## Complexity Tracking

No constitution violations to justify. The implementation follows existing patterns throughout with no new architectural patterns or abstractions introduced.

## Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Feature Spec | [spec.md](./spec.md) | Complete |
| Research | [research.md](./research.md) | Complete |
| Data Model | [data-model.md](./data-model.md) | Complete |
| API Contracts | [contracts/convex-functions.md](./contracts/convex-functions.md) | Complete |
| Quickstart | [quickstart.md](./quickstart.md) | Complete |
| Spec Checklist | [checklists/requirements.md](./checklists/requirements.md) | Complete |
| Tasks | tasks.md | Pending (`/speckit.tasks`) |
