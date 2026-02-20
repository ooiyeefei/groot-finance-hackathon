# Data Model: LHDN MyInvois Submission UI

**Branch**: `017-lhdn-submission-ui` | **Date**: 2026-02-20

## Overview

No new tables or schema changes required. All LHDN fields were deployed in PR #203 (016-e-invoice-schema-change). This feature adds TypeScript interface extensions and UI components that read/write existing fields.

## Entity: Sales Invoice (Extended Interface)

The `SalesInvoice` TypeScript interface in `src/domains/sales-invoices/types/index.ts` must be extended to include the LHDN fields already present in the Convex schema.

### New Fields on SalesInvoice Interface

```
LHDN MyInvois Tracking:
  lhdnSubmissionId?     string       LHDN 26-char batch submission UID
  lhdnDocumentUuid?     string       LHDN 26-char individual document UUID
  lhdnLongId?           string       Public verification long ID (for QR code)
  lhdnStatus?           LhdnStatus   pending | submitted | valid | invalid | cancelled
  lhdnSubmittedAt?      number       Unix timestamp (ms) of submission
  lhdnValidatedAt?      number       Unix timestamp (ms) of validation result
  lhdnValidationErrors? array        [{code: string, message: string, target?: string}]
  lhdnDocumentHash?     string       SHA-256 hash for integrity verification

Shared:
  einvoiceType?         EinvoiceType invoice | credit_note | debit_note | refund_note
```

### Types to Import

From `src/lib/constants/statuses.ts` (already deployed):
- `LhdnStatus` — type union: "pending" | "submitted" | "valid" | "invalid" | "cancelled"
- `EinvoiceType` — type union: "invoice" | "credit_note" | "debit_note" | "refund_note"

## Entity: LHDN Validation Error (Display Only)

No schema change. UI reads the embedded array from `lhdnValidationErrors` on the invoice.

```
LhdnValidationError:
  code       string     Error code from LHDN (always present)
  message    string     Human-readable error description (always present)
  target?    string     Target field that caused the error (optional)
```

## Entity: Business (Read Only)

This feature reads but does not write business LHDN fields. The forms to edit these fields are owned by #206.

```
Fields read for pre-flight validation:
  lhdnTin?                     string    Required for LHDN submission
  businessRegistrationNumber?  string    Required for LHDN submission (BRN)
  msicCode?                    string    Required for LHDN submission
```

## State Transitions (UI Perspective)

### LHDN Status Lifecycle (display + trigger)

```
[no status] → pending → submitted → valid → [display only: cancelled]
                                   → invalid → [resubmit] → submitted
```

- `[no status] → pending`: Triggered by "Submit to LHDN" button (this feature)
- `pending → submitted`: Set by backend after LHDN API call (#75)
- `submitted → valid/invalid`: Set by backend after LHDN validation response (#75)
- `valid → cancelled`: Display only in this feature; cancel action deferred to #75
- `invalid → submitted`: Triggered by "Resubmit to LHDN" button (this feature)

### e-Invoice Type (auto-determined, set once)

```
Sales Invoice → "invoice"
Credit Note   → "credit_note"
Debit Note    → "debit_note"
Refund Note   → "refund_note"
```

Set automatically at submission time. No user selection.

## Access Control

| Action | Owner | Finance Admin | Manager | Employee |
|--------|-------|---------------|---------|----------|
| View LHDN status badges | Yes | Yes | Yes | Yes |
| View validation errors | Yes | Yes | Yes | Yes |
| View submission timeline | Yes | Yes | Yes | Yes |
| View QR code | Yes | Yes | Yes | Yes |
| Submit to LHDN | Yes | Yes | No | No |
| Resubmit to LHDN | Yes | Yes | No | No |

Permission gate: `hasPermission('finance_admin')` (maps to owner + finance_admin roles).

## Indexes Used (Existing)

- `by_businessId_lhdnStatus` on `sales_invoices` — for potential future LHDN status filtering on the list page
- No new indexes needed for this feature
