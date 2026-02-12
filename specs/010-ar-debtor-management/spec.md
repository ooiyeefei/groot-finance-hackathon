# Feature Specification: Accounts Receivable & Debtor Management

**Feature Branch**: `010-ar-debtor-management`
**Created**: 2026-02-10
**Status**: Draft
**Input**: User description: "AR ledger, debtor list, debtor detail, debtor statement generation, payment-invoice linkage, AR aging report"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Payment-Invoice Linkage & History (Priority: P1)

As a finance admin, I need every payment recorded against a sales invoice to be stored as an individual record with full details (amount, date, method, bank reference), linked to specific invoice(s). Currently, payments only update a running total on the invoice with no history — I cannot answer "what payments were made on invoice INV-2026-001?" or "which invoices did this bank transfer cover?"

**Why this priority**: This is the foundational data model change that all other features depend on. Without individual payment records linked to invoices, debtor statements, aging reports, and AR ledger views cannot show payment details. This must be built first.

**Independent Test**: Record 3 separate payments against 2 invoices for the same customer. Verify each payment is stored individually with its own date, method, reference, and amount. Verify one payment can be split across 2 invoices. Verify the invoice's amountPaid and balanceDue still update correctly.

**Acceptance Scenarios**:

1. **Given** an invoice with balanceDue of $1,000, **When** I record a $400 payment via bank transfer with reference "TXN-123", **Then** a payment record is created with amount=$400, method=bank_transfer, reference="TXN-123", paymentDate, and the invoice balanceDue becomes $600 with status "partially_paid"
2. **Given** 2 invoices (INV-001 with $500 due, INV-002 with $300 due), **When** I record a single $800 payment and allocate $500 to INV-001 and $300 to INV-002, **Then** 2 payment allocation records are created, INV-001 becomes "paid", INV-002 becomes "paid"
3. **Given** an invoice with 2 prior payments recorded, **When** I view the invoice detail, **Then** I see a payment history section showing each payment's date, amount, method, and reference
4. **Given** a payment that has been recorded, **When** I view the payment record, **Then** I can see which invoice(s) it was applied to and the allocated amounts

---

### User Story 2 - Debtor List with Aging Analysis (Priority: P2)

As a finance admin, I need a "Debtors" view that shows all customers who owe money, with their total outstanding balance, number of open invoices, and an aging breakdown. This helps me prioritize collection efforts by seeing who owes the most and which debts are oldest.

**Why this priority**: The debtor list is the primary working view for AR management. Once payment records exist (US1), the debtor list provides the aggregated view that finance admins check daily to manage collections.

**Independent Test**: Create 5 customers with varying numbers of invoices at different aging stages (current, 30-day, 60-day, 90-day overdue). View the debtor list and verify each customer shows correct outstanding total, invoice count, and aging breakdown. Filter to "overdue only" and verify only overdue debtors appear.

**Acceptance Scenarios**:

1. **Given** 3 customers with outstanding invoices, **When** I open the "Debtors" tab in the Invoices page (third tab alongside "Incoming Invoices" and "Sales Invoices"), **Then** I see a list showing each customer's name, total outstanding, number of open invoices, and oldest unpaid invoice age in days
2. **Given** the debtor list, **When** I view the aging summary at the top, **Then** I see total AR grouped into buckets: Current (not yet due), 1-30 days overdue, 31-60 days, 61-90 days, 90+ days
3. **Given** a debtor list with 10 customers, **When** I sort by "outstanding amount" descending, **Then** the customer with the highest balance appears first
4. **Given** a debtor list, **When** I filter to "overdue only", **Then** only customers with at least one invoice past its due date are shown
5. **Given** no customers with outstanding invoices, **When** I open the Debtors tab, **Then** I see an empty state message indicating no outstanding receivables

---

### User Story 3 - Debtor Detail & Invoice History (Priority: P3)

As a finance admin, I need to click on a debtor from the list and see all their invoices with payment status, payment history per invoice, and a running balance. This is needed before I can contact the debtor about outstanding amounts.

**Why this priority**: The detail view is essential for customer communication and dispute resolution. It builds on the debtor list (US2) by providing the drill-down capability.

**Independent Test**: Select a customer who has 3 invoices (1 paid, 1 partially paid with 2 payments, 1 overdue). Verify all 3 invoices appear with correct status, amounts, and individual payment records. Verify the running balance adds up correctly.

**Acceptance Scenarios**:

1. **Given** a customer with 5 invoices in various states, **When** I click their name in the debtor list, **Then** I see all their invoices sorted by date, each showing: invoice number, issue date, due date, total amount, amount paid, balance due, and status
2. **Given** an invoice with 2 partial payments, **When** I expand the invoice row, **Then** I see each payment's date, amount, method, and bank reference
3. **Given** a customer with invoices over multiple months, **When** I view their detail page, **Then** I see a running balance that starts from the earliest invoice and accumulates through each invoice and payment chronologically
4. **Given** a customer detail page, **When** I look at the summary header, **Then** I see: total invoiced (all time), total paid, total outstanding, and number of overdue invoices

---

### User Story 4 - Debtor Statement Generation (Priority: P4)

As a finance admin, I need to generate a debtor statement for a specific customer and date range (e.g., January 2026 - February 2026) that shows opening balance, all invoices issued, all payments received, and closing balance in chronological order. I need to download this as a PDF and optionally email it to the debtor.

**Why this priority**: Debtor statements are a standard business communication tool for AR management. They are typically sent monthly or on-demand to remind debtors of their obligations. This depends on US1 (payment records) and US3 (debtor detail data).

**Independent Test**: For a customer with 4 invoices and 3 payments in Jan-Feb 2026, plus 1 invoice from December 2025 (contributing to opening balance), generate a statement for Jan 1 - Feb 28, 2026. Verify opening balance reflects the December invoice, all Jan-Feb transactions appear chronologically, and closing balance is correct. Download as PDF and verify formatting.

**Acceptance Scenarios**:

1. **Given** a customer with transactions spanning Dec 2025 - Feb 2026, **When** I generate a statement for Jan 1 - Feb 28, 2026, **Then** the statement shows: opening balance (outstanding as of Dec 31), each invoice and payment in date order, and a closing balance (outstanding as of Feb 28)
2. **Given** a generated statement, **When** I download as PDF, **Then** the PDF includes: business letterhead/name, customer details, date range, opening balance, transaction listing (date, description, debit/credit, running balance), and closing balance
3. **Given** a generated statement, **When** I click "Email to Customer", **Then** the statement PDF is sent to the customer's email address on file
4. **Given** a customer with no transactions in the selected date range but an existing outstanding balance, **When** I generate a statement, **Then** the statement shows the opening balance equal to the closing balance with no line items
5. **Given** a statement with mixed invoices and payments, **When** I review the transaction listing, **Then** invoices appear as debits (increase balance) and payments appear as credits (decrease balance), with a running balance column

---

### User Story 5 - AR Aging Report (Priority: P5)

As a finance admin, I need a summary AR aging report showing total receivables grouped by aging buckets (Current, 1-30, 31-60, 61-90, 90+ days overdue), with a per-debtor breakdown within each bucket. I need to export this for management reporting.

**Why this priority**: The aging report is a management-level summary used for financial reporting and board meetings. It aggregates the debtor list data (US2) into a formal report format.

**Independent Test**: With 8 customers having invoices at various aging stages, generate the aging report. Verify each bucket total is correct, each customer appears in the correct bucket(s), and the grand total matches the total AR. Export as CSV and verify data integrity.

**Acceptance Scenarios**:

1. **Given** outstanding invoices across multiple aging periods, **When** I open the AR Aging Report, **Then** I see a summary row with columns: Current, 1-30 Days, 31-60 Days, 61-90 Days, 90+ Days, and Total
2. **Given** the aging report, **When** I expand a bucket (e.g., "31-60 Days"), **Then** I see each customer within that bucket with their subtotal for that aging period
3. **Given** a customer with multiple invoices in different aging buckets, **Then** that customer appears in multiple bucket rows, with amounts correctly split by invoice age
4. **Given** the aging report, **When** I click "Export", **Then** I receive a CSV file with all aging data including customer names, amounts per bucket, and totals

---

### Edge Cases

- **Overpayment**: A payment amount exceeds the total outstanding across all selected invoices. System must reject with a clear error message.
- **Zero-balance debtors**: A customer who had invoices but is now fully paid should not appear in the active debtor list, but should still be accessible via search/filter.
- **Voided invoice with payments**: If an invoice with recorded payments is voided, the payments must be clearly marked as needing refund/reallocation, and the debtor's outstanding balance must be recalculated.
- **Multi-currency**: If a customer has invoices in different currencies, the debtor list must show outstanding per currency (not sum mixed currencies). Aging buckets should be per-currency.
- **Date boundary accuracy**: For statement generation, an invoice issued on Jan 31 and a payment on Feb 1 must appear in the correct period based on the selected date range (using transaction date, not creation timestamp).
- **Large debtor list**: Businesses with 500+ customers must still load the debtor list within acceptable time, using pagination or virtual scrolling.
- **Concurrent payments**: Two users recording payments against the same invoice simultaneously must not result in overpayment (optimistic concurrency or conflict detection).
- **Payment correction**: A payment recorded against the wrong invoice or with the wrong amount cannot be edited or deleted. The finance admin must record a reversal payment (which restores the invoice balance) and then record a new correct payment.

### Out of Scope

- **Credit notes / refunds**: Formal credit note documents that reduce a customer's balance (e.g., for returned goods or billing errors) are not included. Payment corrections are handled via reversal payments; invoice cancellation is handled via voiding.
- **Automated payment matching**: Importing bank statements and auto-matching transactions to invoices is not included.
- **Payment reminders / dunning**: Automated email reminders for overdue invoices are not included.
- **Accounts Payable (AP)**: Vendor-side payables and creditor management are not part of this feature.

## Requirements *(mandatory)*

### Functional Requirements

**Payment Records & Linkage**

- **FR-001**: System MUST store each payment as an individual record with: payment date, amount, payment method, payment reference (bank reference/cheque number), and the user who recorded it
- **FR-002**: System MUST link each payment to one or more invoices via payment allocations, where each allocation specifies the invoice and the amount applied to that invoice
- **FR-003**: System MUST support splitting a single payment across multiple invoices (multi-invoice allocation)
- **FR-004**: System MUST support multiple payments against a single invoice (partial payment tracking)
- **FR-005**: System MUST validate that total payment allocations equal the payment amount (no unallocated funds)
- **FR-006**: System MUST validate that allocations to an invoice do not exceed the invoice's balance due
- **FR-007**: System MUST update the invoice's amountPaid, balanceDue, and status after each payment is recorded
- **FR-008**: System MUST support the following payment methods: bank_transfer, cash, cheque, card, other
- **FR-008a**: Payment records MUST be immutable once created — no editing or deletion is permitted
- **FR-008b**: System MUST support recording a "reversal" payment to correct mistakes, which offsets the original payment amount and recalculates the linked invoice's balanceDue and status
- **FR-008c**: Reversal payments MUST reference the original payment being reversed and display as a distinct transaction type in payment history and debtor statements

**Debtor List & Aging**

- **FR-009**: System MUST display a list of all customers with outstanding (unpaid or partially paid) invoices
- **FR-010**: System MUST show per-debtor: customer name, total outstanding amount, number of open invoices, and days since oldest unpaid invoice was due
- **FR-011**: System MUST display an aging summary with buckets: Current (not yet due), 1-30 days overdue, 31-60 days, 61-90 days, 90+ days overdue
- **FR-012**: System MUST support filtering the debtor list by: overdue only, date range (invoices issued within), minimum outstanding amount
- **FR-013**: System MUST support sorting the debtor list by: outstanding amount, days overdue, customer name
- **FR-014**: System MUST calculate aging based on the invoice due date relative to today's date

**Debtor Detail**

- **FR-015**: System MUST display all invoices for a selected debtor, showing: invoice number, issue date, due date, total, paid, balance, status
- **FR-016**: System MUST display payment history for each invoice, showing: payment date, amount, method, and reference
- **FR-017**: System MUST display a running balance for the debtor's transaction history (invoices increase balance, payments decrease it)
- **FR-018**: System MUST show a debtor summary: total invoiced, total paid, total outstanding, count of overdue invoices

**Debtor Statement**

- **FR-019**: System MUST generate a debtor statement for a selected customer and date range
- **FR-020**: Statement MUST include: opening balance (outstanding before the start date), all invoices issued within the period, all payments received within the period, and closing balance
- **FR-021**: Statement MUST list transactions in chronological order, with invoices as debits and payments as credits, and a running balance column
- **FR-022**: System MUST allow the statement to be downloaded as a PDF document
- **FR-023**: System MUST allow the statement to be emailed to the customer's email address on file
- **FR-024**: Statement PDF MUST include: business name, customer details, date range, and a professional layout

**AR Aging Report**

- **FR-025**: System MUST generate an AR aging report showing totals per aging bucket (Current, 1-30, 31-60, 61-90, 90+)
- **FR-026**: System MUST show per-debtor breakdown within each aging bucket
- **FR-027**: System MUST allow the aging report to be exported as CSV

**Accounting Integration**

- **FR-028**: When an invoice is sent, the system MUST create an accounting entry recording the receivable (Income type, pending status)
- **FR-029**: When a payment is recorded, the system MUST update the linked accounting entry status to reflect the payment state (pending when partially paid, paid when fully collected)
- **FR-030**: When an invoice is voided, the system MUST mark the linked accounting entry as cancelled

**Access Control**

- **FR-031**: All AR and debtor management features MUST be restricted to users with finance_admin permissions
- **FR-032**: All data MUST be scoped to the active business (multi-tenant isolation)

### Key Entities

- **Payment**: An individual payment received from a customer. Contains: date, total amount, method (bank_transfer/cash/cheque/card/other), payment reference, recorded-by user. A single payment can be allocated across multiple invoices.
- **Payment Allocation**: A many-to-many linkage between a payment and an invoice. Contains: the payment reference, the invoice reference, and the allocated amount. The sum of allocations for a payment equals the payment amount. The sum of allocations for an invoice equals its amountPaid.
- **Debtor**: A virtual entity — any customer with at least one outstanding (sent, partially_paid, or overdue) invoice. Not a separate record; derived from customer + invoice data.
- **Debtor Statement**: A generated report for a specific customer and date range, showing chronological transactions (invoices and payments) with opening and closing balances. Generated on-demand, not stored permanently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Finance admins can record a payment and link it to specific invoices in under 60 seconds
- **SC-002**: Finance admins can view the complete payment history for any invoice within 2 clicks from the debtor list
- **SC-003**: Debtor list loads with aging breakdown for up to 200 active debtors within 3 seconds
- **SC-004**: Debtor statement for a 3-month period generates and renders within 5 seconds
- **SC-005**: PDF statement download completes within 3 seconds after clicking download
- **SC-006**: AR aging report accurately categorizes 100% of outstanding invoices into correct aging buckets based on due date
- **SC-007**: All payment amounts reconcile exactly — sum of payment allocations for an invoice equals the invoice's amountPaid field, with no rounding discrepancies beyond 2 decimal places
- **SC-008**: Finance admins can identify their top 10 debtors by outstanding amount within 10 seconds of opening the debtors view

## Clarifications

### Session 2026-02-10

- Q: Can recorded payments be deleted or reversed? → A: Payments are immutable once recorded. Mistakes are corrected by recording a reversal payment that offsets the original amount. This preserves a complete audit trail.
- Q: Where should the Debtors view be placed in navigation? → A: Third tab in the existing Invoices page alongside "Incoming Invoices" and "Sales Invoices", keeping all invoice/AR views consolidated and avoiding sidebar bloat.
- Q: Are credit notes / refunds in scope? → A: Out of scope. Reversal payments and invoice voiding cover correction needs for now. Credit notes can be added as a future feature.

## Assumptions

- **Currency handling**: Debtor totals and aging reports will group by currency. Mixed-currency totals will not be summed into a single figure unless explicitly requested.
- **Statement format**: The debtor statement PDF will follow a standard accounting statement layout similar to bank statements (date, description, debit, credit, running balance).
- **Email delivery**: Statement emails will use the existing email infrastructure (or a placeholder endpoint if not yet built). The email contains the PDF as an attachment.
- **Data migration**: Existing sales invoices that already have amountPaid > 0 will not have individual payment records retroactively created. The payment history will start from the point this feature is deployed.
- **Payment methods**: The five methods (bank_transfer, cash, cheque, card, other) cover the standard SME payment channels in Southeast Asia.
- **AR aging calculation**: Aging is calculated from invoice due date (not issue date). An invoice due on Feb 15 that is unpaid on March 20 is "31-60 days" overdue.
- **Opening balance for statements**: Opening balance is the sum of all outstanding invoice balances for the customer as of the day before the statement start date, minus any payments recorded before the start date.
