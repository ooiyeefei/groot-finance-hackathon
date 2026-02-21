# Data Model: Timesheet & Attendance for Payroll

**Branch**: `018-timesheet-attendance` | **Date**: 2026-02-20

## Entity Relationship Overview

```
business_memberships (extended)
  ├── isAttendanceTracked → determines if employee needs check-in
  └── workScheduleId → references work_schedules

work_schedules ─── 1:N ──→ business_memberships
  └── overtimeRuleId → references overtime_rules

overtime_rules ─── 1:N ──→ work_schedules

attendance_records ─── N:1 ──→ users (via userId)
  └── one per tracked employee per workday

timesheets ─── N:1 ──→ users (via userId)
  ├── references pay_period_configs (via payPeriodConfigId)
  ├── embeds daily entries (computed from attendance_records + leave_requests)
  └── status lifecycle: draft → confirmed → approved → finalized → locked

payroll_adjustments ─── N:1 ──→ timesheets (via originalTimesheetId)
  └── corrections for locked periods, applied to next export

pay_period_configs ─── N:1 ──→ businesses
  └── one active config per business
```

## New Tables

### attendance_records

Daily check-in/check-out records for tracked employees.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | `Id<"businesses">` | Yes | Multi-tenant isolation |
| userId | `Id<"users">` | Yes | Employee who checked in |
| date | `string` | Yes | ISO date (YYYY-MM-DD) |
| checkInTime | `number` | Yes | Unix timestamp of check-in |
| checkOutTime | `number` | No | Unix timestamp of check-out (null = incomplete) |
| totalMinutes | `number` | No | Calculated: checkOut - checkIn - breakMinutes |
| breakMinutes | `number` | Yes | From work schedule config (default) |
| status | validator | Yes | `complete`, `incomplete`, `flagged`, `auto_closed` |
| attendanceStatus | validator | Yes | `present`, `late`, `early_departure`, `absent` |
| latenessMinutes | `number` | No | Minutes late (beyond grace period) |
| earlyDepartureMinutes | `number` | No | Minutes left early (beyond grace period) |
| hoursDeducted | `number` | No | Auto-calculated from lateness + early departure |
| deductionWaived | `boolean` | No | Manager waived the deduction (default false) |
| waivedBy | `Id<"users">` | No | Manager who waived |
| waivedReason | `string` | No | Reason for waiver |
| source | validator | Yes | `auto` (check-in), `manual` (employee edit), `system` (auto-close) |
| manualEditReason | `string` | No | Required when source is `manual` |
| location | `object` | No | `{ lat: number, lng: number, accuracy: number }` |
| locationFlagged | `boolean` | No | Outside geofence (if enabled) |
| notes | `string` | No | Employee notes |
| updatedAt | `number` | No | Last modification timestamp |

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_userId` → `["userId"]`
- `by_businessId_userId_date` → `["businessId", "userId", "date"]` (unique constraint enforced in code)
- `by_businessId_date` → `["businessId", "date"]` (team daily view)
- `by_businessId_status` → `["businessId", "status"]` (find incomplete sessions)

**Validators**:
```typescript
attendanceRecordStatusValidator = literalUnion(["complete", "incomplete", "flagged", "auto_closed"])
attendanceStatusValidator = literalUnion(["present", "late", "early_departure", "absent"])
attendanceSourceValidator = literalUnion(["auto", "manual", "system"])
```

---

### work_schedules

Configurable work schedule profiles.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | `Id<"businesses">` | Yes | Multi-tenant isolation |
| name | `string` | Yes | Profile name (e.g., "Standard Office", "Part-Time") |
| startTime | `string` | Yes | HH:MM format (e.g., "09:00") |
| endTime | `string` | Yes | HH:MM format (e.g., "18:00") |
| workDays | `array<number>` | Yes | Days of week (0=Sun, 1=Mon, ..., 6=Sat) |
| breakMinutes | `number` | Yes | Break duration in minutes (e.g., 60) |
| graceMinutes | `number` | Yes | Grace period for lateness (default 15) |
| regularHoursPerDay | `number` | Yes | Calculated: endTime - startTime - breakMinutes (in hours) |
| overtimeRuleId | `Id<"overtime_rules">` | No | Associated OT rule |
| isDefault | `boolean` | Yes | Default schedule for new employees |
| isActive | `boolean` | Yes | Can be deactivated |
| updatedAt | `number` | No | Last modification timestamp |

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_businessId_isDefault` → `["businessId", "isDefault"]`
- `by_businessId_isActive` → `["businessId", "isActive"]`

---

### overtime_rules

Configurable overtime rate tiers.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | `Id<"businesses">` | Yes | Multi-tenant isolation |
| name | `string` | Yes | Rule name (e.g., "Malaysia Standard OT") |
| calculationBasis | validator | Yes | `daily`, `weekly`, or `both` |
| dailyThresholdHours | `number` | No | Hours/day before OT kicks in (e.g., 8) |
| weeklyThresholdHours | `number` | No | Hours/week before OT kicks in (e.g., 40) |
| requiresPreApproval | `boolean` | Yes | OT hours need manager pre-approval |
| rateTiers | `array<object>` | Yes | Array of `{ label, multiplier, applicableOn }` |
| isActive | `boolean` | Yes | Can be deactivated |
| updatedAt | `number` | No | Last modification timestamp |

**Rate Tier Structure** (embedded):
```typescript
{
  label: string,            // e.g., "Standard OT", "Rest Day", "Public Holiday"
  multiplier: number,       // e.g., 1.5, 2.0, 3.0
  applicableOn: string,     // "weekday_ot", "rest_day", "public_holiday"
}
```

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_businessId_isActive` → `["businessId", "isActive"]`

---

### timesheets

Periodic summary of an employee's work hours for a pay period.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | `Id<"businesses">` | Yes | Multi-tenant isolation |
| userId | `Id<"users">` | Yes | Employee |
| payPeriodConfigId | `Id<"pay_period_configs">` | Yes | Associated pay period config |
| periodStartDate | `string` | Yes | ISO date (YYYY-MM-DD) |
| periodEndDate | `string` | Yes | ISO date (YYYY-MM-DD) |
| dailyEntries | `array<object>` | Yes | Embedded daily breakdown |
| totalRegularMinutes | `number` | Yes | Sum of regular work minutes |
| totalOvertimeMinutes | `number` | Yes | Sum of all OT minutes |
| overtimeByTier | `array<object>` | Yes | OT minutes broken down by rate tier |
| leaveDays | `array<object>` | Yes | Leave days with type info |
| publicHolidayDays | `number` | Yes | Count of public holidays in period |
| attendanceDeductionMinutes | `number` | Yes | Total minutes deducted for lateness/early departure |
| netPayableMinutes | `number` | Yes | regularMinutes + OT minutes - deductions |
| hasAnomalies | `boolean` | Yes | Whether any anomaly flags exist |
| anomalySummary | `array<string>` | No | List of anomaly descriptions |
| status | validator | Yes | `draft`, `confirmed`, `approved`, `finalized`, `locked` |
| confirmedAt | `number` | No | When employee confirmed |
| confirmedBy | validator | No | `employee` or `system` (auto-confirm) |
| approverId | `Id<"users">` | No | Manager assigned for approval |
| approvedAt | `number` | No | When manager approved |
| approverNotes | `string` | No | Manager notes on approval |
| finalizedAt | `number` | No | When included in payroll export |
| lockedAt | `number` | No | When pay period was exported/locked |
| updatedAt | `number` | No | Last modification timestamp |

**Daily Entry Structure** (embedded):
```typescript
{
  date: string,                 // ISO date
  attendanceRecordId: Id<"attendance_records"> | null,
  dayType: string,              // "workday", "rest_day", "public_holiday", "leave"
  leaveType: string | null,     // Leave type name if on leave
  checkInTime: number | null,
  checkOutTime: number | null,
  regularMinutes: number,
  overtimeMinutes: number,
  overtimeTier: string | null,  // Which rate tier applies
  attendanceStatus: string,     // present, late, early_departure, absent, on_leave, public_holiday
  latenessMinutes: number,
  earlyDepartureMinutes: number,
  hoursDeducted: number,
  deductionWaived: boolean,
  flags: string[],              // Anomaly flags for this day
}
```

**Overtime By Tier Structure** (embedded):
```typescript
{
  tierLabel: string,      // e.g., "Standard OT"
  multiplier: number,     // e.g., 1.5
  minutes: number,        // Total minutes at this tier
}
```

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_userId` → `["userId"]`
- `by_businessId_status` → `["businessId", "status"]`
- `by_businessId_userId_periodStartDate` → `["businessId", "userId", "periodStartDate"]`
- `by_approverId_status` → `["approverId", "status"]` (manager approval routing)

**Validators**:
```typescript
timesheetStatusValidator = literalUnion(["draft", "confirmed", "approved", "finalized", "locked"])
timesheetConfirmedByValidator = literalUnion(["employee", "system"])
```

---

### payroll_adjustments

Corrections for locked pay periods, applied forward.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | `Id<"businesses">` | Yes | Multi-tenant isolation |
| userId | `Id<"users">` | Yes | Employee affected |
| originalTimesheetId | `Id<"timesheets">` | Yes | The locked timesheet being corrected |
| originalPeriodStartDate | `string` | Yes | For reference/display |
| adjustmentType | validator | Yes | `hours_add`, `hours_deduct`, `ot_add`, `ot_deduct` |
| minutes | `number` | Yes | Amount of adjustment in minutes |
| overtimeTier | `string` | No | If OT adjustment, which tier |
| reason | `string` | Yes | Explanation of correction |
| createdBy | `Id<"users">` | Yes | Admin who created adjustment |
| appliedToTimesheetId | `Id<"timesheets">` | No | Timesheet where adjustment was exported |
| appliedAt | `number` | No | When included in export |
| updatedAt | `number` | No | Last modification timestamp |

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_userId` → `["userId"]`
- `by_originalTimesheetId` → `["originalTimesheetId"]`
- `by_businessId_appliedToTimesheetId` → `["businessId", "appliedToTimesheetId"]` (find adjustments for current export)

**Validators**:
```typescript
payrollAdjustmentTypeValidator = literalUnion(["hours_add", "hours_deduct", "ot_add", "ot_deduct"])
```

---

### pay_period_configs

Business-level payroll cycle configuration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | `Id<"businesses">` | Yes | Multi-tenant isolation |
| frequency | validator | Yes | `weekly`, `biweekly`, `monthly` |
| startDay | `number` | Yes | Day periods start (0=Sun..6=Sat for weekly/biweekly; 1-28 for monthly) |
| confirmationDeadlineDays | `number` | Yes | Business days after period close for employee confirmation (default 2) |
| isActive | `boolean` | Yes | Only one active config per business |
| updatedAt | `number` | No | Last modification timestamp |

**Indexes**:
- `by_businessId` → `["businessId"]`
- `by_businessId_isActive` → `["businessId", "isActive"]`

**Validators**:
```typescript
payPeriodFrequencyValidator = literalUnion(["weekly", "biweekly", "monthly"])
```

## Extended Tables

### business_memberships (add fields)

| New Field | Type | Required | Description |
|-----------|------|----------|-------------|
| isAttendanceTracked | `boolean` | No | Whether this employee requires check-in/check-out (default false) |
| workScheduleId | `Id<"work_schedules">` | No | Override schedule for this employee (falls back to business default) |

## State Machines

### Attendance Record Status

```
(new check-in) → incomplete
incomplete + check-out → complete
incomplete + end-of-day cron → auto_closed (flagged)
complete + manager/employee edit → flagged
auto_closed + employee correction → complete
```

### Timesheet Status

```
(auto-generated at period close) → draft
draft + employee confirms → confirmed
draft + auto-confirm deadline passes → confirmed (confirmedBy: system)
confirmed + no anomalies → approved (auto)
confirmed + has anomalies → (routed to manager) → approved
approved + included in export → finalized
finalized + pay period exported → locked (immutable)
```

### Anomaly Flag Types

Flags that mark a timesheet as `hasAnomalies: true`:

| Flag | Trigger | Resolution |
|------|---------|------------|
| `missing_checkin` | Tracked employee has no attendance record for a workday | Employee adds manual entry or manager marks absent |
| `incomplete_session` | Check-in without check-out (auto-closed by system) | Employee corrects check-out time |
| `manual_edit` | Employee manually modified an auto-generated entry | Manager reviews the edit |
| `ot_exceeds_threshold` | Overtime hours exceed a business-configured weekly threshold | Manager reviews and approves/adjusts |
| `location_outside_geofence` | Check-in location outside configured geofence | Manager acknowledges |
| `leave_attendance_conflict` | Employee checked in on a day with approved leave | Employee cancels leave or discards attendance |
