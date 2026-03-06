# Feature Specification: Batch Payment Processing for Expense Claims

**Feature Branch**: `001-batch-payment`
**Created**: 2026-03-06
**Status**: Draft
**Input**: GitHub Issue #260 - Batch Payment Processing for Expense Claims
**GitHub Issue**: https://github.com/grootdev-ai/groot-finance/issues/260

## Problem Statement

After a manager approves expense claims, they are posted to accounting records as "pending". Currently, there is no workflow for finance admins to process these payments in bulk. They must individually locate each claim in accounting records and change the status to "paid" one by one.

**Current broken flow**: Employee submits > Manager approves > Posted to accounting as "pending" > Manual 1-by-1 status change

**Desired flow**: Employee submits > Manager approves > Posted to accounting as "pending" > Finance Admin batch-selects approved claims > Marks as paid > Accounting records updated > Cash Book-Payment export ready

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Batch Mark Claims as Paid (Priority: P1)

As a finance admin, I want to see all approved expense claims pending payment in one view, select multiple claims, and mark them as paid in a single action, so I can efficiently process reimbursements without hunting through accounting records one by one.

**Why this priority**: This is the core value of the feature. Without batch payment processing, finance admins waste significant time on manual status changes and cannot close the reimbursement loop. This directly unblocks the Cash Book-Payment export workflow.

**Independent Test**: Can be fully tested by creating 5+ approved expense claims, navigating to the payment processing view, selecting all claims, clicking "Mark as Paid", and verifying all claims transition to "reimbursed" status with corresponding accounting entries updated to "paid".

**Acceptance Scenarios**:

1. **Given** there are 10 approved expense claims from 3 different employees, **When** a finance admin opens the Payment Processing view, **Then** all 10 claims are visible, grouped by employee, with claim details (employee name, date, amount, vendor, category, reference number) and a running total.

2. **Given** the finance admin has selected 5 of 10 claims using checkboxes, **When** they click "Mark as Paid", **Then** all 5 claims transition to "reimbursed" status, their linked accounting entries transition to "paid", and the remaining 5 claims stay as "approved" in the list.

3. **Given** the finance admin clicks "Select All", **When** they click "Mark as Paid", **Then** all visible claims are processed in one batch operation.

4. **Given** a batch payment has been processed, **When** the finance admin views the accounting records for those claims, **Then** each record shows status "paid" with the payment processing timestamp and the name of the admin who processed it.

---

### User Story 2 - Filter and Search Pending Claims (Priority: P2)

As a finance admin, I want to filter pending claims by employee, date range, and category so I can process payments for specific groups (e.g., all claims from one department this month) rather than always processing everything at once.

**Why this priority**: Filtering enables targeted batch processing. Many companies process reimbursements per department or per pay cycle. Without filters, the admin must manually skip claims they don't want to process yet.

**Independent Test**: Can be tested by creating claims across different employees, dates, and categories, then verifying filters correctly narrow the list and "Select All" only selects filtered results.

**Acceptance Scenarios**:

1. **Given** there are approved claims from employees Alice, Bob, and Carol, **When** the finance admin filters by employee "Alice", **Then** only Alice's claims appear in the list and the running total reflects only her claims.

2. **Given** claims exist from January and February, **When** the admin filters by date range "Feb 1 - Feb 28", **Then** only February claims appear.

3. **Given** filters are applied showing 3 of 10 claims, **When** the admin clicks "Select All", **Then** only the 3 filtered claims are selected (not the hidden 7).

---

### User Story 3 - Record Payment Details (Priority: P3)

As a finance admin, I want to optionally record the payment date, payment method, and a reference number when batch-processing claims, so there is a clear audit trail of how and when the reimbursement was made.

**Why this priority**: Audit trail enrichment. The core feature works without this (P1 already records who and when), but recording payment method and reference improves reconciliation and compliance.

**Independent Test**: Can be tested by processing a batch with payment details filled in, then verifying the details are stored and visible on each processed claim.

**Acceptance Scenarios**:

1. **Given** the finance admin has selected claims and clicks "Mark as Paid", **When** a confirmation dialog appears, **Then** it shows optional fields for payment date (defaults to today), payment method (bank transfer, cheque, cash, etc.), and payment reference number.

2. **Given** the admin fills in payment date "2026-03-01", method "Bank Transfer", reference "TXN-2026-0301", **When** they confirm, **Then** all selected claims are updated with these payment details.

3. **Given** the admin leaves all optional fields empty, **When** they confirm, **Then** claims are still processed successfully with payment date defaulting to today and method/reference left blank.

---

### User Story 4 - Submission-Level and Individual Expense Selection (Priority: P1)

As a finance admin, I want to process payments at the submission level (selecting whole submissions) or drill into a submission to select individual expenses, so I can efficiently handle both bulk and granular payment processing.

**Why this priority**: Expense claims are grouped into submissions. Finance admins need to operate at both levels — pay an entire submission at once, or selectively pay individual claims within a submission.

**Independent Test**: Can be tested by creating 2 submissions with 3 claims each, then (a) paying one whole submission and (b) paying 2 of 3 claims in the other submission.

**Acceptance Scenarios**:

1. **Given** there are 3 approved submissions from different employees, **When** a finance admin selects 2 submissions and clicks "Mark as Paid", **Then** all claims within those 2 submissions are marked as reimbursed.

2. **Given** a submission contains 5 approved claims, **When** the finance admin expands the submission and selects only 3 of the 5 claims, **Then** only those 3 claims are processed when "Mark as Paid" is clicked.

3. **Given** all claims in a submission have been individually marked as reimbursed, **When** the last claim is processed, **Then** the parent submission status is automatically updated to "reimbursed".

---

### User Story 5 - Send Back for Correction (Priority: P2)

As a finance admin, I want to send back individual expense claims that have data issues or lack supporting documents directly to the expense submitter for correction, without requiring the manager to re-approve, so that corrections flow efficiently.

**Why this priority**: Finance admins often find issues during payment review (wrong amount, missing receipt, incorrect category). Sending these back to the employee for correction — bypassing the manager re-approval step — avoids unnecessary bottlenecks.

**Independent Test**: Can be tested by selecting a claim, clicking "Send Back", entering a reason, and verifying the claim returns to the employee's expense list in an editable state with the admin's note visible.

**Acceptance Scenarios**:

1. **Given** an approved claim has an issue, **When** the finance admin clicks "Send Back" on that claim and enters a reason, **Then** the claim status changes to "draft" (editable by the employee) and the reason is attached to the claim.

2. **Given** a claim has been sent back by finance admin, **When** the employee corrects and resubmits it, **Then** the claim goes directly to the finance admin's Payment Processing queue (skipping manager re-approval) since it was already approved once.

3. **Given** a submission has 5 claims and 1 is sent back, **When** the finance admin processes the remaining 4, **Then** those 4 are reimbursed while the sent-back claim remains in draft status awaiting correction.

---

### Edge Cases

- What happens when a claim's linked accounting entry has already been manually changed to "paid"? The system should skip it gracefully and not error, treating it as already processed.
- What happens when two finance admins try to batch-process the same claims simultaneously? The system should handle this gracefully -- the second admin should see a message that some claims were already processed, and only unprocessed claims should be affected.
- What happens when a claim has no linked accounting entry (data integrity issue)? The claim status should still update to "reimbursed", and a warning should be logged. The admin should see a notice that some claims had no accounting link.
- What happens when there are zero approved claims pending payment? The view should show an empty state message: "No approved claims pending payment."
- What happens if the batch is very large (100+ claims)? The system should process them reliably without timeout, showing a progress indicator if the operation takes more than a few seconds.
- What happens when a sent-back claim is resubmitted — does it need manager approval again? No — claims sent back by finance admin go directly back to the Payment Processing queue after the employee corrects and resubmits.
- What happens if only some claims in a submission are selected for payment? The submission remains in "approved" status until all claims are either reimbursed or sent back. Only when all are resolved does the submission status update.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a "Payment Processing" tab within the Manager Approvals page (after the existing Approval tab), accessible to finance admins and owners, showing all expense claims with status "approved" that have not yet been reimbursed.
- **FR-002**: System MUST display each pending claim with: employee name, submission date, claim amount (with currency), vendor name, expense category, and reference number.
- **FR-003**: System MUST group claims by employee in the list view, showing employee name as a section header with a subtotal per employee.
- **FR-004**: System MUST provide a checkbox for each claim and a "Select All" / "Deselect All" toggle.
- **FR-005**: System MUST show running totals of selected claims' amounts grouped by currency (e.g., "MYR 5,000.00 + SGD 200.00"), updating in real-time as selections change. Totals MUST NOT be combined across currencies.
- **FR-006**: System MUST provide a "Mark as Paid" action button that is enabled only when at least one claim is selected.
- **FR-007**: When "Mark as Paid" is triggered, the system MUST atomically update the selected expense claims' status from "approved" to "reimbursed" and their linked accounting entries' status to "paid".
- **FR-008**: System MUST record the payment processing timestamp and the identity of the admin who processed the payment on each affected claim.
- **FR-009**: System MUST provide filters for: employee name, date range (claim submission date), and expense category.
- **FR-010**: "Select All" MUST only select claims visible after filtering (not hidden claims).
- **FR-011**: System MUST show a confirmation dialog before processing, displaying the count of selected claims and total amounts grouped by currency.
- **FR-012**: System MUST restrict access to the Payment Processing view to users with "finance_admin" or "owner" roles only.
- **FR-013**: System MUST optionally accept payment date, payment method, and payment reference number during batch processing.
- **FR-014**: System MUST gracefully handle claims whose accounting entries were already marked "paid", skipping them without error.
- **FR-015**: After batch processing completes, the system MUST show a success summary indicating how many claims were processed and the total amounts grouped by currency.
- **FR-016**: System MUST display approved claims grouped by submission, showing submission title, employee name, submission date, and claim count. Each submission MUST be expandable to show individual claims.
- **FR-017**: System MUST allow selection at both submission level (checkbox on submission row selects all claims) and individual claim level (checkbox on individual claim within an expanded submission).
- **FR-018**: System MUST provide a "Send Back" action on individual claims, requiring a reason/note, which returns the claim to "draft" status for the employee to correct.
- **FR-019**: Claims sent back by a finance admin MUST, upon employee resubmission, route directly to the Payment Processing queue (bypassing manager re-approval), since they were already manager-approved.
- **FR-020**: When all claims in a submission are either reimbursed or sent back and reprocessed, the parent submission status MUST automatically update to reflect completion.

### Key Entities

- **Expense Claim**: A reimbursement request submitted by an employee. Key attributes: employee, amount, vendor, category, reference number, status (approved/reimbursed), submission date, linked accounting entry. Status transitions from "approved" to "reimbursed" upon payment processing.
- **Accounting Entry**: A financial record linked to an approved expense claim. Key attributes: status (pending/paid), amount, linked expense claim. Status transitions from "pending" to "paid" when the linked claim is processed.
- **Payment Batch** (implicit): A logical grouping of claims processed together in one action. Not a stored entity, but represented by shared processing timestamp and admin identity across the affected claims.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Finance admins can process 20 approved expense claims in under 30 seconds (compared to ~5 minutes manually updating one by one).
- **SC-002**: 100% of processed claims have their corresponding accounting entries updated to "paid" status in the same operation -- no orphaned pending entries.
- **SC-003**: Finance admins can filter to a specific employee's claims and process only those claims within 3 clicks (filter, select all, mark as paid).
- **SC-004**: Cash Book-Payment export produces correct output for all claims processed through batch payment (no claims stuck in "approved" status blocking exports).
- **SC-005**: All batch payment operations include a complete audit trail (who processed, when, which claims) queryable by any admin.

## Assumptions

- The existing "approved" status on expense claims correctly indicates claims ready for payment processing (manager has already approved).
- The `paidAt` field already exists on the expense claims schema and can be used to record payment timestamp.
- The accounting entries table has a status field that can be updated to "paid".
- Expense claims link to accounting entries via an existing relationship (accounting_entry_id or similar).
- The confirmation dialog for payment details (P3) is a simple modal, not a separate page.
- Payment method options are a predefined list (bank transfer, cheque, cash) rather than free-text.
- The feature will be added as a new "Payment Processing" tab within the Manager Approvals page, placed after the existing Approval tab. This follows the natural workflow: Approve > Pay. Expense Claims page is strictly for individual users (even finance admins submit their own expenses there), so payment processing belongs in the manager/admin workflow area.

## Clarifications

### Session 2026-03-06

- Q: Where should the Payment Processing view live in the app? → A: New tab under Manager Approvals page, after the Approval tab. Expense Claims is strictly for individual users; the approve-then-pay workflow belongs in the manager/admin area.
- Q: How should multi-currency claims be handled in the running total and batch summary? → A: Show separate running totals per currency (e.g., "MYR 5,000 + SGD 200"). Mixed-currency batches are allowed but totals are never combined.

## Out of Scope

- Actual payment integration (bank transfers, payment gateway). This feature only records the payment status, it does not initiate real payments.
- Generating payment files (e.g., GIRO, ACH batch files) for bank upload. This may be a future enhancement.
- Employee notifications when their claims are marked as reimbursed. This can be added later.
- Partial payment of a single claim. Claims are either fully reimbursed or still approved.
- Reversing a batch payment (un-reimbursing claims). This would be a separate feature if needed.
