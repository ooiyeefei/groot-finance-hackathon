# Data Model: Smart AP Vendor Management

**Feature**: 013-ap-vendor-management
**Date**: 2026-02-14

---

## Entity Changes

### 1. Vendor (MODIFIED — `vendors` table)

**New fields** added to existing `vendors` table in `convex/schema.ts`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paymentTerms` | `paymentTermsValidator` (enum) | Optional | Default payment terms: due_on_receipt, net_15, net_30, net_60, custom |
| `customPaymentDays` | `number` | Optional | Days for custom terms (only when paymentTerms = "custom") |
| `defaultCurrency` | `string` | Optional | Vendor's primary currency code (e.g., "MYR", "SGD") |
| `contactPerson` | `string` | Optional | Primary contact name at vendor |
| `website` | `string` | Optional | Vendor website URL |
| `notes` | `string` | Optional | Freeform notes about the vendor |
| `bankDetails` | `object` | Optional | Nested bank information (see below) |

**bankDetails object schema**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bankName` | `string` | Optional | Name of the bank |
| `accountNumber` | `string` | Optional | Bank account number (masked in UI: last 4 digits visible) |
| `routingCode` | `string` | Optional | SWIFT code, routing number, or bank code |
| `accountHolderName` | `string` | Optional | Name on the account |

**Existing fields** (unchanged): legacyId, businessId, name, email, phone, address, taxId, supplierCode, category, status, updatedAt

**Validation rules**:
- `customPaymentDays` must be > 0 when `paymentTerms` = "custom"
- `customPaymentDays` should be null/undefined when `paymentTerms` != "custom"
- `defaultCurrency` must be a valid ISO 4217 currency code from the business's allowedCurrencies

**Indexes** (no new indexes needed — existing indexes sufficient for vendor lookups)

---

### 2. Accounting Entry — Payable (MODIFIED — `accounting_entries` table)

**New fields** added to existing `accounting_entries` table:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paidAmount` | `number` | Optional | Running total of all payments made against this entry. Defaults to 0 for unpaid entries. |
| `paymentHistory` | `array<PaymentRecord>` | Optional | Ordered list of payment records (earliest first) |

**PaymentRecord object schema** (embedded array element):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | `number` | Required | Payment amount in original currency |
| `paymentDate` | `string` | Required | ISO date of payment (YYYY-MM-DD) |
| `paymentMethod` | `string` | Required | bank_transfer, cash, cheque, card, other |
| `notes` | `string` | Optional | Optional payment reference or note |
| `recordedAt` | `number` | Required | Unix timestamp when this payment was recorded |

**Existing fields used for AP** (unchanged but now actively leveraged):
- `vendorId` — links to vendors table
- `transactionType` — "Expense" | "Cost of Goods Sold" for AP entries
- `status` — pending | paid | overdue | cancelled | disputed
- `dueDate` — calculated from vendor payment terms
- `paymentDate` — date of most recent/final payment (backward compatible)
- `paymentMethod` — method of most recent/final payment (backward compatible)
- `originalAmount`, `originalCurrency` — invoice amount
- `homeCurrencyAmount`, `exchangeRate` — converted amount
- `lineItems` — embedded line items from OCR

**State transitions**:

```
           ┌──────────────┐
           │   pending     │ ← Created from invoice
           └──────┬───────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
        ▼         ▼         ▼
   ┌─────────┐ ┌────────┐ ┌──────────┐
   │ overdue  │ │  paid  │ │cancelled │
   │(auto-set)│ │        │ │          │
   └────┬─────┘ └────────┘ └──────────┘
        │              ▲
        │              │
        └──────────────┘
              (payment recorded for full amount)

   * partial payment: status stays pending/overdue, paidAmount increases
   * full payment: status → paid (when paidAmount >= originalAmount)
   * disputed: can be set from pending or overdue (manual action)
```

**Indexes** (potential new indexes for AP queries):

| Index Name | Fields | Purpose |
|-----------|--------|---------|
| `by_businessId_dueDate` | `[businessId, dueDate]` | Upcoming payments query — find pending entries by due date range |
| `by_businessId_vendorId_status` | `[businessId, vendorId, status]` | Vendor-level aging — group by vendor with status filter |

**Note**: Index additions depend on query patterns. The `by_businessId_dueDate` index is critical for the upcoming payments view. The vendor+status index enables efficient vendor drill-down. Evaluate against Convex's index limits before adding.

---

### 3. Vendor Price History (UNCHANGED — `vendor_price_history` table)

No schema changes. New queries only.

**Existing fields used for price intelligence**:
- `vendorId` + `normalizedDescription` — match items across invoices
- `unitPrice` + `currency` — price comparison
- `observedAt` — recency for trend analysis
- `isConfirmed` — only compare against confirmed prices

**Query patterns added**:
- Price change detection: Compare latest price vs. most recent confirmed price for same vendor + item
- Cross-vendor comparison: Find all vendors with confirmed prices for the same normalized item description

---

### 4. Action Center Insight (UNCHANGED — `action_center_insights` table)

No schema changes. New insight creation patterns.

**New insight categories used**:
- `category: "optimization"` — price increase alerts, cross-vendor savings opportunities
- `category: "deadline"` — newly overdue payables summary
- `category: "cashflow"` — upcoming payment reminders (via existing proactive analysis)

---

## Relationships

```
┌──────────────┐         ┌─────────────────────┐
│   vendors    │◄────────│  accounting_entries  │
│              │ vendorId │  (AP = Expense/COGS) │
│ + paymentTerms         │  + paidAmount        │
│ + bankDetails          │  + paymentHistory    │
│ + customPaymentDays    │                     │
└──────┬───────┘         └──────────┬──────────┘
       │                            │
       │ vendorId                   │ accountingEntryId
       ▼                            ▼
┌──────────────────┐    ┌─────────────────────┐
│vendor_price_history│   │action_center_insights│
│ (price tracking)  │    │ (alerts/insights)    │
└──────────────────┘    └─────────────────────┘
```

**Key relationships**:
- Vendor → Accounting Entries: One-to-many (one vendor, many payables). Some entries may have no vendorId ("Unassigned Vendor").
- Vendor → Price History: One-to-many (one vendor, many price observations per item over time).
- Accounting Entry → Price History: One-to-many via `accountingEntryId` (confirmed observations linked to their source entry).
- Accounting Entry → Action Center: Indirectly linked via `affectedEntities` field in insights.

## Due Date Calculation Logic

```
function calculateDueDate(entry, vendor):
  1. If entry has explicit dueDate from invoice OCR → use it
  2. Else if vendor has paymentTerms:
     - due_on_receipt → transactionDate
     - net_15 → transactionDate + 15 days
     - net_30 → transactionDate + 30 days
     - net_60 → transactionDate + 60 days
     - custom → transactionDate + vendor.customPaymentDays
  3. Else → transactionDate + 30 days (system default)
```

## Aging Bucket Classification

```
function classifyAgingBucket(entry):
  daysOverdue = today - entry.dueDate  (in days)

  if daysOverdue <= 0:    return "current"     (not yet due)
  if daysOverdue <= 30:   return "1_30"        (1-30 days overdue)
  if daysOverdue <= 60:   return "31_60"       (31-60 days overdue)
  if daysOverdue <= 90:   return "61_90"       (61-90 days overdue)
  else:                   return "90_plus"     (90+ days overdue)

  Note: Uses dueDate (which respects vendor payment terms),
        NOT transactionDate + 30 days blanket.
```

## Outstanding Balance Calculation

```
function outstandingBalance(entry):
  return entry.originalAmount - (entry.paidAmount ?? 0)

  Note: paidAmount tracks cumulative partial payments.
  An entry is fully paid when outstandingBalance <= 0.
```
