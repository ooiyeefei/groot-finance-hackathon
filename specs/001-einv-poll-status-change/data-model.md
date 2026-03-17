# Data Model: E-Invoice Status Polling

**Date**: 2026-03-16 | **Branch**: `001-einv-poll-status-change`

## Entities

### Sales Invoice (existing — no schema changes needed)

All required fields already exist on `sales_invoices` table:

| Field | Type | Purpose |
|-------|------|---------|
| `lhdnStatus` | `"pending" \| "submitted" \| "valid" \| "invalid" \| "cancelled" \| "rejected" \| "cancelled_by_buyer"` | Current LHDN status |
| `lhdnValidatedAt` | `number?` (Unix ms) | Start of 72h polling window |
| `lhdnRejectedAt` | `number?` (Unix ms) | When buyer rejected |
| `lhdnStatusReason` | `string?` | Rejection/cancellation reason |
| `lhdnReviewRequired` | `boolean?` | Flag if journal entry needs reversal review |
| `lhdnSubmissionId` | `string?` | Submission UID for API queries |
| `lhdnDocumentUuid` | `string?` | Document UUID from LHDN |
| `lhdnLongId` | `string?` | For QR code verification |
| `journalEntryId` | `Id<"journal_entries">?` | Link to GL entry (triggers review flag) |

**Index**: `by_businessId_lhdnStatus` — used by polling query

### Notification (existing — no schema changes needed)

| Field | Value for this feature |
|-------|----------------------|
| `type` | `"lhdn_submission"` |
| `severity` | `"warning"` |
| `resourceType` | `"sales_invoice"` |
| `resourceId` | Invoice ID |

### Business Settings (existing — no schema changes needed)

| Field | Type | Purpose |
|-------|------|---------|
| `einvoiceAutoDelivery` | `boolean?` | Auto-send PDF after validation |
| `einvoiceBuyerNotifications` | `boolean?` | Enable buyer email notifications |
| `lhdnClientId` | `string?` | LHDN API credential |
| `lhdnTin` | `string?` | Business TIN |

## State Transitions

```
pending → submitted → valid → rejected (buyer rejection detected)
                           → cancelled_by_buyer (external cancellation detected)
                           → cancelled (issuer-initiated)
```

Only `valid` invoices within 72h of `lhdnValidatedAt` are polled. Once status changes to rejected/cancelled/cancelled_by_buyer, no further polling occurs.

## No New Tables or Schema Changes

All required fields, indexes, and status values were added in the `022-einvoice-lhdn-buyer-flows` implementation. This feature only needs code changes (email wiring + UI implementation).
