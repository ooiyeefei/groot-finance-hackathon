# Convex Mutation Contracts: Peppol Transmission

**Date**: 2026-02-20

## Mutation: `initiatePeppolTransmission`

**Location**: `convex/functions/salesInvoices.ts`

### Signature

```typescript
export const initiatePeppolTransmission = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => { ... }
})
```

### Preconditions (Validated Server-Side)

1. User is authenticated and has `owner`, `finance_admin`, or `manager` role for the business
2. Invoice exists, belongs to business, is not soft-deleted
3. Invoice `status` is NOT `draft` and NOT `void`
4. Invoice `peppolStatus` is `undefined` (not yet in Peppol lifecycle)
5. Business has `peppolParticipantId` set (sender registered)
6. Customer (via `invoice.customerId`) has `peppolParticipantId` set (receiver registered)

### Effects

- Sets `peppolStatus` to `"pending"`
- Sets `updatedAt` to `Date.now()`

### Returns

- `Id<"sales_invoices">` on success
- Throws `Error` with descriptive message on validation failure

### Error Messages

| Condition | Error Message |
|-----------|---------------|
| Invoice not found | `"Invoice not found"` |
| Wrong status | `"Invoice must be sent before transmitting via Peppol"` |
| Already in Peppol | `"Invoice already has a Peppol transmission in progress or completed"` |
| No sender Peppol ID | `"Business does not have a Peppol participant ID configured"` |
| No receiver Peppol ID | `"Customer does not have a Peppol participant ID configured"` |

---

## Mutation: `retryPeppolTransmission`

**Location**: `convex/functions/salesInvoices.ts`

### Signature

```typescript
export const retryPeppolTransmission = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => { ... }
})
```

### Preconditions

1. User is authenticated with appropriate role (same as above)
2. Invoice exists, belongs to business, is not soft-deleted
3. Invoice `peppolStatus` is `"failed"` (can only retry failed transmissions)

### Effects

- Sets `peppolStatus` to `"pending"`
- Clears `peppolErrors` (sets to `undefined`)
- Sets `updatedAt` to `Date.now()`

### Returns

- `Id<"sales_invoices">` on success
- Throws `Error` with descriptive message on validation failure

### Error Messages

| Condition | Error Message |
|-----------|---------------|
| Invoice not found | `"Invoice not found"` |
| Not failed | `"Can only retry transmission for invoices with failed Peppol status"` |

---

## No Query Changes Required

Existing queries (`list`, `getById`) already return full invoice documents. Peppol fields are automatically included when populated — Convex returns all document fields by default.
