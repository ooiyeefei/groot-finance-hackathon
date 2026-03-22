# Data Model: Credit/Debit Note Support

## Schema Changes

### sales_invoices table (AR) — No schema changes needed

Existing fields already support credit/debit notes:
- `einvoiceType: v.optional(einvoiceTypeValidator)` — "credit_note", "debit_note", "refund_note"
- `originalInvoiceId: v.optional(v.id("sales_invoices"))` — links to parent invoice
- `creditNoteReason: v.optional(v.string())` — reason for adjustment
- Index: `by_originalInvoiceId` — for querying adjustment documents

**Note**: `createDebitNote` mutation is missing — needs to be added (mirrors `createCreditNote`).

### invoices table (AP) — 3 new fields + 1 new index

```
+ einvoiceType: v.optional(einvoiceTypeValidator)        // "credit_note", "debit_note", "refund_note"
+ originalInvoiceId: v.optional(v.id("invoices"))        // Links to parent AP invoice
+ creditNoteReason: v.optional(v.string())               // Reason for adjustment

+ index: by_originalInvoiceId ["originalInvoiceId"]       // For querying adjustment documents
```

All fields optional — backward-compatible with existing AP invoices.

## Entity Relationships

```
sales_invoices (AR)
├── 1:N → sales_invoices (via originalInvoiceId)    # Credit/debit notes
├── 1:1 → journal_entries (via journalEntryId)      # GL entry
└── 1:1 → customers (via customerId)                # Customer

invoices (AP)
├── 1:N → invoices (via originalInvoiceId)          # Credit/debit notes [NEW]
├── 1:1 → journal_entries (via journalEntryId)      # GL entry
└── N:1 → businesses (via businessId)               # Business owner
```

## State Transitions

### Credit/Debit Note Lifecycle

```
[Created] → draft
    ↓ (user submits to LHDN)
[LHDN Submitted] → lhdnStatus: "submitted"
    ↓ (polling validates)
[LHDN Validated] → lhdnStatus: "validated"
    or
[LHDN Rejected] → lhdnStatus: "rejected" → user fixes → resubmit

[Void] → status: "void" + reversal journal entry
```

### Original Invoice Balance Updates

```
Original Invoice (totalAmount: $1000)
  ├── Credit Note 1 ($200) → netOutstanding: $800
  ├── Credit Note 2 ($300) → netOutstanding: $500
  └── Debit Note 1 ($100) → netOutstanding: $600

Formula: netOutstanding = originalAmount - Σ(creditNotes) + Σ(debitNotes)
Max credit allowed: originalAmount - Σ(existingCredits)
```

## Validation Rules

| Rule | AR | AP |
|------|----|----|
| Parent invoice must be sent/paid/partially_paid/overdue | ✓ (sent, paid, partially_paid, overdue) | ✓ (completed, paid, partially_paid) |
| Credit total ≤ original invoice total | ✓ | ✓ |
| Same currency as original | ✓ | ✓ |
| Must have at least 1 line item | ✓ | ✓ |
| Line item amount > 0 | ✓ | ✓ |
| LHDN submission requires original UUID | ✓ | ✓ |

## Journal Entry Templates

### AR Credit Note
```
Dr. Sales Revenue (4100)     $amount
  Cr. Accounts Receivable (1200)  $amount
Description: "Credit note CN-{number} against invoice {originalNumber}"
```

### AR Debit Note
```
Dr. Accounts Receivable (1200)  $amount
  Cr. Sales Revenue (4100)      $amount
Description: "Debit note DN-{number} against invoice {originalNumber}"
```

### AP Credit Note
```
Dr. Accounts Payable (2100)     $amount
  Cr. Expense Account ({code})   $amount
Description: "Credit note against AP invoice {originalNumber}"
```

### AP Debit Note
```
Dr. Expense Account ({code})    $amount
  Cr. Accounts Payable (2100)   $amount
Description: "Debit note against AP invoice {originalNumber}"
```
