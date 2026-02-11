# Feature Specification: Sales Invoice Generation

**Feature Branch**: `009-sales-invoice-generation`
**Created**: 2026-02-09
**Status**: Draft
**Input**: User description: "Add a sales invoice generation feature for business owners to create, customize, and send professional invoices to their customers — complementing the existing vendor invoice upload & OCR feature."

## Clarifications

### Session 2026-02-09

- Q: Who should be able to create and send sales invoices? → A: Only finance admin role — aligning with the existing pattern where only finance admin can process vendor invoices and create accounting records/payments.
- Q: When should the accounting entry (Income) be created? → A: Accrual-basis — revenue recognized when invoice is sent (Accounts Receivable), with a separate entry when payment is received.
- Q: What should the default payment terms be for new invoices? → A: Net 30 (due 30 days after invoice date), overridable per invoice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Send a Sales Invoice (Priority: P1)

As a business owner, I want to create a professional sales invoice for my customer so I can bill them for products or services rendered and maintain proper financial records.

The user navigates to the sales invoices section, clicks "Create Invoice", fills in customer details, adds line items (products/services with descriptions, quantities, unit prices), applies tax rates, previews the invoice, and sends it via email — all from a single, guided flow.

**Why this priority**: This is the core value proposition. Without the ability to create and send invoices, no other feature matters. A business owner needs to generate invoices to get paid.

**Independent Test**: Can be fully tested by creating an invoice with at least one line item, previewing it, and sending it to an email address. Delivers immediate value as the user can start billing customers.

**Acceptance Scenarios**:

1. **Given** a logged-in user with finance admin role on the sales invoices page, **When** they click "Create Invoice", **Then** an invoice creation form opens with fields for customer info, line items, tax, and notes.
2. **Given** a logged-in user without finance admin role, **When** they navigate to sales invoices, **Then** they can view invoices but cannot access the "Create Invoice" or "Send" actions.
3. **Given** the user is filling out the invoice form, **When** they add line items with description, quantity, and unit price, **Then** the system auto-calculates line totals, subtotal, tax amount, and grand total in real-time.
4. **Given** the user has completed the invoice form, **When** they click "Preview", **Then** a professional invoice preview renders with the business logo, all entered details formatted according to the selected template.
5. **Given** the user is previewing the invoice, **When** they click "Send", **Then** the invoice is emailed to the customer's email address and the invoice status is set to "Sent".
6. **Given** the user is previewing the invoice, **When** they click "Download PDF", **Then** a PDF version of the invoice is generated and downloaded to their device.
7. **Given** the user is on the invoice form, **When** they leave required fields empty and attempt to send, **Then** validation errors are shown on the specific fields that need attention.

---

### User Story 2 - Manage Product/Service Catalog (Priority: P2)

As a business owner, I want to maintain a catalog of my products and services with preset descriptions and pricing so I can quickly add them to invoices without re-entering details each time.

The user creates and manages a catalog of their offerings (products or services), each with a name, description, SKU/code, unit price, and tax applicability. When creating an invoice, they can select items from this catalog to auto-populate line items.

**Why this priority**: A product catalog dramatically speeds up repeat invoicing — which is the most common use case for SMEs that invoice regularly. Without it, users must re-type product details every time, which is tedious and error-prone.

**Independent Test**: Can be tested by creating 3+ catalog items, then creating an invoice and selecting items from the catalog to verify auto-population of line item fields.

**Acceptance Scenarios**:

1. **Given** a business owner on the product catalog page, **When** they click "Add Item", **Then** a form appears to enter item name, description, SKU/code (optional), default unit price, unit of measure, and tax applicability.
2. **Given** existing catalog items, **When** the user is adding line items to an invoice, **Then** they can search/select from their catalog and the line item fields auto-populate with the catalog defaults.
3. **Given** a catalog item is selected for an invoice line, **When** the user modifies the price or description on the invoice, **Then** only the invoice line is affected — the catalog item remains unchanged.
4. **Given** the product catalog, **When** the user edits or deactivates a catalog item, **Then** existing invoices that used that item are not affected, but future invoices reflect the update.

---

### User Story 3 - Manage Customer Directory (Priority: P2)

As a business owner, I want to save my customer details so I can quickly select returning customers when creating invoices without re-entering their information.

The user maintains a directory of customers with their business name, contact person, email, address, and tax ID. When creating an invoice, they can select a saved customer to auto-fill the billing details.

**Why this priority**: Same priority as product catalog — together they make the invoicing workflow fast and practical for repeat use. Most SMEs invoice the same customers regularly.

**Independent Test**: Can be tested by adding a customer to the directory, then creating an invoice and selecting that customer to verify auto-population of customer fields.

**Acceptance Scenarios**:

1. **Given** a business owner on the customer directory, **When** they add a new customer, **Then** the system saves the customer's business name, contact person name, email, phone, billing address, and tax registration number.
2. **Given** existing customers in the directory, **When** the user is creating an invoice, **Then** they can search and select a customer by name or email, and billing fields auto-populate.
3. **Given** a customer is selected for an invoice, **When** the user modifies customer details on the invoice, **Then** only the invoice copy is affected — the directory entry remains unchanged.
4. **Given** the customer directory, **When** the user creates a new invoice for a customer not in the directory, **Then** the system offers to save the new customer details to the directory after the invoice is created.

---

### User Story 4 - Track Invoice Lifecycle (Priority: P2)

As a business owner, I want to track the status of all my invoices so I can know which invoices are paid, overdue, or still pending, and take action accordingly.

The user can view a dashboard/list of all sales invoices with their current status (Draft, Sent, Viewed, Paid, Overdue, Void). They can filter and sort by status, customer, date, or amount. Overdue invoices are visually highlighted.

**Why this priority**: Knowing which invoices are paid and which are outstanding is essential for cash flow management — the #1 concern of SMEs.

**Independent Test**: Can be tested by creating invoices in various states and verifying the list view correctly displays, filters, and sorts them with accurate status badges.

**Acceptance Scenarios**:

1. **Given** the user has multiple invoices, **When** they navigate to the sales invoices list, **Then** they see all invoices with columns for invoice number, customer name, date, due date, amount, and status.
2. **Given** the invoice list, **When** the user filters by status (e.g., "Overdue"), **Then** only invoices matching that status are displayed.
3. **Given** an invoice has a due date that has passed and it is not marked as paid, **When** the list renders, **Then** the invoice is automatically marked as "Overdue" with a visual indicator.
4. **Given** a sent invoice, **When** the user records a payment against it, **Then** the invoice status changes to "Paid", the payment date is recorded, and a payment receipt accounting entry is created.
5. **Given** a draft invoice, **When** the user edits and sends it, **Then** the status transitions from "Draft" to "Sent", the sent date is recorded, and an Accounts Receivable accounting entry is created (accrual-basis revenue recognition).

---

### User Story 5 - Customize Invoice Template and Business Profile (Priority: P3)

As a business owner, I want to set up my business profile (logo, company details, payment instructions) once and have it automatically appear on every invoice, with the option to choose from a few clean invoice templates.

The user configures their business profile with logo, company name, registration number, tax ID, address, and default payment instructions (bank account details). They can choose from 2-3 clean, modern invoice templates. These defaults apply to all new invoices.

**Why this priority**: While invoices can be created without customization, a professional appearance with company branding builds customer trust and looks legitimate. This is a setup-once feature.

**Independent Test**: Can be tested by configuring a business profile with logo and payment details, selecting a template, and verifying that a newly created invoice renders with those defaults applied.

**Acceptance Scenarios**:

1. **Given** the business profile settings page, **When** the user uploads a logo and fills in company details, **Then** the information is saved and previewed on a sample invoice layout.
2. **Given** configured business details, **When** the user creates a new invoice, **Then** the seller section is pre-filled with the saved company information and logo.
3. **Given** 2-3 available templates, **When** the user selects a different template, **Then** the invoice preview updates to reflect the new layout while keeping the same data.
4. **Given** payment instructions are configured (bank name, account number, payment reference), **When** an invoice is generated, **Then** the payment instructions appear in the invoice footer.

---

### User Story 6 - Recurring Invoices (Priority: P3)

As a business owner with subscription or retainer clients, I want to set up recurring invoices that are automatically generated on a schedule so I don't have to manually create the same invoice every month.

The user can mark an invoice as recurring and set a frequency (weekly, monthly, quarterly, yearly) and an optional end date. The system auto-generates draft invoices on the schedule for the user to review and send.

**Why this priority**: Recurring invoices save significant time for businesses with repeat clients but are not essential for the initial launch — manual creation covers this use case initially.

**Independent Test**: Can be tested by setting up a recurring monthly invoice, advancing time (or triggering manually), and verifying that a new draft invoice is created with the correct details and incremented invoice number.

**Acceptance Scenarios**:

1. **Given** a completed invoice, **When** the user enables "Recurring" and sets frequency to "Monthly", **Then** the system schedules automatic invoice generation on the same day each month.
2. **Given** a recurring schedule is active, **When** the scheduled date arrives, **Then** a new invoice is auto-generated as a "Draft" with the same line items, customer, and an incremented invoice number.
3. **Given** an auto-generated recurring draft, **When** the user reviews it, **Then** they can edit any field before sending, or send it as-is.
4. **Given** a recurring invoice, **When** the user cancels the recurrence, **Then** no further invoices are generated, but existing invoices are unaffected.

---

### Edge Cases

- What happens when the user creates an invoice with a currency different from their home currency? The system displays the invoice in the selected currency and stores the exchange rate for accounting purposes.
- How does the system handle tax calculation for mixed tax-rate line items? Each line item can have its own tax rate, and the invoice totals section shows tax broken down by rate.
- What happens when a customer's email bounces during invoice delivery? The system marks the delivery status as "Failed" and notifies the user to verify the email address.
- What happens when the user tries to edit a "Sent" or "Paid" invoice? Sent invoices can be voided and a new corrected invoice created. Paid invoices cannot be edited — only voided with a credit note.
- How does the system handle invoice numbering when multiple users create invoices simultaneously? Invoice numbers are auto-generated sequentially server-side using a business-scoped counter to prevent duplicates.
- What happens when a product catalog item is deleted but referenced by existing invoices? The catalog item is soft-deleted (deactivated), and existing invoices retain the item details as captured at time of creation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST restrict sales invoice creation, editing, sending, and voiding to users with the finance admin role. Non-finance-admin users may view invoices in read-only mode.
- **FR-001a**: System MUST allow finance admin users to create sales invoices with customer details, line items (description, quantity, unit price, tax rate), subtotal, tax, and total calculations.
- **FR-002**: System MUST auto-generate sequential invoice numbers with a customizable prefix (e.g., "INV-2026-001") that is unique within each business.
- **FR-003**: System MUST support multi-currency invoicing with at least SGD, MYR, THB, IDR, PHP, VND, and USD currencies.
- **FR-004**: System MUST calculate line item totals (quantity x unit price), subtotal, tax amounts (per tax rate), and grand total automatically and in real-time as the user edits.
- **FR-005**: System MUST support tax-inclusive and tax-exclusive pricing modes per invoice.
- **FR-006**: System MUST allow users to apply discounts at the line item level (percentage or fixed amount) and at the invoice level.
- **FR-007**: System MUST generate a downloadable PDF of the invoice with professional formatting, company branding, and all required financial details.
- **FR-008**: System MUST send the invoice to the customer's email address with the PDF attached or linked.
- **FR-009**: System MUST track invoice lifecycle status: Draft, Sent, Paid, with additional states for Overdue (automatic), Void, and Partially Paid.
- **FR-010**: System MUST allow users to record payments against invoices (full or partial), transitioning the status accordingly.
- **FR-011**: System MUST provide a product/service catalog where users can create, edit, and deactivate items with name, description, SKU/code, default unit price, unit of measure, and tax applicability.
- **FR-012**: System MUST auto-populate invoice line items when a catalog item is selected, while allowing per-invoice overrides.
- **FR-013**: System MUST provide a customer directory where users can save and manage customer details (name, email, phone, address, tax ID).
- **FR-014**: System MUST auto-populate invoice customer fields when a saved customer is selected.
- **FR-015**: System MUST allow users to configure their business profile (logo, company name, address, registration number, tax ID, payment instructions) for use on invoices.
- **FR-016**: System MUST offer at least 2 clean, modern invoice templates for users to choose from.
- **FR-017**: System MUST support recurring invoice schedules (weekly, monthly, quarterly, yearly) that auto-generate draft invoices.
- **FR-018**: System MUST persist a copy of all invoice data (customer info, line items, amounts) at the time of creation, independent of later catalog or customer directory changes.
- **FR-019**: System MUST provide an invoices list view with filtering by status, customer, date range, and sorting by date, amount, or status.
- **FR-020**: System MUST automatically mark invoices as "Overdue" when the due date passes without full payment.
- **FR-021**: System MUST validate all required fields before allowing an invoice to be sent (customer name, at least one line item, valid amounts).
- **FR-022**: System MUST support notes/memo and payment terms fields on invoices. The default payment terms MUST be "Net 30" (due date auto-set to 30 days after invoice date), overridable per invoice. Common presets (Due on Receipt, Net 15, Net 30, Net 60) MUST be selectable, with an option for custom due date.
- **FR-023**: System MUST scope all invoice data by business for multi-tenant isolation.
- **FR-024**: System MUST follow accrual-basis accounting: when an invoice status transitions to "Sent", the system creates an Accounts Receivable entry (revenue recognized at issuance). When a payment is recorded against the invoice, the system creates a corresponding payment receipt entry. This integrates with the existing accounting system.

### Key Entities

- **Sales Invoice**: The core document representing a bill to a customer. Contains seller info (from business profile), buyer info (customer), line items, financial totals, status, dates (issue date, due date, paid date), payment terms, notes, and template selection. Has a unique sequential invoice number per business.
- **Invoice Line Item**: A row on the invoice representing a product or service. Contains description, quantity, unit price, tax rate, discount, and calculated total. May reference a catalog item but stores its own copy of all values.
- **Product/Service Catalog Item**: A reusable template for common products or services. Contains name, description, SKU/code, default unit price, unit of measure, tax rate, and active/inactive status. Belongs to a business.
- **Customer**: A record in the customer directory. Contains business name, contact person, email, phone, billing address, and tax registration number. Belongs to a business. Separate from the existing "Vendor" entity — vendors are who the business buys from; customers are who the business sells to.
- **Business Profile (Invoice Settings)**: Configuration for invoice appearance and defaults. Contains logo, company name, address, registration/tax IDs, default payment instructions (bank details), default currency, invoice number prefix, and selected template. Belongs to a business.
- **Recurring Invoice Schedule**: Configuration for automatic invoice generation. Contains source invoice reference, frequency, next generation date, end date (optional), and active status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create and send a complete, professional-looking sales invoice in under 5 minutes on their first attempt.
- **SC-002**: Users with a configured product catalog can create and send repeat invoices in under 2 minutes.
- **SC-003**: 100% of generated invoice PDFs contain all legally required fields for SEA business invoicing (seller details, buyer details, tax information, line items, totals).
- **SC-004**: Users can view the current status of any invoice within 2 clicks from the main navigation.
- **SC-005**: The system accurately calculates all invoice totals (line totals, subtotals, tax, discounts, grand total) with zero calculation errors across all supported currencies.
- **SC-006**: Overdue invoices are automatically flagged within 24 hours of the due date passing.
- **SC-007**: Recurring invoices are auto-generated as drafts within the scheduled period with correct details and incremented invoice numbers.
- **SC-008**: All invoice data is correctly scoped per business — no cross-business data leakage.

## Assumptions

- The existing vendor entity will remain separate from the new customer entity, as they serve opposite roles (vendors = suppliers, customers = buyers).
- Invoice PDF generation will use the existing client-side PDF library already available in the project for the initial version.
- Email delivery will use an existing or new email service integration. The specific provider is an implementation decision.
- The business profile/invoice settings will be stored as part of or alongside the existing business entity in the database.
- Tax rates are manually entered per line item or per invoice for now — no automatic tax lookup service is required in v1.
- Invoice numbering is sequential per business and auto-generated, with no gaps allowed in normal operation (voided invoices keep their number).
- Only the finance admin role can create, edit, send, and void sales invoices — consistent with the existing permission model where finance admin processes vendor invoices and accounting records. Other roles have read-only access to view invoices.
- SEA-specific compliance features (e.g., Malaysia MyInvois e-invoicing, QR code payments) are out of scope for v1 but the data model should be extensible to support them in the future.
