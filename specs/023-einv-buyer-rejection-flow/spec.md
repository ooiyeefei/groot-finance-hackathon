# Feature Specification: LHDN E-Invoice Buyer Rejection Flow

**Feature Branch**: `023-einv-buyer-rejection-flow`
**Created**: 2026-03-16
**Status**: Draft
**Input**: GitHub Issue #309 — P0: Buyer rejection flow — reject received e-invoices via LHDN API
**Priority**: P0 (Launch blocker)

## Clarifications

### Session 2026-03-16

- Q: What entities should received e-invoices link to? → A: **AP invoices (primary), expense claims (secondary)**. Received e-invoices from suppliers are B2B AP transactions. The current `matchedExpenseClaimId` field handles the "grey area" (small merchants issuing LHDN e-invoices for employee purchases). Add new `matchedInvoiceId` field for AP linkage. Rejection updates whichever is linked.
- Q: Should matching use AI/DSPy or field matching? → A: **Tier 1 field matching only**. LHDN e-invoices are highly structured (TIN, amount, reference). Match using TIN + amount + reference (exact). No AI/DSPy initially — defer until field matching proves insufficient (<80% match rate).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reject a Received E-Invoice (Priority: P1)

A finance admin reviews a received e-invoice from a supplier in Groot's AP module and determines it is incorrect (wrong amount, wrong items, duplicate, etc.). They click "Reject E-Invoice", provide a reason, confirm the action, and the rejection is submitted to LHDN within the 72-hour window. The e-invoice status updates to "rejected" and any linked AP invoice or expense claim is updated accordingly.

**Why this priority**: This is the core feature — without the ability to reject, users must leave Groot and use the MyInvois portal, breaking the workflow and creating compliance risk. This is the single feature that closes the gap versus competitors. The primary use case is B2B supplier invoices (AP).

**Independent Test**: Can be fully tested by receiving an e-invoice in Groot, clicking reject within 72 hours, and verifying the status change in both Groot and MyInvois.

**Acceptance Scenarios**:

1. **Given** a received e-invoice with status "valid" and within 72 hours of LHDN validation, **When** a finance admin clicks "Reject E-Invoice" and enters a reason, **Then** the rejection is submitted to LHDN, the document status updates to "rejected", and rejection details (reason, timestamp, user) are recorded.
2. **Given** a received e-invoice with status "valid" that is linked to an AP invoice, **When** the e-invoice is rejected, **Then** the linked AP invoice's e-invoice attachment status is cleared and rejection details are recorded on the invoice.
3. **Given** a received e-invoice with status "valid" that is linked to an expense claim, **When** the e-invoice is rejected, **Then** the linked expense claim's e-invoice attachment is cleared and the claim's LHDN received status is set to "rejected".
4. **Given** a received e-invoice with status "valid", **When** the 72-hour rejection window has expired, **Then** the reject button is disabled/hidden and the user sees a message indicating the window has passed.
5. **Given** a received e-invoice that has already been rejected or cancelled, **When** a user views the document, **Then** no reject option is available and the current status is clearly displayed.

---

### User Story 2 - Notification on Rejection (Priority: P2)

When a received e-invoice is rejected, the relevant stakeholders receive an in-app notification. For AP invoices, the finance admin who created the invoice is notified. For expense claims, the employee who submitted the claim is notified.

**Why this priority**: Without notification, stakeholders won't know the e-invoice was rejected until they check manually — causing delays in AP processing or expense reimbursement.

**Independent Test**: Can be tested by rejecting a linked e-invoice and verifying the correct stakeholder receives a notification with the rejection reason and actionable guidance.

**Acceptance Scenarios**:

1. **Given** a received e-invoice linked to AP invoice X created by Finance Admin A, **When** the e-invoice is rejected, **Then** Finance Admin A receives an in-app notification with the rejection reason and a link to the affected invoice.
2. **Given** a received e-invoice linked to expense claim X submitted by Employee A, **When** a manager rejects the e-invoice, **Then** Employee A receives an in-app notification with the rejection reason and a link to the affected expense claim.
3. **Given** a received e-invoice that is NOT linked to any AP invoice or expense claim, **When** the e-invoice is rejected, **Then** no notification is sent (no recipient to notify).

---

### User Story 3 - 72-Hour Countdown Visibility (Priority: P2)

When viewing a received e-invoice that is still within the 72-hour rejection window, the user sees a countdown showing time remaining to reject. This helps users make timely decisions about whether to accept or reject.

**Why this priority**: The 72-hour window is a hard LHDN deadline. Without visibility, users may miss the window unknowingly, losing the ability to reject.

**Independent Test**: Can be tested by viewing a received e-invoice at various points within and after the 72-hour window and verifying the countdown accuracy and behavior at expiry.

**Acceptance Scenarios**:

1. **Given** a received e-invoice validated 24 hours ago, **When** a user views the document, **Then** they see approximately "48 hours remaining" to reject.
2. **Given** a received e-invoice validated 71 hours ago, **When** a user views the document, **Then** they see approximately "1 hour remaining" with urgent styling.
3. **Given** a received e-invoice validated 73 hours ago, **When** a user views the document, **Then** no countdown is shown and the reject option is unavailable.

---

### Edge Cases

- **LHDN API down or error during rejection**: The system displays a clear error message and allows the user to retry. The document status does not change until LHDN confirms the rejection.
- **Rate limit exceeded (12 RPM)**: The system informs the user that the service is temporarily busy and to try again in a moment.
- **E-invoice state changed on LHDN side between dialog open and submit** (e.g., supplier cancels): The system validates the current state before submission and shows an appropriate message if the state has changed.
- **72-hour window expires while rejection dialog is open**: The submission fails gracefully with a message explaining the window has closed.
- **Concurrent rejection attempts by multiple users**: Only the first successful rejection is applied; subsequent attempts receive an "already rejected" message.
- **Rejection reason is empty or whitespace-only**: The system requires a non-empty reason before enabling the confirm button.
- **E-invoice linked to both AP invoice AND expense claim** (duplicate purchase scenario): System flags this for manual resolution. Rejection updates both links but user should investigate the duplicate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users with owner, finance_admin, or manager roles to reject a received e-invoice.
- **FR-002**: System MUST require a non-empty rejection reason (free-text) before submitting the rejection to LHDN.
- **FR-003**: System MUST enforce the 72-hour rejection window — rejection is only permitted within 72 hours of the document's LHDN validation timestamp.
- **FR-004**: System MUST submit the rejection to LHDN via their document state API and only update the local status after receiving confirmation from LHDN.
- **FR-005**: System MUST record rejection metadata: timestamp, reason, and the user who performed the rejection.
- **FR-006**: System MUST clear the e-invoice attachment from any linked expense claim when the e-invoice is rejected.
- **FR-007**: System MUST update the linked expense claim's LHDN received status to "rejected" when the e-invoice is rejected.
- **FR-008**: System MUST send an in-app notification to the expense claim submitter when their linked e-invoice is rejected.
- **FR-009**: System MUST display a confirmation dialog before submitting the rejection, clearly stating the action is irreversible and the supplier will be notified.
- **FR-010**: System MUST display the remaining time in the 72-hour rejection window on eligible received e-invoices.
- **FR-011**: System MUST handle LHDN API errors (rate limiting, network failures, invalid state) gracefully with user-friendly messages and retry capability.
- **FR-012**: System MUST respect the LHDN rate limit of 12 requests per minute for rejection calls.
- **FR-013**: System MUST prevent rejection of e-invoices that are not in "valid" status (already rejected, cancelled, etc.).
- **FR-014**: System MUST update the linked AP invoice's e-invoice reference status when the e-invoice is rejected.
- **FR-015**: System MUST send an in-app notification to the AP invoice creator when their linked e-invoice is rejected.

### Key Entities

- **Received E-Invoice Document**: A document received from a supplier via LHDN. Key attributes: UUID, supplier TIN, status (valid, rejected, cancelled), validation timestamp, rejection details (reason, timestamp, rejecting user). Linked optionally to an AP invoice (primary) or expense claim (secondary, for grey area cases).
- **AP Invoice**: A supplier invoice recorded in the AP module. Key attributes: vendor, amount, invoice number, payment status. When the linked received e-invoice is rejected, the e-invoice reference is cleared and rejection details recorded.
- **Expense Claim**: An employee's expense submission that may have a linked received e-invoice (grey area — small merchants issuing LHDN e-invoices). When the linked e-invoice is rejected, the attachment is cleared and LHDN status updated.
- **Notification**: An in-app alert sent to the relevant stakeholder when their linked e-invoice is rejected. For AP invoices, notifies the invoice creator. For expense claims, notifies the claim submitter. Contains: rejection reason, link to affected record, timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can reject a received e-invoice within 3 clicks (view, reject button, confirm) and under 30 seconds total.
- **SC-002**: 100% of rejections within the 72-hour window are successfully submitted to LHDN (excluding LHDN downtime).
- **SC-003**: Linked AP invoices or expense claims are updated within 5 seconds of a successful rejection.
- **SC-004**: Stakeholders (AP invoice creator or claim submitter) receive rejection notifications within 10 seconds of the rejection being confirmed.
- **SC-005**: Zero users accidentally submit rejections — confirmation dialog prevents unintended actions.
- **SC-006**: Zero rejections are attempted outside the 72-hour window — the system enforces the deadline before the user can act.

## Assumptions

- The existing LHDN client library (`cancelDocument()`) provides a working pattern to follow for the rejection method — same API endpoint, different status value.
- The `einvoice_received_documents` table already exists with a `status` field and `dateTimeValidated` timestamp.
- The intermediary authentication mode (using business TIN) is already implemented for LHDN API calls.
- In-app notifications use the existing `notifications` table and delivery infrastructure.
- The rejection is permanent and irreversible per LHDN rules — there is no "undo rejection" flow.
- Rate limiting (12 RPM) is shared across all LHDN document state operations (cancel + reject).
- The `invoices` table exists for AP invoice tracking (confirmed in codebase).
- Received e-invoice matching to AP invoices or expense claims uses structured field matching (TIN + amount + reference) — no AI required initially due to LHDN's standardized format.

## Scope Boundaries

### In Scope
- Rejecting received e-invoices via LHDN API
- Updating local document status (received e-invoice)
- Updating linked AP invoices or expense claims
- In-app notifications to affected stakeholders (AP invoice creator, expense claim submitter)
- 72-hour window enforcement and countdown display
- Error handling for LHDN API failures
- Supporting both AP invoice and expense claim linkage

### Out of Scope
- Email notifications for rejection events (handled by separate notification preferences feature)
- Batch rejection of multiple e-invoices at once
- Supplier-side view of rejections
- Auto-rejection rules or AI-assisted rejection decisions
- Rejection analytics or reporting dashboard
- AI/DSPy-powered matching for received e-invoices (deferred until Tier 1 field matching proves insufficient)
- Duplicate purchase detection (when same e-invoice matches both AP invoice and expense claim) — noted as future enhancement
