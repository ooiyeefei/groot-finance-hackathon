# Convex Function Contracts: Timesheet & Attendance

**Branch**: `018-timesheet-attendance` | **Date**: 2026-02-20

All functions follow existing patterns: auth via Clerk identity, RBAC via business_memberships, audit via audit_events.

## attendanceRecords.ts

### Queries

#### `checkIn` (mutation)
Record employee check-in.
```
Args: { businessId: Id<"businesses">, location?: { lat, lng, accuracy } }
Returns: Id<"attendance_records">
Auth: Authenticated employee, must be attendance-tracked
Side effects: Creates attendance_record with status "incomplete", logs audit event
Validation: No existing incomplete record for today, not on approved leave, is a workday
```

#### `checkOut` (mutation)
Record employee check-out.
```
Args: { businessId: Id<"businesses"> }
Returns: Id<"attendance_records">
Auth: Authenticated employee with active session
Side effects: Updates record (checkOutTime, totalMinutes, attendanceStatus, lateness/early departure calculations), logs audit event
Validation: Must have incomplete record for today
```

#### `getMyToday` (query)
Get current user's attendance record for today.
```
Args: { businessId: string }
Returns: AttendanceRecord | null
Auth: Authenticated employee
```

#### `getMyRecords` (query)
Get current user's attendance records for a date range.
```
Args: { businessId: string, startDate: string, endDate: string }
Returns: AttendanceRecord[]
Auth: Authenticated employee
```

#### `getTeamToday` (query)
Get team attendance for today (manager view).
```
Args: { businessId: string }
Returns: Array<{ user, attendanceRecord, status }>
Auth: Manager+ (filters to direct reports for managers, all for owner/finance_admin)
```

#### `getTeamRecords` (query)
Get team attendance for date range.
```
Args: { businessId: string, startDate: string, endDate: string, userId?: string }
Returns: Array<{ user, records: AttendanceRecord[] }>
Auth: Manager+
```

#### `manualEntry` (mutation)
Employee creates/edits a manual attendance entry.
```
Args: { businessId: Id<"businesses">, date: string, checkInTime: number, checkOutTime: number, reason: string }
Returns: Id<"attendance_records">
Auth: Authenticated employee, must be attendance-tracked
Side effects: Creates/updates record with source "manual", auto-flags as anomaly, logs audit event
Validation: Date must be within current or most recent pay period, reason required
```

#### `waiveDeduction` (mutation)
Manager waives attendance deduction for an employee.
```
Args: { id: Id<"attendance_records">, reason: string }
Returns: void
Auth: Manager+ (assigned approver, owner, or finance_admin)
Side effects: Sets deductionWaived=true, waivedBy, waivedReason, logs audit event
```

### Internal Functions

#### `autoCloseIncompleteSessions` (internalMutation)
Cron: Close incomplete sessions at end of work schedule.
```
Args: {}
Trigger: Daily at midnight UTC
Side effects: For each incomplete record past end-of-day, sets checkOutTime to schedule endTime, status to "auto_closed"
```

---

## timesheets.ts

### Queries

#### `getMyTimesheets` (query)
Get current user's timesheets.
```
Args: { businessId: string, year?: number, limit?: number }
Returns: Timesheet[]
Auth: Authenticated employee
```

#### `getById` (query)
Get single timesheet with full detail.
```
Args: { id: string }
Returns: Timesheet (enriched with user, approver info)
Auth: Owner of timesheet, assigned approver, or admin
```

#### `getPendingForManager` (query)
Get timesheets pending manager approval (anomalous only).
```
Args: { businessId: string }
Returns: Timesheet[] (where status=confirmed AND hasAnomalies=true AND approverId=currentUser)
Auth: Manager+
```

#### `getBusinessTimesheets` (query)
Get all timesheets for a business in a period (admin view).
```
Args: { businessId: string, periodStartDate: string, status?: string }
Returns: Timesheet[] (enriched with user info)
Auth: Owner/finance_admin
```

### Mutations

#### `confirm` (mutation)
Employee confirms their timesheet.
```
Args: { id: Id<"timesheets"> }
Returns: void
Auth: Timesheet owner
Side effects: status → confirmed, confirmedAt set, confirmedBy "employee". If no anomalies → auto-approve (status → approved). If anomalies → routes to approverId.
Validation: Status must be "draft"
```

#### `editEntry` (mutation)
Employee edits a daily entry in their timesheet.
```
Args: { id: Id<"timesheets">, date: string, checkInTime?: number, checkOutTime?: number, reason: string }
Returns: void
Auth: Timesheet owner
Side effects: Updates daily entry, recalculates totals, adds "manual_edit" anomaly flag, logs audit
Validation: Status must be "draft" or "confirmed" (if confirmed, resets to draft for re-confirmation)
```

#### `approve` (mutation)
Manager approves a timesheet.
```
Args: { id: Id<"timesheets">, notes?: string }
Returns: void
Auth: Assigned approver, owner, or finance_admin
Side effects: status → approved, approvedAt set, logs audit
Validation: Status must be "confirmed"
```

#### `reject` (mutation)
Manager rejects a timesheet back to employee.
```
Args: { id: Id<"timesheets">, reason: string }
Returns: void
Auth: Assigned approver, owner, or finance_admin
Side effects: status → draft (back to employee), approverNotes set, logs audit
Validation: Status must be "confirmed", reason required
```

### Internal Functions

#### `generateTimesheets` (internalMutation)
Cron: Auto-generate timesheets for completed pay periods.
```
Args: {}
Trigger: Daily at 1:00 AM UTC
Logic:
  1. For each business with active pay_period_config
  2. Check if a period just ended (based on frequency + startDay)
  3. For each tracked employee, generate timesheet by:
     a. Fetching attendance_records for the period
     b. Fetching approved leave_requests overlapping the period
     c. Fetching public_holidays for the period
     d. Calculating regular/OT hours per day using work_schedule + overtime_rules
     e. Classifying attendance status per day
     f. Detecting anomalies
     g. Inserting timesheet with status "draft"
```

#### `autoConfirmPastDeadline` (internalMutation)
Cron: Auto-confirm timesheets past confirmation deadline.
```
Args: {}
Trigger: Daily at 2:00 AM UTC
Logic:
  1. Find timesheets with status "draft"
  2. Check if confirmationDeadlineDays has passed since periodEndDate
  3. Auto-confirm (confirmedBy: "system")
  4. Apply same routing logic as manual confirm
```

---

## workSchedules.ts

### Queries

#### `list` (query)
```
Args: { businessId: string, activeOnly?: boolean }
Returns: WorkSchedule[]
Auth: Manager+
```

#### `getById` (query)
```
Args: { id: string }
Returns: WorkSchedule
Auth: Manager+
```

### Mutations

#### `create` (mutation)
```
Args: { businessId, name, startTime, endTime, workDays, breakMinutes, graceMinutes, overtimeRuleId?, isDefault }
Returns: Id<"work_schedules">
Auth: Owner/finance_admin
Validation: Time format, workDays valid, if isDefault=true → unset other defaults
```

#### `update` (mutation)
```
Args: { id, ...partial fields }
Returns: void
Auth: Owner/finance_admin
```

#### `remove` (mutation)
```
Args: { id }
Returns: void
Auth: Owner/finance_admin
Validation: Not assigned to any employees, not the only active schedule
```

---

## overtimeRules.ts

### Queries

#### `list` (query)
```
Args: { businessId: string }
Returns: OvertimeRule[]
Auth: Manager+
```

### Mutations

#### `create` (mutation)
```
Args: { businessId, name, calculationBasis, dailyThresholdHours?, weeklyThresholdHours?, requiresPreApproval, rateTiers }
Returns: Id<"overtime_rules">
Auth: Owner/finance_admin
Validation: At least one rate tier, thresholds match calculation basis
```

#### `update` (mutation)
```
Args: { id, ...partial fields }
Returns: void
Auth: Owner/finance_admin
```

---

## payPeriodConfigs.ts

### Queries

#### `getActive` (query)
```
Args: { businessId: string }
Returns: PayPeriodConfig | null
Auth: Manager+
```

### Mutations

#### `createOrUpdate` (mutation)
```
Args: { businessId, frequency, startDay, confirmationDeadlineDays }
Returns: Id<"pay_period_configs">
Auth: Owner/finance_admin
Side effects: Deactivates previous config, creates new one as active
```

---

## payrollAdjustments.ts

### Queries

#### `listForPeriod` (query)
```
Args: { businessId: string, periodStartDate?: string }
Returns: PayrollAdjustment[]
Auth: Owner/finance_admin
```

### Mutations

#### `create` (mutation)
```
Args: { businessId, userId, originalTimesheetId, adjustmentType, minutes, overtimeTier?, reason }
Returns: Id<"payroll_adjustments">
Auth: Owner/finance_admin
Validation: Original timesheet must be locked, reason required
```

---

## Payroll Export Extension

### Export Module Addition

Extend existing `ExportModule` type:
```typescript
type ExportModule = "expense" | "leave" | "timesheet"
```

### Pre-built Templates

#### `SQL_PAYROLL_TIMESHEET`
```
EMP_NAME, EMP_ID, PERIOD_START, PERIOD_END, REGULAR_HOURS, OT_1_5X_HOURS, OT_2_0X_HOURS, OT_3_0X_HOURS, LEAVE_DAYS, DEDUCTION_HOURS, NET_PAYABLE_HOURS
```

#### `GENERIC_TIMESHEET`
```
Employee Name, Employee ID, Email, Department, Country, Period Start, Period End, Regular Hours, Standard OT Hours, Rest Day OT Hours, Holiday OT Hours, Total OT Hours, Leave Days (Annual), Leave Days (Sick), Leave Days (Other), Attendance Deduction Hours, Net Payable Hours, Adjustment Hours, Status
```

### Timesheet Field Definitions

New field definitions for the export template builder:

| Category | Field Path | Label |
|----------|-----------|-------|
| Employee | employee.name | Employee Name |
| Employee | employee.employeeId | Employee ID |
| Employee | employee.email | Email |
| Employee | employee.department | Department |
| Employee | employee.countryCode | Country |
| Period | periodStartDate | Period Start |
| Period | periodEndDate | Period End |
| Hours | totalRegularHours | Regular Hours |
| Hours | totalOvertimeHours | Total OT Hours |
| Hours | netPayableHours | Net Payable Hours |
| OT Detail | overtimeByTier.standard | Standard OT Hours (1.5x) |
| OT Detail | overtimeByTier.restDay | Rest Day OT Hours (2.0x) |
| OT Detail | overtimeByTier.publicHoliday | Holiday OT Hours (3.0x) |
| Leave | leaveDays.annual | Annual Leave Days |
| Leave | leaveDays.sick | Sick Leave Days |
| Leave | leaveDays.other | Other Leave Days |
| Leave | leaveDays.total | Total Leave Days |
| Attendance | attendanceDeductionHours | Attendance Deduction Hours |
| Attendance | publicHolidayDays | Public Holiday Days |
| Adjustments | adjustmentHours | Adjustment Hours (from previous period) |
| Workflow | status | Timesheet Status |
| Workflow | confirmedAt | Confirmed Date |
| Workflow | approvedAt | Approved Date |
