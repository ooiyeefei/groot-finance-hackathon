# Feature Specification: Leave Management P1 Enhancements

**Feature Branch**: `034-leave-enhance`
**Created**: 2026-03-23
**Status**: Draft
**Input**: GitHub Issue #378 — P1 enhancements for leave management (team overlap warnings, push notifications, bulk import, reports & export, leave year configuration)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Team Overlap Conflict Warnings (Priority: P1)

A manager reviewing a leave approval request receives an automatic warning when other team members already have approved leave during the same period. The warning shows how many team members are absent and on which dates, helping the manager make an informed approval decision without manually checking the team calendar.

**Why this priority**: Approving overlapping leave can leave teams understaffed. This is a high-impact, low-effort enhancement — the overlap detection logic already exists in the team calendar backend. The gap is surfacing it at the decision point (the approval action) rather than requiring the manager to separately check the calendar.

**Independent Test**: Can be tested by creating two overlapping leave requests for the same team, then verifying the approval dialog shows a warning for the second request.

**Acceptance Scenarios**:

1. **Given** a submitted leave request for Jan 6-10, **When** a manager clicks "Approve" and 2 other team members have approved leave overlapping those dates, **Then** a warning dialog appears showing "2 team members are on leave during these dates" with a breakdown of who is absent and on which overlapping dates, with options to proceed or cancel the approval.
2. **Given** a submitted leave request for Jan 6-10, **When** a manager clicks "Approve" and no team members have approved leave overlapping those dates, **Then** the approval proceeds immediately with no warning dialog.
3. **Given** a submitted leave request for Jan 6-10, **When** a manager reviews the warning and clicks "Approve Anyway", **Then** the leave is approved as normal and the balance is deducted.
4. **Given** a submitted leave request, **When** the overlap check runs, **Then** both approved and submitted (pending) requests from team members in the same reporting group (direct reports of the same manager) are considered — not the entire company.
5. **Given** a submitted leave request for Jan 6-10, **When** the manager is viewing the approval dialog warning, **Then** each overlapping team member's name, leave type, and overlapping dates are visible.

---

### User Story 2 - Mobile Push Notifications for Leave (Priority: P1)

Managers receive a push notification on their mobile device (iOS and Android) when an employee submits a leave request. Employees receive a push notification when their leave is approved or rejected. Tapping the notification opens the relevant page in the app (approval page for managers, leave details for employees).

**Why this priority**: The current email-only notification has low visibility — managers miss approvals for days, blocking employees. Push notifications create a real-time approval loop critical for team operations. APNs infrastructure (P8 keys in SSM) is already deployed for iOS; FCM (Firebase Cloud Messaging) is added for Android to cover the SEA market where Android is dominant.

**Independent Test**: Can be tested by submitting a leave request and verifying the manager's device receives a push notification, then tapping it opens the approval page.

**Acceptance Scenarios**:

1. **Given** an employee submits a leave request, **When** the request is submitted, **Then** the assigned manager receives a push notification titled "New Leave Request" with the employee's name and date range.
2. **Given** a manager approves a leave request, **When** the approval is saved, **Then** the requesting employee receives a push notification titled "Leave Approved" with the approved dates.
3. **Given** a manager rejects a leave request, **When** the rejection is saved, **Then** the requesting employee receives a push notification titled "Leave Rejected" with the rejection reason summary.
4. **Given** a user taps a "New Leave Request" notification on their device, **When** the app opens, **Then** they are taken directly to the leave approval page with the relevant request highlighted.
5. **Given** a user taps a "Leave Approved/Rejected" notification, **When** the app opens, **Then** they are taken directly to their leave details page.
6. **Given** a user has disabled push notifications in their notification preferences, **When** a leave event triggers, **Then** no push notification is sent (in-app and email still function per existing preferences).

---

### User Story 3 - Bulk Import Leave Balances (Priority: P2)

An admin onboarding a new business or migrating from another system can upload a CSV file containing employee leave balances. The system maps columns, validates data, and creates or updates leave balance records for all employees in one operation.

**Why this priority**: Manual per-employee balance setup via the settings page is impractical for businesses with 20+ employees. This removes the biggest friction in onboarding. The CSV import shared library already handles parsing, column mapping, and validation — this story configures it for leave balance data.

**Independent Test**: Can be tested by preparing a CSV with employee names/emails, leave types, and entitled days, uploading it in leave management settings, and verifying balances are created correctly.

**Acceptance Scenarios**:

1. **Given** an admin is on the leave management settings page, **When** they click "Import Balances", **Then** a CSV import modal opens with drag-and-drop file upload supporting CSV and XLSX formats.
2. **Given** a CSV file is uploaded with columns like "Employee Email", "Leave Type", "Year", "Entitled Days", "Used Days", "Carry Over", **When** the file is parsed, **Then** columns are automatically mapped to leave balance fields (using alias matching and AI fallback), and the admin can review and adjust mappings. The "Year" column is required and determines which leave year the balance applies to.
3. **Given** the column mapping is confirmed, **When** data is previewed, **Then** a summary shows total rows, valid rows, and skipped rows with reasons (e.g., "Employee email not found", "Leave type code not recognized").
4. **Given** the admin confirms the import, **When** balances are created, **Then** each valid row creates or updates a leave balance record for the specified employee, leave type, and year. Existing balances for the same employee/type/year are updated (not duplicated).
5. **Given** a CSV row references an employee email that doesn't exist in the business, **When** validation runs, **Then** the row is flagged as invalid with a clear error message and skipped during import.
6. **Given** a CSV row references a leave type code that doesn't exist, **When** validation runs, **Then** the row is flagged as invalid with the unrecognized code shown.
7. **Given** a successful import, **When** the operation completes, **Then** a summary shows how many balances were created, updated, and skipped, with a downloadable error report for skipped rows.

---

### User Story 4 - Leave Reports & Export (Priority: P2)

An admin or finance user can generate leave utilization reports, view absence trends, and export leave data as CSV or PDF. Reports include leave balance summaries across all employees, utilization rates by team, and monthly absence trends.

**Why this priority**: Without reporting, admins cannot measure leave patterns, plan staffing, or provide board-level summaries. This is essential for the CFO Copilot persona. Ranked P2 because the data exists — this story is about aggregation and presentation.

**Independent Test**: Can be tested by navigating to a leave reports section, generating a utilization report, verifying the data matches known leave balances, and downloading the export.

**Acceptance Scenarios**:

1. **Given** an admin navigates to leave management, **When** they select the "Reports" tab, **Then** they see report options: Leave Balance Summary, Leave Utilization, and Absence Trends.
2. **Given** the admin selects "Leave Balance Summary", **When** the report generates, **Then** it shows each employee's entitled, used, remaining, and carry-over days broken down by leave type for the selected year.
3. **Given** the admin selects "Leave Utilization", **When** the report generates, **Then** it shows utilization rates (used/entitled as percentage) by team, with visual indicators (charts) for high and low utilization.
4. **Given** the admin selects "Absence Trends", **When** the report generates, **Then** it shows a monthly breakdown of total absence days across the business, highlighting peak absence months.
5. **Given** any report is displayed, **When** the admin clicks "Export CSV", **Then** the report data downloads as a CSV file with appropriate headers and formatting.
6. **Given** any report is displayed, **When** the admin clicks "Export PDF", **Then** a formatted PDF report is generated and downloaded with the business name, report title, date range, and tabular data.
7. **Given** a manager views reports, **When** they generate any report, **Then** they only see data for their direct reports (not the entire company).

---

### User Story 5 - Leave Year Configuration (Priority: P3)

An admin can configure when the leave year starts for their business. Some SEA businesses use a fiscal year (e.g., April-March) rather than the calendar year (January-December). This setting affects balance calculations, carryover timing, and report date ranges.

**Why this priority**: Currently hardcoded to calendar year. While most Malaysian businesses use Jan-Dec, Singapore and other SEA countries commonly use Apr-Mar or Jul-Jun fiscal years. This is P3 because it affects a smaller subset of users, but is important for regional expansion.

**Independent Test**: Can be tested by configuring a business to use April-March leave year, then verifying that a leave request in March 2027 draws from the Apr 2026-Mar 2027 balance period, and carryover happens in April.

**Acceptance Scenarios**:

1. **Given** an admin is on the leave management settings page, **When** they look at general settings, **Then** they see a "Leave Year Start Month" dropdown (January through December), defaulting to January.
2. **Given** the admin changes the leave year start to April, **When** the setting is saved, **Then** all balance calculations for the business use April-March as the leave year boundary.
3. **Given** a leave year of April-March is configured, **When** an employee views their balance in July 2026, **Then** the balance shown is for the period Apr 2026 - Mar 2027 (not Jan-Dec 2026).
4. **Given** a leave year of April-March is configured, **When** the annual carryover process runs, **Then** carryover from the previous year (Apr 2025-Mar 2026) is applied at the start of April 2026.
5. **Given** a business changes their leave year start month mid-year, **When** the setting is saved, **Then** a warning explains that existing balances for the current period will need manual adjustment, and the new year boundary takes effect from the next leave year cycle.
6. **Given** a leave year of April-March is configured, **When** reports are generated, **Then** the default date range for "current year" reflects the configured leave year (Apr-Mar), not the calendar year.

---

### Edge Cases

- **Overlap warning with partial overlap**: Leave A is Jan 6-10, Leave B is Jan 9-12 — warning shows only the 2 overlapping dates (Jan 9-10).
- **Push notification when device token is expired or invalid**: The system handles failed push delivery gracefully (log the failure, don't retry indefinitely, mark token as invalid after repeated failures).
- **CSV import with duplicate rows**: If two rows reference the same employee + leave type + year, the later row overwrites the earlier one (last-write-wins within the same import).
- **Report generation with no data**: When a business has no leave requests for the selected period, reports show an empty state with a helpful message, not an error.
- **Leave year change with in-flight requests**: Submitted but not-yet-approved requests remain valid under the year they were submitted for. The year change only affects future balance periods.
- **Bulk import for employees who haven't been assigned leave balances yet**: The import creates new balance records (does not require pre-existing ones).
- **Manager approving own leave**: The overlap warning does not count the approver's own leave (they are the approver, not a conflicting team member). Self-approval routing follows existing business rules.
- **Push notification deep link when app is not installed**: Gracefully falls back — the notification still appears but tapping it opens the web URL instead.

## Requirements *(mandatory)*

### Functional Requirements

**Team Overlap Warnings (M4)**
- **FR-001**: System MUST check for overlapping approved and submitted leave requests among the approver's direct reports when a manager initiates an approval action.
- **FR-002**: System MUST display a warning dialog showing the count of overlapping team members, their names, leave types, and the specific overlapping dates.
- **FR-003**: System MUST allow the manager to proceed with approval or cancel after reviewing the warning.
- **FR-004**: System MUST NOT show a warning when no overlapping leave exists.
- **FR-005**: Overlap detection MUST only consider team members within the same reporting group (direct reports of the same manager/approver), and MUST include both approved and submitted (pending) leave requests.

**Mobile Push Notifications (M5)**
- **FR-006**: System MUST send a push notification to the assigned manager when an employee submits a leave request.
- **FR-007**: System MUST send a push notification to the requesting employee when their leave is approved or rejected.
- **FR-008**: Push notifications MUST include a deep link that opens the relevant page in the mobile app (approval page for managers, leave details for employees).
- **FR-009**: System MUST respect existing notification preferences — if a user has disabled notifications for the "approval" category, push notifications are also suppressed.
- **FR-010**: System MUST register and store device tokens for push notification delivery, supporting both APNs (iOS) and FCM (Android) tokens.
- **FR-011**: System MUST handle invalid or expired device tokens gracefully (mark as invalid after 3 consecutive failures, stop sending).
- **FR-028**: System MUST support sending push notifications via both APNs (iOS) and FCM (Android), using the appropriate service based on the stored device token type.

**Bulk Import Leave Balances (A3)**
- **FR-012**: System MUST provide a CSV/XLSX import interface in leave management settings for admin users.
- **FR-013**: System MUST support automatic column mapping with alias matching and AI-assisted mapping as a fallback.
- **FR-014**: System MUST validate each row against known employees (by email), known leave type codes, and a valid year value before importing. The "Year" column is required.
- **FR-015**: System MUST create new balance records or update existing ones (upsert by employee + leave type + year).
- **FR-016**: System MUST provide a detailed import summary showing created, updated, and skipped row counts with error reasons.
- **FR-017**: System MUST allow the admin to download an error report for skipped rows.

**Leave Reports & Export (A4)**
- **FR-018**: System MUST provide a Leave Balance Summary report showing entitled, used, remaining, and carry-over per employee per leave type.
- **FR-019**: System MUST provide a Leave Utilization report with utilization rates by team.
- **FR-020**: System MUST provide an Absence Trends report showing monthly absence day totals.
- **FR-021**: System MUST support exporting any report as CSV.
- **FR-022**: System MUST support exporting any report as a formatted PDF with business name, report title, and date range.
- **FR-023**: Managers MUST only see report data for their direct reports. Admins see all employees.

**Leave Year Configuration (A7)**
- **FR-024**: System MUST allow admins to configure a leave year start month (1-12) per business, defaulting to January.
- **FR-025**: All balance calculations, carryover logic, and report date ranges MUST respect the configured leave year boundary.
- **FR-026**: System MUST warn admins when changing the leave year start mid-cycle that existing balances may need manual adjustment.
- **FR-027**: Changing the leave year start MUST NOT retroactively modify existing approved leave requests or historical balances.

### Key Entities

- **Leave Request**: An employee's request for time off, with start/end dates, leave type, status, and approver assignment. Extended with overlap metadata during approval.
- **Leave Balance**: An employee's entitlement and usage for a specific leave type and year. Extended with import source tracking (manual vs. CSV import).
- **Device Token**: A mobile device's push notification identifier, linked to a user, with platform type (APNs or FCM), validity status, and last-used timestamp.
- **Leave Report**: A generated aggregation of leave data for a business, scoped by date range, role visibility, and report type (balance summary, utilization, trends).
- **Business Leave Settings**: Per-business configuration including leave year start month, extending the existing business configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Managers see overlap warnings within 2 seconds of clicking "Approve" when conflicts exist.
- **SC-002**: Push notifications are delivered to the manager's device within 30 seconds of a leave submission.
- **SC-003**: An admin can bulk-import 100 employee leave balances in under 3 minutes (upload, map, confirm, complete).
- **SC-004**: Leave Balance Summary report generates and displays within 5 seconds for a business with up to 200 employees.
- **SC-005**: Report exports (CSV and PDF) download within 10 seconds for datasets up to 500 rows.
- **SC-006**: After configuring a non-January leave year, all balance displays and reports reflect the correct year boundary without manual intervention.
- **SC-007**: 90% of managers can complete the approval flow (including reviewing overlap warnings) without external guidance.
- **SC-008**: Zero push notifications are sent to users who have disabled the approval notification category.

## Clarifications

### Session 2026-03-23

- Q: Should push notifications target iOS only (APNs) or both iOS and Android (APNs + FCM)? → A: Both platforms — APNs for iOS and FCM for Android. Capacitor abstracts both under a single plugin API, and Android is the dominant mobile platform in SEA.
- Q: Should overlap warnings include only approved leave, or also submitted (pending) requests? → A: Both approved and submitted requests. Prevents cascading approvals that create understaffing when multiple requests are pending for the same dates.
- Q: How is the balance year determined during CSV import? → A: Year column required in CSV. Supports historical and current year imports for businesses migrating from other systems.

## Assumptions

- The Capacitor mobile app framework (already in use) supports APNs push notification registration and deep linking.
- The existing CSV import shared library (`src/lib/csv-parser/`) can be extended with a leave balance schema definition without modification to the core library.
- The existing `public_holidays` table and business day calculator already handle the correct holidays for overlap detection.
- Reports are generated on-demand (not pre-computed or cached) — acceptable for businesses with up to 200 employees.
- PDF export uses the existing `@react-pdf/renderer` library already in the project.
- Leave year configuration is per-business (not per-employee or per-leave-type).
- Device token registration happens during app initialization (Capacitor plugin handles token retrieval).

## Dependencies

- **APNs SSM Parameters**: P8 signing key, key ID, and team ID must be configured in AWS SSM (infrastructure already deployed via `apns-stack.ts`).
- **FCM Configuration**: Firebase project with Cloud Messaging enabled; server key or service account credentials stored in SSM for Android push delivery.
- **Capacitor Push Plugin**: Mobile app must integrate a push notification plugin for token registration and notification handling.
- **Existing Overlap Detection**: The `teamCalendar.ts` conflict detection logic is the foundation for the approval warning — any changes to it affect this feature.
- **CSV Import Library**: The shared `src/lib/csv-parser/` library must support the leave balance schema type.
- **Notification Preferences Table**: The existing `notification_preferences` structure must be extended to include a push notification channel.
