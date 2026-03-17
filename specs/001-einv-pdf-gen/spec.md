# Feature Specification: LHDN-Validated E-Invoice PDF Generation & Buyer Delivery

**Feature Branch**: `001-einv-pdf-gen`
**Created**: 2026-03-16
**Status**: Draft
**GitHub Issue**: [#311](https://github.com/grootdev-ai/groot-finance/issues/311)
**Input**: Generate LHDN-validated e-invoice PDF with QR code and deliver to buyer via email

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Download Validated E-Invoice PDF (Priority: P1)

As a business user who has submitted a sales invoice to LHDN and received validation, I want to download a PDF that includes the LHDN validation stamp (QR code, UUID, and validation date) so I can share a legally verified e-invoice document with my buyer or keep it for records.

**Why this priority**: This is the foundational capability — without a validated PDF, neither manual sharing nor automated delivery is possible. It also addresses the immediate gap vs competitors who generate formatted e-invoice documents. Even without email delivery, users can manually download and share.

**Independent Test**: Create a sales invoice, submit to LHDN, wait for validation. Then click "Download E-Invoice (LHDN)" from the invoice detail page. Verify the PDF contains the QR code, UUID, validation timestamp, and "E-INVOICE VALIDATED" visual indicator.

**Acceptance Scenarios**:

1. **Given** a sales invoice with `lhdnStatus === "valid"` and a `lhdnLongId`, **When** I click "Download E-Invoice (LHDN)" on the invoice detail page, **Then** the system generates and downloads a PDF containing the full invoice content plus an LHDN validation block (QR code linking to the LHDN verification page, document UUID, validation date, and a visual "E-INVOICE VALIDATED" badge).
2. **Given** a sales invoice that has NOT been validated by LHDN (status is "pending", "submitted", or "rejected"), **When** I view the invoice detail page, **Then** the "Download E-Invoice (LHDN)" button is not visible.
3. **Given** a validated e-invoice of any supported document type (Invoice, Credit Note, Debit Note, Self-Billed Invoice), **When** I download the LHDN PDF, **Then** the PDF correctly renders that document type with the LHDN validation block.

---

### User Story 2 - Automatic Email Delivery to Buyer (Priority: P2)

As a business owner, I want validated e-invoices to be automatically emailed to my buyer so they receive proof of the LHDN-validated transaction without needing to check the MyInvois portal — matching or exceeding what competitors like Remicle offer.

**Why this priority**: This is the key competitive differentiator identified in the issue. It closes the gap with Remicle's flow where validated e-invoices are delivered directly to buyers. However, it depends on P1 (PDF generation) being complete first.

**Independent Test**: Enable auto-delivery in business settings. Submit an invoice to LHDN and wait for it to become validated. Verify that the buyer receives an email with the PDF attached and a link to the LHDN validation page.

**Acceptance Scenarios**:

1. **Given** a business has auto-delivery enabled and a sales invoice transitions to `lhdnStatus === "valid"`, **When** the system detects the validation, **Then** it generates the LHDN-validated PDF, emails it to the buyer's email address on file, and records the delivery timestamp and recipient email on the invoice record.
2. **Given** a business has auto-delivery enabled but the buyer's email is missing or invalid on the invoice, **When** the system attempts delivery, **Then** it skips email delivery, logs a warning, and flags the invoice as "delivery failed — no buyer email" so the user can manually resolve it.
3. **Given** a business has auto-delivery disabled, **When** a sales invoice becomes validated, **Then** no automatic email is sent. The user can manually trigger delivery via a "Send to Buyer" button on the invoice detail page, or download the PDF to share externally.
4. **Given** a validated e-invoice that was auto-delivered, **When** I view the invoice detail page, **Then** I can see when and to whom the e-invoice was delivered (timestamp + email).

---

### User Story 3 - Business-Level Auto-Delivery Settings (Priority: P3)

As a business admin, I want to configure whether validated e-invoices are automatically emailed to buyers so I can control when and how my customers receive e-invoice documents.

**Why this priority**: Configuration is important for user control but has a reasonable default (auto-deliver ON). The feature works with the default without this settings UI, making it lower priority than the core generation and delivery.

**Independent Test**: Navigate to business settings, toggle auto-delivery on/off. Submit invoices and verify delivery behavior matches the setting.

**Acceptance Scenarios**:

1. **Given** I am a business admin, **When** I navigate to the e-invoice settings area, **Then** I see a toggle for "Automatically email validated e-invoices to buyers" (default: ON).
2. **Given** I toggle auto-delivery OFF, **When** future invoices are validated by LHDN, **Then** no automatic emails are sent.
3. **Given** I toggle auto-delivery back ON, **When** new invoices are validated, **Then** automatic email delivery resumes for newly validated invoices (does not retroactively send for invoices validated while the setting was OFF).

---

### User Story 4 - Server-Side PDF Persistence (Priority: P2)

As a system, when an e-invoice is validated, I need to generate and store the PDF server-side so it can be attached to emails and served for future downloads without re-generating each time.

**Why this priority**: Same priority as email delivery because email requires a stored PDF attachment. Also improves performance for repeated downloads and ensures the PDF is a point-in-time snapshot of the validated document.

**Independent Test**: Trigger LHDN validation on an invoice. Verify that the system generates and stores the PDF. Subsequent downloads serve the stored PDF rather than regenerating.

**Acceptance Scenarios**:

1. **Given** the LHDN polling system detects an invoice status change to "valid", **When** the system processes this event, **Then** it generates the PDF with LHDN validation block and persists it in file storage, linking the storage reference to the invoice record.
2. **Given** a validated invoice already has a stored PDF, **When** I click "Download E-Invoice (LHDN)", **Then** the system serves the stored PDF directly without regenerating it.

---

### Edge Cases

- What happens when the LHDN validation QR code URL format changes? The QR code URL pattern should be centrally defined so it can be updated in one place.
- What happens when PDF generation fails mid-process? The system should retry once, and if it still fails, mark the invoice as "PDF generation failed" and notify the business user. The invoice's LHDN validation status is unaffected.
- What happens when email delivery bounces or fails? The system should record the failure, update the delivery status to "failed", and allow the user to retry manually or update the buyer's email and re-send.
- What happens for invoices validated before this feature is deployed? Existing validated invoices should generate the PDF on-demand when the user clicks "Download E-Invoice (LHDN)" — no backfill batch processing needed.
- What happens when the buyer email has invalid formatting? The system should validate email format before attempting delivery and reject obviously invalid addresses.
- What happens when a buyer cancels an invoice after the PDF was generated and delivered? The stored PDF remains as a historical record, but the invoice status reflects the cancellation. No recall of the delivered email is needed — LHDN's portal shows the current status when the QR code is scanned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a PDF for validated e-invoices that includes the full invoice content plus an LHDN validation block containing: QR code (linking to LHDN verification URL), document UUID, validation timestamp, and a visual "E-INVOICE VALIDATED" indicator.
- **FR-002**: System MUST conditionally render the LHDN validation block — only when the invoice has been validated and has a valid long identifier from LHDN.
- **FR-003**: System MUST support all e-invoice document types: Invoice, Credit Note, Debit Note, and Self-Billed Invoice.
- **FR-004**: System MUST provide a "Download E-Invoice (LHDN)" button on the sales invoice detail page, visible only for validated invoices, distinct from the regular "Download Invoice" button.
- **FR-005**: System MUST generate and persist the validated PDF server-side when an invoice's LHDN status transitions to "valid", storing a reference to the file on the invoice record.
- **FR-006**: System MUST send an email to the buyer containing the validated PDF as an attachment when auto-delivery is enabled. The email must include: invoice number, business name, a link to the LHDN verification page, and a professional message body.
- **FR-007**: System MUST record delivery metadata on the invoice: timestamp of delivery and the recipient email address.
- **FR-008**: System MUST provide a business-level setting to enable/disable automatic email delivery of validated e-invoices (default: enabled).
- **FR-009**: System MUST handle missing or invalid buyer email gracefully — skip delivery, log the issue, and surface a user-visible indicator so the business can manually resolve.
- **FR-010**: System MUST provide a "Send to Buyer" action on all validated invoices, enabling manual email delivery regardless of auto-delivery setting. This serves both as a first-time send (when auto-delivery is OFF) and as a retry for failed/skipped deliveries.
- **FR-011**: System MUST embed the QR code encoding the LHDN verification URL using the long identifier returned by LHDN upon validation.
- **FR-012**: System MUST send an in-app notification to the business user when email delivery fails (bounce, invalid email, or system error), enabling them to take corrective action without needing to check each invoice individually.

### Key Entities

- **Sales Invoice** (extended): The core entity being enhanced. Gains references to the stored validated PDF, delivery timestamps, and recipient tracking. Supports multiple document types.
- **Business Settings** (extended): Business-level configuration controlling auto-delivery behavior for validated e-invoices.
- **E-Invoice Delivery Record**: Metadata tracking when, to whom, and with what result (success/failure) a validated e-invoice PDF was delivered via email.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can download a validated e-invoice PDF (with QR code and LHDN stamp) within 5 seconds of clicking the download button.
- **SC-002**: 95% of validated e-invoices with auto-delivery enabled are delivered to the buyer's email within 10 minutes of LHDN validation.
- **SC-003**: The QR code in every generated PDF, when scanned, resolves to the correct LHDN verification page for that specific invoice.
- **SC-004**: PDF generation succeeds for all four supported document types (Invoice, Credit Note, Debit Note, Self-Billed Invoice) without layout or data errors.
- **SC-005**: Business users can toggle auto-delivery on/off and see the change reflected in delivery behavior for subsequent validations within one polling cycle.
- **SC-006**: Failed deliveries (bounce, missing email) are surfaced to the user via in-app notification and on the invoice detail view, with a clear path to retry.

## Clarifications

### Session 2026-03-16

- Q: When auto-delivery is OFF, can users still manually trigger email delivery to the buyer from the UI? → A: Yes — "Send to Buyer" button is always available on validated invoices regardless of auto-delivery setting, serving as both first-time send and retry.
- Q: Should delivery failures trigger proactive notifications or only be visible on the invoice detail page? → A: In-app notification only. No separate email to the business user — the daily AI digest already covers offline awareness, and the corrective action (retry/fix email) happens in-app.

## Assumptions

- The existing LHDN polling system reliably detects status changes to "valid" and will serve as the trigger for PDF generation and email delivery.
- Buyer email addresses stored on the sales invoice customer snapshot are the correct delivery targets.
- The existing SES email infrastructure supports PDF attachments and has sufficient sending limits for this use case.
- The LHDN verification URL format using the long identifier is the current and stable pattern.
- Auto-delivery defaults to ON for all businesses — this matches the competitive expectation (Remicle delivers automatically).
- No custom email template is needed for the initial release — a professional default template is sufficient. Custom templates can be added later if demand arises.
