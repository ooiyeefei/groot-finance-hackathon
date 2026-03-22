# API Contracts: AR Credit/Debit Notes

## Convex Mutations

### salesInvoices.createDebitNote (NEW)
```
Input:
  originalInvoiceId: Id<"sales_invoices">
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

Output: Id<"sales_invoices">

Side effects:
  - Creates journal entry: Dr. AR 1200, Cr. Revenue 4100
  - Inserts sales_invoices record with einvoiceType: "debit_note"
  - Number format: DN-{originalInvoiceNumber}-{seq}

Validation:
  - Original invoice status ∈ {sent, paid, partially_paid, overdue}
  - All line item amounts > 0
  - Original invoice exists and belongs to businessId
```

## Convex Queries

### salesInvoices.getAdjustmentsForInvoice (UPDATE existing getCreditNotesForInvoice)
```
Input: invoiceId: Id<"sales_invoices">
Output: Array<{
  _id: Id<"sales_invoices">
  invoiceNumber: string
  einvoiceType: "credit_note" | "debit_note" | "refund_note"
  totalAmount: number
  status: string
  lhdnStatus?: string
  creditNoteReason?: string
  _creationTime: number
}>

Change: Returns both credit notes AND debit notes (filter by originalInvoiceId)
```

### salesInvoices.getNetOutstandingAmount (UPDATE)
```
Input: invoiceId: Id<"sales_invoices">
Output: {
  originalAmount: number
  totalCredited: number
  totalDebited: number
  netOutstanding: number  // originalAmount - totalCredited + totalDebited
}

Change: Add totalDebited field, include debit notes in calculation
```

## LHDN Submission

### AR Credit Note → Type 02
```
UBL InvoiceTypeCode: "02"
BillingReference.AdditionalDocumentReference.ID: original invoice lhdnDocumentUuid
```

### AR Debit Note → Type 03
```
UBL InvoiceTypeCode: "03"
BillingReference.AdditionalDocumentReference.ID: original invoice lhdnDocumentUuid
```

### Submission guard
```
IF original invoice lhdnDocumentUuid is null:
  REJECT with "Original invoice must be validated by LHDN before submitting adjustment"
```
