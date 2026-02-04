# Feature Specification: Leave & Time-Off Management Module

**Feature Branch**: `001-leave-management`
**Created**: 2026-02-03
**Status**: Draft
**Input**: GitHub Issue #146 - Leave & Time-Off Management Module for FinanSEAL with unified workflow, modern UX, and SEA regional compliance

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee Submits Leave Request (Priority: P1)

An employee needs to request time off for personal reasons, vacation, or illness. They access the leave management section, select their dates, choose a leave type (annual, sick, etc.), optionally add notes, and submit the request for manager approval.

**Why this priority**: This is the core functionality - without leave request submission, the entire module has no purpose. Every other feature depends on leave requests existing.

**Independent Test**: Can be fully tested by an employee submitting a leave request and seeing it appear in their pending requests list. Delivers immediate value as users can formally request time off.

**Acceptance Scenarios**:

1. **Given** an employee is logged in with available leave balance, **When** they select dates (e.g., Feb 10-12), choose "Annual Leave", and submit, **Then** the request is created with status "submitted" and routed to their manager.
2. **Given** an employee selects dates that exceed their available balance, **When** they attempt to submit, **Then** the system displays an error message indicating insufficient balance.
3. **Given** an employee has an existing approved leave for Feb 15-17, **When** they try to request leave for Feb 16-18, **Then** the system prevents submission with a message about overlapping dates.
4. **Given** an employee submits a request, **When** submission succeeds, **Then** their manager receives a notification (push/email) about the pending request.

---

### User Story 2 - Manager Approves/Rejects Leave from Unified Queue (Priority: P1)

A manager needs to review and act on pending leave requests from their team members. They access their approval queue, which shows both leave requests and expense claims together, review the details, and approve or reject with a single action.

**Why this priority**: Approval is essential to complete the leave workflow. The unified queue is the primary differentiator vs competitors - managers see all pending items in one place.

**Independent Test**: Can be tested by a manager viewing the unified queue, seeing pending leave requests, and approving/rejecting them. Delivers value as managers can manage time-off efficiently.

**Acceptance Scenarios**:

1. **Given** a manager has pending leave requests and expense claims, **When** they view the approval queue, **Then** both types appear in a single unified list with clear type indicators.
2. **Given** a manager views a leave request, **When** they tap/click "Approve", **Then** the request status changes to "approved", employee balance is deducted, and the employee is notified.
3. **Given** a manager views a leave request, **When** they tap/click "Reject" and provide a reason, **Then** the request status changes to "rejected", balance remains unchanged, and the employee is notified with the rejection reason.
4. **Given** a manager is on mobile, **When** they receive a push notification about a pending request, **Then** they can approve/reject directly from the notification with minimal taps.

---

### User Story 3 - Employee Views Leave Balance (Priority: P1)

An employee wants to know how many leave days they have remaining before planning time off. They see their current balance prominently displayed on their dashboard without needing to navigate elsewhere.

**Why this priority**: Balance visibility is essential for employees to make informed leave requests. Without knowing their balance, they cannot plan effectively.

**Independent Test**: Can be tested by an employee viewing their dashboard and seeing accurate leave balances for each leave type. Delivers value as users always know their remaining entitlement.

**Acceptance Scenarios**:

1. **Given** an employee has 15 annual leave days and 10 sick days entitled, with 3 annual and 1 sick used, **When** they view their dashboard, **Then** they see "Annual: 12 days remaining" and "Sick: 9 days remaining" in a visible widget.
2. **Given** an employee's leave request is approved, **When** they return to the dashboard, **Then** their balance reflects the deduction in real-time (no page refresh required).
3. **Given** an employee, **When** they click on the balance widget, **Then** they see a breakdown of entitlements, used, adjustments, and remaining by leave type.

---

### User Story 4 - Manager Views Team Calendar (Priority: P2)

A manager needs to see their team's scheduled absences to plan coverage and avoid approving conflicting leave requests. They access a calendar view showing who is off when, with public holidays overlaid.

**Why this priority**: Team visibility helps managers make informed approval decisions and plan workload. Important but secondary to core request/approval flow.

**Independent Test**: Can be tested by a manager viewing the team calendar and seeing approved leave displayed correctly. Delivers value as managers can plan team coverage.

**Acceptance Scenarios**:

1. **Given** a manager has 5 team members with various approved leave, **When** they view the team calendar for February, **Then** they see each person's leave displayed on the appropriate dates.
2. **Given** the employee's country is Singapore, **When** viewing the calendar, **Then** Singapore public holidays are displayed and visually distinct from leave.
3. **Given** two team members have approved leave on the same day, **When** viewing the calendar, **Then** a visual indicator highlights the overlap.
4. **Given** a manager, **When** they filter the calendar by specific team member, **Then** only that person's leave is shown.

---

### User Story 5 - Admin Configures Leave Types (Priority: P2)

An HR administrator needs to set up the leave types available in their organization (e.g., Annual, Sick, Medical, Compassionate, Maternity/Paternity). They can customize entitlements and rules per type.

**Why this priority**: Configuration enables the system to match company policies. Essential for setup but only done once initially.

**Independent Test**: Can be tested by an admin creating/editing leave types and seeing them available when employees submit requests. Delivers value as organizations can customize to their policies.

**Acceptance Scenarios**:

1. **Given** an admin accesses leave settings, **When** they create a new leave type "Compassionate Leave" with 3 days allowance, **Then** employees see this option when submitting requests.
2. **Given** an admin edits "Annual Leave", **When** they change default days from 14 to 18, **Then** new employees receive 18 days entitlement.
3. **Given** an admin creates a leave type, **When** they set "requires approval" to false, **Then** requests of this type are auto-approved upon submission.
4. **Given** an admin creates "Unpaid Leave", **When** they set "deducts from balance" to false, **Then** requests don't affect the employee's paid leave balance.

---

### User Story 6 - Employee Views Public Holidays (Priority: P2)

An employee wants to see public holidays for their country to plan their leave around them. They access a calendar showing their country's holidays integrated with their leave view.

**Why this priority**: Holiday awareness helps employees plan time off efficiently. Important for UX but system can function without it initially.

**Independent Test**: Can be tested by an employee viewing the calendar and seeing correct public holidays for their assigned country. Delivers value as users can plan around holidays.

**Acceptance Scenarios**:

1. **Given** an employee based in Singapore, **When** they view the calendar for January, **Then** they see "New Year's Day" and "Chinese New Year" marked as public holidays.
2. **Given** an employee based in Malaysia, **When** they view the calendar, **Then** they see Malaysian holidays (different from Singapore even for shared dates like CNY due to different observances).
3. **Given** a leave request spans Feb 1-5 but Feb 3 is a public holiday, **When** calculating days deducted, **Then** only 4 days are deducted from balance (holiday excluded).

---

### User Story 7 - Employee Cancels Pending Request (Priority: P2)

An employee realizes their plans have changed and needs to cancel a leave request that hasn't been approved yet. They find their pending request and cancel it.

**Why this priority**: Flexibility for employees to change plans. Important for usability but doesn't block core workflow.

**Independent Test**: Can be tested by an employee canceling a pending request and seeing it removed from the approval queue. Delivers value as users aren't locked into requests.

**Acceptance Scenarios**:

1. **Given** an employee has a pending (submitted) leave request, **When** they click "Cancel", **Then** the request status changes to "cancelled" and it's removed from the manager's queue.
2. **Given** an employee has an approved leave request for a future date, **When** they attempt to cancel, **Then** the system allows cancellation and restores their balance.
3. **Given** an employee has an approved leave request where the start date has passed, **When** they attempt to cancel, **Then** the system prevents cancellation with a message indicating the leave has already started.

---

### User Story 8 - Admin Sets Public Holidays by Country (Priority: P3)

An HR administrator needs to configure which public holidays apply to employees in different countries. The system comes pre-loaded with holidays for supported SEA countries, and admins can add company-specific holidays.

**Why this priority**: Pre-loaded holidays reduce admin work. Important for regional compliance but has sensible defaults.

**Independent Test**: Can be tested by an admin viewing/editing holiday configurations and seeing employees affected correctly. Delivers value as organizations can customize holiday schedules.

**Acceptance Scenarios**:

1. **Given** an admin accesses holiday settings, **When** they view Malaysia 2026, **Then** they see pre-loaded Malaysian public holidays.
2. **Given** an admin, **When** they add a custom company holiday "Company Anniversary" on March 15, **Then** all employees see this day marked and it's excluded from leave calculations.
3. **Given** pre-loaded holidays exist for MY, SG, ID, PH, TH, VN, **When** the year changes, **Then** holidays are automatically updated for the new year.

---

### User Story 9 - Admin Configures Accrual Rules (Priority: P3)

An HR administrator needs to define how leave balances accrue - whether granted annually upfront, monthly, or pro-rated for new hires.

**Why this priority**: Accrual rules automate balance management. Important for ongoing operations but manual adjustments can work initially.

**Independent Test**: Can be tested by an admin configuring accrual rules and seeing balances update according to the rules. Delivers value as leave entitlements are managed automatically.

**Acceptance Scenarios**:

1. **Given** an admin sets "Annual Leave" accrual to "Annual Grant", **When** a new year begins, **Then** all eligible employees receive their full entitlement.
2. **Given** an admin sets accrual to "Monthly" at 1.25 days/month, **When** a month ends, **Then** employee balances increase by 1.25 days.
3. **Given** a new employee joins mid-year (July 1), **When** pro-rata is enabled, **Then** they receive 50% of annual entitlement.

---

### Edge Cases

- **Employee with no manager assigned**: Request routes to any available admin/owner using existing fallback algorithm.
- **Leave spanning public holiday**: Days are calculated excluding the public holiday (e.g., 5-day request with 1 holiday = 4 days deducted).
- **Manager approves own leave**: System routes to their manager, or if none, to admin/owner.
- **Employee changes country**: Public holidays update to new country; existing balance preserved.
- **Negative balance after adjustment**: Allow but flag for admin review; prevent future requests until resolved.
- **Overlapping requests**: Reject second request with clear error message; allow if first was rejected/cancelled.
- **Request for past dates**: Prevent requests starting before current date.
- **Request during notice period**: Allow but display informational warning to manager.

## Requirements *(mandatory)*

### Functional Requirements

**Leave Request Management**
- **FR-001**: System MUST allow employees to create leave requests with start date, end date, leave type, and optional notes.
- **FR-002**: System MUST calculate total days based on date range, excluding weekends and public holidays.
- **FR-003**: System MUST prevent submission of requests that exceed available balance.
- **FR-004**: System MUST prevent submission of requests with overlapping dates with existing approved/pending requests.
- **FR-005**: System MUST route submitted requests to the employee's assigned manager.
- **FR-006**: System MUST use 4-level fallback routing when employee has no manager (employee → manager → admin → owner).
- **FR-007**: System MUST allow employees to cancel pending/approved future requests.
- **FR-008**: System MUST restore balance when approved requests are cancelled.

**Approval Workflow**
- **FR-009**: System MUST display leave requests and expense claims in a unified approval queue for managers.
- **FR-010**: System MUST allow managers to approve requests with a single action.
- **FR-011**: System MUST allow managers to reject requests with a mandatory reason.
- **FR-012**: System MUST deduct from employee balance immediately upon approval.
- **FR-013**: System MUST send notifications on request submission, approval, and rejection.
- **FR-014**: System MUST support one-tap approval from mobile push notifications.

**Balance Tracking**
- **FR-015**: System MUST display current leave balance per type on employee dashboard.
- **FR-016**: System MUST update balance display in real-time when changes occur.
- **FR-017**: System MUST show balance breakdown (entitled, used, adjustments, remaining).
- **FR-018**: System MUST track balance per leave type per year.

**Team Calendar**
- **FR-019**: System MUST display team members' approved leave on a calendar view for managers.
- **FR-020**: System MUST display public holidays on the calendar, distinguished from leave.
- **FR-021**: System MUST highlight dates where multiple team members are absent.
- **FR-022**: System MUST allow filtering calendar by team member.

**Leave Type Configuration**
- **FR-023**: System MUST provide default leave types: Annual, Sick, Medical, Unpaid.
- **FR-024**: System MUST allow admins to create custom leave types.
- **FR-025**: System MUST support configurable properties per leave type: default days, requires approval, deducts from balance.
- **FR-026**: System MUST allow leave types to be country-specific.

**Public Holiday Management**
- **FR-027**: System MUST include pre-loaded public holidays for MY, SG, ID, PH, TH, VN.
- **FR-028**: System MUST allow admins to add company-specific holidays.
- **FR-029**: System MUST display holidays based on employee's assigned country.
- **FR-030**: System MUST exclude public holidays from leave day calculations.

**Accrual Rules**
- **FR-031**: System MUST support annual grant accrual (full entitlement at year start).
- **FR-032**: System MUST support monthly accrual (configurable days per month).
- **FR-033**: System MUST support pro-rata calculation for mid-year hires.

**Audit & Compliance**
- **FR-034**: System MUST log all leave actions to audit trail (create, submit, approve, reject, cancel).
- **FR-035**: System MUST enforce role-based access (employees see own, managers see team, admins see all).
- **FR-036**: System MUST scope all leave data to the business (multi-tenant isolation).

### Key Entities

- **Leave Request**: A formal request by an employee to take time off. Contains date range, leave type, status, notes, and approval information.
- **Leave Balance**: Tracks an employee's entitlement and usage per leave type per year. Shows entitled, used, adjustments, and remaining days.
- **Leave Type**: A category of leave (e.g., Annual, Sick). Configurable per organization with default days, approval requirements, and balance deduction rules.
- **Public Holiday**: A non-working day that applies to employees of a specific country. Pre-loaded for SEA countries, can be customized per organization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Employees can submit a complete leave request (with dates, type, and submission) in under 60 seconds.
- **SC-002**: Managers can approve a leave request from notification to completion in under 10 seconds.
- **SC-003**: Employee leave balance is visible on dashboard immediately upon login without additional navigation.
- **SC-004**: 50% of existing expense claims users adopt leave management within 30 days of launch.
- **SC-005**: Median time from leave submission to manager decision is under 4 hours during business days.
- **SC-006**: 70% of managers use the unified approval queue (rather than separate views) after 2 weeks.
- **SC-007**: System supports organizations with up to 500 employees without performance degradation.
- **SC-008**: Calendar displays team of 50 members within 2 seconds.
- **SC-009**: Leave balance updates reflect immediately after approval (no manual refresh required).
- **SC-010**: Public holidays are correctly displayed for all 6 supported countries (MY, SG, ID, PH, TH, VN).

## Assumptions

1. **Manager hierarchy exists**: The existing `business_memberships.managerId` field is populated for employees.
2. **Approval workflow reusable**: The existing 4-level approval fallback algorithm works for leave requests.
3. **Full days only for V1**: Half-day leave is out of scope; all requests are full business days.
4. **Weekends are non-working**: Saturday and Sunday are excluded from day calculations (configurable per country can be added later).
5. **Single country per employee**: Each employee is assigned to one country for holiday purposes.
6. **Calendar year for balances**: Leave balances reset/accrue based on calendar year (Jan-Dec).
7. **Notification system exists**: Push notification and email infrastructure is available from expense claims.
8. **Mobile app exists**: The existing mobile app will be extended (or responsive web is sufficient for V1).

## Out of Scope

- Half-day leave (planned for V2)
- Time-in-lieu / compensatory leave
- Shift scheduling and rostering
- Payroll integration
- Custom multi-level approval chains (beyond existing hierarchy)
- Overtime tracking
- Leave encashment
- Medical certificate upload
- Integration with external calendar services (Google/Outlook) for V1
