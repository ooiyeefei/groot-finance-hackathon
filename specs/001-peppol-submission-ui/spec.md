# Feature Specification: Peppol InvoiceNow Transmission UI

**Feature Branch**: `001-peppol-submission-ui`
**Created**: 2026-02-20
**Status**: Draft
**Input**: GitHub Issue #205 — Build the frontend UI for transmitting sales invoices via the Peppol InvoiceNow network (Singapore) and tracking delivery status
**Related Issues**: #196 (Peppol full integration), #198/#203 (schema changes — completed), #204 (LHDN submission UI — sibling)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Peppol Status Visibility on Invoice List (Priority: P1)

A business owner browsing their sales invoices list can see at a glance which invoices have been transmitted via Peppol and their current delivery status. A color-coded Peppol status badge appears next to invoices that have entered the Peppol transmission lifecycle. Invoices without Peppol activity show no Peppol badge — keeping the list clean for businesses that don't use InvoiceNow.

**Why this priority**: Visibility is the foundation. Before users can transmit or troubleshoot, they need to see current Peppol status across all invoices. This is also the lowest-risk change (read-only display) and provides immediate value.

**Independent Test**: Can be fully tested by viewing the sales invoices list with a mix of invoices (some with Peppol status, some without) and verifying that badges render correctly with the right colors. Delivers awareness of Peppol transmission state across the invoice portfolio.

**Acceptance Scenarios**:

1. **Given** a sales invoice has `peppolStatus` set to "pending", **When** the user views the invoices list, **Then** a gray "Pending" badge appears in the Peppol status area for that invoice.
2. **Given** a sales invoice has `peppolStatus` set to "transmitted", **When** the user views the invoices list, **Then** a blue "Transmitted" badge appears.
3. **Given** a sales invoice has `peppolStatus` set to "delivered", **When** the user views the invoices list, **Then** a green "Delivered" badge appears.
4. **Given** a sales invoice has `peppolStatus` set to "failed", **When** the user views the invoices list, **Then** a red "Failed" badge appears.
5. **Given** a sales invoice has no `peppolStatus` (undefined), **When** the user views the invoices list, **Then** no Peppol badge is shown for that invoice.

---

### User Story 2 - Transmit Invoice via InvoiceNow (Priority: P1)

A business owner opens a sales invoice and sends it to the buyer via the Peppol InvoiceNow network. The "Send via InvoiceNow" button is only available when the buyer (customer) has a registered Peppol participant ID. Before transmitting, the user sees a confirmation dialog showing the receiver's Peppol ID so they can verify the recipient. After confirming, the system initiates the transmission and the invoice enters the Peppol lifecycle.

**Why this priority**: This is the core action of the feature — without the ability to initiate transmission, the rest of the UI (status tracking, error display, delivery confirmation) has nothing to track. Co-equal with P1 visibility because it's the primary user interaction.

**Independent Test**: Can be tested by navigating to a sent invoice whose customer has a `peppolParticipantId`, clicking "Send via InvoiceNow", confirming in the dialog, and verifying the invoice status updates to "pending". Delivers the core e-invoicing capability.

**Acceptance Scenarios**:

1. **Given** a sent invoice for a customer with `peppolParticipantId`, **When** the user opens the invoice detail page, **Then** a "Send via InvoiceNow" button is visible in the actions area.
2. **Given** a sent invoice for a customer without `peppolParticipantId`, **When** the user opens the invoice detail page, **Then** the "Send via InvoiceNow" button is not shown.
3. **Given** the user clicks "Send via InvoiceNow", **When** the confirmation dialog appears, **Then** it displays the receiver's Peppol participant ID and a confirmation prompt.
4. **Given** the user confirms transmission, **When** the system processes the request, **Then** the invoice `peppolStatus` transitions to "pending" and the button is replaced with the current Peppol status display.
5. **Given** a draft invoice for a customer with `peppolParticipantId`, **When** the user opens the invoice detail page, **Then** the "Send via InvoiceNow" button is not shown (only available for "sent" or later statuses).
6. **Given** an invoice already has a `peppolStatus` (any value), **When** the user opens the invoice detail page, **Then** the "Send via InvoiceNow" button is not shown (replaced by status display/timeline).

---

### User Story 3 - Peppol Delivery Confirmation (Priority: P2)

When a buyer's system confirms receipt of the invoice via the Peppol network, the business owner sees a clear delivery confirmation on the invoice detail page. The confirmation includes the timestamp of when the buyer's Access Point acknowledged delivery, giving the business owner confidence that the invoice reached its destination.

**Why this priority**: Delivery confirmation is the successful end-state of the Peppol lifecycle. While important for user confidence, it is a passive display (no user action needed) and depends on the transmission action (P1) being in place first.

**Independent Test**: Can be tested by viewing an invoice with `peppolStatus` = "delivered" and `peppolDeliveredAt` populated, and verifying the delivery confirmation panel renders with the correct timestamp. Delivers peace of mind that the buyer received the document.

**Acceptance Scenarios**:

1. **Given** an invoice has `peppolStatus` = "delivered" and `peppolDeliveredAt` set, **When** the user opens the invoice detail page, **Then** a delivery confirmation panel is displayed with the delivery timestamp formatted in the user's locale.
2. **Given** an invoice has `peppolStatus` = "transmitted" (not yet delivered), **When** the user opens the invoice detail page, **Then** no delivery confirmation is shown — only the current "transmitted" status is visible.

---

### User Story 4 - Peppol Transmission Error Display & Retry (Priority: P2)

When a Peppol transmission fails, the business owner sees a clear error panel on the invoice detail page showing what went wrong. Each error includes a code and message from the Peppol Access Point. The user can retry the transmission after reviewing the errors or addressing the underlying issue.

**Why this priority**: Error handling is essential for a production-ready feature, but it only applies to failure scenarios. It depends on the transmission action (P1) being available and is a less common path than successful delivery.

**Independent Test**: Can be tested by viewing an invoice with `peppolStatus` = "failed" and `peppolErrors` populated, verifying the error panel renders each error's code and message, and confirming the "Retry transmission" button triggers a new transmission attempt. Delivers actionable error recovery.

**Acceptance Scenarios**:

1. **Given** an invoice has `peppolStatus` = "failed" and `peppolErrors` contains one or more errors, **When** the user opens the invoice detail page, **Then** an error panel is displayed listing each error with its code and message.
2. **Given** the error panel is displayed, **When** the user clicks "Retry transmission", **Then** a confirmation dialog appears and, upon confirmation, the system re-initiates the Peppol transmission (resetting `peppolStatus` to "pending").
3. **Given** an invoice has `peppolStatus` = "failed" with no errors recorded, **When** the user opens the invoice detail page, **Then** the error panel shows a generic "Transmission failed" message with the retry option.

---

### User Story 5 - Peppol Status Timeline (Priority: P3)

The invoice detail page shows a visual timeline of the Peppol transmission lifecycle: Created → Transmitted → Delivered (or Failed). Each step shows the timestamp when it occurred, giving the business owner a chronological view of the invoice's journey through the Peppol network.

**Why this priority**: The timeline is a polish feature that enhances the user experience but is not essential for core functionality. Users can understand the current status from badges and panels without a timeline. It adds value for invoices that have gone through multiple state transitions.

**Independent Test**: Can be tested by viewing invoices at each stage of the Peppol lifecycle and verifying the timeline highlights the correct steps with accurate timestamps. Delivers a visual summary of the invoice's Peppol journey.

**Acceptance Scenarios**:

1. **Given** an invoice has `peppolStatus` = "pending" with no timestamps yet, **When** the user views the timeline, **Then** "Created" is highlighted as completed and subsequent steps are shown as upcoming.
2. **Given** an invoice has `peppolStatus` = "transmitted" with `peppolTransmittedAt` set, **When** the user views the timeline, **Then** "Created" and "Transmitted" are highlighted with the transmission timestamp.
3. **Given** an invoice has `peppolStatus` = "delivered" with both `peppolTransmittedAt` and `peppolDeliveredAt` set, **When** the user views the timeline, **Then** all three steps (Created → Transmitted → Delivered) are highlighted with respective timestamps.
4. **Given** an invoice has `peppolStatus` = "failed", **When** the user views the timeline, **Then** the "Failed" step is shown instead of "Delivered", visually distinguished (e.g., red) from successful steps.

---

### Edge Cases

- What happens when a customer's `peppolParticipantId` is removed after an invoice has already been transmitted? The invoice should continue to display its Peppol status and timeline based on the data already recorded — the button state is determined by the invoice's own `peppolStatus`, not the customer's current `peppolParticipantId`.
- What happens when the invoice is in "void" status but has Peppol data? The Peppol status badge and timeline should still display as historical record, but no transmission actions (send/retry) should be available.
- What happens when the business itself doesn't have a `peppolParticipantId`? The "Send via InvoiceNow" button should not appear — both sender and receiver must have Peppol participant IDs for transmission.
- What happens when a Peppol transmission is in "pending" or "transmitted" state and the user navigates to the invoice? No retry or re-send actions should be available — only the current status is shown. The user must wait for the transmission to resolve.
- What happens on mobile view? The Peppol status badge should appear in the mobile invoice card alongside the existing invoice status badge. The timeline should stack vertically for narrow screens.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a color-coded Peppol status badge on each invoice in the sales invoices list when the invoice has a `peppolStatus` value — gray (pending), blue (transmitted), green (delivered), red (failed).
- **FR-002**: System MUST hide the Peppol badge for invoices where `peppolStatus` is undefined.
- **FR-003**: System MUST show a "Send via InvoiceNow" action button on the invoice detail page when all of the following conditions are met: the invoice status is "sent" or later (not draft), the customer has a `peppolParticipantId`, the business has a `peppolParticipantId`, and the invoice has no existing `peppolStatus`.
- **FR-004**: System MUST display a confirmation dialog before initiating Peppol transmission, showing the receiver's Peppol participant ID.
- **FR-005**: System MUST update the invoice `peppolStatus` to "pending" upon user confirmation of transmission.
- **FR-006**: System MUST display a delivery confirmation panel on the invoice detail page when `peppolStatus` is "delivered", including the formatted delivery timestamp.
- **FR-007**: System MUST display an error panel on the invoice detail page when `peppolStatus` is "failed", listing each error's code and message from `peppolErrors`.
- **FR-008**: System MUST provide a "Retry transmission" action on the error panel that resets the invoice to "pending" status for re-transmission.
- **FR-009**: System MUST display a visual timeline on the invoice detail page showing the Peppol lifecycle stages (Created → Transmitted → Delivered/Failed) with timestamps for each completed stage.
- **FR-010**: System MUST prevent transmission actions (send/retry) for invoices that are in "void" or "draft" status.
- **FR-011**: System MUST prevent transmission actions while an invoice is in "pending" or "transmitted" state (transmission in progress).
- **FR-012**: System MUST support both desktop and mobile layouts — badges visible in mobile card view, timeline stacks vertically on small screens.
- **FR-013**: System MUST use the existing `PEPPOL_STATUSES` constants from `src/lib/constants/statuses.ts` for all status references.
- **FR-014**: System MUST display Peppol status data as read-only historical record — past status data is never erased even if the invoice or customer changes.

### Key Entities

- **Sales Invoice (UI view)**: The primary entity displayed in both list and detail views. Extended with Peppol transmission data: `peppolDocumentId`, `peppolStatus`, `peppolTransmittedAt`, `peppolDeliveredAt`, `peppolErrors`. The invoice's own status (draft, sent, paid, etc.) gates whether Peppol actions are available.
- **Business**: The sender organization. Must have `peppolParticipantId` configured for Peppol transmission to be offered.
- **Customer**: The receiver organization. Must have `peppolParticipantId` configured for Peppol transmission to be offered on their invoices.
- **Peppol Error**: An error entry returned by the Peppol Access Point upon transmission failure, containing a `code` and `message`.

## Assumptions

- The Peppol Access Point API integration (Storecove or similar provider) is handled by separate work (issue #196). This spec covers UI only, assuming backend mutations exist to write Peppol fields on the sales invoice.
- A mutation to initiate Peppol transmission (which sets `peppolStatus` to "pending") will be provided by the backend integration. The UI calls this mutation upon user confirmation.
- Peppol status transitions (pending → transmitted → delivered/failed) are driven by the backend/webhook layer — the UI is reactive and displays the current state.
- The "Retry transmission" action calls the same initiation mutation, resetting the status to "pending" and clearing previous errors.
- The Peppol status badges follow the same visual pattern as the existing `InvoiceStatusBadge` component — using the same Badge UI component with Peppol-specific colors.
- The Peppol timeline component should be designed to be potentially reusable for the LHDN status timeline (issue #204), sharing the same visual pattern with different stages.
- Both desktop table view and mobile card view must display the Peppol badge. The detail page timeline adapts to screen size.
- Formatting of timestamps uses the existing `formatBusinessDate` utility for consistency.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can identify the Peppol transmission status of any invoice within 2 seconds of viewing the invoices list — no need to open individual invoices.
- **SC-002**: Users can initiate a Peppol InvoiceNow transmission in 3 clicks or fewer from the invoice detail page (button → dialog → confirm).
- **SC-003**: 100% of Peppol status transitions (pending, transmitted, delivered, failed) are visually distinguishable through unique color coding and labeling.
- **SC-004**: When a transmission fails, 100% of error details returned by the Access Point are displayed to the user with actionable retry capability.
- **SC-005**: Users can view the complete transmission timeline (all timestamps and stage transitions) on a single invoice detail page without scrolling to a separate section.
- **SC-006**: The "Send via InvoiceNow" button never appears for ineligible invoices (missing Peppol IDs, wrong invoice status, transmission already in progress) — zero false availability.
- **SC-007**: All Peppol UI elements render correctly on both desktop (1024px+) and mobile (320px+) viewports.
