# API Contracts: AP Credit/Debit Notes

## Convex Mutations

### invoices.createCreditNote (NEW)
```
Input:
  originalInvoiceId: Id<"invoices">
  businessId: Id<"businesses">
  lineItems: Array<{
    lineOrder: number
    description: string
    quantity: number
    unitPrice: number
    totalAmount: number
    taxRate?: number
    taxAmount?: number
    currency: string
  }>
  creditNoteReason: string
  notes?: string

Output: Id<"invoices">

Side effects:
  - Creates journal entry: Dr. AP 2100, Cr. Expense (original account code)
  - Inserts invoices record with einvoiceType: "credit_note"
  - Updates original invoice payable balance

Validation:
  - Original invoice status ∈ {completed, paid, partially_paid}
  - totalAmount ≤ remaining creditable amount
  - All line item amounts > 0
  - Original invoice exists and belongs to businessId
```

### invoices.createDebitNote (NEW)
```
Input:
  originalInvoiceId: Id<"invoices">
  businessId: Id<"businesses">
  lineItems: Array<{
    lineOrder: number
    description: string
    quantity: number
    unitPrice: number
    totalAmount: number
    taxRate?: number
    taxAmount?: number
    currency: string
  }>
  debitNoteReason: string
  notes?: string

Output: Id<"invoices">

Side effects:
  - Creates journal entry: Dr. Expense (original account code), Cr. AP 2100
  - Inserts invoices record with einvoiceType: "debit_note"
  - Updates original invoice payable balance
```

## Convex Queries

### invoices.getAdjustmentsForInvoice (NEW)
```
Input: invoiceId: Id<"invoices">
Output: Array<{
  _id: Id<"invoices">
  einvoiceType: "credit_note" | "debit_note" | "refund_note"
  totalAmount: number
  status: string
  lhdnStatus?: string
  creditNoteReason?: string
  _creationTime: number
}>
```

### invoices.getNetPayableAmount (NEW)
```
Input: invoiceId: Id<"invoices">
Output: {
  originalAmount: number
  totalCredited: number
  totalDebited: number
  netPayable: number  // originalAmount - totalCredited + totalDebited
}
```

## LHDN Self-Bill Submission

### AP Credit Note → Type 12
```
UBL InvoiceTypeCode: "12" (Self-Billed Credit Note)
BillingReference.AdditionalDocumentReference.ID: original self-bill lhdnDocumentUuid
Buyer: FinanSEAL business (issuer of self-bill)
Seller: Vendor
```

### AP Debit Note → Type 13
```
UBL InvoiceTypeCode: "13" (Self-Billed Debit Note)
BillingReference.AdditionalDocumentReference.ID: original self-bill lhdnDocumentUuid
```

### Submission guard
```
IF business does not have self-billing enabled:
  SKIP LHDN submission (AP credit/debit note is internal only)
IF original invoice lhdnDocumentUuid is null:
  REJECT with "Original self-billed invoice must be validated before submitting adjustment"
```
