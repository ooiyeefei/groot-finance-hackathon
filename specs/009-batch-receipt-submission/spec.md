# Feature Specification: Batch Expense Submission

**Feature Branch**: `009-batch-receipt-submission`
**Created**: 2026-02-09
**Status**: Draft
**Input**: User description: "new feature to build: batch submission of expense claims. right now we have expense-claims page for all users to create expense claims 1 by 1 with receipt. i want to create a feature that per 'batch' i.e. usually saas expense app will make it like 'create a new expense report' and user can bulk create 10 or more expense with receipts together, and submit altogether to manager in 1 go."

## Terminology Note

This feature introduces the concept of an **"Expense Submission"** — a container that groups multiple individual expense claims for batch review and approval. The term "submission" is deliberately chosen over "expense report" to avoid confusion with the existing analytics/compliance reports in the system (monthly reports, duplicate reports, formatted reports). Throughout this specification, "submission" refers to this new grouping concept, while "report" continues to mean analytics and compliance reporting.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Submit a Batch of Expenses (Priority: P1)

As an employee, I want to create a new expense submission, add multiple expense claims with receipts to it, and submit the entire group to my manager for approval in one action — so I can efficiently file all my business trip or monthly expenses at once instead of submitting them one by one.

**Why this priority**: This is the core value proposition. Without batch creation and grouped submission, the feature has no purpose. This single story delivers the primary user need: reducing friction for employees who have multiple receipts to process at once.

**Independent Test**: Can be fully tested by creating a new submission, uploading 3+ receipts, reviewing the grouped expenses, and submitting to a manager. Delivers immediate value by replacing the current one-at-a-time workflow.

**Acceptance Scenarios**:

1. **Given** an employee is on the expense claims page, **When** they click "New Expense" (replacing the current single-claim flow), **Then** a new draft submission is created with an auto-generated name (e.g., "Submission - Feb 2026") and the user is taken to the submission detail view where they can upload one or more receipts.
2. **Given** an employee has a draft submission open, **When** they upload one or more receipt images/PDFs, **Then** each receipt triggers AI extraction and creates an individual expense claim linked to this submission, with processing status shown for each.
3. **Given** a submission contains one or more expense claims with completed extraction, **When** the employee reviews the grouped claims and clicks "Submit for Approval", **Then** all claims in the submission change status to "submitted" and the submission is routed to the employee's designated manager.
4. **Given** an employee has a draft submission, **When** they click on a claim row to open the detail drawer and edit fields (vendor, amount, category, etc.), **Then** the changes are saved to that specific claim and the submission total is recalculated when the drawer closes.
5. **Given** an employee starts a submission but does not finish, **When** they navigate away, **Then** the draft submission is preserved and accessible from the expense claims page to resume later.

---

### User Story 2 - Manager Reviews and Approves a Batch Submission (Priority: P2)

As a manager, I want to review and approve (or reject) an entire expense submission as a single unit — so I can efficiently process my team's expense requests without approving each claim individually.

**Why this priority**: Batch approval is essential for the feature to deliver end-to-end value. Without it, employees batch-submit but managers still process one-by-one, which only shifts the bottleneck. However, this depends on User Story 1 being in place first.

**Independent Test**: Can be tested by submitting a batch (from Story 1) and then logging in as the manager to approve/reject the grouped submission. Delivers value by reducing manager approval workload.

**Acceptance Scenarios**:

1. **Given** a manager has pending submissions in their approval queue, **When** they view the approval dashboard, **Then** they see submissions listed as grouped items showing the submitter name, submission title, number of claims, total amount, and submission date.
2. **Given** a manager opens a submission for review, **When** they view the submission detail page, **Then** they see all individual expense claims listed with processing status and brief summaries (vendor, amount, category), and can click any claim row to open a slide-out drawer with full details (receipt image preview, expense fields, line items).
3. **Given** a manager is reviewing a submission, **When** they click "Approve All", **Then** all claims in the submission are approved, accounting entries are created for each, and the employee is notified.
4. **Given** a manager finds issues with one or more claims, **When** they reject the submission with a reason, **Then** the entire submission returns to the employee as a draft with the rejection reason visible, and the employee can fix and resubmit.
5. **Given** a manager finds issues with even one claim in a submission, **When** they reject the submission with a reason and optional per-claim notes, **Then** the entire submission returns to the employee as a draft — the employee must fix the flagged claims and resubmit the whole submission. Partial approval is not supported; the submission is always approved or rejected as a unit.

---

### User Story 3 - Track Submission Status and History (Priority: P3)

As an employee, I want to see all my expense submissions with their current status and drill into any submission to see individual claim details — so I can track what has been approved, what is pending, and what needs correction.

**Why this priority**: Status visibility is important for usability but the feature can function without a dedicated tracking view (employees could still see individual claim statuses). This adds polish and clarity to the batch workflow.

**Independent Test**: Can be tested by creating submissions in various states (draft, submitted, approved, rejected) and verifying the list view shows correct statuses, totals, and allows drill-down. Delivers value by giving employees a clear overview of their batch submissions.

**Acceptance Scenarios**:

1. **Given** an employee navigates to the expense claims page, **When** they view the submissions tab, **Then** they see a list of their submissions ordered by most recent, showing status, title, claim count, total amount, and submission date.
2. **Given** an employee clicks on a submission, **When** the detail view opens, **Then** they see all claims within that submission with individual statuses, and can distinguish between approved, pending, and rejected claims.
3. **Given** a submission was partially or fully rejected, **When** the employee views the rejected submission, **Then** they see the manager's rejection reason and can edit and resubmit.

---

### User Story 4 - Migrate Existing Draft Claims into Submissions (Priority: P4)

As an employee with pre-existing draft expense claims (created before the batch feature launch), I want those claims to be automatically migrated into individual submissions — so I can continue to review and submit them through the new unified flow without re-entering data.

**Why this priority**: This is a one-time migration concern for the transition period. All future claims will be created within submissions from the start, so this story only affects claims that existed before the feature launch.

**Independent Test**: Can be tested by verifying that existing draft claims are wrapped in auto-created submissions and appear in the submission list. Delivers value by ensuring no data is orphaned during the transition.

**Acceptance Scenarios**:

1. **Given** an employee has existing draft claims that predate the batch feature, **When** they navigate to the expense claims page after the feature launches, **Then** each pre-existing draft claim is wrapped in its own auto-created submission (one claim per submission) and appears in their submission list.
2. **Given** a migrated single-claim submission, **When** the employee opens it, **Then** they can add more receipts to it or submit it as-is through the standard submission flow.

---

### Edge Cases

- What happens when a user uploads a file that is not a valid receipt (e.g., a random photo or document)? → The existing AI classification rejects it, and the claim is marked as invalid within the submission. The user is notified and can remove or replace it.
- What happens when AI extraction fails for one receipt in a batch of 10? → The failed claim is marked with an error status. The user can manually fill in details or remove it. The rest of the submission is unaffected.
- What happens when a submission contains zero claims and the user tries to submit? → The system prevents submission and displays a message indicating at least one valid claim is required.
- What happens when a manager is reassigned while a submission is pending approval? → The submission follows the existing manager routing logic (hierarchy-based fallback), same as individual claims today.
- What happens when an employee deletes a claim from a submission? → The claim is removed from the submission and the total is recalculated. If it was the last claim, the submission returns to empty draft state.
- How are duplicate detections handled within a batch? → The existing duplicate detection runs on each claim. If duplicates are detected within the same submission, the user is warned before submission.
- What happens when an empty draft submission reaches the 24-hour auto-delete threshold while the user has the page open? → The system deletes the submission server-side and displays a notification on the page indicating the draft has been removed, redirecting the user back to the submissions list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow employees to create a new expense submission (draft container) from the expense claims page.
- **FR-002**: System MUST allow employees to upload multiple receipt files (images, PDFs) to a single submission, with each file creating an individual expense claim linked to the submission.
- **FR-003**: System MUST process each uploaded receipt through the existing AI extraction pipeline (document classification → data extraction) and display per-claim processing status within the submission view.
- **FR-004**: System MUST allow employees to review, edit, and delete individual claims within a draft submission before submitting.
- **FR-005**: System MUST calculate and display the total amount across all claims in a submission, grouped by currency.
- **FR-006**: System MUST allow employees to submit an entire submission for manager approval in a single action, changing all contained claims to "submitted" status.
- **FR-007**: System MUST route submitted submissions to the employee's designated manager using the existing approval routing logic.
- **FR-008**: System MUST allow managers to view pending submissions as grouped items in their approval dashboard, showing submitter, title, claim count, and total amount.
- **FR-009**: System MUST allow managers to approve an entire submission, triggering accounting entry creation for each contained claim.
- **FR-010**: System MUST allow managers to reject an entire submission with a reason, returning all claims to draft status for the employee to correct.
- **FR-011**: System MUST preserve draft submissions across sessions so employees can resume adding claims later.
- **FR-012**: System MUST auto-generate a default submission name (e.g., "Submission - Feb 2026") that employees can optionally customize.
- **FR-013**: System MUST replace the current single-claim "New Expense" flow with the submission-based flow. All new expense creation goes through a submission, even for a single claim.
- **FR-014**: System MUST run duplicate detection on claims within a submission and warn the employee before submission if potential duplicates are found.
- **FR-015**: System MUST migrate pre-existing draft claims (created before feature launch) into auto-created individual submissions so they are accessible through the new unified flow.
- **FR-016**: System MUST notify the employee when their submission is approved or rejected.
- **FR-017**: System MUST display reimbursement progress on approved submissions as a derived indicator (e.g., "3 of 5 claims reimbursed"), computed from the individual claim reimbursement statuses.
- **FR-018**: System MUST automatically transition the submission status to "reimbursed" when all contained claims have been individually reimbursed by finance.
- **FR-019**: System MUST provide a dedicated submission detail page at `/expense-claims/submissions/[id]` showing a claim list with processing status and brief summaries (vendor, amount, category), an upload area for adding receipts, currency-grouped totals, and a submit button.
- **FR-020**: System MUST allow users to click any claim row on the submission detail page to open a slide-out drawer displaying full claim details (receipt image preview, all expense fields, line items), reusing the existing individual expense detail component.
- **FR-021**: System MUST automatically delete empty draft submissions (zero claims) after 24 hours from creation.
- **FR-022**: System MUST display a transient, closeable warning banner on empty draft submission pages informing the user that the draft will be automatically deleted in 24 hours if no receipts are added.

### Key Entities

- **Expense Submission**: A container that groups multiple expense claims for batch review and approval. Key attributes: title/name, status (draft, submitted, approved, rejected, reimbursed), submitter, approver, submission date, total amount(s) by currency, rejection reason. A submission belongs to one employee and is routed to one manager. Approval is all-or-nothing — no partial approval state. The submission owns the lifecycle through approval; reimbursement is tracked per-claim, with the submission deriving a progress indicator (e.g., "3 of 5 reimbursed") and automatically transitioning to "reimbursed" when all contained claims are individually reimbursed.
- **Expense Claim** (existing, extended): An individual expense with receipt. Extended with a required reference to the parent submission. All new claims belong to a submission. Pre-existing claims are migrated into auto-created submissions. All existing attributes remain unchanged.

## Assumptions

- The existing AI extraction pipeline (Trigger.dev + Gemini Vision) can handle concurrent processing of multiple receipts from a single submission without requiring changes to the extraction logic itself — only the triggering mechanism needs to support multiple files.
- The existing manager routing and approval notification system can be extended to operate on submissions without replacing the individual claim approval path.
- Multi-currency submissions display per-currency totals rather than converting to a single currency.
- The maximum number of claims per submission is bounded at a reasonable limit (e.g., 50 claims) to prevent performance issues during batch processing and review.
- Submission names are user-facing labels for organization purposes and do not need to be unique.
- The existing monthly reports and analytics features will aggregate claims regardless of whether they were submitted individually or as part of a submission — the submission grouping does not affect reporting.

## Clarifications

### Session 2026-02-09

- Q: How should the batch submission feature be accessed — new tab, separate page, or replace the current flow? → A: Replace the current "New Expense" flow entirely. All new claims go through a submission container, even single claims. The submission becomes the universal entry point for creating expenses.
- Q: Should the submission track its own reimbursement status, given that all claims now flow through submissions? → A: Submission-level lifecycle through approval (draft → submitted → approved/rejected), with reimbursement tracked per-claim. The submission derives a reimbursement progress indicator from its claims (e.g., "3 of 5 reimbursed") and automatically reaches terminal "reimbursed" status when all contained claims are individually reimbursed by finance.
- Q: What should the submission detail experience be — full page, drawer, or modal? → A: Full dedicated page at `/expense-claims/submissions/[id]` showing the claim list with processing status and brief summaries. Each claim row is clickable, opening a slide-out drawer with full claim details (receipt image preview, expense details, line items) — reusing the existing individual expense detail modal/component where possible.
- Q: Should the system handle stale/abandoned draft submissions? → A: Auto-delete empty draft submissions (zero claims) after 24 hours. Drafts with at least one claim persist indefinitely. Display a transient, closeable warning banner on empty draft submissions informing the user that the draft will be automatically deleted in 24 hours if no receipts are added.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Employees can create a submission, add 10 receipts, and submit for approval in under 10 minutes (compared to the current flow of ~2 minutes per individual claim, saving approximately 10 minutes for 10 claims).
- **SC-002**: Managers can review and approve a 10-claim submission in under 3 minutes (compared to individually reviewing 10 separate claims).
- **SC-003**: 90% of employees who currently submit 3+ claims per month adopt the batch submission workflow within 2 months of launch.
- **SC-004**: Zero data loss — all receipts uploaded in a batch are successfully processed or clearly flagged with actionable error states.
- **SC-005**: Employees who only have one receipt can create a submission, upload the single receipt, and submit in under 2 minutes — no slower than the current single-claim flow.
