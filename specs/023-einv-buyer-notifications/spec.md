# Feature Specification: E-Invoice Buyer Notifications

**Feature Branch**: `023-einv-buyer-notifications`
**Created**: 2026-03-16
**Status**: Draft
**Input**: GitHub Issue #312 — P1: Buyer notifications — notify customers on e-invoice validation, cancellation, rejection
**Priority**: P1 (competitive parity with Remicle)

## Clarifications

### Session 2026-03-16

- Q: PDPA compliance for sending emails to external buyers (non-Groot users) — is buyer unsubscribe needed? → A: Transactional exemption applies. No per-buyer unsubscribe mechanism needed. These are LHDN-mandated e-invoice lifecycle notifications, not marketing. The business-level toggle (FR-006) provides sufficient issuer-side control.
- Q: Should the system maintain an audit trail for sent buyer notifications? → A: Log on sales invoice — append notification events (type, email, timestamp, send status) to the existing sales invoice record. No separate notification log table needed.
- Q: Should the system prevent duplicate notifications for the same event on the same invoice? → A: Yes — idempotent via audit log. Before sending, check if a notification of the same event type has already been logged as "sent" on that invoice; skip if so.
- Q: Should buyer notification emails support multiple languages? → A: English-only for v1. Standard B2B business language for Malaysian invoicing. Localization deferred to future iteration based on buyer feedback.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buyer Receives Validation Notification (Priority: P1)

As a buyer (customer) who has received an e-invoice from a Groot SME, I want to be notified by email when LHDN validates the e-invoice so that I know the document is officially recognized and can act on it (e.g., schedule payment, file for records).

**Why this priority**: This is the most common lifecycle event — every successfully submitted e-invoice gets validated. Without this notification, buyers must manually check the MyInvois portal. Competitor (Remicle) already provides this, making it table stakes for competitive parity.

**Independent Test**: Can be fully tested by submitting a test e-invoice, having the LHDN polling detect validation, and verifying the buyer receives an email with correct invoice details and MyInvois link.

**Acceptance Scenarios**:

1. **Given** an e-invoice has been submitted to LHDN and the buyer has an email on file, **When** the LHDN polling detects the status changes to "valid", **Then** the buyer receives an email containing the invoice number, business name, document UUID, validation date, amount, and a link to view on MyInvois portal.
2. **Given** an e-invoice is validated but the buyer has no email on file, **When** the validation is detected, **Then** the system skips the buyer notification silently without errors and logs the skip reason.
3. **Given** the business has disabled "notify buyer on validation" in their settings, **When** the e-invoice is validated, **Then** no buyer notification email is sent.

---

### User Story 2 - Buyer Receives Cancellation Notification (Priority: P1)

As a buyer who received a validated e-invoice, I want to be notified when the issuer cancels that e-invoice so that I can update my records and avoid paying a cancelled invoice.

**Why this priority**: Cancellation without notification creates financial risk for the buyer — they may pay an invoice that no longer exists. This is a compliance and trust concern.

**Independent Test**: Can be tested by issuing a test e-invoice, waiting for validation, then cancelling it through the Groot cancel flow, and verifying the buyer receives a cancellation email with the reason.

**Acceptance Scenarios**:

1. **Given** a validated e-invoice exists and the buyer has an email on file, **When** the issuer cancels the e-invoice via Groot, **Then** the buyer receives an email stating the invoice has been cancelled, including the cancellation reason, invoice number, UUID, and amount.
2. **Given** the business has disabled "notify buyer on cancellation", **When** the issuer cancels an e-invoice, **Then** no cancellation email is sent to the buyer.

---

### User Story 3 - Buyer Receives Rejection Confirmation (Priority: P2)

As a buyer who has rejected an e-invoice through the LHDN system, I want to receive confirmation that my rejection has been processed so that I have a record of the action and know the issuer has been informed.

**Why this priority**: This is a confirmation of the buyer's own action. While lower priority than unsolicited status changes (validation/cancellation), it provides a complete audit trail and professional experience. Rejection is less common than validation or cancellation.

**Independent Test**: Can be tested by simulating a buyer rejection detected via LHDN polling and verifying the buyer receives a confirmation email.

**Acceptance Scenarios**:

1. **Given** a buyer has rejected an e-invoice through MyInvois/LHDN, **When** the LHDN polling detects the rejection status, **Then** the buyer receives a confirmation email stating their rejection has been processed, with the invoice number and UUID.
2. **Given** the rejection is detected but the buyer has no email on file, **When** the rejection is processed, **Then** the notification is skipped silently.

---

### User Story 4 - Business Controls Buyer Notification Preferences (Priority: P2)

As a business admin, I want to control whether buyer notification emails are sent for each event type (validation, cancellation) so that I can manage my customer communication preferences.

**Why this priority**: Businesses need control over what communications go to their customers under their brand. Some may prefer to handle buyer communication through their own channels.

**Independent Test**: Can be tested by toggling notification settings in the business settings UI and verifying that emails are sent or suppressed accordingly.

**Acceptance Scenarios**:

1. **Given** a business admin is on the business settings page, **When** they view the e-invoice notification settings, **Then** they see toggles for "Notify buyer on validation" and "Notify buyer on cancellation", both defaulting to enabled.
2. **Given** a business admin disables "Notify buyer on validation", **When** a subsequent e-invoice is validated, **Then** no buyer notification is sent for that event.
3. **Given** a business admin re-enables a previously disabled notification, **When** the next relevant event occurs, **Then** the buyer notification resumes.

---

### Edge Cases

- What happens when the buyer's email address is malformed or invalid? The system validates email format before sending and skips with a logged warning if invalid.
- What happens when the SES email send fails (e.g., bounce, rate limit)? The system logs the failure and does not block the main e-invoice workflow. No automatic retry for transactional notifications.
- What happens when multiple status changes occur rapidly (e.g., validation immediately followed by cancellation)? Each event triggers its own independent notification.
- What happens when the same e-invoice is cancelled and the cancellation is later rejected by LHDN? The notification reflects the action taken at the time — no recall mechanism for sent emails.
- What happens when a business has no buyer email for a customer? The system skips the notification silently, logs the reason, and continues the parent workflow without error.
- What happens when the polling detects the same "valid" status on consecutive cycles? The system checks the notification log for an existing "sent" entry of the same event type and skips if already sent (idempotent).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST send an email notification to the buyer when an e-invoice status changes to "valid" on LHDN, provided the buyer has an email on file and the business has not disabled validation notifications.
- **FR-002**: System MUST send an email notification to the buyer when the issuer cancels an e-invoice, provided the buyer has an email on file and the business has not disabled cancellation notifications.
- **FR-003**: System MUST send a confirmation email to the buyer when their e-invoice rejection is detected by the LHDN polling, provided the buyer has an email on file.
- **FR-004**: Each buyer notification email MUST include: invoice number, issuer business name, document UUID, relevant date (validation/cancellation/rejection date), invoice amount with currency, and a direct link to view the document on the MyInvois portal.
- **FR-005**: Cancellation notification emails MUST include the cancellation reason provided by the issuer.
- **FR-006**: System MUST provide per-business configuration toggles for enabling/disabling buyer notifications on validation and cancellation events, with both defaulting to enabled.
- **FR-007**: System MUST gracefully handle cases where the buyer's email is unavailable or invalid — skip the notification without errors and without blocking the parent workflow.
- **FR-008**: All buyer notification emails MUST be sent from the `notifications.hellogroot.com` domain using existing email infrastructure.
- **FR-009**: Notification emails MUST clearly identify the sending business and include a footer stating the email is automated via Groot Finance.
- **FR-010**: System MUST resolve the buyer's email from the sales invoice's customer contact information (primary email or contact email).
- **FR-011**: System MUST log each buyer notification attempt on the sales invoice record, capturing: event type, recipient email, timestamp, and send status (sent/skipped/failed).
- **FR-012**: System MUST prevent duplicate notifications by checking the notification log before sending — if a notification of the same event type is already logged as "sent" on that invoice, the system skips sending.

### Key Entities

- **Buyer Notification**: An email notification sent to the buyer (customer) on an e-invoice, triggered by a lifecycle event (validation, cancellation, rejection). Contains event type, invoice reference, and relevant metadata.
- **Business Notification Settings**: Per-business configuration that controls which buyer notification events are active. Attributes include toggles for validation and cancellation notifications.
- **Sales Invoice (existing, extended)**: The source document containing buyer contact information (email, name), invoice details (number, amount, currency), and LHDN metadata (UUID, long ID, status). Extended with a buyer notification log — an ordered list of notification events recording type, recipient email, timestamp, and send status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of validated e-invoices where the buyer has an email on file and notifications are enabled result in a buyer notification email being sent within 5 minutes of status detection.
- **SC-002**: Buyers can view their validated e-invoice on the MyInvois portal directly from the email link with a single click.
- **SC-003**: Business admins can configure buyer notification preferences in under 30 seconds via the settings interface.
- **SC-004**: Zero buyer notification failures block or delay the core e-invoice workflow (validation, cancellation, or rejection processing).
- **SC-005**: Feature achieves parity with competitor (Remicle) buyer notification flow covering validation, cancellation, and rejection events.

## Assumptions

- The existing email infrastructure on `notifications.hellogroot.com` is operational and has sufficient sending limits for buyer notifications.
- Buyer email addresses are stored in the sales invoice's customer snapshot (either primary email or contact email).
- The LHDN polling mechanism (for validation and rejection detection) already exists and can be extended with notification triggers.
- The e-invoice cancellation flow already exists and can be extended with a notification step.
- Rejection confirmation notifications are always sent (not configurable per-business) since they confirm the buyer's own action.
- No per-business custom email branding is needed — all emails use a standard Groot Finance template with the business name in the body.
- Buyer notification emails are transactional (LHDN-mandated e-invoice lifecycle events), not marketing. No per-buyer unsubscribe mechanism is required under PDPA. The business-level toggle provides issuer-side control.
- All buyer notification emails are in English only for v1. Localization (Malay, Chinese) is deferred to a future iteration based on buyer feedback.

## Dependencies

- **LHDN Status Polling** (Issue #309 — implemented): Buyer notifications for validation and rejection depend on the polling mechanism detecting status changes.
- **E-Invoice Cancellation Flow** (existing): Cancellation notifications depend on the existing cancel API route.
- **Email Infrastructure** (existing): The `notifications.hellogroot.com` domain and email sending configuration must be operational.
- **Buyer Rejection Flow** (Issue #310 — implemented): Rejection confirmation depends on the rejection detection mechanism.
