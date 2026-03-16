# Feature Specification: LHDN E-Invoice Buyer Flows

**Feature Branch**: `022-einvoice-lhdn-buyer-flows`
**Created**: 2026-03-16
**Status**: Draft
**Input**: LHDN e-invoice buyer flows: status polling for issued invoices, buyer rejection, buyer notifications, validated PDF with QR delivery, compliance dashboard
**Related Issues**: #309, #310, #311, #312, #313

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detect When Buyer Rejects or Cancels Our Issued E-Invoice (Priority: P1)

As a business owner or finance admin, I need to know when a buyer rejects or cancels an e-invoice I issued through LHDN, so I can take corrective action (re-issue, contact the buyer, adjust records).

Currently, after LHDN validates an e-invoice and the initial polling job completes, Groot never checks again. If a buyer rejects the invoice within the 72-hour LHDN window (via MyInvois portal or their own system), the `sales_invoices` record stays at "valid" forever — the issuer is blind to the rejection.

**Why this priority**: This is the foundation for all other buyer flows. Without status change detection, notifications and the dashboard can't reflect reality. It's also a data integrity issue — our records would be wrong.

**Independent Test**: Can be fully tested by submitting an e-invoice to LHDN sandbox, then using the LHDN sandbox portal to reject it, and verifying Groot detects the status change within 10 minutes.

**Acceptance Scenarios**:

1. **Given** a sales invoice with `lhdnStatus: "valid"` and validated within the last 72 hours, **When** the polling cycle runs, **Then** the system checks the document status on LHDN API and updates the local record if the status has changed.
2. **Given** a buyer rejects our issued e-invoice on MyInvois portal, **When** the next polling cycle detects `rejectRequestDateTime` in the LHDN response, **Then** the record is updated to `lhdnStatus: "rejected"` with the rejection reason and timestamp, and an in-app notification is sent to the invoice creator and business owner.
3. **Given** a buyer or external party cancels our issued e-invoice, **When** the polling cycle detects `status: "Cancelled"`, **Then** the record is updated to `lhdnStatus: "cancelled_by_buyer"` (distinct from issuer-initiated cancellation) with the cancellation reason.
4. **Given** a sales invoice validated more than 72 hours ago, **When** the polling cycle runs, **Then** this invoice is excluded from polling (status is final after 72 hours).
5. **Given** the LHDN API is unreachable during a polling cycle, **When** the request fails, **Then** the system retries on the next cycle without marking the invoice as failed.

---

### User Story 2 - Reject a Received E-Invoice from a Supplier (Priority: P2)

As a buyer (SME using Groot), when I receive an e-invoice from a supplier that is incorrect (wrong amount, wrong items, duplicate), I need to reject it through Groot within 72 hours, so that the rejection is filed with LHDN and the supplier is notified.

Currently, received e-invoices are matched to expense claims but there is no rejection mechanism — users must go to MyInvois portal directly.

**Why this priority**: Buyer rejection is an LHDN-mandated flow. Users who discover billing errors need to act within 72 hours. Without this, Groot is an incomplete e-invoice platform.

**Independent Test**: Can be tested by receiving a test e-invoice in sandbox, then rejecting it through Groot UI, and verifying the rejection status propagates to LHDN.

**Acceptance Scenarios**:

1. **Given** a received e-invoice with status "valid" and within 72 hours of validation, **When** a user with appropriate role (owner, finance_admin, manager) clicks "Reject E-Invoice", **Then** the system shows a form requiring a rejection reason.
2. **Given** the user submits a rejection with a valid reason, **When** the system calls the LHDN rejection API, **Then** the received document status is updated to "rejected", the rejection reason and timestamp are recorded, and the linked expense claim (if any) has its e-invoice attachment cleared.
3. **Given** a received e-invoice with validation older than 72 hours, **When** the user views the document, **Then** the "Reject" option is hidden/disabled with a message explaining the window has expired.
4. **Given** the LHDN API returns an error during rejection, **When** the rejection fails, **Then** the user sees a clear error message and the document status is not changed.
5. **Given** a user without the required role (e.g., regular employee), **When** they view a received e-invoice, **Then** the "Reject" option is not available.

---

### User Story 3 - Deliver Validated E-Invoice PDF with LHDN QR Code to Buyer (Priority: P3)

As a business issuing e-invoices, after LHDN validates my e-invoice, I want a branded PDF with the LHDN QR code and validation stamp to be automatically emailed to my customer, so they receive proof of the validated e-invoice without needing to check MyInvois portal.

The system already generates sales invoice PDFs and emails them to customers (with PDF attachment via SES). The gap is embedding the LHDN validation block (QR code, UUID, timestamp, badge) into the existing PDF template and triggering auto-delivery on validation.

**Why this priority**: High-impact UX differentiator vs competitors. Buyers get immediate proof of the validated e-invoice. However, it's not a regulatory requirement — buyers can always check MyInvois portal.

**Independent Test**: Can be tested by submitting an e-invoice, waiting for LHDN validation, and verifying (a) the PDF includes QR code + validation stamp, (b) the buyer receives an email with the PDF attached.

**Acceptance Scenarios**:

1. **Given** an e-invoice transitions to "valid" with a LHDN long ID, **When** the validation is detected, **Then** the system generates a PDF that includes: the LHDN QR code (linking to the LHDN share page), the document UUID, the validation timestamp, and a "Validated by LHDN" visual indicator.
2. **Given** a validated e-invoice PDF and auto-delivery is enabled, **When** the buyer's email is available in the customer record, **Then** the system emails the PDF to the buyer using the existing sales invoice email service.
3. **Given** a validated e-invoice, **When** the issuer views the invoice detail page, **Then** a "Download E-Invoice (LHDN)" button is available that generates/serves the PDF with the LHDN validation block.
4. **Given** a business has disabled auto-delivery, **When** an e-invoice is validated, **Then** no email is sent, but the PDF is still available for manual download.
5. **Given** the buyer's email is not available, **When** the e-invoice is validated, **Then** the system skips email delivery without error and makes the PDF available for manual download only.

---

### User Story 4 - Notify Buyer on E-Invoice Lifecycle Events (Priority: P4)

As a buyer of goods/services, I want to receive email notifications when an e-invoice issued to me is validated, cancelled, or when my rejection is processed, so I have an audit trail and don't need to check the LHDN portal.

Since buyers are external (not Groot users), notifications are email-only, sent via the existing SES infrastructure.

**Why this priority**: Complements the PDF delivery (Story 3). Cancellation and rejection notifications are important for the buyer's records. Lower priority because the PDF delivery covers the most important event (validation).

**Independent Test**: Can be tested by triggering each lifecycle event and verifying the buyer receives the corresponding email.

**Acceptance Scenarios**:

1. **Given** an e-invoice is validated by LHDN, **When** auto-delivery is enabled and buyer email exists, **Then** the buyer receives an email with validation details and a link to the MyInvois portal page.
2. **Given** the issuer cancels a validated e-invoice, **When** the cancellation is confirmed by LHDN, **Then** the buyer receives an email notifying them of the cancellation with the reason.
3. **Given** the buyer's rejection is processed by LHDN, **When** the status update is detected, **Then** the buyer receives a confirmation email.
4. **Given** a business has disabled buyer notifications, **When** any lifecycle event occurs, **Then** no email is sent to the buyer.

---

### User Story 5 - E-Invoice Compliance Dashboard (Priority: P5)

As a business owner or finance admin, I want a dashboard showing my e-invoice compliance metrics — submission rates, validation success, rejection rates, and compliance score — so I can monitor my LHDN e-invoice health and identify issues.

**Why this priority**: Reporting is valuable but not blocking. The system works without it. It becomes more valuable after all other flows are in place (more data to show).

**Independent Test**: Can be tested by having a mix of submitted/valid/rejected/cancelled e-invoices and verifying the dashboard shows correct metrics and charts.

**Acceptance Scenarios**:

1. **Given** a business has submitted e-invoices to LHDN, **When** the user navigates to the e-invoice compliance tab, **Then** they see metric cards: total submitted, validation rate, rejection rate, cancellation rate, pending count, failed count.
2. **Given** e-invoice history spanning multiple months, **When** the user views the dashboard, **Then** they see a monthly volume chart and a status breakdown chart.
3. **Given** e-invoices with validation errors, **When** the user views the dashboard, **Then** they see a "Top Rejection Reasons" table grouped by error codes.
4. **Given** the user selects a date range filter, **When** the filter is applied, **Then** all metrics and charts update to reflect only the selected period.
5. **Given** the user wants to export data for audit, **When** they click "Export CSV", **Then** the system downloads a CSV containing: invoice number, date, amount, LHDN status, UUID, submitted timestamp, validated timestamp, and any errors.

---

### Edge Cases

- What happens when LHDN changes API behavior or adds new status codes? System should handle unknown statuses gracefully (log a warning, don't crash, surface to admin).
- What happens when the same document is polled concurrently by multiple processes? Status updates must be idempotent (only update if status actually changed).
- What happens when a business has hundreds of validated invoices within the 72-hour window? Polling must batch API calls and respect rate limits.
- What happens when SES email delivery fails (bounce, invalid email)? Log the failure, don't block the workflow, surface the delivery failure in the invoice detail view.
- What happens when a received e-invoice is rejected but it was already linked to an approved expense claim? The expense claim keeps its "approved" status but gains a warning flag "E-Invoice Rejected" requiring finance admin review before reimbursement proceeds. The e-invoice attachment reference is cleared.
- What happens when the LHDN sandbox and production environments have different behaviors? Environment-aware configuration must be used.
- What happens when a business has no eligible invoices (none sent to LHDN)? The compliance dashboard should show a zero state with guidance on how to start submitting.

## Requirements *(mandatory)*

### Functional Requirements

**Status Polling (Foundation)**
- **FR-001**: System MUST periodically check LHDN for status changes on all issued e-invoices validated within the last 72 hours.
- **FR-002**: System MUST detect buyer-initiated rejections and update local records with status, reason, and timestamp.
- **FR-003**: System MUST detect external cancellations and distinguish them from issuer-initiated cancellations.
- **FR-004**: System MUST stop polling invoices after 72 hours from validation (status is final per LHDN rules).
- **FR-005**: System MUST send in-app notifications to the invoice creator and business owner/finance admin when an issued invoice is rejected or externally cancelled.
- **FR-006**: System MUST handle LHDN API errors during polling gracefully — retry on next cycle, never corrupt local state due to transient failures.
- **FR-006a**: When an issued invoice is rejected or externally cancelled and has a posted journal entry, the system MUST NOT auto-reverse the journal entry. Instead, it MUST flag the invoice with a warning badge indicating "LHDN Rejected — Review Required" so the user can decide whether to reverse, void, or re-issue.

**Buyer Rejection**
- **FR-007**: System MUST allow users with owner, finance_admin, or manager role to reject a received e-invoice within 72 hours of LHDN validation.
- **FR-008**: System MUST require a rejection reason when submitting a rejection.
- **FR-009**: System MUST call the LHDN API to file the rejection.
- **FR-010**: System MUST update the received document record when a rejection is filed. If the rejected document is linked to an approved expense claim, the system MUST add a warning flag "E-Invoice Rejected" on the claim (requiring finance admin review before reimbursement) and clear the e-invoice attachment reference — but MUST NOT change the claim's approval status.
- **FR-011**: System MUST enforce the 72-hour rejection window — prevent attempts after expiry.
- **FR-012**: System MUST display the remaining time in the rejection window when viewing a rejectable document.

**Validated E-Invoice PDF with QR**
- **FR-013**: System MUST generate a PDF for validated e-invoices that includes: LHDN QR code, document UUID, validation timestamp, and a visual validation indicator.
- **FR-014**: The LHDN QR code MUST encode the correct LHDN share URL for the document.
- **FR-015**: System MUST provide a download action on the invoice detail page for validated e-invoices.
- **FR-016**: System MUST support auto-delivery of the validated PDF via email to the buyer, using the existing email service.
- **FR-017**: System MUST allow businesses to enable or disable auto-delivery of validated e-invoices. Auto-delivery MUST be ON by default for all businesses.
- **FR-018**: System MUST skip email delivery without error when the buyer's email is not available.

**Buyer Notifications**
- **FR-019**: System MUST send email notifications to buyers when their e-invoice is validated, cancelled, or when their rejection is processed.
- **FR-020**: Buyer notification emails MUST include: document UUID, a link to the LHDN portal page, and relevant details (amount, invoice number, status reason).
- **FR-021**: System MUST allow businesses to enable or disable buyer notifications per event type.
- **FR-022**: System MUST use the existing email infrastructure for buyer notifications.

**Compliance Dashboard**
- **FR-023**: System MUST display e-invoice compliance metrics: total submitted, validation rate, rejection rate, cancellation rate, pending count, failed count, and compliance score.
- **FR-024**: Compliance score MUST be calculated as: invoices submitted to LHDN / total eligible invoices, expressed as a percentage.
- **FR-025**: System MUST display a monthly volume chart showing submission, validation, and rejection trends.
- **FR-026**: System MUST display a table of top rejection/validation error reasons grouped by error code.
- **FR-027**: System MUST support date range filtering on all dashboard metrics and charts.
- **FR-028**: System MUST support CSV export of e-invoice submission history for audit purposes.
- **FR-029**: The dashboard MUST be embedded as a tab within the existing sales invoices page (not a separate page).

### Key Entities

- **Issued E-Invoice Status Change**: Represents a status transition detected by polling — captures previous status, new status, reason, timestamp, and source (buyer rejection vs external cancellation).
- **Buyer Rejection Request**: A user-initiated action to reject a received e-invoice — captures document UUID, rejection reason, requesting user, and timestamp.
- **Validated E-Invoice PDF**: A generated PDF containing the original invoice content plus LHDN validation artifacts (QR code, UUID, timestamp, validation badge).
- **Buyer Notification**: An outbound email triggered by an e-invoice lifecycle event — captures event type, recipient, delivery status, and timestamp.
- **E-Invoice Compliance Metrics**: An aggregate view of e-invoice health — submission counts by status, compliance score, monthly trends, and error breakdowns.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Buyer rejections and external cancellations are detected within 10 minutes of occurring on LHDN.
- **SC-002**: Only invoices within the 72-hour window are polled, keeping the polling set bounded and proportional to recent activity.
- **SC-003**: Users can reject a received e-invoice end-to-end (view, enter reason, confirm, LHDN status updated) in under 30 seconds.
- **SC-004**: 100% of validated e-invoices have a downloadable PDF with LHDN QR code available within 1 minute of validation.
- **SC-005**: Auto-delivered e-invoice emails reach the buyer within 5 minutes of LHDN validation.
- **SC-006**: Buyer notification emails are sent for all three lifecycle events (validation, cancellation, rejection) when enabled.
- **SC-007**: The compliance dashboard loads within 3 seconds for businesses with up to 10,000 invoices.
- **SC-008**: All e-invoice status changes are reflected in real-time on the UI.
- **SC-009**: Zero data integrity issues — local records always match LHDN's source of truth for documents within the active window.

## Clarifications

### Session 2026-03-16

- Q: When a buyer rejects an issued e-invoice that already has a posted journal entry, should the system auto-create a reversal journal entry? → A: No auto-reversal. Flag the invoice for review with a warning badge; user decides whether to reverse, void, or re-issue.
- Q: When a received e-invoice is rejected and it was linked to an approved expense claim, what should happen to that claim? → A: Keep status as "approved" but add a warning flag "E-Invoice Rejected" requiring finance admin review before reimbursement.
- Q: Should auto-delivery of validated e-invoice PDFs to buyers be ON or OFF by default? → A: ON by default. Businesses can disable in settings.

## Assumptions

- LHDN sandbox environment faithfully simulates buyer rejection and cancellation behaviors for testing.
- The 72-hour rejection/cancellation window is consistent across all LHDN document types (Invoice, Credit Note, Debit Note, Self-Billed).
- Buyer email addresses stored in customer records are valid and deliverable for the majority of cases.
- The existing email sending domain has sufficient sending reputation and quota for buyer notification volume.
- The LHDN API rate limit for status queries (300 RPM) is sufficient for polling all active invoices across all businesses.
- The existing PDF rendering setup can generate PDFs server-side for auto-delivery, not just client-side.
