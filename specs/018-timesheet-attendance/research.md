# Research: Timesheet & Attendance for Payroll

**Branch**: `018-timesheet-attendance` | **Date**: 2026-02-20

## Decision Log

### D1: Domain Module Structure

- **Decision**: Create `src/domains/timesheet-attendance/` following the leave-management domain pattern
- **Rationale**: All existing domains follow identical structure (components/, hooks/, lib/, types/). Leave management is the closest analog with approval workflows, balance tracking, and settings.
- **Alternatives**: Embedding in leave-management domain (rejected — separate purchasable module with distinct entities)

### D2: Data Storage — Convex Tables

- **Decision**: 6 new Convex tables + 1 extended table
  - New: `attendance_records`, `work_schedules`, `overtime_rules`, `timesheets`, `payroll_adjustments`, `pay_period_configs`
  - Extended: `business_memberships` (add attendance tracking fields)
- **Rationale**: Follows existing multi-tenant pattern (businessId on every table), compound indexes for common queries, validator-based status fields
- **Alternatives**: Embedding attendance in existing tables (rejected — separate entities with distinct lifecycles)

### D3: Timesheet Generation — Cron-Based

- **Decision**: Convex cron job triggers timesheet auto-generation at period close, similar to existing `markOverdue` and `generateDueInvoices` patterns
- **Rationale**: Existing cron infrastructure (convex/crons.ts) already handles daily/hourly scheduled tasks. Pattern proven with 9+ active cron jobs. Auto-close incomplete sessions + auto-generate timesheets + auto-confirm past deadline.
- **Alternatives**: Manual generation triggered by admin (rejected — defeats AI-first automation goal). Real-time generation on each check-out (rejected — unnecessary computation for every check-out)

### D4: Approval-by-Exception Workflow

- **Decision**: Reuse existing RBAC + approval routing. Timesheets with `hasAnomalies: false` auto-approve on employee confirmation. Only anomalous timesheets route to manager.
- **Rationale**: Existing leave approval uses identical pattern (approverId from business_memberships.managerId, owner/finance_admin override). The anomaly flag determines routing.
- **Alternatives**: All timesheets require manager approval (rejected — contradicts SC-002 target of 90% auto-approval)

### D5: Payroll Export — Extend Existing Export System

- **Decision**: Add "timesheet" as a new `ExportModule` type in the existing export system. Create pre-built templates for common SEA payroll formats (SQL Payroll, Kakitangan, generic).
- **Rationale**: Export system is production-grade with templates, scheduling, history, RBAC, and CSV generation. Adding a new module type requires minimal new code.
- **Alternatives**: Build separate export (rejected — duplicates existing infrastructure)

### D6: Overtime Calculation — Daily-First with Weekly Option

- **Decision**: Default to daily OT calculation (hours beyond configured daily threshold). Admin can also enable weekly OT (hours beyond weekly threshold). Both can be active simultaneously (daily applies first, weekly catches additional).
- **Rationale**: SEA labor laws (Malaysia Employment Act 1955, Singapore Employment Act) are daily-based. Daily OT is the expected default. Weekly option supports businesses with flexible schedules.
- **Alternatives**: Weekly-only (rejected — doesn't match SEA labor conventions)

### D7: Geolocation — Browser API, Optional

- **Decision**: Use `navigator.geolocation.getCurrentPosition()` for optional geofencing. No existing geolocation code to reuse — this is net new.
- **Rationale**: No hardware dependencies (mobile browser API). Optional per business. Store lat/lng with attendance record for audit. Geofence validation is client-side advisory (not blocking — flagged for manager).
- **Alternatives**: GPS hardware/kiosk (rejected — out of scope V1). Server-side IP geolocation (rejected — too imprecise for attendance)

### D8: Notifications — Email via Existing Leave Pattern

- **Decision**: Extend existing leave notification API pattern (`POST /api/v1/leave-management/notifications/route.ts`) for timesheet notifications. Push notifications disabled globally (infrastructure not ready).
- **Rationale**: Leave notifications are the only active notification channel. Same patterns apply: email on submission, approval, rejection, anomaly alerts.
- **Alternatives**: Wait for push notification infrastructure (rejected — email is sufficient for V1)

### D9: Attendance Status Classification

- **Decision**: Classify attendance per day using work schedule + grace period. Statuses: `present`, `late`, `early_departure`, `absent`, `on_leave`, `public_holiday`. Lateness/early departure auto-deduct from net payable hours (waivable by manager).
- **Rationale**: Matches spec clarification (hours-based deduction model). Grace period is configurable per work schedule (default 15 min).
- **Alternatives**: Binary present/absent only (rejected — insufficient for payroll deduction needs)

### D10: Pay Period Lock & Forward Adjustments

- **Decision**: Exported pay periods are immutable. A `payroll_adjustments` table stores corrections that apply to the next period's export. Export includes adjustments section.
- **Rationale**: Standard payroll practice — don't rewrite history. Preserves audit trail. External payroll systems may have already consumed the data.
- **Alternatives**: Reopenable periods (rejected — breaks audit trail and creates reconciliation headaches)

## Technology Mapping

| Spec Requirement | Implementation Approach |
|-----------------|------------------------|
| Check-in/check-out (FR-001) | Convex mutation + optional Browser Geolocation API |
| Auto-generate timesheets (FR-006) | Convex cron job (daily at 1 AM UTC) |
| Auto-confirm past deadline (FR-008) | Convex cron job (daily at 2 AM UTC) |
| Auto-close incomplete sessions (FR-003) | Convex cron job (daily at midnight UTC) |
| Anomaly detection (FR-010) | Server-side logic in timesheet generation mutation |
| OT calculation (FR-011-013) | Library function in `lib/overtime-calculator.ts` |
| Payroll export (FR-024) | Extend existing export system with "timesheet" module |
| Audit trail (FR-022) | Existing `audit_events` table via `logEvent()` |
| Manager approval (FR-010) | Existing RBAC + approval routing pattern |
| Settings UI (FR-015-018) | New tab in business settings (lazy-loaded) |
| Team dashboard (US3) | New tab in manager approvals (lazy-loaded) |
