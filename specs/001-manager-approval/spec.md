# Feature Specification: Manager Approval Workflow Enforcement

**Feature Branch**: `001-manager-approval`
**Created**: 2026-01-29
**Status**: Draft
**Input**: User description: "Fix manager approval workflow: require manager assignment for employees, self-approval routing for managers, block submission for employees without managers"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Block Expense Submission Without Manager Assignment (Priority: P1)

As an employee without an assigned manager, when I try to submit an expense claim, the system should prevent submission and inform me that I need a manager assigned before I can submit expenses.

**Why this priority**: This is critical for ensuring all expense claims have a valid approver. Without this safeguard, expenses could be submitted with no one assigned to approve them, creating operational bottlenecks and compliance risks.

**Independent Test**: Can be tested by creating an employee without a manager assignment, attempting to submit an expense, and verifying the system blocks submission with a clear error message.

**Acceptance Scenarios**:

1. **Given** I am an employee with no manager assigned, **When** I attempt to submit an expense claim, **Then** the system blocks submission and displays a message explaining I need a manager assigned
2. **Given** I am an employee with no manager assigned, **When** I view my draft expense claim, **Then** I see a warning indicator that submission requires manager assignment
3. **Given** I am an employee with no manager assigned, **When** I try to submit, **Then** the system provides guidance on how to resolve the issue (contact admin/owner)

---

### User Story 2 - Manager Self-Approval Routing (Priority: P2)

As a manager or finance admin without an assigned manager above me, when I submit an expense claim, the system should route the claim to myself for self-approval, allowing me to approve my own expenses.

**Why this priority**: Managers and admins need a clear workflow path. Without self-approval routing, their claims would have no approver, blocking legitimate expense reimbursement.

**Independent Test**: Can be tested by having a manager with no assigned manager submit an expense, then verifying it appears in their own approval queue and they can approve it.

**Acceptance Scenarios**:

1. **Given** I am a manager with no manager assigned above me, **When** I submit an expense claim, **Then** the claim is routed to my own approval queue
2. **Given** I am a finance admin with no manager assigned, **When** I submit an expense claim, **Then** the claim is routed to my own approval queue
3. **Given** I am a manager and I submitted a claim routed to myself, **When** I view my approval queue, **Then** I see my own claim and can approve or reject it
4. **Given** I am a manager with another finance admin/owner available, **When** I submit an expense claim, **Then** the claim is routed to the other admin/owner (not self) to maintain separation of duties

---

### User Story 3 - Enforce Manager Assignment in Team Management (Priority: P3)

As an admin or owner managing team members, when I assign or change an employee's role, the system should require manager assignment for employees and make it optional for managers/admins.

**Why this priority**: This is the preventive control that ensures employees always have managers. While P1 blocks submission as a safety net, this story prevents the problem at the source.

**Independent Test**: Can be tested by attempting to save an employee's profile without a manager assigned, verifying the system requires selection before saving.

**Acceptance Scenarios**:

1. **Given** I am assigning the "employee" role to a team member, **When** I try to save without selecting a manager, **Then** the system requires me to select a manager before saving
2. **Given** I am assigning the "manager" role to a team member, **When** I save without selecting a manager, **Then** the system allows saving (manager assignment is optional)
3. **Given** I am assigning the "finance_admin" role to a team member, **When** I save without selecting a manager, **Then** the system allows saving (manager assignment is optional)
4. **Given** I am changing a team member's role from "manager" to "employee", **When** they have no manager assigned, **Then** the system requires me to assign a manager before saving the role change

---

### Edge Cases

- What happens when the only manager in a business is also the only employee? (The manager must still have self-approval capability)
- How does the system handle an employee whose assigned manager is deactivated? (Block submission, warn user)
- What happens when an admin demotes a manager to employee who has no manager assigned? (Require manager assignment before completing demotion)
- How does the system handle a manager approving their own high-value claim? (Allow but may require secondary approval based on business policy - out of scope for this feature)

## Requirements *(mandatory)*

### Functional Requirements

**Submission Blocking (P1)**
- **FR-001**: System MUST prevent expense claim submission when the submitting employee has no manager assigned
- **FR-002**: System MUST display a clear error message explaining why submission is blocked (no manager assigned)
- **FR-003**: System MUST provide guidance to the user on how to resolve the issue (contact admin/owner)
- **FR-004**: System MUST show a warning indicator on draft claims for employees without assigned managers

**Self-Approval Routing (P2)**
- **FR-005**: System MUST route expense claims to the submitter's approval queue when: (a) submitter is a manager or admin, AND (b) submitter has no manager assigned, AND (c) no other finance_admin/owner is available
- **FR-006**: System MUST route expense claims to another finance_admin/owner (excluding submitter) when available, even if submitter is a manager/admin
- **FR-007**: System MUST allow managers and admins to approve claims in their own queue, including self-submitted claims
- **FR-008**: System MUST NOT route employee claims to self-approval (employees cannot approve their own claims)

**Team Management Validation (P3)**
- **FR-009**: System MUST require manager selection when saving a team member with "employee" role
- **FR-010**: System MUST allow saving team members with "manager" or "finance_admin" roles without manager selection
- **FR-011**: System MUST require manager assignment when changing a role from manager/admin to employee if no manager is currently assigned
- **FR-012**: System MUST validate that assigned manager is active and has approval permissions

**Approval Queue Filtering (Existing - Verify)**
- **FR-013**: System MUST only show managers claims from their direct reports (employees with managerId = current user)
- **FR-014**: System MUST show managers their own submitted claims in their approval queue
- **FR-015**: System MUST show finance_admin/owner all claims in the business

### Key Entities

- **Business Membership**: Represents a user's membership in a business, including their role (employee/manager/finance_admin/owner), status (active/inactive), and manager assignment (managerId)
- **Expense Claim**: A submitted expense with a workflow status, linked to a submitter (userId) and optional approver (reviewedBy)
- **Approval Queue**: A filtered view of expense claims showing only those the current user is authorized to approve

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of submitted expense claims have a valid approver assigned (no claims with null reviewed_by in "submitted" status)
- **SC-002**: Employees without manager assignment cannot submit claims (0 submissions from employees with null managerId)
- **SC-003**: Managers/admins can successfully submit and self-approve claims within the same session when no other approver exists
- **SC-004**: Team management interface prevents saving employees without manager assignment (validation error rate: 100% for attempts)
- **SC-005**: Approval queue filtering correctly shows only authorized claims (managers see only direct reports + own claims)

## Assumptions

- The existing role hierarchy (owner > finance_admin > manager > employee) remains unchanged
- Self-approval for managers/admins is acceptable business practice for this organization
- High-value claims requiring additional approval is out of scope for this feature
- The existing manager assignment UI in Team Management is the primary interface for assigning managers
- Business always has at least one owner or finance_admin to handle edge cases
