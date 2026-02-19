# Schema Contract: e-Invoice Fields

**Branch**: `016-e-invoice-schema-change` | **Date**: 2026-02-19

## Overview

This feature is schema-only — no new API endpoints. The "contracts" are the TypeScript type definitions and Convex validators that form the interface between frontend and backend.

## New Status Constants (src/lib/constants/statuses.ts)

### LHDN_STATUSES

```typescript
export const LHDN_STATUSES = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  VALID: "valid",
  INVALID: "invalid",
  CANCELLED: "cancelled",
} as const;

export type LhdnStatus = typeof LHDN_STATUSES[keyof typeof LHDN_STATUSES];
export const LHDN_STATUS_VALUES = Object.values(LHDN_STATUSES);
```

### PEPPOL_STATUSES

```typescript
export const PEPPOL_STATUSES = {
  PENDING: "pending",
  TRANSMITTED: "transmitted",
  DELIVERED: "delivered",
  FAILED: "failed",
} as const;

export type PeppolStatus = typeof PEPPOL_STATUSES[keyof typeof PEPPOL_STATUSES];
export const PEPPOL_STATUS_VALUES = Object.values(PEPPOL_STATUSES);
```

### EINVOICE_TYPES

```typescript
export const EINVOICE_TYPES = {
  INVOICE: "invoice",
  CREDIT_NOTE: "credit_note",
  DEBIT_NOTE: "debit_note",
  REFUND_NOTE: "refund_note",
} as const;

export type EinvoiceType = typeof EINVOICE_TYPES[keyof typeof EINVOICE_TYPES];
export const EINVOICE_TYPE_VALUES = Object.values(EINVOICE_TYPES);
```

## New Convex Validators (convex/lib/validators.ts)

```typescript
export const lhdnStatusValidator = literalUnion(LHDN_STATUS_VALUES);
export const peppolStatusValidator = literalUnion(PEPPOL_STATUS_VALUES);
export const einvoiceTypeValidator = literalUnion(EINVOICE_TYPE_VALUES);
```

## Extended TypeScript Interface (src/domains/sales-invoices/types/index.ts)

### CustomerSnapshot (extended)

```typescript
export interface CustomerSnapshot {
  // Existing fields (unchanged)
  businessName: string;
  contactPerson?: string;
  email: string;
  phone?: string;
  address?: string;
  taxId?: string;

  // New e-invoice fields
  tin?: string;
  brn?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  city?: string;
  stateCode?: string;
  postalCode?: string;
  countryCode?: string;
}
```

## Convex Mutation Arg Changes

### salesInvoices.create — customerSnapshot arg extension

The `customerSnapshot` argument in the create mutation must accept the new optional fields. The Convex schema `v.object()` for customerSnapshot must match.

### salesInvoices.update — customerSnapshot arg extension

Same extension as create.

### salesInvoices.send — auto-customer creation extension

When `send` creates a customer from snapshot data (lines 522-549), the new fields must be mapped:

```
customerSnapshot.tin         → customers.tin
customerSnapshot.brn         → customers.brn
customerSnapshot.addressLine1 → customers.addressLine1
customerSnapshot.addressLine2 → customers.addressLine2
customerSnapshot.addressLine3 → customers.addressLine3
customerSnapshot.city        → customers.city
customerSnapshot.stateCode   → customers.stateCode
customerSnapshot.postalCode  → customers.postalCode
customerSnapshot.countryCode → customers.countryCode
```
