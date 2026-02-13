# Data Model Changes: Stripe-Style Invoice Creation UX

**Branch**: `012-stripe-invoice-ux` | **Date**: 2026-02-13

## Schema Changes

All changes are **additive** (optional fields only) to maintain backward compatibility with existing invoices.

### 1. LineItem — New Fields

| Field | Type | Default | Purpose |
| ----- | ---- | ------- | ------- |
| `supplyDateStart` | `optional string` (ISO date) | — | Service period start date |
| `supplyDateEnd` | `optional string` (ISO date) | — | Service period end date |
| `isDiscountable` | `optional boolean` | `true` | Whether invoice-level discounts apply to this item |

**Validation Rules**:
- If `supplyDateStart` is set, `supplyDateEnd` must also be set (and vice versa)
- `supplyDateEnd` must be >= `supplyDateStart`
- `isDiscountable` defaults to `true` if not specified

**Affected Files**:
- `convex/schema.ts` — Add fields to lineItem validator in `sales_invoices` table
- `src/domains/sales-invoices/types/index.ts` — Add to `LineItem` interface and `lineItemSchema`
- `src/domains/sales-invoices/lib/invoice-calculations.ts` — Respect `isDiscountable` in invoice-level discount calculations

### 2. sales_invoices — New Fields

| Field | Type | Default | Purpose |
| ----- | ---- | ------- | ------- |
| `footer` | `optional string` | — | Invoice footer text |
| `customFields` | `optional array` of `{key: string, value: string}` | `[]` | User-defined key-value metadata |
| `showTaxId` | `optional boolean` | `false` | Toggle display of business tax ID on invoice |

**Notes**:
- Existing `notes` field serves as "Memo" (UI label change only, no schema change)
- Existing `paymentInstructions` field unchanged
- `customFields` limited to 10 entries max (validated in mutation)

**Affected Files**:
- `convex/schema.ts` — Add fields to `sales_invoices` table definition
- `convex/functions/salesInvoices.ts` — Add to `create` and `update` mutation validators
- `src/domains/sales-invoices/types/index.ts` — Add to `SalesInvoice` interface

### 3. businesses.invoiceSettings — New Field

| Field | Type | Default | Purpose |
| ----- | ---- | ------- | ------- |
| `acceptedPaymentMethods` | `optional array` of `string` | `["bank_transfer", "cash", "card"]` | Payment methods displayed on invoices |

**Valid Values**: `"bank_transfer"`, `"cash"`, `"card"`, `"cheque"`, `"other"`

**Affected Files**:
- `convex/schema.ts` — Add to `invoiceSettings` object in `businesses` table
- `src/domains/sales-invoices/components/invoice-settings-form.tsx` — Add payment method configuration UI

## Entity Relationship Summary

```
businesses
  └── invoiceSettings
        └── acceptedPaymentMethods[] ──(read-only display)──→ Invoice form Payment Collection section

sales_invoices
  ├── lineItems[]
  │     ├── supplyDateStart/End    (NEW: service period)
  │     └── isDiscountable         (NEW: discount eligibility)
  ├── footer                       (NEW: footer text)
  ├── customFields[]               (NEW: key-value pairs)
  ├── showTaxId                    (NEW: tax ID toggle)
  ├── notes                        (EXISTING: serves as "Memo")
  └── paymentInstructions          (EXISTING: unchanged)
```

## State Transitions

No changes to existing invoice status lifecycle:
```
draft → sent → partially_paid → paid
                              → overdue
              → overdue
draft → void
sent → void
```

Auto-save creates invoices in `draft` status. The new "Review invoice" flow leads to `send()` which transitions to `sent`.

## Migration Notes

- All new fields are optional — no data migration needed
- Existing invoices render correctly without new fields (defaults apply)
- New fields only populated when user enables them in the "Additional Options" section or "Item Options" section
