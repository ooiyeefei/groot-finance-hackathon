# Feature Specification: LHDN e-Invoice Submission Pipeline

**Feature Branch**: `001-lhdn-einvoice-submission`
**Created**: 2026-02-25
**Status**: Draft
**Input**: LHDN e-Invoice Flow 1 (Sales Invoice Submission as Intermediary, GitHub #227) and Flow 3 (Self-Billed E-Invoice for Exempt Vendor Purchases, GitHub #229). These share the same submission pipeline and are specified together.

## Clarifications

### Session 2026-02-25

- Q: How are vendors flagged as "exempt" for self-billing? → A: Two-level detection: (1) Vendor-level flag (`isExempt`) on the vendor/customer record — persists across all transactions with that vendor. (2) Per-transaction QR-code detection on expense claim receipts — if no QR code detected, system infers exempt and suggests self-billing. Finance admin can override in either direction. Self-billing applies to ALL purchases from exempt vendors — both expense claims AND AP/vendor invoices, not just expense claims.
- Q: Does the user wait for LHDN validation, or does it happen in the background? → A: Asynchronous. Submission is queued immediately, user can navigate away, status updates in real-time on the record, notification on completion. LHDN validation timing varies (seconds to minutes), and merchant systems for Flow 2 may take up to days — users should never be blocked waiting.
- Q: What happens when LHDN polling times out (no response)? → A: Poll for up to 30 minutes, then mark as "timeout" with automatic retry in 1 hour, up to 3 retries. After exhausting retries, mark as "failed — manual review required" and notify the user.
- Q: Should self-billed e-invoices auto-trigger after approval or require explicit action? → A: Configurable per-business. Business owner can choose in Business Settings whether self-billing for exempt vendors auto-triggers after approval or requires manual confirmation by finance admin. Default: manual confirmation.

## Context

Malaysian businesses with annual revenue ≥ RM1M are mandated to issue e-invoices through LHDN's MyInvois system. FinanSEAL operates as an **intermediary** — submitting e-invoices on behalf of multiple tenant businesses using a single platform credential and digital certificate (hybrid model, following SQL Accounting's approach).

This specification covers two submission flows that share the same pipeline:
- **Sales invoices** (type 01/02/03/04): Business issues invoice to their customer
- **Self-billed e-invoices** (type 11): Business issues invoice on behalf of an exempt seller (small vendors below RM1M, individuals, foreign suppliers). Self-billing applies to ALL purchase transactions from exempt vendors — both employee expense claims and regular AP/vendor invoices.

### What Already Exists
- LHDN tracking fields on `sales_invoices` table (deployed)
- Business settings UI for TIN, BRN, MSIC code, LHDN Client ID (deployed)
- Customer fields for TIN, BRN, structured address (deployed)
- Digital signature Lambda infrastructure and SSM credential storage (deployed)
- LHDN status constants and UI components — badges, timeline, QR code, validation errors (deployed)
- LHDN submit button placeholder on sales invoice detail (deployed, currently disabled)

### What This Spec Adds
- The actual submission pipeline: document generation → signing → submission → polling → status sync
- Self-billed e-invoice generation from approved expense claims
- LHDN e-invoice tracking fields on expense claims
- Cancellation of validated e-invoices (within 72-hour window)
- Notification to business users on status changes

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Submit Sales Invoice to LHDN (Priority: P1)

A business owner or finance admin wants to submit a finalized sales invoice to LHDN for compliance. They click "Submit to LHDN" on an invoice that has been sent to the customer. The system converts the invoice to the required government format, digitally signs it, submits it to LHDN, and reports back whether it was accepted or rejected.

**Why this priority**: Core compliance requirement. Without this, businesses using FinanSEAL cannot meet the LHDN e-invoice mandate. This is the primary reason customers will adopt the e-invoice feature.

**Independent Test**: Can be fully tested by creating a sales invoice, sending it, then submitting to LHDN. Delivers immediate compliance value — the business has a validated e-invoice with a verification QR code.

**Acceptance Scenarios**:

1. **Given** a sales invoice in "sent" status with the business's LHDN settings configured (TIN, BRN, MSIC code), **When** the owner clicks "Submit to LHDN" and confirms, **Then** the system queues the submission (status: "pending"), the user can navigate away, and the status updates asynchronously through "submitted" to "valid" or "invalid" with a notification on completion.

2. **Given** a sales invoice where the customer has no TIN on record, **When** the owner initiates LHDN submission, **Then** the system warns that the buyer TIN is missing and offers to use the general public TIN (EI00000000000) or cancel and add the TIN first.

3. **Given** a sales invoice where the business's LHDN settings are incomplete (missing TIN, BRN, or MSIC code), **When** the owner tries to submit, **Then** the system blocks submission and directs the user to complete their Business Settings first.

4. **Given** an invoice that LHDN rejects (status: invalid), **When** the owner views the invoice, **Then** the system displays the specific validation errors returned by LHDN with actionable descriptions, and offers a "Resubmit" option after corrections.

---

### User Story 2 — View LHDN Verification QR Code on Validated Invoice (Priority: P1)

After LHDN validates an e-invoice, the business owner or finance admin needs to see the official LHDN verification QR code on the invoice. This QR code can be embedded on printed invoices or PDFs so the buyer can verify the e-invoice's authenticity with LHDN.

**Why this priority**: The QR code is the visible proof of compliance. Customers and auditors expect to see it on validated invoices. Without it, the e-invoice is validated but not practically usable.

**Independent Test**: Can be tested by viewing any invoice with LHDN status "valid" — the QR code should appear and link to LHDN's public verification page.

**Acceptance Scenarios**:

1. **Given** a sales invoice with LHDN status "valid" and a long ID assigned, **When** the user views the invoice detail, **Then** a scannable QR code is displayed that links to the LHDN public verification page for that document.

2. **Given** a sales invoice with LHDN status "pending" or "submitted", **When** the user views the invoice detail, **Then** no QR code is shown, and the current submission status is displayed instead.

---

### User Story 3 — Cancel a Validated E-Invoice (Priority: P2)

A business owner discovers an error in a recently submitted e-invoice. Within 72 hours of LHDN validation, they can cancel the e-invoice through FinanSEAL. After cancellation, they can correct the invoice and resubmit.

**Why this priority**: Errors happen. The 72-hour cancellation window is a critical safety net. Without it, businesses must use a more complex credit note process to correct mistakes.

**Independent Test**: Can be tested by submitting an invoice to LHDN, then cancelling it within 72 hours. The LHDN status should update to "cancelled".

**Acceptance Scenarios**:

1. **Given** an invoice with LHDN status "valid" that was validated less than 72 hours ago, **When** the owner clicks "Cancel E-Invoice" and provides a reason, **Then** the system sends the cancellation to LHDN and updates the status to "cancelled".

2. **Given** an invoice with LHDN status "valid" that was validated more than 72 hours ago, **When** the owner views the invoice, **Then** the "Cancel E-Invoice" option is not available, and a note explains the 72-hour window has expired.

3. **Given** a cancelled e-invoice, **When** the owner corrects the invoice data and clicks "Resubmit to LHDN", **Then** the system generates a new e-invoice document, signs it, and submits it as a fresh submission.

---

### User Story 4 — Self-Billed E-Invoice for Exempt Vendor Purchases (Priority: P2)

When a business purchases from an exempt vendor (small business below RM1M, individual, or foreign supplier), the system needs to generate and submit a self-billed e-invoice to LHDN on behalf of the company. This applies to both employee expense claims and regular AP/vendor invoices — any purchase from an exempt vendor requires self-billing.

Detection is two-level: (1) Vendors can be flagged as "exempt" at the vendor record level, which persists across all transactions. (2) For expense claims, if no QR code is found on the uploaded receipt, the system infers the merchant is likely exempt and suggests self-billing. The finance admin can confirm or override in either direction.

**Why this priority**: Self-billing is a legal requirement for ALL purchases from exempt vendors — not just expense claims. Without this, businesses are non-compliant for a significant portion of their costs, especially common for Malaysian SMEs purchasing from small local vendors.

**Independent Test**: Can be tested by (a) approving an expense claim with no QR code and confirming self-billing, or (b) marking a vendor as exempt and generating a self-billed e-invoice from an AP invoice. Both should produce a validated self-billed e-invoice linked back to the source record.

**Acceptance Scenarios**:

1. **Given** an approved expense claim where no QR code was detected on the receipt, **When** the finance admin views the claim, **Then** the system suggests "This receipt has no e-invoice QR code — self-billing may be required" and offers a "Generate Self-Billed E-Invoice" action.

2. **Given** an AP/vendor invoice from a vendor flagged as "exempt" in their vendor record, **When** the finance admin views the invoice, **Then** the system prompts that self-billing is required and offers a "Generate Self-Billed E-Invoice" action.

3. **Given** any approved expense claim or AP invoice (regardless of QR/exempt flag), **When** the finance admin chooses to, **Then** they can manually initiate "Generate Self-Billed E-Invoice" as an override.

4. **Given** the finance admin confirms self-billing (or auto-trigger is enabled for the business), **When** the action is initiated, **Then** the system generates a self-billed e-invoice (document type 11) with the company as buyer and the vendor as seller, signs it, and submits to LHDN asynchronously.

5. **Given** a self-billed e-invoice that LHDN validates successfully, **When** the validation completes, **Then** the e-invoice reference (document ID, verification QR) is automatically linked to the originating expense claim or AP invoice record, and the user is notified.

8. **Given** a business with auto-trigger enabled for self-billing, **When** an expense claim or AP invoice from an exempt vendor is approved, **Then** the system automatically generates and submits the self-billed e-invoice without requiring additional finance admin action.

9. **Given** a business with auto-trigger disabled (default), **When** an expense claim or AP invoice from an exempt vendor is approved, **Then** the system shows a prompt suggesting self-billing but waits for the finance admin to explicitly confirm.

6. **Given** a vendor with minimal info (just name, no TIN), **When** the finance admin generates a self-billed e-invoice, **Then** the system uses the general individual TIN and requires at minimum the vendor name, description, and amount.

7. **Given** a vendor newly flagged as "exempt", **When** any future expense claim or AP invoice is created for that vendor, **Then** the system automatically suggests self-billing without needing QR detection.

---

### User Story 5 — Receive Notifications on E-Invoice Status Changes (Priority: P3)

Business owners and finance admins want to be notified when an e-invoice submission result comes back from LHDN — whether it's validated, rejected, or if a buyer rejects a received e-invoice. Notifications appear in-app and optionally via email.

**Why this priority**: Submission to LHDN is asynchronous. Users should not need to manually check each invoice's status. Notifications close the feedback loop and prompt action on rejections.

**Independent Test**: Can be tested by submitting an invoice and verifying that a notification is delivered when LHDN returns the validation result.

**Acceptance Scenarios**:

1. **Given** an invoice submitted to LHDN, **When** LHDN validates it successfully, **Then** the business owner/finance admin receives a notification saying the e-invoice is valid, with a link to view it.

2. **Given** an invoice submitted to LHDN, **When** LHDN rejects it, **Then** the business owner/finance admin receives a notification with the rejection reason and a prompt to fix and resubmit.

3. **Given** a validated e-invoice, **When** the buyer rejects it (within 72 hours), **Then** the business owner/finance admin receives a notification about the rejection request.

---

### User Story 6 — Batch Submit Multiple Invoices to LHDN (Priority: P3)

A business with many invoices wants to submit several at once rather than one by one. They can select multiple invoices from the list and submit them in a single batch operation.

**Why this priority**: Operational efficiency for businesses with high invoice volumes. The LHDN system supports batch submission (up to 100 documents per batch), and this feature leverages that capability.

**Independent Test**: Can be tested by selecting 5+ invoices and submitting as a batch. Each invoice's status should update independently based on its validation result.

**Acceptance Scenarios**:

1. **Given** multiple invoices in "sent" status with valid LHDN configuration, **When** the user selects them and clicks "Submit Selected to LHDN", **Then** all selected invoices are submitted in a single batch and their statuses update individually.

2. **Given** a batch where some invoices pass validation and others fail, **When** results return from LHDN, **Then** each invoice shows its own status (valid/invalid) independently, and the user can address failures individually.

---

### Edge Cases

- What happens when the LHDN service is temporarily unavailable during submission? System should retry with backoff (up to 3 retries at 1-hour intervals after a 30-minute polling window) and notify the user if all retries are exhausted.
- What happens when a business's digital certificate expires? System should block new submissions and alert the business owner that the certificate needs renewal.
- What happens when an expense claim is edited or voided after a self-billed e-invoice has been submitted? The self-billed e-invoice should be cancelled (if within 72 hours) or flagged for credit note resolution.
- What happens when the same invoice is accidentally submitted twice? LHDN has duplicate detection (checks 5 fields within a 2-hour window). System should handle the duplicate rejection gracefully and inform the user.
- What happens when the LHDN authentication token expires mid-batch? System should transparently refresh the token and continue the batch without user intervention.
- What happens when a self-billed e-invoice needs to reference an expense claim that has multiple line items from different vendors? Each vendor should be a separate self-billed e-invoice.

## Requirements *(mandatory)*

### Functional Requirements

**Document Generation**

- **FR-001**: System MUST convert a finalized sales invoice into a LHDN-compliant e-invoice document, including supplier details, buyer details, line items, tax breakdown, and all mandatory LHDN fields.
- **FR-002**: System MUST convert an approved expense claim into a self-billed e-invoice document (document type 11), with the company as buyer and the vendor as seller.
- **FR-003**: System MUST support document types: Invoice (01), Credit Note (02), Debit Note (03), Refund Note (04), and Self-Billed Invoice (11).
- **FR-004**: System MUST format all monetary values with at least one decimal place and no trailing zeros (LHDN decimal formatting requirement).

**Digital Signing**

- **FR-005**: System MUST digitally sign each e-invoice document using the platform's certificate before submission, following the LHDN 8-step signing workflow.
- **FR-006**: System MUST block submissions if the signing certificate is expired, missing, or invalid, and display a clear error message.

**Submission & Authentication**

- **FR-007**: System MUST authenticate with LHDN using the intermediary model — the platform's own credentials with the tenant business's TIN specified per-request.
- **FR-008**: System MUST cache authentication tokens for their full validity period (60 minutes) and reuse them across submissions for the same tenant.
- **FR-009**: System MUST support submitting individual invoices and batches of up to 100 invoices in a single submission.
- **FR-010**: System MUST validate that the business has all required LHDN configuration (TIN, BRN, MSIC code) before allowing submission.

**Status Tracking & Polling**

- **FR-011**: System MUST poll LHDN for validation results after submission for up to 30 minutes. If no final status is received, the system retries automatically (up to 3 retries at 1-hour intervals). After exhausting retries, the submission is marked as "failed — manual review required" and the user is notified.
- **FR-012**: System MUST store the LHDN submission ID, document UUID, long ID, validation timestamp, and any validation errors on the invoice/expense claim record.
- **FR-013**: System MUST update the LHDN status through its lifecycle: pending → submitted → valid/invalid → cancelled.

**QR Code & Verification**

- **FR-014**: System MUST generate a verification QR code from the LHDN long ID for every validated e-invoice and display it on the invoice detail view.
- **FR-015**: The QR code MUST encode the LHDN public verification URL so anyone scanning it can verify the e-invoice directly with LHDN.

**Cancellation**

- **FR-016**: System MUST allow cancellation of validated e-invoices within 72 hours of validation, requiring a cancellation reason.
- **FR-017**: System MUST clearly indicate when the 72-hour cancellation window has expired and the option is no longer available.

**Self-Billed E-Invoices (Expense Claims)**

- **FR-018**: System MUST suggest self-billing when no QR code is detected on an expense claim receipt, or when the vendor is flagged as "exempt" at the vendor record level, and allow the finance admin to confirm, dismiss, or manually initiate self-billing on any approved expense claim or AP invoice.
- **FR-019**: System MUST track LHDN submission status on both expense claim and AP invoice records (submission ID, document UUID, long ID, status, validation errors).
- **FR-020**: System MUST link the self-billed e-invoice back to the originating expense claim or AP invoice record after LHDN validation.
- **FR-021**: System MUST support vendors with minimal information (name only) by using the general individual TIN for the supplier field.
- **FR-025**: System MUST allow marking a vendor/customer as "exempt" at the record level, persisting the flag across all future transactions with that vendor.
- **FR-026**: System MUST provide a per-business setting to configure whether self-billing for exempt vendors auto-triggers after approval or requires manual confirmation. Default: manual confirmation.

**Notifications**

- **FR-022**: System MUST notify the business owner/finance admin when an e-invoice status changes (validated, rejected, buyer rejection request).
- **FR-023**: Notifications MUST include a direct link to the affected invoice or expense claim.

**Access Control**

- **FR-024**: Only users with Owner or Finance Admin roles MUST be able to initiate LHDN submissions and cancellations. Other roles can view LHDN status but not take action.

### Key Entities

- **E-Invoice Document**: A structured representation of a sales invoice or self-billed invoice in the format required by LHDN. Contains supplier details, buyer details, line items, tax breakdown, digital signature, and document metadata. Related to either a Sales Invoice or an Expense Claim.
- **LHDN Submission**: A record of a submission to LHDN's system. Contains the submission ID, one or more document UUIDs, validation status, timestamps, and any error details. A submission can contain 1–100 documents.
- **Self-Billed E-Invoice**: A special e-invoice (type 11) where the buyer's company creates the invoice on behalf of the seller. Triggered from an approved expense claim or AP/vendor invoice when the vendor is exempt from e-invoicing. Links back to the originating record.
- **Exempt Vendor**: A vendor that is not required to issue e-invoices — below RM1M annual revenue, an individual (non-business person), or a foreign supplier. Purchases from exempt vendors require the buyer to self-bill. Exempt status is determined by: (1) a persistent `isExempt` flag on the vendor record, or (2) absence of a QR code on an expense claim receipt, with finance admin override in either direction.

## Assumptions

- The platform's LHDN digital certificate and signing infrastructure are operational (deployed per existing specs).
- The platform's intermediary registration with LHDN is complete (TIN, BRN, Client ID provisioned).
- Each tenant business has already been onboarded — they've registered on MyInvois Portal and authorized FinanSEAL as their intermediary.
- Business settings (TIN, BRN, MSIC code) are already configurable in the UI (deployed).
- Customer TIN and structured address fields are already available in the customer records (deployed).
- The existing notification infrastructure (in-app + email) can be reused for e-invoice status change notifications.
- Self-billed e-invoices count toward the same e-invoice usage limit as sales invoices per the pricing plan.
- The LHDN sandbox environment is available for testing before production deployment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A business user can submit a sales invoice to LHDN and receive a validation result within 5 minutes of clicking "Submit".
- **SC-002**: 95% of correctly configured invoices (valid TIN, BRN, MSIC, complete data) pass LHDN validation on first submission.
- **SC-003**: A finance admin can generate and submit a self-billed e-invoice from an approved expense claim in under 3 clicks.
- **SC-004**: Users receive notification of LHDN validation results (success or failure) within 2 minutes of LHDN completing validation.
- **SC-005**: The system handles LHDN service unavailability gracefully — queues submissions and retries without user intervention, with status visible to the user at all times.
- **SC-006**: Batch submission of up to 100 invoices completes (all individual statuses resolved) within 15 minutes.
- **SC-007**: All validated e-invoices display a verification QR code that, when scanned, opens LHDN's public verification page showing correct invoice details.

## Dependencies

- GitHub #216 — Procure LHDN digital certificate from MCMC-licensed CA
- GitHub #217 — LHDN intermediary registration & onboarding UX
- GitHub #218 — LHDN invoice JSON format compliance (namespace prefixes + decimal formatting)
- GitHub #199 — Digital signature infrastructure (completed)
- GitHub #198 — E-invoice schema changes (completed)

## Reference

- Research: `docs/features/einvoice/lhdn-einvoice-research.md`
- Existing spec: `specs/016-e-invoice-schema-change/spec.md`
- Existing spec: `specs/017-lhdn-submission-ui/spec.md`
- Existing spec: `specs/001-digital-signature-infra/spec.md`
