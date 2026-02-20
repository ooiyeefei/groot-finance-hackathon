# Data Model: Peppol InvoiceNow Transmission UI

**Date**: 2026-02-20
**Branch**: `001-peppol-submission-ui`

## Entities (All Pre-existing from #203)

This feature creates no new tables or fields. All data model work was completed in PR #203 (issue #198). This document maps the existing schema fields to their UI consumption points.

### Sales Invoice — Peppol Fields

| Field | Type | Source | UI Usage |
|-------|------|--------|----------|
| `peppolDocumentId` | `string?` | Set by backend after AP call | Display in timeline/detail (informational) |
| `peppolStatus` | `"pending" \| "transmitted" \| "delivered" \| "failed"?` | Set by mutation + webhook | Badge rendering, action gating, timeline state |
| `peppolTransmittedAt` | `number?` | Set by backend webhook | Timeline timestamp for "Transmitted" step |
| `peppolDeliveredAt` | `number?` | Set by backend webhook | Timeline timestamp for "Delivered" step, delivery confirmation panel |
| `peppolErrors` | `Array<{code: string, message: string}>?` | Set by backend webhook | Error panel display when status = "failed" |

**State Machine**:
```
(undefined) → pending → transmitted → delivered
                    └──→ failed ←── (retry resets to pending)
```

**Transition Triggers**:
- `undefined → pending`: User clicks "Send via InvoiceNow" + confirms
- `pending → transmitted`: Backend confirms AP accepted the document
- `transmitted → delivered`: Backend receives delivery receipt from receiver's AP
- `pending/transmitted → failed`: Backend receives error from AP
- `failed → pending`: User clicks "Retry transmission" + confirms

### Business — Peppol Fields

| Field | Type | UI Usage |
|-------|------|----------|
| `peppolParticipantId` | `string?` | Gates "Send via InvoiceNow" button (sender must have ID) |

### Customer — Peppol Fields

| Field | Type | UI Usage |
|-------|------|----------|
| `peppolParticipantId` | `string?` | Gates "Send via InvoiceNow" button (receiver must have ID); shown in confirmation dialog |

### Validators (Pre-existing)

| Validator | Location | Values |
|-----------|----------|--------|
| `peppolStatusValidator` | `convex/lib/validators.ts` | `"pending" \| "transmitted" \| "delivered" \| "failed"` |
| `PEPPOL_STATUSES` | `src/lib/constants/statuses.ts` | `{ PENDING, TRANSMITTED, DELIVERED, FAILED }` |

### Indexes (Pre-existing)

| Index | Table | Fields | Usage |
|-------|-------|--------|-------|
| `by_businessId_peppolStatus` | `sales_invoices` | `[businessId, peppolStatus]` | Future: filter invoices by Peppol status |

## Data Access Patterns

### Read Patterns (Queries)

1. **Invoice List** — `api.functions.salesInvoices.list`
   - Already returns full invoice documents including Peppol fields
   - No query changes needed; Peppol fields are automatically included when populated

2. **Invoice Detail** — `api.functions.salesInvoices.getById`
   - Already returns full invoice document
   - No query changes needed

3. **Customer Lookup** — Need to fetch customer by `invoice.customerId` to check `peppolParticipantId`
   - Existing query: `api.functions.customers.getById` or equivalent
   - Used on detail page to gate "Send via InvoiceNow" button

4. **Business Context** — `useActiveBusiness()` hook
   - Already returns business record with `peppolParticipantId`
   - No changes needed

### Write Patterns (Mutations)

1. **Initiate Peppol Transmission** — NEW mutation needed
   - Input: `{ id: Id<"sales_invoices">, businessId: Id<"businesses"> }`
   - Validates: auth, invoice status, sender + receiver Peppol IDs exist
   - Sets: `peppolStatus = "pending"`, `updatedAt = Date.now()`
   - Returns: invoice ID

2. **Retry Peppol Transmission** — Same mutation, but also clears `peppolErrors`
   - Input: Same as above
   - Additional validation: current `peppolStatus` must be "failed"
   - Sets: `peppolStatus = "pending"`, clears `peppolErrors`, `updatedAt = Date.now()`
   - Returns: invoice ID

## No Schema Changes Required

All Peppol-related fields, validators, constants, and indexes were deployed in PR #203. This feature only reads existing fields and writes via new mutations.
