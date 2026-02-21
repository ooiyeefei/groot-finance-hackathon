# Feature Specification: Timesheet & Attendance for Payroll

**Feature Branch**: `018-timesheet-attendance`
**Created**: 2026-02-20
**Status**: Draft
**Related Issue**: [#146 - Leave & Time-Off Management Module](https://github.com/grootdev-ai/groot-finance/issues/146)
**Input**: Add timesheet and attendance features related to payroll calculation for SEA SMEs, with AI-first differentiation over traditional competitors (QuickHR, Workday)

## Context & Differentiation

FinanSEAL already has a fully functional leave management system with approval workflows, balance tracking, and public holiday support for 6 SEA countries. This feature extends the platform with timesheet and attendance capabilities — specifically the minimum needed for payroll calculation.

**AI-First Approach vs. Traditional Competitors:**

| Aspect | Traditional (QuickHR, Workday) | FinanSEAL AI-First |
|--------|-------------------------------|---------------------|
| Time entry | Manual clock-in/clock-out, biometric devices | Smart check-in (mobile tap, auto-detect) with AI-generated timesheets |
| Timesheet review | Manager reviews every entry | Approval-by-exception: AI flags only anomalies for review |
| Overtime tracking | Manual rules, manual flagging | AI detects OT patterns and alerts proactively |
| Payroll prep | Manual data extraction and reconciliation | Auto-generated payroll-ready summaries |
| Attendance monitoring | Hardware-dependent (kiosk, biometric) | Lightweight mobile-first with optional geofencing |
| Error correction | After-the-fact corrections requiring paperwork | AI suggests corrections before payroll closes |

## Clarifications

### Session 2026-02-20

- Q: Is check-in mandatory or optional for employees? → A: Configurable per business (purchased module). Businesses that enable the module assign specific employees to attendance tracking. For tracked employees, check-in is mandatory — missing check-ins are anomalies requiring resolution before payroll. Non-tracked employees are unaffected.
- Q: How do attendance exceptions (lateness, early departure) affect payroll? → A: Hours-based. Lateness/early departure automatically reduces net payable hours (e.g., 30 min late = 0.5 hours deducted). Managers can waive the deduction per exception. No monetary deduction — the external payroll system handles financial impact.
- Q: What happens when an employee doesn't confirm their timesheet? → A: Auto-confirm after a configurable deadline (default: 2 business days after period close). Unconfirmed timesheets auto-confirm as-is and proceed to the normal approval flow. Auto-confirmation is logged as a system action in the audit trail.
- Q: Can finalized/exported pay periods be reopened for corrections? → A: No. Finalized periods are locked. Corrections are recorded as adjustment entries applied to the next pay period's export. This preserves audit trail integrity and avoids re-exporting data already consumed by payroll systems.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee Records Daily Work Hours (Priority: P1)

An employee opens the FinanSEAL mobile or web app and checks in at the start of their workday with a single tap. Throughout the day, the system tracks their work session. At the end of the day, they check out. The system calculates total work hours, break time, and flags if overtime was worked. At the end of the week, the employee sees an auto-generated timesheet summarizing their daily hours, overtime, and leave taken — they simply confirm or adjust.

**Why this priority**: Without daily work hour recording, there is no data for payroll calculation. This is the foundational capability everything else depends on.

**Independent Test**: Can be fully tested by having an employee check in, check out, and view their auto-generated weekly timesheet with calculated hours.

**Acceptance Scenarios**:

1. **Given** an employee is on a workday, **When** they tap "Check In" on the app, **Then** the system records their check-in time and shows an active work session indicator.
2. **Given** an employee has an active work session, **When** they tap "Check Out", **Then** the system records check-out time and calculates total hours worked for the day.
3. **Given** an employee has worked 5 days in a week, **When** the weekly timesheet period ends, **Then** the system auto-generates a timesheet with daily hours, total regular hours, overtime hours, and leave days — pre-filled and ready for confirmation.
4. **Given** an employee reviews their auto-generated timesheet, **When** they find an incorrect entry, **Then** they can edit the specific day's hours with a reason and resubmit for review.
5. **Given** an employee forgot to check out, **When** they open the app the next day, **Then** the system flags the incomplete session and suggests a check-out time based on their usual pattern.

---

### User Story 2 - AI Auto-Generates Payroll-Ready Timesheet Summaries (Priority: P1)

At the end of each pay period (weekly, bi-weekly, or monthly — configurable per business), the system automatically generates a payroll-ready summary for each employee. This summary includes: total regular hours worked, overtime hours (broken down by rate tier if applicable), leave days taken (by type), public holidays, and attendance exceptions (late arrivals, early departures, missing check-ins). The summary is presented to the employee for confirmation, then routed to the manager for approval. Only exceptions and anomalies require manager attention — normal timesheets are auto-approved.

**Why this priority**: This is the core payroll integration output. Without a consolidated, accurate summary of hours and attendance, payroll cannot be calculated.

**Independent Test**: Can be tested by running a pay period close and verifying the auto-generated summary matches the underlying daily records, with correct OT calculations and leave deductions.

**Acceptance Scenarios**:

1. **Given** a pay period has ended, **When** the system generates the payroll summary, **Then** it includes total regular hours, overtime hours, leave days by type, public holidays, and net payable hours for each employee.
2. **Given** an employee's timesheet has no anomalies (all check-ins/outs recorded, hours within normal range), **When** the employee confirms the timesheet, **Then** it is auto-approved without requiring manager review.
3. **Given** a timesheet has anomalies (missing check-ins, overtime exceeding threshold, manual edits), **When** the summary is generated, **Then** the manager receives a notification highlighting only the anomalies for review.
4. **Given** an employee was on approved leave for certain days, **When** the payroll summary is generated, **Then** those days show the correct leave type and are excluded from expected work hours.

---

### User Story 3 - Manager Reviews Attendance Exceptions (Priority: P2)

A manager sees a dashboard showing their team's attendance status for the current period. Instead of reviewing every timesheet line-by-line, the system highlights only exceptions: late arrivals, early departures, missing check-ins/outs, overtime exceeding thresholds, and pattern anomalies (e.g., consistently late on specific days). The manager can approve, adjust, or flag individual entries. Once all exceptions are resolved, the team's payroll summary is finalized.

**Why this priority**: Managers need to validate attendance data before payroll runs, but reviewing every entry is inefficient. Exception-based review is the AI-first differentiator.

**Independent Test**: Can be tested by creating a team with mixed attendance patterns (some normal, some with anomalies) and verifying the manager only sees flagged items.

**Acceptance Scenarios**:

1. **Given** a manager has 10 team members, **When** they open the attendance review dashboard, **Then** they see a summary card for each member showing status (clean/has exceptions) and only members with exceptions are expanded by default.
2. **Given** an employee checked in 30+ minutes after their scheduled start time, **When** the manager reviews exceptions, **Then** the late arrival is highlighted with the actual vs. expected time and the employee's provided reason (if any).
3. **Given** a manager approves all exceptions for a team member, **When** they finalize, **Then** the employee's payroll summary status changes to "Approved" and is included in the payroll export.
4. **Given** a manager wants to adjust an employee's recorded hours, **When** they edit the entry, **Then** the system requires a reason for the adjustment and logs it in the audit trail.

---

### User Story 4 - Admin Configures Work Schedules & Overtime Rules (Priority: P2)

An admin sets up the company's work schedule: standard working hours (e.g., 9:00 AM - 6:00 PM), work days (e.g., Monday-Friday), and break duration. They also configure overtime rules: OT threshold (hours per day/week), OT rate multipliers (1.5x for first 4 OT hours, 2.0x for rest day work, 3.0x for public holiday work), and whether OT requires pre-approval. These configurations apply per business and can be overridden per employee group or individual.

**Why this priority**: Work schedule and OT rules are the foundation for all payroll calculations. Without them, the system cannot determine regular vs. overtime hours.

**Independent Test**: Can be tested by configuring a work schedule and OT rules, then having employees record time that crosses OT thresholds, and verifying correct hour classification.

**Acceptance Scenarios**:

1. **Given** an admin navigates to business settings, **When** they configure work schedule (start time, end time, work days, break duration), **Then** the schedule is saved and applied to all employees by default.
2. **Given** an admin configures OT rules with rate tiers, **When** an employee works beyond regular hours, **Then** the system automatically classifies excess hours into the correct OT rate tier.
3. **Given** an admin enables "OT requires pre-approval", **When** an employee's hours exceed the OT threshold, **Then** the overtime hours are flagged for manager approval before being included in payroll.
4. **Given** a business operates in Malaysia, **When** an employee works on a public holiday, **Then** the system applies the configured public holiday OT rate (e.g., 3.0x) to those hours.

---

### User Story 5 - Payroll Export with Hours & Attendance Data (Priority: P2)

An admin or finance user exports payroll-ready data for the pay period. The export includes: employee name/ID, total regular hours, overtime hours (by tier), leave days taken, attendance deductions (if any), and net payable hours. The export format supports common payroll systems and can be downloaded as CSV or integrated via future payroll system connections.

**Why this priority**: The ultimate purpose of timesheet and attendance tracking is to feed payroll. This story delivers the tangible business output.

**Independent Test**: Can be tested by running a complete pay period with varied employee scenarios (full attendance, leave, OT, exceptions) and verifying the export accurately reflects all data.

**Acceptance Scenarios**:

1. **Given** all timesheets for a pay period are finalized, **When** the admin clicks "Export Payroll Data", **Then** a CSV file is generated with one row per employee containing: regular hours, OT hours (by tier), leave days (by type), attendance adjustments, and net payable hours.
2. **Given** a pay period includes employees in different countries (MY, SG), **When** the export is generated, **Then** country-specific fields are included (e.g., EPF/SOCSO eligibility flags for Malaysia, CPF flags for Singapore).
3. **Given** some employees have unfinalized timesheets, **When** the admin attempts to export, **Then** the system warns about incomplete timesheets and lists the affected employees, allowing partial export or requiring completion first.

---

### User Story 6 - Smart Attendance Insights & Anomaly Detection (Priority: P3)

The AI assistant (existing chat feature) can answer attendance-related questions: "Who hasn't checked in today?", "Show me overtime trends for this month", "Which employees have attendance anomalies this period?". The system also proactively surfaces insights: teams approaching overtime budget limits, employees with recurring late patterns, and attendance trends that may indicate workload issues.

**Why this priority**: This is the AI-first differentiator — turning raw attendance data into actionable insights. However, it builds on top of the core tracking features (P1/P2).

**Independent Test**: Can be tested by asking the AI assistant attendance questions and verifying accurate, contextual responses.

**Acceptance Scenarios**:

1. **Given** an admin asks the chat "Who hasn't checked in today?", **When** the AI processes the query, **Then** it returns a list of employees who have not checked in by a reasonable hour on the current workday.
2. **Given** an employee has been late more than 3 times in the current month, **When** the manager views the team dashboard, **Then** a proactive insight is shown: "3 employees have recurring late patterns this month."
3. **Given** a team's overtime hours are approaching the configured monthly budget, **When** the threshold is 80% reached, **Then** the manager receives a notification with the AI's recommendation.

---

### Edge Cases

- What happens when an employee checks in but forgets to check out? The system auto-closes the session at end of the configured work schedule and flags it as an anomaly for the employee to correct.
- What happens when an employee checks in from a location outside the geofence (if enabled)? The check-in is recorded but flagged with the actual location for manager visibility.
- What happens when a public holiday falls on a workday and the employee works? The hours are classified under the public holiday OT rate automatically.
- What happens when an employee works on a day they have approved leave? The system detects the conflict and asks the employee to either cancel the leave or discard the attendance record.
- What happens when the pay period spans a month boundary? The system handles split periods, prorating as needed and attributing hours to the correct pay period.
- What happens when an employee changes work schedule mid-period? The system applies the old schedule for days before the change and the new schedule for days after.
- What happens when overtime rules change mid-period? Existing OT hours remain classified under the old rules; new OT from the change date uses updated rules.
- How does the system handle part-time employees with different scheduled hours? Part-time schedules are configured per employee, and OT thresholds are calculated proportionally.
- What happens when an employee doesn't confirm their timesheet before the deadline? The system auto-confirms the timesheet as-is after the configurable deadline (default: 2 business days). The auto-confirmation is logged as a system action in the audit trail, and the timesheet proceeds to the normal approval flow.
- What happens when a payroll error is discovered after export? The exported pay period is locked. Admins create adjustment entries that are applied to the next pay period's export, preserving audit trail integrity.

## Requirements *(mandatory)*

### Functional Requirements

**Daily Time Recording**

- **FR-001**: System MUST allow tracked employees to check in and check out via mobile or web with a single tap. The timesheet & attendance module is a purchasable feature; businesses that enable it assign specific employees to attendance tracking. For tracked employees, daily check-in is mandatory.
- **FR-002**: System MUST record check-in and check-out timestamps and calculate total hours worked per day, excluding configured break duration.
- **FR-003**: System MUST detect and flag incomplete sessions (check-in without check-out, or vice versa) and missing check-ins for tracked employees, treating both as anomalies requiring resolution before payroll. The system suggests corrections based on the employee's work schedule.
- **FR-004**: System MUST support optional geofencing for check-in/check-out, recording the employee's location at the time of the action.
- **FR-005**: System MUST allow employees to manually add or edit time entries with a required reason, subject to manager approval.

**Timesheet Generation & Management**

- **FR-006**: System MUST auto-generate timesheets at the end of each pay period (weekly, bi-weekly, or monthly — configurable per business).
- **FR-007**: Auto-generated timesheets MUST include: daily hours worked, break time, overtime hours (classified by rate tier), approved leave days (by type), public holidays, and attendance flags.
- **FR-008**: Employees MUST be able to review and confirm their auto-generated timesheet, or edit specific entries with reasons. If an employee does not confirm within a configurable deadline (default: 2 business days after period close), the timesheet auto-confirms as-is and proceeds to the approval flow. Auto-confirmation is logged as a system action.
- **FR-009**: Confirmed timesheets with no anomalies MUST be auto-approved without requiring manager review (approval-by-exception).
- **FR-010**: Timesheets with anomalies (missing check-ins, manual edits, OT exceeding threshold) MUST be routed to the assigned manager for review.

**Overtime Calculation**

- **FR-011**: System MUST automatically classify hours as regular or overtime based on configured work schedule and OT thresholds.
- **FR-012**: System MUST support tiered overtime rates (e.g., 1.5x for standard OT, 2.0x for rest day, 3.0x for public holiday) configurable by the admin.
- **FR-013**: System MUST calculate overtime at the daily level and/or weekly level based on admin configuration (country-specific labor law compliance).
- **FR-014**: System MUST support optional OT pre-approval, where overtime hours require manager approval before being eligible for payroll.

**Work Schedule & Configuration**

- **FR-015**: Admin MUST be able to configure default work schedules: start time, end time, work days, and break duration.
- **FR-016**: Admin MUST be able to create multiple work schedule profiles (e.g., "Standard Office", "Shift A", "Part-Time") and assign them to employees.
- **FR-017**: Admin MUST be able to configure overtime rules: OT threshold (daily/weekly), rate tiers with multipliers, and whether OT requires pre-approval.
- **FR-018**: Admin MUST be able to configure pay periods (weekly, bi-weekly, monthly) with start day and cutoff rules.

**Attendance Tracking & Exception Management**

- **FR-019**: System MUST track attendance status for each workday: present (on-time), late, early departure, absent, on leave, or public holiday.
- **FR-020**: System MUST define "late" and "early departure" based on configurable grace periods (e.g., 15-minute grace period after scheduled start).
- **FR-021**: System MUST allow managers to review and resolve attendance exceptions (approve, adjust, or waive). Lateness and early departure automatically reduce net payable hours (e.g., 30 min late = 0.5 hours deducted from that day). Managers can waive the deduction for individual exceptions.
- **FR-022**: All attendance adjustments and manager actions MUST be logged in the audit trail with timestamp, actor, and reason.

**Payroll Integration**

- **FR-023**: System MUST generate payroll-ready summaries per employee per pay period, including: regular hours, overtime hours by tier, leave days by type, attendance deductions, and net payable hours.
- **FR-024**: System MUST support exporting payroll summaries as CSV with configurable columns.
- **FR-025**: Payroll export MUST include country-specific compliance fields relevant to the employee's registered country (e.g., OT rate classification labels).
- **FR-026**: System MUST prevent payroll export for pay periods with unfinalized timesheets, showing a clear list of employees requiring action.
- **FR-026a**: Once a pay period is exported, the system MUST lock it — no edits to timesheets or attendance records for that period. Corrections MUST be recorded as adjustment entries applied to the next pay period's export.
- **FR-026b**: The payroll export MUST include a separate adjustments section listing any corrections carried forward from previous periods, with references to the original period and reason.

**Leave Integration**

- **FR-027**: System MUST integrate with the existing leave management system to automatically reflect approved leave days in timesheets and payroll summaries.
- **FR-028**: System MUST detect conflicts between attendance records and approved leave (e.g., employee checked in on a leave day) and prompt for resolution.

### Key Entities

- **Attendance Record**: A single check-in/check-out pair for a tracked employee on a specific date. Attributes: employee, date, check-in time, check-out time, total hours, break time, location (optional), status (complete/incomplete/flagged), source (manual/auto), lateness duration, early departure duration, hours deducted (auto-calculated from lateness/early departure, waivable by manager).
- **Work Schedule**: A configuration defining standard working hours for a group of employees. Attributes: name, start time, end time, work days, break duration, grace period, business association.
- **Overtime Rule**: Configuration for how excess hours are classified and rated. Attributes: OT threshold (daily/weekly), rate tiers (multiplier + hour range), pre-approval requirement, business association.
- **Timesheet**: A periodic summary of an employee's work hours for a pay period. Attributes: employee, pay period (start/end dates), daily entries, total regular hours, total OT hours (by tier), leave days, attendance flags, status (draft/confirmed/approved/finalized/locked), approver. Finalized timesheets become locked after payroll export; corrections are forward adjustments.
- **Payroll Adjustment**: A correction entry for a previously locked pay period. Attributes: employee, original period reference, adjustment type (hours add/deduct), amount, reason, created by, applied-to period.
- **Payroll Summary**: An export-ready aggregation of an employee's timesheet, leave, and attendance data for a pay period. Attributes: employee, period, regular hours, OT hours by tier, leave breakdown, attendance adjustments, net payable hours, compliance fields.
- **Pay Period Configuration**: Business-level setting defining payroll cycle. Attributes: frequency (weekly/bi-weekly/monthly), start day, cutoff rules, employee confirmation deadline (default: 2 business days), business association.

## Assumptions

- The timesheet & attendance module is a purchasable feature. Businesses enable it and assign specific employees to attendance tracking. Non-tracked employees are unaffected.
- Tracked employees are expected to have smartphones or web access for check-in/check-out; no hardware (biometric/kiosk) is required for V1. For tracked employees, daily check-in is mandatory — missing check-ins are anomalies.
- Work schedules follow a regular pattern (same hours each workday); shift rotation scheduling is out of scope for V1.
- OT rate tiers follow SEA labor law conventions: standard OT (1.5x), rest day (2.0x), public holiday (3.0x) — specific rates are configurable per business.
- Geofencing is optional and disabled by default; businesses can enable it if needed.
- The existing approval workflow pattern (manager hierarchy, fallback routing) will be reused for timesheet approvals.
- The existing leave management and public holiday data will be consumed directly — no duplication.
- Payroll calculation itself (salary computation, tax deductions, statutory contributions) is out of scope; this feature provides the **input data** for payroll systems.
- Part-time employees use proportional OT thresholds based on their configured schedule.
- Break duration is a single configurable value per schedule (not tracked via check-in/check-out for breaks in V1).

## Out of Scope (V1)

- **Salary/tax calculation**: This feature provides hours and attendance data, not actual payroll processing.
- **Statutory contribution calculation**: EPF, SOCSO, CPF etc. are calculated by payroll systems consuming our export.
- **Shift rotation scheduling**: Complex shift patterns with rotating schedules. V1 supports fixed schedules only.
- **Break tracking via check-in/check-out**: Breaks are a configured duration, not individually tracked.
- **Biometric or hardware integration**: V1 is mobile/web only.
- **Direct payroll system integration (API)**: V1 supports CSV export; API integration is future.
- **Time-in-lieu / compensatory time off**: Requires deeper leave-attendance coupling, deferred to V2.
- **Project/task-based time tracking**: Billable hours allocation to clients/projects.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Employees can check in and check out in under 5 seconds (single tap from dashboard).
- **SC-002**: 90% of timesheets are auto-approved without manager intervention (approval-by-exception working effectively).
- **SC-003**: Payroll-ready export can be generated within 1 minute for a business with up to 200 employees.
- **SC-004**: Overtime hours are correctly classified into rate tiers with 100% accuracy against configured rules.
- **SC-005**: Managers spend less than 5 minutes per pay period reviewing team attendance exceptions (vs. reviewing all timesheets).
- **SC-006**: 100% of attendance adjustments are captured in the audit trail with actor and reason.
- **SC-007**: Leave data from the existing leave management system is accurately reflected in 100% of timesheets.
- **SC-008**: 80% of businesses using leave management adopt timesheet & attendance within 3 months of launch.
