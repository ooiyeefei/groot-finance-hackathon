# Research: Credit/Debit Note Support

## Decision 1: Data Model — Same Table vs Separate Table for Credit/Debit Notes

**Decision**: Store credit/debit notes in the SAME table as their parent documents (AR in `sales_invoices`, AP in `invoices`).

**Rationale**:
- AR credit notes already use this pattern (`sales_invoices` table with `einvoiceType: "credit_note"` and `originalInvoiceId`)
- Credit/debit notes share 95% of the same fields as invoices (line items, amounts, tax, LHDN fields, customer/vendor info)
- Same-table approach enables reuse of existing queries, indexes, and UI components
- LHDN treats credit/debit notes as documents in the same submission pipeline — same status tracking

**Alternatives considered**:
- Separate `credit_debit_notes` table: Rejected — would require duplicating invoice fields and breaking existing AR credit note code
- Polymorphic table with type discriminator: This IS the chosen approach (einvoiceType field)

## Decision 2: BillingReference — LHDN UUID vs Invoice Number

**Decision**: Use LHDN UUID (`lhdnDocumentUuid`) in BillingReference, falling back to invoice number if UUID not yet assigned.

**Rationale**:
- LHDN spec requires BillingReference to reference the original e-invoice
- Current invoice-mapper.ts uses `originalInvoiceNumber` in BillingReference.AdditionalDocumentReference.ID
- LHDN API validates against UUID — using UUID is more reliable
- Some invoices may not have LHDN UUID yet (not submitted) — FR-015 blocks this case

**Alternatives considered**:
- Invoice number only: Works for LHDN but less reliable for cross-reference
- Both UUID and number: Overcomplicated, LHDN only needs one

## Decision 3: AP Schema Extension Pattern

**Decision**: Add 3 new fields + 1 new index to existing `invoices` table:
- `einvoiceType: v.optional(einvoiceTypeValidator)`
- `originalInvoiceId: v.optional(v.id("invoices"))`
- `creditNoteReason: v.optional(v.string())`
- Index: `by_originalInvoiceId` on `["originalInvoiceId"]`

**Rationale**: Mirrors the AR pattern exactly. All fields are optional (backward-compatible). Existing invoices default to `einvoiceType: undefined` which is treated as "invoice".

## Decision 4: Journal Entry Pattern for Credit/Debit Notes

**Decision**: Use specific journal entry patterns per document type:

| Document | Debit Account | Credit Account | Effect |
|----------|--------------|----------------|--------|
| AR Credit Note | Revenue 4100 | AR 1200 | Reduces receivable |
| AR Debit Note | AR 1200 | Revenue 4100 | Increases receivable |
| AP Credit Note | AP 2100 | Expense (original) | Reduces payable |
| AP Debit Note | Expense (original) | AP 2100 | Increases payable |

**Rationale**: IFRS-compliant double-entry bookkeeping. AR credit note reverses the original invoice entry. AP credit note reverses the AP liability.

## Decision 5: Self-Bill Mapper Extension

**Decision**: Extend `mapToSelfBilledInvoice` to accept an `einvoiceType` parameter, mapping to Types 12/13/14 via `mapEinvoiceTypeToDocumentType(einvoiceType, isSelfBilled: true)`.

**Rationale**: The existing function already uses `LHDN_DOCUMENT_TYPES.SELF_BILLED_INVOICE` — parameterizing this is minimal change. The UBL structure for self-billed credit/debit notes is identical to self-billed invoices except for the InvoiceTypeCode and BillingReference.

## Decision 6: UI Location for Credit/Debit Note Creation

**Decision**: "Create Credit Note" / "Create Debit Note" buttons in the invoice detail view (both AR and AP), opening a sheet/modal form.

**Rationale**:
- Follows existing pattern (credit-note-form.tsx is already triggered from invoice detail)
- Users think about adjustments in the context of a specific invoice
- Pre-populating line items from the original invoice requires the invoice to be in context
