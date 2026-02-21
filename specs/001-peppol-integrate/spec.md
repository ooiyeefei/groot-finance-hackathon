# Feature Specification: Singapore InvoiceNow (Peppol) Full Integration

**Feature Branch**: `001-peppol-integrate`
**Created**: 2026-02-20
**Status**: Draft
**Input**: GitHub Issues #196 (Singapore InvoiceNow/Peppol e-invoice integration) and #205 (Peppol InvoiceNow transmission UI — status tracking & delivery confirmation)

## Context

Singapore's InvoiceNow is the national e-invoicing framework built on the Peppol network, governed by IMDA. IRAS has mandated phased adoption for GST-registered businesses:

| Phase   | Revenue Threshold | Mandate Date |
| ------- | ----------------- | ------------ |
| Phase 1 | >SGD 100M         | Nov 2025     |
| Phase 2 | >SGD 25M          | May 2026     |
| Phase 3 | All GST-registered | Nov 2026     |

FinanSEAL's pricing already includes e-invoicing (Starter: 100/month, Pro: Unlimited, Enterprise: Unlimited). The database schema fields for Peppol tracking are already deployed. UI component shells exist with "Coming Soon" labels. This spec covers activating the full end-to-end Peppol transmission capability — from document generation through network delivery and status tracking.

**Prerequisite work already completed:**
- Peppol tracking fields on sales invoices (status, timestamps, errors, document ID)
- Peppol participant ID fields on businesses and customers
- Status constants and validation rules
- UI component placeholders (badges, transmission panel, error panel)
- Mutation stubs for initiate/retry transmission
- Customer form with Peppol Participant ID input

## Scope

**In scope:**
- Outbound Peppol transmission — sending sales invoices and credit notes (AR) to buyers via the InvoiceNow network
- Credit note creation capability — the app currently only supports invoice generation and voiding; this feature adds the ability to issue credit notes against sent/paid invoices
- Peppol BIS Billing 3.0 supports two document types natively: Invoice and Credit Note — both are covered

**Out of scope:**
- Receiving invoices via Peppol (AP/inbound) — the platform already has AP features with OCR for supplier invoice ingestion; Peppol-based inbound reception is a separate future enhancement
- Debit notes and refund notes — these are less standard on the Peppol network; debit notes can be handled as additional invoices, refund notes as credit notes
- Editing sent invoices — the current void-and-reissue workflow remains; credit notes provide the correction mechanism

## Clarifications

### Session 2026-02-20

- Q: Is receiving invoices via Peppol in scope? → A: Sending only (outbound AR). Receiving is a separate AP feature — platform already has AP with OCR for inbound invoices.
- Q: Which document types should Peppol support? → A: Invoices + credit notes (the two native Peppol BIS 3.0 types). Credit note creation is new — app currently can only generate invoices and void them. Debit/refund notes are out of scope.
- Q: Who can transmit via Peppol and create credit notes? → A: Same permissions as sending invoices — finance admin role. Aligns with existing invoice workflow authorization.
- Q: What happens when the e-invoice plan limit is reached? → A: Soft block — show warning and upgrade prompt, but allow a small grace buffer (e.g., 5 extra transmissions) before hard blocking.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Transmit Invoice via InvoiceNow (Priority: P1)

A business owner opens a finalized sales invoice and sends it to the buyer via the Peppol InvoiceNow network. The system converts the invoice into the required international document format (Peppol BIS Billing 3.0) and transmits it through a certified Peppol Access Point. The user sees the invoice enter the transmission lifecycle and can track its progress until the buyer's system confirms receipt.

**Why this priority**: This is the core value proposition. Without the ability to transmit invoices through the Peppol network, none of the other features (status tracking, error handling, delivery confirmation) have anything to operate on. This story covers the complete transmission pipeline from user action to network delivery.

**Independent Test**: Can be tested by opening a sent invoice for a customer with a Peppol ID, clicking "Send via InvoiceNow", confirming in the dialog, and verifying the invoice enters the Peppol transmission lifecycle. Delivers the core e-invoicing capability that enables IRAS compliance.

**Acceptance Scenarios**:

1. **Given** a sent invoice for a customer with a Peppol participant ID, and the business has its own Peppol participant ID configured, **When** the user clicks "Send via InvoiceNow", **Then** a confirmation dialog shows the receiver's Peppol ID and asks for confirmation.
2. **Given** the user confirms transmission, **When** the system processes the request, **Then** the invoice data is converted to Peppol BIS Billing 3.0 format and submitted to the Peppol network, and the invoice status transitions to "pending".
3. **Given** the Peppol Access Point successfully receives the document, **When** the network confirms acceptance, **Then** the invoice status transitions to "transmitted" with a recorded timestamp and network document ID.
4. **Given** the buyer's Access Point acknowledges receipt, **When** the delivery notification is received, **Then** the invoice status transitions to "delivered" with a recorded delivery timestamp.
5. **Given** a sent invoice for a customer without a Peppol participant ID, **When** the user opens the invoice detail page, **Then** the "Send via InvoiceNow" button is not available.
6. **Given** a draft invoice (not yet finalized), **When** the user views it, **Then** no Peppol transmission option is available regardless of the customer's Peppol ID.

---

### User Story 2 - Peppol Document Generation (Priority: P1)

When a user initiates Peppol transmission, the system automatically generates a Peppol BIS Billing 3.0 compliant document from the sales invoice data. The document includes all required fields: supplier and buyer identities, Peppol participant IDs, line items with tax categories, payment terms, and totals — all conforming to the international standard required for Peppol network transmission.

**Why this priority**: Co-equal P1 because document generation is the prerequisite for transmission. An invalid or non-compliant document will be rejected by the Peppol network. This is the technical foundation that makes Story 1 possible.

**Independent Test**: Can be tested by generating a Peppol document from a sample invoice and validating it against the Peppol BIS Billing 3.0 specification rules. Delivers compliant document formatting that enables network acceptance.

**Acceptance Scenarios**:

1. **Given** a sales invoice with complete line items, tax information, and buyer/seller details, **When** the system generates the Peppol document, **Then** the output conforms to Peppol BIS Billing 3.0 (UBL 2.1 based) with the correct customization ID and profile ID.
2. **Given** an invoice with multiple line items at different tax rates, **When** the document is generated, **Then** each line item includes the correct tax category code per the UN/CEFACT code list (UNCL 5305) and the tax summary is accurate.
3. **Given** an invoice with the buyer's structured address (line 1-3, city, state, postal code, country), **When** the document is generated, **Then** the address components map to the correct Peppol address structure.
4. **Given** an invoice with incomplete mandatory Peppol fields (e.g., missing tax category), **When** the system attempts to generate the document, **Then** the user receives a clear validation error identifying the missing fields before any network submission occurs.
5. **Given** an invoice with payment terms specified, **When** the document is generated, **Then** the payment means code (UNCL 4461) is included in the output.

---

### User Story 3 - Peppol Status Visibility Across Invoices (Priority: P1)

A business owner browsing their sales invoices list can see at a glance which invoices have been transmitted via Peppol and their current delivery status. Color-coded badges appear next to invoices in the Peppol lifecycle. Invoices without Peppol activity show no badge, keeping the list clean.

**Why this priority**: Co-equal P1 because status visibility is essential from the moment the first invoice is transmitted. Without it, users have no feedback on whether their invoices reached the buyer. This is the foundation for all status-related features.

**Independent Test**: Can be tested by viewing the invoices list with a mix of Peppol and non-Peppol invoices and verifying correct badge rendering. Delivers portfolio-level awareness of Peppol transmission state.

**Acceptance Scenarios**:

1. **Given** invoices with Peppol statuses of pending, transmitted, delivered, and failed, **When** the user views the invoices list, **Then** each invoice shows a color-coded badge — gray (pending), blue (transmitted), green (delivered), red (failed).
2. **Given** an invoice with no Peppol status, **When** the user views the list, **Then** no Peppol badge appears for that invoice.
3. **Given** the user is on a mobile device, **When** viewing the invoices list, **Then** the Peppol badge is visible in the mobile card layout.

---

### User Story 4 - Transmission Error Handling & Retry (Priority: P2)

When a Peppol transmission fails, the business owner sees a clear error panel showing what went wrong. Each error from the Peppol network includes a code and human-readable message. The user can retry the transmission after reviewing or addressing the issue.

**Why this priority**: Error recovery is critical for production readiness but applies only to failure scenarios. It depends on transmission (P1) being available and is a less frequent path than successful delivery.

**Independent Test**: Can be tested by viewing an invoice with failed Peppol status, verifying error details are displayed, and confirming the retry action re-initiates transmission. Delivers actionable error recovery.

**Acceptance Scenarios**:

1. **Given** an invoice with failed Peppol status and recorded errors, **When** the user opens the invoice detail, **Then** an error panel lists each error with its code and message.
2. **Given** the error panel is displayed, **When** the user clicks "Retry transmission" and confirms, **Then** the system re-initiates transmission and the status resets to "pending".
3. **Given** a failed transmission with no recorded error details, **When** the user views the invoice, **Then** a generic "Transmission failed" message is shown with the retry option available.

---

### User Story 5 - Delivery Confirmation Display (Priority: P2)

When the buyer's system confirms receipt via the Peppol network, the business owner sees a delivery confirmation on the invoice detail page. The confirmation includes the delivery timestamp, giving confidence that the invoice reached its destination.

**Why this priority**: Delivery confirmation is the successful end-state. While important for user confidence, it is passive (no user action) and depends on transmission (P1) being in place.

**Independent Test**: Can be tested by viewing an invoice with delivered status and verifying the confirmation panel shows the delivery timestamp. Delivers assurance that the buyer received the document.

**Acceptance Scenarios**:

1. **Given** an invoice with delivered Peppol status and a delivery timestamp, **When** the user opens the invoice detail, **Then** a delivery confirmation panel is displayed with the formatted timestamp.
2. **Given** an invoice still in "transmitted" status (awaiting delivery), **When** the user views it, **Then** no delivery confirmation appears — only the current "transmitted" status is visible.

---

### User Story 6 - Create and Transmit Credit Notes (Priority: P2)

A business owner needs to issue a credit note against a previously sent or paid invoice — for example, to correct an overcharge, account for returned goods, or apply a post-sale discount. The user selects the original invoice, creates a credit note specifying the credited amount and reason, and can then transmit the credit note via InvoiceNow just like an invoice. Currently the app only supports voiding invoices entirely; credit notes provide a partial correction mechanism that preserves the original invoice record.

**Why this priority**: Credit notes are the standard Peppol correction document and a compliance requirement for businesses that need to adjust invoiced amounts. Without credit notes, the only option is voiding and reissuing, which is disruptive for the buyer. This is P2 because invoices are the primary flow (P1), but credit notes are essential for real-world billing operations.

**Independent Test**: Can be tested by selecting a sent invoice, creating a credit note for a partial amount, and verifying the credit note appears in the invoices list with its own Peppol transmission capability. Delivers the ability to issue formal corrections through the Peppol network.

**Acceptance Scenarios**:

1. **Given** a sent or paid invoice, **When** the user selects "Create Credit Note", **Then** a credit note form appears pre-populated with the original invoice reference, line items, and amounts — the user can adjust amounts and add a reason.
2. **Given** the user submits a credit note, **When** the system processes it, **Then** a new credit note document is created linked to the original invoice, with its own lifecycle status (independent of the original invoice).
3. **Given** a finalized credit note for a customer with a Peppol participant ID, **When** the user clicks "Send via InvoiceNow", **Then** the system generates a Peppol BIS Billing 3.0 Credit Note document (not Invoice) and transmits it through the network.
4. **Given** the original invoice has not been sent or finalized, **When** the user views the invoice, **Then** the "Create Credit Note" option is not available (credit notes can only be issued against finalized invoices).
5. **Given** a credit note has been created, **When** the user views the original invoice, **Then** the original invoice shows a reference to the linked credit note(s) and the net outstanding amount.

---

### User Story 7 - Peppol Status Timeline (Priority: P3)

The invoice or credit note detail page shows a visual timeline of the Peppol transmission lifecycle: Created → Transmitted → Delivered (or Failed). Each step displays its timestamp, giving a chronological view of the invoice's journey through the network.

**Why this priority**: The timeline is a polish feature that enhances the user experience. Users can understand status from badges and panels without it. It adds value for complete lifecycle visibility.

**Independent Test**: Can be tested by viewing invoices at each lifecycle stage and verifying the timeline highlights correct steps with accurate timestamps.

**Acceptance Scenarios**:

1. **Given** an invoice with "pending" status, **When** the user views the timeline, **Then** "Created" is highlighted as completed and subsequent steps are upcoming.
2. **Given** an invoice with "transmitted" status, **When** the user views the timeline, **Then** "Created" and "Transmitted" are highlighted with the transmission timestamp.
3. **Given** an invoice with "delivered" status, **When** the user views the timeline, **Then** all steps (Created → Transmitted → Delivered) are highlighted with respective timestamps.
4. **Given** an invoice with "failed" status, **When** the user views the timeline, **Then** the "Failed" step replaces "Delivered" and is visually distinguished (e.g., red).

---

### User Story 8 - Business Peppol Registration Setup (Priority: P3)

A business administrator configures their organization's Peppol participant ID in the business settings. This is the sender identity used when transmitting invoices via InvoiceNow. Without this configured, Peppol transmission options are not available for any invoice.

**Why this priority**: One-time setup that must happen before transmission, but most businesses will do this once. It gates the entire feature but is a simple configuration step.

**Independent Test**: Can be tested by navigating to business settings, entering a Peppol participant ID, saving, and verifying that the "Send via InvoiceNow" option becomes available on eligible invoices.

**Acceptance Scenarios**:

1. **Given** the business has no Peppol participant ID configured, **When** the admin opens business settings, **Then** a Peppol participant ID field is available for input.
2. **Given** the admin enters and saves a valid Peppol participant ID (format: scheme:identifier, e.g., "0195:T08GA1234A"), **When** they navigate to a sent invoice for a Peppol-enabled customer, **Then** the "Send via InvoiceNow" button is now available.
3. **Given** the business has no Peppol participant ID configured, **When** viewing any invoice, **Then** no Peppol transmission options appear anywhere in the UI.

---

### Edge Cases

- What happens when a customer's Peppol participant ID is removed after an invoice has already been transmitted? The invoice continues to display its Peppol status and timeline based on recorded data — historical transmissions are not affected by customer changes.
- What happens when the invoice is voided but has Peppol data? The Peppol status and timeline display as historical record, but no transmission actions (send/retry) are available.
- What happens when the Peppol Access Point provider is temporarily unavailable? The system should set the invoice to "failed" status with an appropriate network error message and allow retry.
- What happens when the generated document fails Peppol validation rules? The user should see specific validation errors (e.g., missing tax category, invalid participant ID format) before the document is submitted to the network.
- What happens when a transmission is "pending" or "transmitted" and the user returns to the invoice? No retry or re-send actions are available — only the current status is shown. The user waits for resolution.
- What happens when the same invoice is transmitted, fails, and is retried? The system records the latest transmission attempt. Previous error details are replaced by the new attempt's status.
- What happens when an invoice has line items with no tax information? The document generation validates completeness and returns clear errors identifying which line items need tax category assignment.
- What happens when a credit note is created for an invoice that has already been voided? The system should prevent credit note creation for voided invoices — voiding is a complete cancellation, not a partial correction.
- What happens when multiple credit notes are issued against the same invoice? Each credit note is an independent document with its own Peppol lifecycle. The original invoice displays all linked credit notes and the net outstanding amount. The total credited amount must not exceed the original invoice total.
- What happens when a credit note's Peppol transmission fails but the original invoice was successfully delivered? Each document has an independent Peppol lifecycle — the credit note failure does not affect the original invoice's delivered status.
- What happens when a business reaches their e-invoice plan limit? The system shows a warning and upgrade prompt but allows a small grace buffer (e.g., 5 extra transmissions) before hard blocking. Once the grace buffer is exhausted, the "Send via InvoiceNow" button is disabled with a clear "Limit reached — upgrade your plan" message.

## Requirements *(mandatory)*

### Functional Requirements

**Document Generation**

- **FR-001**: System MUST generate Peppol BIS Billing 3.0 compliant documents from both sales invoices and credit notes, including all mandatory UBL fields (customization ID, profile ID, supplier/buyer parties, line items, tax summary, payment means).
- **FR-002**: System MUST validate document completeness against Peppol requirements before generating, reporting specific missing or invalid fields to the user.
- **FR-003**: System MUST map tax information to the correct international code lists (UNCL 5305 for tax categories, UNCL 4461 for payment means).
- **FR-004**: System MUST include both sender and receiver Peppol participant IDs in the generated document.
- **FR-004a**: System MUST generate the correct Peppol document type — Invoice for sales invoices, Credit Note for credit notes — with the appropriate UBL root element and document type code.

**Credit Note Creation**

- **FR-004b**: System MUST allow users to create a credit note against any sent or paid invoice, pre-populating the form with the original invoice reference and line items.
- **FR-004c**: System MUST allow users to adjust line item amounts and specify a reason when creating a credit note.
- **FR-004d**: System MUST prevent credit note creation for draft or voided invoices.
- **FR-004e**: System MUST ensure the total credited amount across all credit notes for an invoice does not exceed the original invoice total.
- **FR-004f**: System MUST link credit notes to their originating invoice, displaying the relationship on both the credit note and the original invoice.
- **FR-004g**: System MUST display net outstanding amount on the original invoice when credit notes exist.

**Network Transmission**

- **FR-005**: System MUST transmit generated documents to the Peppol network through a certified Access Point provider via their integration interface.
- **FR-006**: System MUST track the transmission lifecycle with four distinct states: pending (submitted to provider), transmitted (accepted by network), delivered (acknowledged by buyer's Access Point), and failed (rejected or errored).
- **FR-007**: System MUST record a network-assigned document identifier upon successful submission for traceability.
- **FR-008**: System MUST receive and process delivery notifications and failure notifications from the Access Point provider to update invoice status in near-real-time.
- **FR-009**: System MUST record timestamps for each status transition (transmission time, delivery time).
- **FR-010**: System MUST record error details (code and message) when a transmission fails.

**User Interface — Transmission Actions**

- **FR-011**: System MUST show a "Send via InvoiceNow" action button on the invoice or credit note detail page when: the document is finalized (not draft), the customer has a Peppol participant ID, the business has a Peppol participant ID, and the document has no existing Peppol status.
- **FR-012**: System MUST display a confirmation dialog before initiating transmission, showing the receiver's Peppol participant ID.
- **FR-013**: System MUST provide a "Retry transmission" action for failed invoices that re-initiates the transmission pipeline.
- **FR-014**: System MUST prevent transmission actions for documents in draft, void, pending, or transmitted states.
- **FR-014a**: System MUST restrict Peppol transmission and credit note creation to users with finance admin permissions — the same role that can mark invoices as "sent".

**User Interface — Status Display**

- **FR-015**: System MUST display a color-coded Peppol status badge on invoices in the list view — gray (pending), blue (transmitted), green (delivered), red (failed). No badge for invoices without Peppol status.
- **FR-016**: System MUST display a delivery confirmation panel with formatted timestamp when an invoice reaches delivered status.
- **FR-017**: System MUST display an error panel listing each error's code and message when an invoice has failed status.
- **FR-018**: System MUST display a visual status timeline showing the Peppol lifecycle stages with timestamps for completed stages.
- **FR-019**: System MUST support both desktop and mobile layouts for all Peppol UI elements.

**Configuration**

- **FR-020**: System MUST provide a setting for business administrators to configure their organization's Peppol participant ID.
- **FR-021**: System MUST gate all Peppol transmission features behind both the sender (business) and receiver (customer) having valid Peppol participant IDs configured.

**Data Integrity**

- **FR-022**: System MUST preserve Peppol status data as immutable historical record — past transmission data is never erased even if the invoice, customer, or business details change.
- **FR-023**: System MUST count each Peppol transmission (invoices and credit notes) against the business's e-invoice usage allocation per their subscription plan.
- **FR-024**: System MUST warn users approaching their plan limit and display an upgrade prompt, while allowing a small grace buffer (e.g., 5 extra transmissions beyond the limit).
- **FR-025**: System MUST hard block transmission when the grace buffer is exhausted, disabling the "Send via InvoiceNow" button with a clear "Limit reached — upgrade your plan" message.

### Key Entities

- **Sales Invoice**: The primary business document. Extended with Peppol transmission tracking: network document ID, transmission status, timestamps for each stage, and error details if failed. The invoice's own lifecycle status (draft, sent, paid, etc.) gates whether Peppol actions are available. May have one or more linked credit notes.
- **Credit Note**: A correction document issued against a sent or paid invoice. References the original invoice, contains adjusted line items and a reason. Has its own independent Peppol transmission lifecycle (separate from the original invoice). The total credited amount across all credit notes must not exceed the original invoice total. This is a new capability — the app currently only supports voiding invoices.
- **Business (Sender)**: The organization sending documents. Must have a Peppol participant ID configured (format: scheme:identifier, e.g., "0195:T08GA1234A") to enable Peppol transmission.
- **Customer (Receiver)**: The buyer organization. Must have a Peppol participant ID configured for Peppol transmission to be available on their documents. Also holds structured address and tax identifier fields needed for compliant document generation.
- **Peppol Document**: The generated Peppol BIS Billing 3.0 (UBL 2.1) document derived from a sales invoice or credit note. Two document types: Invoice and Credit Note. Contains supplier/buyer parties, line items, tax summary, payment terms, and Peppol-specific identifiers. Transmitted as a unit through the network.
- **Peppol Error**: An error entry returned by the network or Access Point upon transmission failure, containing a code and human-readable message.
- **E-Invoice Usage**: A counter tracking how many e-invoices (Peppol + LHDN combined) a business has transmitted in a billing period, measured against their plan allocation. Both invoices and credit notes count toward the allocation.

## Assumptions

- FinanSEAL will integrate with an existing certified Peppol Access Point provider (e.g., Storecove) rather than becoming an Access Point. This means FinanSEAL handles document generation and calls the provider's API; the provider handles AS4 transport, network compliance, and Peppol certification.
- The Access Point provider offers a REST-based integration interface for document submission and provides delivery/failure notifications via webhooks or polling.
- Peppol participant ID format follows the standard scheme:identifier pattern (e.g., "0195:T08GA1234A" where 0195 is the Singapore UEN scheme).
- The business must register their Peppol participant ID with IMDA (outside the system) before configuring it in FinanSEAL.
- Tax category mapping from FinanSEAL's internal representation to UNCL 5305 codes is deterministic and can be automated without user input.
- The Peppol timeline component shares a visual pattern with the LHDN submission timeline for consistent user experience across e-invoicing standards.
- Existing UI component shells (badges, panels) will be activated by removing "Coming Soon" labels and wiring them to the backend.
- Peppol document generation does not require digital signatures within the document itself — signatures are handled at the AS4 transport layer by the Access Point provider.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can transmit a sales invoice via the Peppol InvoiceNow network in 3 clicks or fewer from the invoice detail page (button → dialog → confirm).
- **SC-002**: Users can identify the Peppol transmission status of any invoice within 2 seconds of viewing the invoices list, without opening individual invoices.
- **SC-003**: 100% of generated documents pass Peppol BIS Billing 3.0 validation rules before being submitted to the network — no invalid documents reach the Access Point.
- **SC-004**: When a transmission fails, 100% of error details from the network are displayed to the user with an actionable retry option.
- **SC-005**: Status updates from the Peppol network (transmitted, delivered, failed) are reflected in the user interface within 5 minutes of the event occurring.
- **SC-006**: The "Send via InvoiceNow" button never appears for ineligible invoices — zero false availability (missing Peppol IDs, wrong invoice status, transmission already in progress).
- **SC-007**: All Peppol UI elements render correctly on both desktop (1024px+) and mobile (320px+) viewports.
- **SC-008**: Invoice document generation completes and is ready for transmission within 5 seconds of user confirmation.
- **SC-009**: Businesses approaching their e-invoice plan limit receive notification before reaching the cap, preventing unexpected transmission failures.
