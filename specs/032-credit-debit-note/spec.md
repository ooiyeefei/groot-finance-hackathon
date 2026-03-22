# Feature Specification: Credit/Debit Note Support (E-Invoice, AR & AP)

**Feature Branch**: `032-credit-debit-note`
**Created**: 2026-03-22
**Status**: Draft
**Input**: GitHub Issue #333 — E-Invoice Credit/Debit Note support + AR/AP credit/debit note capability
**LHDN Document Types**: 02 (Credit Note), 03 (Debit Note), 04 (Refund Note), 12 (Self-Billed Credit Note), 13 (Self-Billed Debit Note), 14 (Self-Billed Refund Note)

---

## User Scenarios & Testing

### User Story 1 — Create AR Credit Note Against a Sales Invoice (Priority: P1)

A business owner or finance admin needs to issue a credit note when a customer returns goods, receives a price reduction, or is owed a refund. The credit note must reference the original sales invoice, reduce the outstanding balance, and be submittable to LHDN as an e-invoice (Type 02).

**Why this priority**: Credit notes are the most common adjustment document — every business that issues invoices will eventually need to issue a credit. LHDN compliance requires this for any refund/return scenario.

**Independent Test**: Create a credit note from a validated sales invoice, verify the AR balance decreases, verify the journal entry reversal is correct (Dr. Revenue, Cr. AR), and submit to LHDN as Type 02.

**Acceptance Scenarios**:

1. **Given** a sales invoice with status "sent" or "paid" or "partially_paid" and a validated LHDN e-invoice, **When** the user selects "Create Credit Note" and enters line items and a reason, **Then** the system creates a credit note linked to the original invoice with a `CN-{invoiceNumber}-{seq}` number, creates a reversal journal entry, and updates the net outstanding balance.
2. **Given** the user attempts to create a credit note whose total exceeds the remaining creditable amount on the original invoice, **When** the user submits, **Then** the system rejects with a clear error showing the maximum allowed amount.
3. **Given** a credit note has been created, **When** the user submits it to LHDN, **Then** the system maps it to UBL Type 02 with a BillingReference to the original e-invoice UUID and submits it through the existing e-invoice pipeline.
4. **Given** a credit note has been validated by LHDN, **When** the user views the original invoice, **Then** the net outstanding amount reflects the credit and a link to the credit note(s) is visible.

---

### User Story 2 — Create AP Credit Note Against a Supplier Invoice (Priority: P1)

A finance admin receives a credit note from a supplier (e.g., goods returned to vendor, pricing error corrected). The credit note must reference the original AP invoice, reduce the amount payable, and optionally be submitted to LHDN as a self-billed credit note (Type 12) for self-billing businesses.

**Why this priority**: AP credit notes are equally common as AR — any business receiving supplier invoices will encounter vendor credits. Currently, Groot has zero AP credit/debit note capability.

**Independent Test**: Create an AP credit note from a completed supplier invoice, verify the AP balance decreases, verify the journal entry (Dr. AP 2100, Cr. Expense), and optionally submit to LHDN as Type 12.

**Acceptance Scenarios**:

1. **Given** a supplier invoice with status "completed" or "paid" or "partially_paid", **When** the user selects "Create Credit Note" and enters line items and reason, **Then** the system creates an AP credit note linked to the original invoice, creates a reversal journal entry (Dr. AP, Cr. Expense account), and reduces the payable balance.
2. **Given** the AP credit note total exceeds the remaining creditable amount, **When** submitted, **Then** the system rejects with a clear error.
3. **Given** the business uses self-billing and the AP credit note is ready, **When** the user submits to LHDN, **Then** the system maps it to UBL Type 12 (Self-Billed Credit Note) with BillingReference to the original self-billed invoice UUID.

---

### User Story 3 — Create AR Debit Note Against a Sales Invoice (Priority: P2)

A business needs to issue a debit note when additional charges arise after the original invoice (e.g., price increase, additional services rendered, undercharged amount). The debit note increases the amount receivable from the customer.

**Why this priority**: Less common than credit notes but required for compliance. LHDN Type 03.

**Independent Test**: Create a debit note from a sales invoice, verify AR balance increases, verify journal entry (Dr. AR, Cr. Revenue), submit to LHDN as Type 03.

**Acceptance Scenarios**:

1. **Given** a sales invoice with status "sent" or "paid" or "partially_paid", **When** the user creates a debit note with line items describing the additional charges, **Then** the system creates a debit note with number `DN-{invoiceNumber}-{seq}`, creates a journal entry (Dr. AR 1200, Cr. Revenue 4100), and increases the receivable balance.
2. **Given** a debit note is submitted to LHDN, **Then** it is mapped to UBL Type 03 with BillingReference to the original invoice UUID.

---

### User Story 4 — Create AP Debit Note Against a Supplier Invoice (Priority: P2)

A finance admin needs to record an additional charge from a supplier (e.g., freight surcharge added after invoice, price adjustment upward). The debit note increases the amount payable to the vendor.

**Why this priority**: Mirrors AR debit note on the payables side. Required for complete AP lifecycle and LHDN self-billing compliance (Type 13).

**Independent Test**: Create an AP debit note from a supplier invoice, verify AP balance increases, verify journal entry (Dr. Expense, Cr. AP), optionally submit as Type 13.

**Acceptance Scenarios**:

1. **Given** a supplier invoice with status "completed" or "paid" or "partially_paid", **When** the user creates a debit note with additional charge line items, **Then** the system creates an AP debit note, creates a journal entry (Dr. Expense, Cr. AP 2100), and increases the payable balance.
2. **Given** the business uses self-billing, **When** the AP debit note is submitted to LHDN, **Then** it maps to Type 13 (Self-Billed Debit Note).

---

### User Story 5 — View Credit/Debit Note History on Original Invoice (Priority: P2)

Any user viewing an invoice (AR or AP) should immediately see all adjustment documents (credit notes, debit notes) linked to it, with running net balance.

**Why this priority**: Without visibility into adjustments, users cannot reconcile or understand the true outstanding amount on any invoice. Critical for audit trail.

**Independent Test**: View a sales invoice that has 2 credit notes and 1 debit note; verify net outstanding = original amount - credits + debits.

**Acceptance Scenarios**:

1. **Given** a sales invoice with linked credit and debit notes, **When** the user views the invoice detail, **Then** an "Adjustments" section lists all credit/debit notes with their amounts, dates, reasons, and LHDN status, plus the calculated net outstanding balance.
2. **Given** an AP invoice with linked credit and debit notes, **When** the user views the invoice detail, **Then** the same "Adjustments" section appears with net payable balance.

---

### User Story 6 — LHDN E-Invoice Submission for Credit/Debit Notes (Priority: P1)

Credit and debit notes must follow the same e-invoice submission pipeline as regular invoices: UBL mapping → digital signature → LHDN submission → polling → status update. The key difference is the UBL document type code and the mandatory BillingReference to the original e-invoice.

**Why this priority**: LHDN compliance — credit/debit notes issued without e-invoice submission are non-compliant.

**Independent Test**: Submit a credit note to LHDN sandbox, verify Type 02/12 in UBL, verify BillingReference contains original UUID, verify polling updates status.

**Acceptance Scenarios**:

1. **Given** an AR credit note linked to a LHDN-validated invoice, **When** submitted, **Then** the UBL document uses Type Code "02", includes `BillingReference` with the original invoice's LHDN UUID, and follows the standard submission pipeline (sign → submit → poll → update status).
2. **Given** an AP credit note for a self-billing business, **When** submitted, **Then** the UBL uses Type Code "12" (Self-Billed Credit Note) with the original self-billed invoice UUID.
3. **Given** an AR debit note, **When** submitted, **Then** UBL uses Type Code "03" with BillingReference.
4. **Given** an AP debit note for a self-billing business, **When** submitted, **Then** UBL uses Type Code "13".
5. **Given** the original invoice was never submitted to LHDN (no UUID), **When** the user tries to submit the credit/debit note to LHDN, **Then** the system shows a clear error that the original invoice must be validated first.

---

### User Story 7 — Credit/Debit Notes in Accounting Reports (Priority: P3)

Credit and debit notes should appear correctly in financial reports: AR aging, AP aging, trial balance, P&L, and journal entry listings.

**Why this priority**: Important for audit and financial accuracy but the underlying journal entries (P1/P2) already ensure correctness in the GL. This story is about surfacing them in report views.

**Independent Test**: Generate AR aging report; verify credit notes reduce outstanding; verify debit notes increase outstanding.

**Acceptance Scenarios**:

1. **Given** credit/debit notes have been posted, **When** the user views the AR aging report, **Then** the net outstanding per customer reflects all adjustments.
2. **Given** AP credit/debit notes have been posted, **When** the user views the AP aging report, **Then** the net payable per vendor reflects all adjustments.

---

### Edge Cases

- What happens when a credit note is created against an invoice that has already been fully credited? → System rejects with "No remaining creditable amount."
- What happens when the original invoice is voided after a credit note was issued? → Credit note remains valid (it was issued against a once-valid invoice). System warns but does not auto-void.
- What happens when a credit note amount exactly equals the original invoice total? → Allowed — this is a full reversal. Invoice net outstanding becomes zero.
- What happens when the user creates a credit note for a draft invoice? → System rejects — only sent/paid/partially_paid/overdue invoices can have adjustment documents.
- What happens when LHDN rejects a credit/debit note submission? → Same flow as invoice rejection — user sees validation errors, can fix and resubmit.
- What happens when a credit note is created but the original invoice's LHDN e-invoice has been cancelled? → System warns that the credit note cannot reference a cancelled e-invoice and blocks LHDN submission.
- Multi-currency: What if the credit note is in a different currency than the original? → Not allowed — credit/debit notes must use the same currency as the original invoice.

---

## Requirements

### Functional Requirements

#### AR Credit/Debit Notes (Sales Invoices)

- **FR-001**: System MUST allow creating a credit note from any sales invoice with status "sent", "paid", "partially_paid", or "overdue".
- **FR-002**: System MUST allow creating a debit note from any sales invoice with status "sent", "paid", "partially_paid", or "overdue".
- **FR-003**: Credit notes MUST have a unique number format `CN-{originalInvoiceNumber}-{sequence}` and debit notes `DN-{originalInvoiceNumber}-{sequence}`.
- **FR-004**: System MUST prevent total credits on an invoice from exceeding the original invoice total amount.
- **FR-005**: System MUST create IFRS-compliant journal entries: Credit note → Dr. Revenue (4100), Cr. AR (1200); Debit note → Dr. AR (1200), Cr. Revenue (4100).
- **FR-006**: System MUST calculate and display net outstanding amount on any invoice: original amount − total credits + total debits.
- **FR-007**: Credit/debit notes MUST store a reference to the original invoice, a reason, and line items with quantity, unit price, tax, and total.

#### AP Credit/Debit Notes (Supplier Invoices)

- **FR-008**: System MUST allow creating an AP credit note from any supplier invoice with status "completed", "paid", or "partially_paid".
- **FR-009**: System MUST allow creating an AP debit note from any supplier invoice with status "completed", "paid", or "partially_paid".
- **FR-010**: System MUST create IFRS-compliant journal entries: AP Credit note → Dr. AP (2100), Cr. Expense (original account); AP Debit note → Dr. Expense (original account), Cr. AP (2100).
- **FR-011**: System MUST prevent AP credit total from exceeding the original invoice's net creditable amount (original amount minus already-credited amounts).
- **FR-012**: AP credit/debit notes MUST update the payment tracking on the original invoice (reducing/increasing balance due).

#### LHDN E-Invoice Submission

- **FR-013**: System MUST map AR credit notes to LHDN UBL Type 02 and AR debit notes to Type 03, including BillingReference with the original e-invoice UUID.
- **FR-014**: System MUST map AP self-billed credit notes to LHDN UBL Type 12 and AP self-billed debit notes to Type 13, including BillingReference.
- **FR-015**: System MUST block LHDN submission of a credit/debit note if the original invoice has no validated LHDN e-invoice UUID.
- **FR-016**: Credit/debit note LHDN submissions MUST follow the same pipeline as invoices: digital signature → submission → polling → status update.
- **FR-017**: System MUST enforce that the credit/debit note is in the same currency as the original invoice for LHDN submission.

#### User Interface

- **FR-018**: Users MUST be able to initiate credit/debit note creation from the original invoice's detail view (both AR and AP).
- **FR-019**: The creation form MUST pre-populate line items from the original invoice, allowing the user to adjust quantities and amounts downward (for credits) or add new line items (for debits).
- **FR-020**: Each invoice detail view MUST show an "Adjustments" section listing all linked credit/debit notes with amounts, dates, reasons, LHDN status, and a calculated net balance.
- **FR-021**: Credit/debit notes MUST be visible in the sales invoices list and supplier invoices list, visually distinguished from regular invoices (e.g., badge or icon).

#### Data Integrity

- **FR-022**: Every credit/debit note MUST reference exactly one original invoice (AR or AP).
- **FR-023**: Voiding a credit/debit note MUST create a reversal journal entry and restore the original invoice's balance.
- **FR-024**: System MUST maintain an audit trail for all credit/debit note operations (creation, submission, voiding).

### Key Entities

- **Credit Note (AR)**: An adjustment document that reduces the amount receivable from a customer. Linked to one sales invoice. Contains line items, reason, LHDN e-invoice fields, and a reversal journal entry.
- **Debit Note (AR)**: An adjustment document that increases the amount receivable from a customer. Linked to one sales invoice. Contains line items describing additional charges, LHDN e-invoice fields, and an additional-charge journal entry.
- **Credit Note (AP)**: An adjustment document that reduces the amount payable to a supplier. Linked to one supplier invoice. Contains line items, reason, and a reversal journal entry. Optionally submitted as LHDN self-billed credit note (Type 12).
- **Debit Note (AP)**: An adjustment document that increases the amount payable to a supplier. Linked to one supplier invoice. Contains additional charge line items and journal entry. Optionally submitted as LHDN self-billed debit note (Type 13).
- **BillingReference**: LHDN-required field in credit/debit note UBL that references the original e-invoice UUID, enabling LHDN to link the adjustment to the original document.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can create a credit note from an existing invoice (AR or AP) in under 2 minutes, including line item selection and reason entry.
- **SC-002**: Credit/debit notes are accurately reflected in net outstanding balances — AR aging and AP aging reports show correct post-adjustment amounts with zero manual reconciliation needed.
- **SC-003**: 100% of credit/debit notes submitted to LHDN use the correct document type code (02/03/12/13) and include a valid BillingReference to the original e-invoice UUID.
- **SC-004**: System prevents over-crediting in 100% of cases — no credit note total can exceed the remaining creditable amount on the original invoice.
- **SC-005**: Journal entries for all credit/debit notes are IFRS-compliant with balanced double-entry bookkeeping (total debits = total credits for every entry).
- **SC-006**: All six LHDN adjustment document types (02, 03, 04, 12, 13, 14) are supported for e-invoice submission through the existing pipeline.
- **SC-007**: Users can view the complete adjustment history (credits + debits) on any invoice within 1 click from the invoice detail view.

---

## Assumptions

1. **AR credit note infrastructure is partially built**: The `sales_invoices` table already has `einvoiceType`, `originalInvoiceId`, `creditNoteReason` fields and a `createCreditNote` mutation. This spec builds on that foundation.
2. **AP has no credit/debit note infrastructure**: The `invoices` table needs new schema fields and mutations — this is greenfield work.
3. **Self-billing is opt-in**: Not all businesses use self-billing. AP credit/debit note LHDN submission (Types 12/13) is only available for businesses that have self-billing enabled.
4. **Refund notes (Type 04, 14)** are included in the LHDN submission mapping but are functionally similar to credit notes for this implementation. A refund note is a credit note where the adjustment results in a cash refund rather than a balance reduction. The distinction is captured in the `einvoiceType` field.
5. **Existing e-invoice pipeline** (digital signature Lambda, LHDN API client, polling infrastructure) will be reused without modification — only the UBL mappers and submission routes need updates.
6. **Credit/debit notes use the same line item structure** as the original invoice (description, quantity, unit price, tax rate, total).
7. **No partial line item credits**: A credit note line item credits a whole quantity at a price, not a partial amount of a single unit. Users can credit fewer units than the original.
8. **Multi-currency**: Credit/debit notes inherit the currency of the original invoice. Cross-currency adjustments are not supported.

---

## Dependencies

- **Existing e-invoice pipeline**: Digital signature Lambda, LHDN API client, polling infrastructure (all operational).
- **Existing AR credit note schema**: `sales_invoices` table fields for `einvoiceType`, `originalInvoiceId`, `creditNoteReason`.
- **Journal entry helpers**: `convex/lib/journal-entry-helpers.ts` for creating balanced double-entry entries.
- **Self-bill mapper**: `src/lib/lhdn/self-bill-mapper.ts` needs extension for Types 12/13.
- **Invoice mapper**: `src/lib/lhdn/invoice-mapper.ts` already supports Types 02/03 but needs BillingReference integration.

---

## Out of Scope

- **Automated credit note generation** from returns/refund workflows (future: chat agent could trigger this).
- **Customer/vendor self-service portal** for requesting credit notes.
- **Credit note approval workflow** (credit notes follow the same permissions as invoice creation — no separate approval chain for v1).
- **Batch credit/debit note creation** (one at a time for v1).
- **Credit note templates** or recurring credit notes.
- **Integration with bank reconciliation** (credit notes affecting bank matching is a separate feature).
