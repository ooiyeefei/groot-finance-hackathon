# Data Model: LHDN E-Invoice Buyer Flows

## Schema Changes

### Extended: `sales_invoices` table

New/modified fields for issued invoice status tracking:

| Field | Type | Description |
|-------|------|-------------|
| `lhdnStatus` | union | **Extended**: Add `"rejected"` and `"cancelled_by_buyer"` to existing `"pending" \| "submitted" \| "valid" \| "invalid" \| "cancelled"` |
| `lhdnRejectedAt` | optional number | Timestamp when buyer rejected (from LHDN `rejectRequestDateTime`) |
| `lhdnStatusReason` | optional string | Reason for rejection or external cancellation (from LHDN `documentStatusReason`) |
| `lhdnReviewRequired` | optional boolean | True when rejected/cancelled_by_buyer and has posted journal entry — flags for user review |
| `lhdnPdfDeliveredAt` | optional number | Timestamp when validated PDF was emailed to buyer |
| `lhdnPdfDeliveredTo` | optional string | Buyer email address the PDF was delivered to |

**State transitions** (issued invoices):
```
pending → submitted → valid → rejected (by buyer, within 72h)
                           → cancelled_by_buyer (external, within 72h)
                           → cancelled (by issuer, within 72h)
                    → invalid (LHDN validation failed)
```

### Extended: `einvoice_received_documents` table

New/modified fields for buyer rejection:

| Field | Type | Description |
|-------|------|-------------|
| `status` | union | **Extended**: Add `"rejected"` to existing `"valid" \| "cancelled"` |
| `rejectedAt` | optional number | Timestamp when user rejected via Groot |
| `rejectionReason` | optional string | Reason provided by user |
| `rejectedByUserId` | optional string | Clerk user ID who initiated rejection |

**State transitions** (received documents):
```
valid → rejected (by our user, within 72h)
      → cancelled (by supplier, within 72h)
```

### Extended: `expense_claims` table

New field for e-invoice rejection warning:

| Field | Type | Description |
|-------|------|-------------|
| `einvoiceRejectionWarning` | optional boolean | True when linked e-invoice was rejected — requires finance admin review before reimbursement |

### Extended: `businesses` table

New fields for auto-delivery settings:

| Field | Type | Description |
|-------|------|-------------|
| `einvoiceAutoDelivery` | optional boolean | Whether to auto-email validated e-invoices to buyers. Default: true (ON) |
| `einvoiceBuyerNotifications` | optional boolean | Whether to send lifecycle notification emails to buyers. Default: true (ON) |

## Entity Relationships

```
sales_invoices (issued)
  ├── lhdnStatus: tracked by polling Lambda within 72h window
  ├── lhdnLongId → generates QR code URL for PDF
  ├── customerSnapshot.email → buyer email for auto-delivery
  └── journal_entry_lines → may need review if rejected (FR-006a)

einvoice_received_documents (received)
  ├── matchedExpenseClaimId → linked expense claim
  ├── status: updated on rejection
  └── lhdnDocumentUuid → used for LHDN rejection API call

expense_claims
  └── einvoiceRejectionWarning: set when linked received doc is rejected

businesses
  ├── einvoiceAutoDelivery: controls PDF auto-delivery
  └── einvoiceBuyerNotifications: controls lifecycle emails
```

## Index Requirements

No new indexes needed — existing indexes on `sales_invoices.by_business` and `einvoice_received_documents.by_business` are sufficient for the queries in this feature. The 72-hour window filter is applied in-memory after the indexed query.
