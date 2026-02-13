# Feature Specification: Stripe-Style Invoice Creation UX

**Feature Branch**: `012-stripe-invoice-ux`
**Created**: 2026-02-13
**Status**: Draft
**Input**: User description: "Upgrade and improve the existing sales invoice generation feature to follow Stripe's invoice creation UX/UI pattern — split-panel layout with form on left and live preview tabs (Invoice PDF, Email, Payment page) on the right, step-by-step input sections, advanced item options with service dates, tax configuration, coupons, and customization options."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Invoice with Live Preview (Priority: P1)

A business user navigates to create a new sales invoice and sees a two-column layout: an input form on the left and a real-time preview panel on the right. As the user fills in customer details, adds line items, and configures payment terms, the preview updates instantly to reflect the changes. The user can switch between two preview tabs — **Invoice PDF** and **Email** — to see exactly how the invoice will appear in each delivery format before sending.

**Why this priority**: This is the core UX transformation — the split-panel layout with live multi-format preview is the defining feature of the Stripe-style experience. Without this, no other improvements matter.

**Independent Test**: Can be fully tested by creating a new invoice, filling in all fields, and verifying the preview updates in real-time across both tabs. Delivers immediate value as the primary creation workflow.

**Acceptance Scenarios**:

1. **Given** a user clicks "Create Invoice", **When** the page loads, **Then** a two-column layout appears with the form on the left (~50%) and a preview panel on the right (~50%), with the "Invoice PDF" tab active by default.
2. **Given** the user selects a customer, **When** the customer data populates, **Then** the PDF preview updates to show the customer's name, email, and address in the "Bill to" section within 1 second.
3. **Given** the user adds a line item, **When** the item is saved, **Then** the preview updates to show the item description, quantity, unit price, and amount in the line items table.
4. **Given** the user switches to the "Email" tab, **When** the tab is active, **Then** a preview of the invoice email is shown, including the company logo/name, total amount, due date, "Download invoice" link, To/From details, and a "Pay this invoice" call-to-action button.
---

### User Story 2 - Step-by-Step Form Sections (Priority: P1)

A business user fills in the invoice form through clearly organized, sequential sections: **Customer** → **Currency** → **Items** → **Payment Collection** → **Additional Options**. Each section is visually distinct with clear headings and descriptions. The form scrolls vertically on the left panel while the preview stays fixed on the right.

**Why this priority**: The organized form flow is inseparable from the split-panel layout — together they define the creation experience. Users need clear guidance through each step.

**Independent Test**: Can be tested by walking through each section sequentially and verifying all fields function correctly and the form maintains a logical, guided flow.

**Acceptance Scenarios**:

1. **Given** the create invoice page loads, **When** the user views the form, **Then** the following sections appear in order: Customer, Currency (after customer selected), Items, Payment Collection, Additional Options.
2. **Given** the user is in the Customer section, **When** they type in the search field, **Then** a dropdown appears showing "+ Add new customer" at the top, followed by recent/matching customers searchable by name, email, or company name.
3. **Given** the user selects a customer, **When** the selection is confirmed, **Then** the customer's business name, email, and language preference are displayed below the search field, with a "..." menu for additional options.
4. **Given** the user is in the Payment Collection section, **When** they view the options, **Then** they see "Request payment" selected by default with a due date dropdown (Due on receipt, Net 15, Net 30, Net 60) and accepted payment methods displayed as read-only chips (sourced from business invoice settings).
5. **Given** the form content exceeds the viewport height, **When** the user scrolls the left panel, **Then** the preview panel on the right remains fixed/sticky and visible at all times.

---

### User Story 3 - Advanced Item Options (Priority: P2)

When adding or editing a line item, users can expand an "Item options" section to configure advanced properties per item: **item taxes** (select a tax rate), **item discount** (percentage or fixed amount), **supply/service date** (date range picker for service period), and **discountable** toggle (controls whether invoice-level discounts apply to this item).

**Why this priority**: Advanced item options add significant flexibility for professional invoicing but are not required for basic invoice creation. They enhance the product for power users.

**Independent Test**: Can be tested by adding a line item, expanding item options, configuring each advanced field, and verifying the values are saved and reflected in the preview.

**Acceptance Scenarios**:

1. **Given** a user adds a line item, **When** they view the item detail form, **Then** they see the item name/search, quantity, price fields, and a collapsible "Item options" link.
2. **Given** the user expands "Item options", **When** the section opens, **Then** they see: Item taxes dropdown, Item discount input (percentage or fixed amount), Supply date checkbox with date range picker, and Discountable checkbox (checked by default).
3. **Given** the user enables "Supply date" and sets a date range (e.g., May 27, 2025 – May 26, 2026), **When** the item is saved, **Then** the service period appears below the item description in the PDF preview (e.g., "May 27, 2025–May 26, 2026").
4. **Given** the user selects a tax rate for an item, **When** the item is saved, **Then** the tax amount is calculated and reflected in both the line item total and the invoice totals in the preview.
5. **Given** the user clicks "Save and add another", **When** the current item is saved, **Then** a new empty item form appears ready for input, and the previously saved item appears in the items list.

---

### User Story 4 - Additional Options & Customization (Priority: P2)

Below the Payment Collection section, an "Additional options" section allows users to customize the invoice with: **template selection**, **memo** (free text note), **footer** (free text), **custom fields** (key-value pairs), and **tax ID** display. Each option is toggled via a checkbox and reveals an input area when enabled.

**Why this priority**: Customization options are important for professional invoicing and compliance requirements but don't block the core creation flow. They enhance the product for businesses with specific branding or regulatory needs.

**Independent Test**: Can be tested by toggling each option on, entering content, and verifying it appears correctly in both preview tabs.

**Acceptance Scenarios**:

1. **Given** the user scrolls to "Additional options", **When** they view the section, **Then** they see a description ("Customize your invoice with additional fields to better suit your business needs and compliance requirements.") and toggle options for: Template, Memo, Footer, Custom fields, and Tax ID.
2. **Given** the user enables "Memo", **When** the checkbox is checked, **Then** a text input area appears where the user can type a note, and the memo text appears on the PDF preview.
3. **Given** the user selects a template from the dropdown, **When** a template is chosen, **Then** the PDF preview updates to reflect the selected template's layout and styling.
4. **Given** the user enables "Custom fields", **When** they add key-value pairs (e.g., "Project": "Website Redesign"), **Then** the custom fields appear on the PDF preview in the designated area.
5. **Given** the user enables "Tax ID", **When** the toggle is activated, **Then** the business's tax identification number appears on the PDF preview.

---

### User Story 5 - Invoice Header Bar with Actions (Priority: P2)

The invoice creation/editing page has a persistent header bar showing: a close button (X), the page title ("Create invoice" or "Edit invoice"), auto-save status ("Draft saved at [time]"), "Hide preview" toggle button, and a primary "Review invoice" action button.

**Why this priority**: The header bar provides essential navigation and status context. The "Review invoice" step is critical for the finalization flow, and "Hide preview" supports smaller screens.

**Independent Test**: Can be tested by verifying header elements are visible, clicking each button, and confirming expected behaviors (close returns to list, hide/show toggles preview, review opens finalization view).

**Acceptance Scenarios**:

1. **Given** the user is on the create/edit invoice page, **When** they view the header, **Then** they see: X (close) on the left, page title, and on the right: draft save timestamp, "Hide preview" button, and "Review invoice" primary button.
2. **Given** the user clicks "Hide preview", **When** the preview panel hides, **Then** the form expands to full width, and the button text changes to "Show preview".
3. **Given** the user clicks "Review invoice", **When** the review view opens, **Then** a summary of the invoice is shown with options to finalize, send, or go back to editing.
4. **Given** the user makes a change to the invoice (after first meaningful input: customer selected or item added), **When** the change is auto-saved, **Then** the header updates to show "Draft saved at [current time]".
5. **Given** the user clicks the X (close) button, **When** there are unsaved changes, **Then** a confirmation dialog appears asking whether to discard changes or continue editing.

---

### User Story 6 - Edit Existing Draft Invoice (Priority: P3)

A business user can open an existing draft invoice and edit it using the same split-panel layout. The form loads pre-populated with all existing invoice data, and the preview reflects the current state. All the same features (preview tabs, item options, additional options) are available during editing.

**Why this priority**: Editing drafts is essential but the UX is the same as creation — once the creation flow is built, editing inherits the same layout with pre-populated data.

**Independent Test**: Can be tested by creating a draft, navigating away, returning to edit it, and verifying all fields are pre-populated and editable.

**Acceptance Scenarios**:

1. **Given** a draft invoice exists, **When** the user clicks edit, **Then** the same split-panel layout opens with all fields pre-populated from the saved data.
2. **Given** the user changes a line item in edit mode, **When** the item is updated, **Then** the preview immediately reflects the change, and the "Draft saved at" timestamp updates.

---

### Edge Cases

- What happens when the user selects a different currency after adding items? A warning appears: "Selecting a new currency will clear all items from the invoice." Confirmation required before proceeding.
- What happens when the preview panel is hidden and the user navigates between form sections? The form works identically — preview visibility is independent of form functionality.
- What happens when a very long item description is added? The preview truncates or wraps text gracefully without breaking the layout.
- What happens on smaller screens (tablet/mobile)? The preview panel is hidden by default with a "Show preview" option, and the form takes full width.
- What happens when the customer has no email address? The Email preview tab shows a notice that no email address is available, and the "send via email" option is disabled.
- What happens when the user tries to close with unsaved changes? A confirmation prompt prevents accidental data loss.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a two-column split layout for invoice creation and editing — form panel on the left, preview panel on the right.
- **FR-002**: System MUST provide two preview tabs: "Invoice PDF" and "Email", each showing a realistic preview of how the invoice will appear in that format.
- **FR-003**: Preview MUST update in real-time (within 1 second) as the user modifies any field in the form.
- **FR-004**: Form MUST be organized into sequential sections: Customer, Currency, Items, Payment Collection, Additional Options.
- **FR-005**: Customer section MUST provide a searchable dropdown that allows finding existing customers by name, email, or company, and includes an option to add a new customer inline.
- **FR-006**: Currency section MUST show the selected currency and warn the user that changing currency will clear all existing line items.
- **FR-007**: Items section MUST support searching and adding items from the existing product catalog, as well as creating one-time items inline.
- **FR-008**: Each line item MUST have an expandable "Item options" section with: item-level tax rate selection, item discount (percentage or fixed amount), supply/service date range, and discountable toggle.
- **FR-009**: Payment Collection section MUST offer "Request payment" with configurable due date (Due on receipt, Net 15, Net 30, Net 60) and display accepted payment methods as read-only chips pulled from business-level invoice settings (editable only in settings, not per invoice).
- **FR-010**: Additional Options section MUST support toggle-able fields: Template selection, Memo text, Footer text, Custom fields (key-value pairs), and Tax ID display.
- **FR-011**: The header bar MUST show: close button, page title, auto-save status with timestamp, "Hide preview" toggle, and "Review invoice" primary action button.
- **FR-012**: System MUST auto-save the invoice as a draft as the user fills in the form, updating the save timestamp in the header. The draft record is created in the database after the first meaningful input (customer selected or first item added), not on page load.
- **FR-013**: "Hide preview" MUST toggle the preview panel visibility, expanding the form to full width when hidden.
- **FR-014**: "Review invoice" MUST open a summary/finalization view where the user can review all details before sending.
- **FR-015**: The Email preview MUST display: recipient email, subject line, company logo/name, total amount, due date, download invoice link, from/to details, "Pay this invoice" CTA, and line item details.
- **FR-016**: Line item editing MUST support "Save and add another" to streamline adding multiple items sequentially.
- **FR-017**: The PDF preview MUST show: company logo/name, invoice number, date of issue, due date, from/bill-to addresses, line items table (description, qty, unit price, amount), service dates below item descriptions, subtotal, tax, total, and amount due.
- **FR-018**: System MUST maintain all existing invoice functionality (status tracking, payment recording, void, recurring schedules) — this upgrade is focused on the creation/editing UX only.
- **FR-019**: System MUST support responsive behavior — on smaller screens, the preview panel should be hidden by default with an option to show it.

### Key Entities

- **Sales Invoice**: The core document with customer reference, line items, payment terms, currency, status, and customization options (memo, footer, custom fields, tax ID, template).
- **Line Item**: Individual product/service entry with quantity, price, description, item-level tax rate, discount (percentage or fixed), supply/service date range, and discountable flag.
- **Customer**: Business contact with name, email, address, tax ID, and language preference.
- **Catalog Item**: Reusable product/service definition with name, description, price(s), tax rate, and status.
- **Invoice Preview**: Rendered representation of the invoice in two formats — PDF document and email message.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a complete invoice (customer + items + payment terms) and preview it in both formats (PDF and Email) in under 3 minutes.
- **SC-002**: Preview updates within 1 second of any form field change across both tabs.
- **SC-003**: 90% of users can successfully create and send an invoice on their first attempt without external help.
- **SC-004**: Invoice creation abandonment rate decreases by 30% compared to the current flow.
- **SC-005**: Users rate the invoice creation experience 4+ out of 5 in usability surveys.
- **SC-006**: All existing invoice functionality (list, view, payment recording, void, recurring) continues to work without regression.
- **SC-007**: The invoice creation page loads and becomes interactive within 2 seconds on standard connections.
- **SC-008**: The form auto-saves drafts reliably — zero data loss reported from browser crashes or accidental navigation.

## Clarifications

### Session 2026-02-13

- Q: Does FinanSEAL have or plan to build a customer-facing hosted invoice/payment page? → A: Skip the Payment page tab entirely — only provide Invoice PDF and Email preview tabs.
- Q: Should "coupons" reuse existing per-item discounts or introduce a new Coupon entity? → A: Reuse existing per-item discount (percentage/fixed) — rename UI label from "coupons" to "discount" for clarity.
- Q: When is the draft record first created in the database? → A: After first meaningful field is filled (customer selected or first item added) — no empty drafts from page loads.
- Q: Should payment method chips be configurable per invoice or from business settings? → A: Business-level — chips are pulled from invoice settings and displayed read-only on the invoice form (editable only in settings).

## Assumptions

- The existing sales invoice domain (customers, catalog items, line items, templates, payment recording) provides the data foundation — this feature focuses on the creation/editing UX layer.
- The current PDF generation capability will be extended to support the new preview requirements.
- The Email preview is a visual mockup of what the sent email will look like — it does not require a live email rendering engine.
- "Autocharge customer" from Stripe's UX is not applicable to FinanSEAL (no stored payment methods on file) — this option will be omitted, keeping only "Request payment".
- Custom fields (key-value pairs) are a new data capability that will need to be added to the invoice data model.
- Supply/service date range per line item is a new data capability that will need to be added to the line item data model.
- The "Review invoice" step consolidates the current separate preview/send flow into a single finalization experience.
- Language preference for the customer affects the invoice language rendering (existing capability).
