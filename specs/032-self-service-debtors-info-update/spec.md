# Feature Specification: Debtor Self-Service Information Update

**Feature Branch**: `032-self-service-debtors-info-update`
**Created**: 2026-03-22
**Status**: Draft
**Input**: GitHub Issue #366 — Self-service debtor/customer information update via QR code on sales invoice PDF + email info request button
**Labels**: enhancement, priority:p2, einvoice

## Clarifications

### Session 2026-03-22

- Q: Should pending debtor updates require admin approval before merging into the customer record? → A: No. Auto-apply immediately. The invoice PDF already displays the debtor's name, address, TIN, BRN — so QR code access exposes no additional data. Debtors know their own info best. Replace approval queue with a change log (notification + diff) so the business can see what changed and revert if needed.
- Q: Should the self-service QR code appear on every invoice or be opt-in? → A: Business-level toggle in invoice settings, default enabled. Businesses can disable it if they prefer a cleaner layout or don't need it.
- Q: How should the admin be notified when a debtor submits an update? → A: Action Center alert only (in-app). No email notification to admin.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Debtor Fills Out Self-Service Form via Link (Priority: P1)

A debtor receives a link (via QR code scan or email) to a public form pre-filled with their current business details. They update the relevant fields — especially TIN, BRN, and address for e-invoice compliance — and submit. The form requires no login or account. Changes are applied immediately to the customer record.

**Why this priority**: This is the core value proposition — letting debtors self-serve their info updates without back-and-forth emails or phone calls. Without the form, there is nothing for debtors to fill out.

**Independent Test**: Can be tested by generating a token, navigating to the public URL, verifying pre-filled data, editing fields, and submitting. The customer record should be updated immediately.

**Acceptance Scenarios**:

1. **Given** a valid, non-expired token URL, **When** a debtor opens it, **Then** a public form loads with all existing customer fields pre-filled (no login required).
2. **Given** the form is loaded, **When** the debtor updates TIN, BRN, and address fields and clicks Submit, **Then** the changes are applied directly to the customer record and a confirmation message is displayed.
3. **Given** an expired token URL, **When** a debtor opens it, **Then** a friendly message explains the link has expired and instructs them to contact the business for a new link.
4. **Given** a token that has already reached the daily submission limit (5), **When** the debtor tries to submit again, **Then** the form shows a message explaining the daily limit and to try again tomorrow.
5. **Given** the form is loaded, **When** the debtor views the customer code field, **Then** it is displayed as read-only and cannot be edited.

---

### User Story 2 — Business Sees Change Log When Debtor Updates Info (Priority: P1)

When a debtor submits updated info, the business admin receives a notification showing what changed (old vs. new values). The admin can view a change history for each debtor and revert any update if something looks wrong.

**Why this priority**: Even though changes auto-apply, the business needs visibility. Without a change log, admins would have no way to know when debtor info was updated or to catch errors.

**Independent Test**: Can be tested by submitting a debtor update via the public form and verifying a change log entry appears with correct old/new values, and that the revert action restores the previous data.

**Acceptance Scenarios**:

1. **Given** a debtor submits updated info via the self-service form, **When** the submission is processed, **Then** a change log entry is created recording the old values, new values, timestamp, and the token used.
2. **Given** a change log entry exists, **When** the admin views the debtor's detail page, **Then** they see a change history section showing all self-service updates with changed fields highlighted.
3. **Given** a recent change log entry, **When** the admin clicks "Revert", **Then** the customer record is restored to the values before that update and a new log entry records the revert.
4. **Given** a debtor update is applied, **When** the system processes it, **Then** an Action Center alert is created (e.g., "ABC Corp updated their TIN and address").

---

### User Story 3 — QR Code Appears on Sales Invoice PDF (Priority: P2)

When a business generates a sales invoice PDF, a QR code is rendered in the footer area that encodes the debtor's unique self-service update URL. The debtor can scan it with any phone camera to open the form.

**Why this priority**: The QR code is the passive, always-available entry point. Every printed or emailed invoice becomes a touchpoint for collecting missing debtor info. However, it depends on the form (Story 1) being in place first.

**Independent Test**: Can be tested by generating a sales invoice PDF and verifying the QR code is present, scannable, and resolves to a valid self-service URL for the correct debtor.

**Acceptance Scenarios**:

1. **Given** a sales invoice is generated as PDF, **When** the PDF renders, **Then** a QR code appears in the footer area near payment terms.
2. **Given** the QR code is rendered, **When** scanned with a phone camera, **Then** it opens the debtor's self-service update form with correct pre-filled data.
3. **Given** the QR code URL, **When** the token has not expired, **Then** the form loads successfully.
4. **Given** a debtor with an existing valid token, **When** a new invoice is generated for the same debtor, **Then** the same token/URL is reused (not a new token per invoice).
5. **Given** the QR code on the PDF, **When** viewed by the user, **Then** a bilingual label is displayed: "Scan to update your business details / Imbas untuk kemaskini maklumat perniagaan anda".

---

### User Story 4 — Business Sends Email Requesting Debtor Info Update (Priority: P2)

From the debtor detail page, a business user clicks "Request Info Update" which sends a professional email to the debtor containing the self-service link and an explanation of why their details are needed (e-invoice compliance).

**Why this priority**: Email is the active outreach channel — the business proactively asks debtors to update. This complements the passive QR code approach. Depends on Story 1.

**Independent Test**: Can be tested by clicking the button on a debtor with an email address, verifying the email is sent via SES, and confirming the link in the email opens the correct pre-filled form.

**Acceptance Scenarios**:

1. **Given** a debtor with an email address on file, **When** the user clicks "Request Info Update", **Then** a professional branded email is sent containing the self-service link with a clear call-to-action.
2. **Given** a debtor with no email address, **When** the user clicks "Request Info Update", **Then** a tooltip or message explains "No email address on file. Add an email first."
3. **Given** the email is sent, **When** the debtor receives it, **Then** the email contains: business name, explanation of why info is needed, a prominent CTA button, token expiry notice, and "Powered by Groot Finance" footer.
4. **Given** an email was already sent for this debtor within the last 24 hours, **When** the user clicks "Request Info Update" again, **Then** a confirmation prompt warns "An email was sent X hours ago. Send again?" to prevent spamming.

---

### User Story 5 — Bulk Email Request from Debtors List (Priority: P3)

From the debtors list view, a business user selects multiple debtors and triggers a bulk "Request Info Update" action. The system sends emails only to debtors with email addresses and reports a summary of sent vs. skipped.

**Why this priority**: Bulk sending is an efficiency multiplier but is not required for the core flow. It's an enhancement once single-debtor email works.

**Independent Test**: Can be tested by selecting 10 debtors (7 with email, 3 without), triggering bulk send, and verifying 7 emails are queued and 3 are skipped with appropriate summary.

**Acceptance Scenarios**:

1. **Given** 10 debtors are selected (7 with email, 3 without), **When** the user clicks "Request Info Update", **Then** a summary dialog shows "Will send to 7 debtors (3 skipped — no email)".
2. **Given** the user confirms the bulk send, **When** emails are dispatched, **Then** each debtor receives an individual email with their own unique self-service link.
3. **Given** the bulk send completes, **When** the user views the result, **Then** a summary shows how many emails were sent successfully and any failures.
4. **Given** SES rate limits, **When** sending to a large number of debtors, **Then** the system respects rate limits and queues emails appropriately without dropping any.

---

### User Story 6 — Token Management and Regeneration (Priority: P3)

A business admin can view and manage self-service tokens for each debtor — seeing when tokens were created, when they expire, and regenerating expired tokens when needed.

**Why this priority**: Token management is an admin housekeeping feature. The system auto-generates tokens when needed (for QR or email), so explicit management is a convenience, not a blocker.

**Independent Test**: Can be tested by navigating to a debtor detail page, viewing token status, and clicking "Regenerate Link" to create a new token.

**Acceptance Scenarios**:

1. **Given** a debtor detail page, **When** the admin views the self-service section, **Then** they see the current token status (active/expired), creation date, and expiry date.
2. **Given** an expired token, **When** the admin clicks "Regenerate Link", **Then** a new token is created with a fresh expiry period and the old token is invalidated.
3. **Given** a debtor with no token, **When** the admin clicks "Generate Link", **Then** a new token is created and the self-service URL is displayed (copyable).

---

### Edge Cases

- What happens when a debtor submits an update but the business has been deactivated or deleted? The form should show a generic "This link is no longer active" message.
- What happens when a debtor changes their TIN to a value already used by another customer of the same business? The system should flag a warning on the confirmation screen but still apply the change, since the debtor knows their own TIN.
- How does the form handle very long address fields or special characters (Chinese/Tamil names common in Malaysia)? The form must support Unicode input and validate max field lengths matching the existing `customers` table constraints.
- What happens if SES email delivery fails (bounce, complaint)? The system should log the failure and allow the business user to retry or see the error status.
- What if a debtor accesses the form from a country blocked by the business's firewall rules? The public form should be accessible globally — it is a public page with no geo-restrictions.
- What if a debtor submits incorrect info that breaks an e-invoice submission? The business can revert the change from the change log and re-submit. The change log preserves old values for exactly this purpose.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a unique, time-limited token per debtor (mapped to businessId + customerId) with a configurable expiry period (default 30 days).
- **FR-002**: System MUST render a public form at the token URL that requires no authentication, pre-filled with all existing customer fields from the debtor's record.
- **FR-003**: The public form MUST allow editing of: business name, contact person, position, email, phone, phone2, fax, address (line1-3, city, stateCode, postalCode, countryCode), TIN, BRN, ID type (BRN/NRIC/PASSPORT/ARMY), SST registration, website, and business nature.
- **FR-004**: The public form MUST display customer code as read-only.
- **FR-005**: System MUST auto-apply submitted changes directly to the customer record — no approval gate required.
- **FR-006**: System MUST create a change log entry for every self-service update, recording: old values, new values, timestamp, and token used.
- **FR-007**: System MUST provide a change history section on the debtor detail page showing all self-service updates with changed fields highlighted (old → new).
- **FR-008**: System MUST allow admins to revert any self-service update from the change log, restoring the previous values and recording the revert action.
- **FR-009**: System MUST create an Action Center alert when a debtor submits an update (e.g., "ABC Corp updated their TIN and address"). No email notification to admin.
- **FR-010**: System MUST enforce a rate limit of maximum 5 submissions per token per 24-hour period.
- **FR-011**: System MUST show a friendly expiry message when a debtor accesses an expired token URL.
- **FR-012**: System MUST render a QR code on sales invoice PDFs (both modern and classic templates) in the footer area, encoding the debtor's self-service URL, when the business-level toggle is enabled.
- **FR-012a**: System MUST provide a business-level toggle in invoice settings to enable/disable the self-service QR code on invoices (default: enabled).
- **FR-013**: The QR code label MUST be bilingual (English and Malay).
- **FR-014**: System MUST reuse an existing valid token for the same debtor when generating QR codes across multiple invoices (one token per debtor, not per invoice).
- **FR-015**: System MUST provide a "Request Info Update" button on the debtor detail page that sends a branded email via SES containing the self-service link.
- **FR-016**: The "Request Info Update" button MUST be disabled or show a message when the debtor has no email address on file.
- **FR-017**: System MUST provide a bulk "Request Info Update" action in the debtors list view for selected debtors, sending emails only to those with email addresses and reporting a sent/skipped summary.
- **FR-018**: System MUST track email send timestamps per token for audit and duplicate-send prevention.
- **FR-019**: System MUST sanitize all public form input to prevent XSS and injection attacks.
- **FR-020**: System MUST log all access to the public debtor update form for audit trail purposes.
- **FR-021**: System MUST allow admins to regenerate a debtor's self-service token (invalidating the previous one).

### Key Entities

- **Debtor Update Token**: A unique, time-limited credential that maps to a specific business and customer. Contains creation date, expiry date, usage tracking, and email send history. One active token per debtor at a time.
- **Debtor Change Log**: An immutable record of each self-service update. Stores the old values snapshot, new values snapshot, timestamp, token reference, and revert status. Used for visibility and rollback.
- **Customer (existing)**: The authoritative debtor record that changes are applied to directly. Contains all business details, contact info, and LHDN-required fields (TIN, BRN, ID type).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A debtor can complete the self-service form and submit updated details in under 3 minutes from scanning the QR code or clicking the email link.
- **SC-002**: Changes are applied to the customer record within 2 seconds of submission (no manual approval delay).
- **SC-003**: 90% of debtors who open the self-service form successfully submit their updated details (form completion rate).
- **SC-004**: Reduction in manual debtor info collection effort by at least 50% within 3 months of launch (measured by support interactions or manual data entry events).
- **SC-005**: Every self-service update is recorded in the change log with full old/new diff — 100% audit coverage.
- **SC-006**: The self-service form loads and is fully interactive within 3 seconds on a standard mobile connection.
- **SC-007**: Bulk email sends to 100+ debtors complete without failures or dropped emails.
- **SC-008**: QR codes on invoice PDFs are scannable by standard phone cameras at typical print resolution.
- **SC-009**: An admin can revert any self-service update in under 10 seconds from the change log.

## Assumptions

- The existing `customers` table schema already contains all fields needed for the public form (TIN, BRN, address, etc.) — no schema migration needed for the customer record itself.
- SES sending limits are sufficient for the expected volume of debtor info request emails (current SES setup in `system-email-stack.ts` handles transactional email).
- The existing LHDN QR code component (`lhdn-qr-code.tsx`) can be referenced for QR rendering patterns but serves a different purpose (LHDN validation link).
- The default token expiry of 30 days is appropriate for most businesses; this can be made configurable per-business later if needed.
- The public form does not need to support file uploads (e.g., business registration certificates) in the initial release.
- Mobile-responsive design is required since debtors will primarily access the form by scanning QR codes with their phones.
- The form supports Malaysian business context: Malay state codes, Malaysian phone formats, and LHDN-specific ID types (BRN, NRIC, PASSPORT, ARMY).
- The invoice PDF already displays the debtor's name, address, TIN, and BRN — so the QR code form exposes no additional sensitive data beyond what is already printed on the paper.

## Scope Boundaries

**In Scope**:
- QR code generation and rendering on invoice PDFs
- Public self-service form (no auth) with auto-apply
- Token generation, expiry, rate limiting
- Change log with revert capability
- Admin notification on debtor update
- Single and bulk email sending via SES
- Audit logging of form access and submissions

**Out of Scope**:
- Admin approval queue (not needed — auto-apply with change log instead)
- Debtor notification when their update is reverted (can be added later)
- File/document upload on the public form
- Multi-language form beyond bilingual QR label (form UI in English only for v1)
- SMS-based info request (email only for v1)
- Integration with LHDN validation API to verify TIN/BRN in real-time
