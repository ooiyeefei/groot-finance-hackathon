# Feature Specification: LHDN MyInvois Submission UI

**Feature Branch**: `017-lhdn-submission-ui`
**Created**: 2026-02-20
**Status**: Draft
**Input**: GitHub Issue #204 — LHDN MyInvois submission UI — status tracking, submission flow & error display
**Related Issues**: #75 (LHDN full integration), #198 (schema — completed), #206 (customer & business e-invoice fields — parallel dependency)

## Clarifications

### Session 2026-02-20

- Q: How should the `einvoiceType` be determined during LHDN submission? → A: Auto-determine from document type (sales invoice → "invoice", credit note → "credit_note", etc.). No manual user selection needed.
- Q: Should this feature include a "Cancel e-Invoice" action for validated invoices? → A: Display-only — show cancelled status badge and timeline stage, but defer the cancel action to #75 (LHDN API integration) which must enforce LHDN's regulatory cancellation rules (e.g., 72-hour window). Issue #75 updated with this requirement.
- Q: Which user roles can submit invoices to LHDN? → A: Owner and Finance Admin only. LHDN submission is a regulatory compliance action; Manager and Employee roles cannot initiate submissions.

## Dependencies

### Dependency on Issue #206 (Customer & Business e-Invoice Fields UI)

Issue #206 is being developed in parallel (separate worktree/branch). It provides:

- **Business Settings — LHDN Configuration**: TIN, BRN, MSIC code, SST registration forms that must be completed before any invoice can be submitted to LHDN
- **Customer Tax Identifiers**: TIN, BRN, structured address forms that feed into customer snapshots on invoices

**Impact**: This feature's "Submit to LHDN" flow requires business LHDN settings to be configured first. The UI must detect when required business configuration is missing and guide users to complete it (or show a clear message). The actual form components for configuring these fields are owned by #206 — this spec only needs to check whether they're populated.

### Dependency on Schema (Completed)

All LHDN fields on `sales_invoices` are already deployed via PR #203 (issue #198). Schema fields include: `lhdnSubmissionId`, `lhdnDocumentUuid`, `lhdnLongId`, `lhdnStatus`, `lhdnSubmittedAt`, `lhdnValidatedAt`, `lhdnValidationErrors`, `lhdnDocumentHash`, `einvoiceType`. Status constants (`LHDN_STATUSES`, `EINVOICE_TYPES`) and validators are also deployed.

### Out of Scope

- **LHDN API HTTP calls**: The actual submission to LHDN's MyInvois API is tracked in #75. This spec covers UI only, assuming backend mutations exist or will exist to write LHDN fields.
- **Cancel e-Invoice action**: The user action to cancel a validated LHDN e-invoice is deferred to #75 (requires LHDN API call + regulatory window enforcement). This feature displays cancelled status when it occurs but does not provide a cancel button. See [#75 comment](https://github.com/grootdev-ai/groot-finance/issues/75#issuecomment-3931508501).
- **Peppol transmission UI**: Separate issue (#205).
- **Business/Customer form fields**: Owned by #206.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View LHDN Submission Status on Invoice List (Priority: P1)

A business owner views their sales invoices list and can immediately see which invoices have been submitted to LHDN and their current validation status. Color-coded badges next to each invoice make it easy to spot invoices that need attention — whether they're awaiting validation, have been validated, or were rejected.

**Why this priority**: This is the most fundamental visibility feature. Without it, users have no way to know the LHDN compliance status of their invoices at a glance. It's the entry point for all other LHDN-related actions.

**Independent Test**: Can be tested by displaying invoices with different `lhdnStatus` values and verifying the correct badge color and label appears for each status. Delivers immediate compliance visibility.

**Acceptance Scenarios**:

1. **Given** a sales invoice has `lhdnStatus` of "pending", **When** viewing the invoices list, **Then** a gray "Pending" badge is displayed alongside the invoice.
2. **Given** a sales invoice has `lhdnStatus` of "submitted", **When** viewing the invoices list, **Then** a blue "Submitted" badge is displayed.
3. **Given** a sales invoice has `lhdnStatus` of "valid", **When** viewing the invoices list, **Then** a green "Valid" badge is displayed.
4. **Given** a sales invoice has `lhdnStatus` of "invalid", **When** viewing the invoices list, **Then** a red "Invalid" badge is displayed.
5. **Given** a sales invoice has `lhdnStatus` of "cancelled", **When** viewing the invoices list, **Then** a yellow "Cancelled" badge is displayed.
6. **Given** a sales invoice has no `lhdnStatus` (undefined), **When** viewing the invoices list, **Then** no LHDN badge is shown for that invoice.

---

### User Story 2 - Submit Invoice to LHDN (Priority: P1)

A business owner opens a sent invoice that hasn't been submitted to LHDN yet and clicks "Submit to LHDN" to initiate the government validation process. The system confirms the action before proceeding, shows a loading state during the submission, and updates the invoice status when complete. If the business hasn't configured their LHDN settings (TIN, BRN, MSIC code), the system blocks submission and directs them to complete configuration first.

**Why this priority**: This is the core action of the feature — without a submission mechanism, the LHDN tracking fields have no way to be populated from the user's perspective.

**Independent Test**: Can be tested by opening a "sent" invoice without LHDN status and clicking "Submit to LHDN". Verifying the confirmation dialog appears, loading state shows during submission, and status updates to "submitted" on success. Also test that submission is blocked when business configuration is incomplete.

**Acceptance Scenarios**:

1. **Given** a sales invoice with status "sent" and no `lhdnStatus`, **When** viewing the invoice detail page, **Then** a "Submit to LHDN" action button is visible.
2. **Given** the user clicks "Submit to LHDN", **When** the confirmation dialog appears, **Then** the dialog explains what will happen and requires explicit confirmation before proceeding.
3. **Given** the user confirms submission, **When** the submission is processing, **Then** a loading indicator is shown and the button is disabled to prevent duplicate submissions.
4. **Given** the submission succeeds, **When** the response is received, **Then** the invoice's LHDN status updates to reflect the new state and a success notification is shown.
5. **Given** the submission fails (network error, API error), **When** the error is received, **Then** an error message is displayed with actionable information and the user can retry.
6. **Given** a sales invoice with status "draft", **When** viewing the invoice detail page, **Then** the "Submit to LHDN" button is NOT visible (only sent invoices can be submitted).
7. **Given** the business has not configured required LHDN fields (TIN, BRN, or MSIC code), **When** the user attempts to submit, **Then** the system shows a clear message listing the missing fields and provides navigation to the business settings page.
8. **Given** the invoice's customer snapshot is missing TIN, **When** the user attempts to submit, **Then** the system warns about the missing buyer TIN and suggests using the general TIN ("EI00000000000") or updating the customer record.
9. **Given** a user with Manager or Employee role views a sent invoice, **When** viewing the invoice detail page, **Then** the "Submit to LHDN" button is not shown (submission restricted to Owner and Finance Admin roles).

---

### User Story 3 - View and Act on LHDN Validation Errors (Priority: P1)

When LHDN rejects an invoice (status "invalid"), the business owner can see exactly what went wrong — each validation error with its code, message, and the specific field that caused the issue. They can then correct the invoice and resubmit.

**Why this priority**: Rejected invoices require immediate attention. Without error visibility, users cannot understand why an invoice failed or how to fix it, creating a compliance bottleneck.

**Independent Test**: Can be tested by displaying an invoice with `lhdnStatus` "invalid" and `lhdnValidationErrors` populated, verifying each error's code, message, and target field are shown. The resubmit action should be available.

**Acceptance Scenarios**:

1. **Given** an invoice with `lhdnStatus` "invalid" and validation errors, **When** viewing the invoice detail page, **Then** a validation errors panel is displayed prominently.
2. **Given** validation errors exist, **When** viewing the errors panel, **Then** each error shows its error code, human-readable message, and the target field (if specified).
3. **Given** an invoice with `lhdnStatus` "invalid", **When** viewing the invoice detail page, **Then** a "Resubmit to LHDN" action button is available.
4. **Given** a validation error references a specific field (e.g., "BuyerTIN"), **When** viewing the error, **Then** the target field name is displayed to help the user identify what needs correction.
5. **Given** a validation error has no target field, **When** viewing the error, **Then** the error code and message are still displayed without the target field column.

---

### User Story 4 - View LHDN Submission Timeline (Priority: P2)

A business owner can see the complete lifecycle of an invoice's LHDN submission — from creation through submission, validation, and any subsequent cancellation. Each stage shows the timestamp of when it occurred, giving a clear audit trail.

**Why this priority**: The timeline provides compliance audit evidence and helps users understand where an invoice is in the validation process. Important for record-keeping but not required for the core submit-track-fix workflow.

**Independent Test**: Can be tested by displaying an invoice with various LHDN timestamps populated and verifying each lifecycle stage appears with the correct timestamp.

**Acceptance Scenarios**:

1. **Given** an invoice with `lhdnSubmittedAt` timestamp, **When** viewing the timeline on the invoice detail page, **Then** the "Submitted" stage shows with the formatted date and time.
2. **Given** an invoice with `lhdnValidatedAt` timestamp and `lhdnStatus` "valid", **When** viewing the timeline, **Then** the "Validated" stage shows with the timestamp and a success indicator.
3. **Given** an invoice with `lhdnValidatedAt` timestamp and `lhdnStatus` "invalid", **When** viewing the timeline, **Then** the "Rejected" stage shows with the timestamp and an error indicator.
4. **Given** an invoice with `lhdnStatus` "cancelled", **When** viewing the timeline, **Then** the "Cancelled" stage appears as the final step.
5. **Given** an invoice with only `lhdnStatus` "pending" (no timestamps yet), **When** viewing the timeline, **Then** "Pending" is shown as the current stage with subsequent stages grayed out.

---

### User Story 5 - View LHDN Verification QR Code (Priority: P2)

When an invoice has been validated by LHDN and assigned a long ID, the business owner can see a QR code on the invoice detail page that links to the official LHDN MyInvois verification page. This QR code should also appear on the generated PDF for sharing with customers.

**Why this priority**: The QR code is a compliance requirement for validated e-invoices — buyers need a way to verify the invoice's authenticity with LHDN. However, it only applies to already-validated invoices, so it's secondary to the submission and error workflows.

**Independent Test**: Can be tested by displaying an invoice with a `lhdnLongId` and verifying a QR code is rendered that encodes the correct verification URL. Also test that invoices without `lhdnLongId` do not show a QR code.

**Acceptance Scenarios**:

1. **Given** an invoice with `lhdnLongId` populated, **When** viewing the invoice detail page, **Then** a QR code is displayed that encodes the URL `https://myinvois.hasil.gov.my/{lhdnLongId}/share`.
2. **Given** an invoice without `lhdnLongId`, **When** viewing the invoice detail page, **Then** no QR code section is shown.
3. **Given** an invoice with `lhdnLongId`, **When** generating a PDF of the invoice, **Then** the QR code is included in the PDF document.
4. **Given** a user scans the QR code, **When** opening the encoded URL, **Then** it navigates to the official LHDN MyInvois verification page for that document.

---

### Edge Cases

- What happens when a user tries to submit an invoice that has already been submitted (lhdnStatus is "submitted")? The "Submit to LHDN" button should not appear; instead, the current status and timeline are shown.
- What happens when an invoice has lhdnStatus "valid" but no lhdnLongId? The QR code section should not render; the timeline still shows the validated stage. This could indicate an API response that didn't include the long ID.
- What happens when multiple invoices need to be submitted at once? Batch submission is out of scope for this feature — each invoice is submitted individually from its detail page.
- What happens when the user navigates away during submission? The submission continues in the background. On returning to the invoice, the current status is reflected.
- What happens when an invoice has been resubmitted after being invalid? The lhdnStatus transitions back to "submitted" and a new submission timestamp is recorded. The previous validation errors are replaced by the new submission's results.
- What happens when the LHDN validation errors array is empty but status is "invalid"? The errors panel shows a generic "Validation failed — no error details available from LHDN" message.
- What happens on the mobile list view? The LHDN status badge should be visible in the mobile card layout alongside the existing payment status badge.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display color-coded LHDN status badges on the sales invoices list for invoices that have an `lhdnStatus` value.
- **FR-002**: System MUST show LHDN status badges in both desktop table view and mobile card view.
- **FR-003**: System MUST display a "Submit to LHDN" action button on the invoice detail page for invoices with status "sent" that have no `lhdnStatus`.
- **FR-004**: System MUST show a confirmation dialog before submitting an invoice to LHDN, explaining the action.
- **FR-005**: System MUST display a loading state and disable the submit button during LHDN submission processing.
- **FR-006**: System MUST validate that the business has required LHDN configuration (TIN, BRN, MSIC code) before allowing submission, and display a clear message listing missing fields if not configured.
- **FR-007**: System MUST warn users when the customer snapshot on the invoice is missing a buyer TIN, offering the option to proceed with the general TIN or update the customer first.
- **FR-008**: System MUST display a validation errors panel on the invoice detail page when `lhdnStatus` is "invalid", showing each error's code, message, and target field.
- **FR-009**: System MUST display a "Resubmit to LHDN" button when an invoice has `lhdnStatus` "invalid".
- **FR-010**: System MUST display a visual timeline of the LHDN submission lifecycle on the invoice detail page, showing stages with timestamps.
- **FR-011**: System MUST generate and display a QR code on the invoice detail page when `lhdnLongId` is present, encoding the LHDN verification URL.
- **FR-012**: System MUST include the LHDN verification QR code in generated PDF invoices when `lhdnLongId` is present.
- **FR-013**: System MUST show appropriate success/error notifications after submission attempts.
- **FR-014**: System MUST hide the "Submit to LHDN" button for invoices that already have an `lhdnStatus` (already submitted, valid, invalid, or cancelled).
- **FR-015**: System MUST display the LHDN document UUID and submission ID in the invoice detail page when available, for reference purposes.
- **FR-016**: System MUST restrict the "Submit to LHDN" and "Resubmit to LHDN" actions to users with Owner or Finance Admin roles. Manager and Employee roles can view LHDN status, badges, timeline, and errors but cannot initiate submissions.

### Key Entities

- **Sales Invoice (existing)**: Core entity extended with LHDN tracking fields (already deployed). This feature adds UI visibility and interaction for the `lhdnStatus`, `lhdnValidationErrors`, `lhdnLongId`, `lhdnSubmittedAt`, `lhdnValidatedAt`, `lhdnDocumentUuid`, and `lhdnSubmissionId` fields.
- **LHDN Status Badge**: Visual indicator that maps LHDN status values to color-coded labels. Five states: pending (gray), submitted (blue), valid (green), invalid (red), cancelled (yellow).
- **LHDN Submission Timeline**: Ordered visual representation of lifecycle stages: Created → Pending → Submitted → Valid/Invalid → Cancelled, with timestamps at each transition.
- **LHDN Validation Error**: Individual error record containing code (string), message (string), and optional target field (string). Displayed as a list when an invoice is rejected.

## Assumptions

- Backend mutations to write LHDN fields on sales invoices exist or will be created as part of the LHDN API integration (#75). This feature consumes those mutations via the UI but does not define the API integration logic.
- The QR code URL format is `https://myinvois.hasil.gov.my/{lhdnLongId}/share` as specified in the LHDN MyInvois API documentation.
- Business LHDN configuration fields (TIN, BRN, MSIC code) are being built in the parallel #206 branch. This feature only needs to read those fields to check if they're populated — not provide forms to edit them.
- The general buyer TIN "EI00000000000" is acceptable by LHDN for non-registered buyers, as per LHDN documentation.
- LHDN validation errors always include at minimum a `code` and `message`; the `target` field is optional.
- The `einvoiceType` field is auto-determined from the document type at submission time: sales invoices map to "invoice", credit notes to "credit_note", debit notes to "debit_note", refund notes to "refund_note". No manual user selection is required.
- Resubmission replaces the previous validation state — there is no history of multiple submission attempts (only the latest state is tracked).
- The PDF template will need modification to include the QR code, but the overall PDF structure and templates (Modern/Classic) remain unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify the LHDN compliance status of any invoice within 2 seconds of viewing the invoices list, without clicking into the invoice.
- **SC-002**: Users can submit an eligible invoice to LHDN in 3 or fewer clicks from the invoice detail page (click Submit → confirm → done).
- **SC-003**: When an invoice is rejected by LHDN, users can see all validation error details without navigating to external systems.
- **SC-004**: 100% of validated invoices (those with an `lhdnLongId`) display a scannable QR code on both the web view and generated PDF.
- **SC-005**: Users receive clear, actionable feedback when submission is blocked due to missing business configuration, with direct navigation to resolve the issue.
- **SC-006**: The LHDN submission timeline provides a complete audit trail with timestamps for every lifecycle transition that has occurred.
- **SC-007**: LHDN UI elements are fully responsive, functioning correctly on both desktop and mobile views.
