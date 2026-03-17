# Feature Specification: Poll for Status Changes on Issued E-Invoices

**Feature Branch**: `001-einv-poll-status-change`
**Created**: 2026-03-16
**Status**: Draft
**Input**: GitHub Issue #310 — P0: Poll for status changes on issued e-invoices (buyer rejections + cancellations)
**Priority**: P0 (Launch blocker)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detect Buyer Rejection of Issued E-Invoice (Priority: P1)

As a business owner or finance admin, I need the system to automatically detect when a buyer rejects an e-invoice I issued through LHDN, so that I can take corrective action (re-issue, contact buyer, adjust AR) before the 72-hour compliance window closes.

**Why this priority**: Without rejection detection, the business operates on false data — the AR ledger shows a "valid" invoice that the buyer has already rejected. This is both a compliance risk (LHDN requires corrective action) and a financial risk (uncollectable receivable shown as valid).

**Independent Test**: Issue an e-invoice through LHDN, have the buyer reject it via MyInvois portal, and verify the system detects the rejection within 10 minutes, updates the invoice status, and notifies the issuer.

**Acceptance Scenarios**:

1. **Given** a sales invoice with LHDN status "valid" validated within the last 72 hours, **When** the buyer rejects it via LHDN, **Then** the system detects the rejection within 10 minutes and updates the invoice status to "rejected" with the rejection reason and timestamp.
2. **Given** a buyer-rejected invoice is detected, **When** the status update occurs, **Then** an in-app notification is sent to the invoice creator and business finance admins with the rejection reason.
3. **Given** a sales invoice with LHDN status "valid" validated more than 72 hours ago, **When** the polling cycle runs, **Then** the invoice is excluded from polling (the rejection window has closed, status is final).

---

### User Story 2 - Detect External Cancellation of Issued E-Invoice (Priority: P1)

As a business owner or finance admin, I need the system to automatically detect when an issued e-invoice is cancelled externally (by buyer request or LHDN action), so that the invoice record reflects the true status and I can take appropriate accounting action.

**Why this priority**: Same compliance and financial risk as rejection — a cancelled invoice shown as "valid" creates phantom receivables and incorrect compliance reporting. Grouped as P1 alongside rejection because both are status change detections on the same polling mechanism.

**Independent Test**: Issue an e-invoice, have it cancelled externally, and verify the system detects the cancellation, updates status, and notifies the issuer.

**Acceptance Scenarios**:

1. **Given** a sales invoice with LHDN status "valid" validated within the last 72 hours, **When** an external cancellation occurs, **Then** the system detects it within 10 minutes and updates the invoice status to "cancelled_by_buyer" with reason and timestamp.
2. **Given** a cancelled invoice that already has a journal entry posted, **When** the cancellation is detected, **Then** the system flags the invoice for manual review (the journal entry may need reversal).
3. **Given** a sales invoice already cancelled by the issuer (status "cancelled"), **When** the polling cycle runs, **Then** the invoice is excluded from polling (issuer-initiated cancellations don't need external detection).

---

### User Story 3 - View Status Change History on Invoice Detail (Priority: P2)

As a finance admin reviewing an invoice, I need to see when and why the status changed (rejection reason, cancellation timestamp), so that I can understand the full lifecycle and take informed corrective action.

**Why this priority**: While detection (P1) is the core capability, visibility into the details enables informed decision-making. Without the reason and timestamp, the user knows something changed but not why or when.

**Independent Test**: View a rejected invoice's detail page and verify the rejection reason, timestamp, and notification history are visible.

**Acceptance Scenarios**:

1. **Given** an invoice with status "rejected", **When** the user views the invoice detail, **Then** the rejection reason provided by the buyer and the rejection timestamp are displayed.
2. **Given** an invoice with status "cancelled_by_buyer", **When** the user views the invoice detail, **Then** the cancellation reason and timestamp are displayed.
3. **Given** an invoice whose status changed from "valid" to "rejected", **When** the user views the invoice detail, **Then** the original validation date and the subsequent rejection date are both visible, showing the timeline.

---

### Edge Cases

- What happens when LHDN API is temporarily unavailable during a polling cycle? The polling should skip gracefully and retry on the next cycle without marking invoices as failed.
- What happens when multiple invoices change status in the same polling cycle? Each invoice should be processed independently — a failure to update one should not block updates to others.
- What happens when the same status change is detected across two consecutive polling cycles (idempotency)? The system should recognize the status is already updated and skip re-processing without creating duplicate notifications.
- What happens if a business has no LHDN credentials configured? The polling should skip that business silently (no error noise).
- What happens when an invoice is rejected AND the business has auto-delivery email notifications enabled? The notification system should send both in-app and email notifications per business settings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically check LHDN for status changes on all issued e-invoices that were validated within the last 72 hours.
- **FR-002**: System MUST detect buyer rejections (indicated by `rejectRequestDateTime` in LHDN response) and update the invoice status to "rejected".
- **FR-003**: System MUST detect external cancellations (indicated by `cancelDateTime` and status "Cancelled" in LHDN response) and update the invoice status to "cancelled_by_buyer".
- **FR-004**: System MUST store the rejection/cancellation reason and timestamp on the invoice record.
- **FR-005**: System MUST send an in-app notification AND an email notification to the invoice creator and users with finance_admin role when a status change is detected. Email delivery is governed by the business's existing notification settings (auto-delivery toggles).
- **FR-006**: System MUST only poll invoices within the 72-hour window after LHDN validation (status is final after this window).
- **FR-007**: System MUST handle polling failures gracefully — a failure on one invoice must not prevent processing of remaining invoices.
- **FR-008**: System MUST be idempotent — detecting the same status change twice must not create duplicate notifications or duplicate updates.
- **FR-009**: System MUST distinguish between issuer-initiated cancellations (existing "cancelled" status) and buyer/external cancellations (new "cancelled_by_buyer" status).
- **FR-010**: System MUST flag invoices with existing journal entries when a rejection or cancellation is detected, indicating the journal entry may need reversal. The flag MUST be visible as a "Review Required" badge in the sales invoice list view AND as a warning banner with context on the invoice detail page.

### Key Entities

- **Sales Invoice**: The issued e-invoice record. Extended with rejection/cancellation metadata (reason, timestamp, review flag). New status values: "rejected", "cancelled_by_buyer".
- **Notification**: In-app alert sent to relevant users when a status change is detected. Contains invoice reference, new status, and reason.
- **Polling Window**: The 72-hour period after LHDN validation during which buyer rejection/cancellation is possible. Defines the set of invoices to poll.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Buyer rejections are detected and reflected in the system within 10 minutes of the rejection occurring on LHDN.
- **SC-002**: External cancellations are detected and reflected in the system within 10 minutes of the cancellation occurring on LHDN.
- **SC-003**: 100% of invoices within the 72-hour window are polled on each cycle — no invoices are silently missed.
- **SC-004**: Zero duplicate notifications are generated when the same status change is detected across multiple polling cycles.
- **SC-005**: Polling has zero impact on invoices outside the 72-hour window — they are never queried against LHDN.
- **SC-006**: Invoice creators and finance admins are notified within 1 minute of a status change being detected.
- **SC-007**: Invoice detail view shows rejection/cancellation reason and timestamp for all status-changed invoices.

## Clarifications

### Session 2026-03-16

- Q: Should email notifications be in scope for status change alerts, or only in-app? → A: In-app + email, governed by existing business notification settings.
- Q: Where does the "review required" flag surface in the UI? → A: List view badge + detail page warning banner (no Action Center integration).

## Assumptions

- LHDN's document submission status endpoint reliably returns rejection and cancellation fields when applicable.
- The 72-hour rejection window is measured from the `lhdnValidatedAt` timestamp on the sales invoice.
- LHDN API rate limit of 300 RPM for document status checks provides sufficient headroom for the expected invoice volume.
- Existing LHDN credentials and access token refresh mechanisms are already functional for each business.
- The notification system (in-app notifications table) already exists and can be reused for status change alerts.
- Business settings for email notification preferences (auto-delivery toggles) are already in place from prior e-invoice features.

## Dependencies

- LHDN API availability and response format consistency (external dependency).
- Existing LHDN credential management and token refresh (already implemented).
- Existing notification infrastructure (in-app notifications).
- Existing sales_invoices table with LHDN status and validation timestamp fields.
