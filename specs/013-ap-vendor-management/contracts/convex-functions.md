# API Contracts: Convex Functions

**Feature**: 013-ap-vendor-management
**Date**: 2026-02-14

This project uses Convex (not REST APIs). All data access is via Convex queries and mutations.

---

## Modified Functions

### vendors.ts — Mutations

#### `vendors.update` (MODIFIED)

Extend existing update mutation to accept new vendor profile fields.

```typescript
// Additional args (all optional)
{
  paymentTerms?: "due_on_receipt" | "net_15" | "net_30" | "net_60" | "custom"
  customPaymentDays?: number        // required when paymentTerms = "custom"
  defaultCurrency?: string          // ISO 4217 currency code
  contactPerson?: string
  website?: string
  notes?: string
  bankDetails?: {
    bankName?: string
    accountNumber?: string
    routingCode?: string
    accountHolderName?: string
  }
}
```

**Validation**: If `paymentTerms` = "custom", `customPaymentDays` must be provided and > 0.

---

### accountingEntries — Mutations

#### `accountingEntries.recordPayment` (NEW mutation)

Records a full or partial payment against a pending/overdue accounting entry.

```typescript
Args: {
  entryId: Id<"accounting_entries">
  amount: number                    // Payment amount in original currency
  paymentDate: string               // ISO date (YYYY-MM-DD), defaults to today
  paymentMethod: string             // bank_transfer | cash | cheque | card | other
  notes?: string                    // Optional payment reference
}

Returns: {
  success: boolean
  newStatus: "pending" | "overdue" | "paid"
  outstandingBalance: number
  totalPaid: number
}

Behavior:
  1. Validate entry exists and status is "pending" or "overdue"
  2. Validate amount > 0 and amount <= outstandingBalance
  3. Append PaymentRecord to paymentHistory array
  4. Update paidAmount = paidAmount + amount
  5. Update paymentDate and paymentMethod (latest payment)
  6. If paidAmount >= originalAmount → set status = "paid"
  7. Return new status and balances
```

---

## New Queries

### analytics — Queries

#### `analytics.getAgedPayablesByVendor` (NEW query)

Returns vendor-level aged payables grouped by vendor with aging bucket breakdown.

```typescript
Args: {
  businessId: Id<"businesses">
}

Returns: {
  vendors: Array<{
    vendorId: Id<"vendors"> | null       // null = "Unassigned Vendor"
    vendorName: string                    // "Unassigned Vendor" if vendorId is null
    paymentTerms?: string                 // Vendor's default payment terms
    current: number                       // Home currency amount not yet due
    days1to30: number                     // 1-30 days overdue
    days31to60: number                    // 31-60 days overdue
    days61to90: number                    // 61-90 days overdue
    days90plus: number                    // 90+ days overdue
    totalOutstanding: number              // Sum of all buckets
    entryCount: number                    // Number of unpaid entries
  }>
  totals: {
    current: number
    days1to30: number
    days31to60: number
    days61to90: number
    days90plus: number
    totalOutstanding: number
  }
}

Behavior:
  1. Fetch all accounting_entries where transactionType in ["Expense", "Cost of Goods Sold"]
     AND status in ["pending", "overdue"] AND deletedAt is null
  2. For each entry, calculate outstanding balance (originalAmount - paidAmount)
  3. Calculate aging bucket using entry.dueDate (respecting vendor payment terms)
  4. Group by vendorId (null vendorId → "Unassigned Vendor")
  5. Convert amounts to home currency using stored exchangeRate
  6. Sort vendors by totalOutstanding descending
```

#### `analytics.getVendorPayablesDrilldown` (NEW query)

Returns individual unpaid entries for a specific vendor.

```typescript
Args: {
  businessId: Id<"businesses">
  vendorId: Id<"vendors"> | null       // null for unassigned entries
}

Returns: Array<{
  entryId: Id<"accounting_entries">
  referenceNumber?: string
  originalAmount: number
  originalCurrency: string
  homeCurrencyAmount: number
  paidAmount: number
  outstandingBalance: number
  transactionDate: string
  dueDate: string
  daysOverdue: number                   // negative = days until due
  status: "pending" | "overdue"
  category?: string
  notes?: string
}>

Behavior:
  1. Fetch accounting_entries for the given vendorId and businessId
  2. Filter: transactionType in ["Expense", "COGS"], status in ["pending", "overdue"]
  3. Calculate outstandingBalance and daysOverdue for each
  4. Sort by dueDate ascending (most urgent first)
```

#### `analytics.getUpcomingPayments` (NEW query)

Returns pending payables due within a specified window.

```typescript
Args: {
  businessId: Id<"businesses">
  daysAhead: 7 | 14 | 30
}

Returns: Array<{
  entryId: Id<"accounting_entries">
  vendorId?: Id<"vendors">
  vendorName: string
  originalAmount: number
  originalCurrency: string
  homeCurrencyAmount: number
  outstandingBalance: number
  dueDate: string
  daysRemaining: number                 // negative = days overdue
  status: "pending" | "overdue"
  referenceNumber?: string
}>

Behavior:
  1. Fetch accounting_entries where transactionType in ["Expense", "COGS"]
     AND status in ["pending", "overdue"]
     AND dueDate <= today + daysAhead
  2. Include overdue entries (dueDate < today) at the top
  3. Calculate daysRemaining (negative for overdue)
  4. Sort: overdue first (most overdue at top), then by dueDate ascending
  5. Look up vendor names
```

#### `analytics.getVendorSpendAnalytics` (NEW query)

Returns spend analytics for the selected period.

```typescript
Args: {
  businessId: Id<"businesses">
  periodDays: 30 | 90 | 365
}

Returns: {
  topVendors: Array<{
    vendorId: Id<"vendors"> | null
    vendorName: string
    totalSpend: number                   // Home currency
    transactionCount: number
    percentOfTotal: number               // 0-100
  }>
  categoryBreakdown: Array<{
    category: string
    totalSpend: number                   // Home currency
    percentOfTotal: number
    transactionCount: number
  }>
  monthlyTrend: Array<{
    month: string                        // "YYYY-MM"
    totalSpend: number                   // Home currency
    transactionCount: number
  }>
  totalSpend: number
}

Behavior:
  1. Fetch accounting_entries where transactionType in ["Expense", "COGS"]
     AND status in ["paid", "pending", "overdue"] (exclude cancelled, disputed)
     AND transactionDate >= today - periodDays
  2. Aggregate by vendorId for top vendors (sort by totalSpend desc, limit 10)
  3. Aggregate by category for breakdown
  4. Aggregate by month (YYYY-MM) for last 12 months for trend
  5. All amounts in home currency
```

### vendorPriceHistory — Queries

#### `vendorPriceHistory.detectPriceChanges` (NEW query)

Compares current line item prices against historical vendor prices.

```typescript
Args: {
  vendorId: Id<"vendors">
  lineItems: Array<{
    itemDescription: string
    unitPrice: number
    currency: string
  }>
}

Returns: Array<{
  itemDescription: string
  currentPrice: number
  previousPrice: number
  percentChange: number                  // Positive = increase
  alertLevel: "none" | "info" | "warning" | "alert"
  cheaperVendor?: {
    vendorId: Id<"vendors">
    vendorName: string
    price: number
    savingsPercent: number
  }
  observationCount: number               // How many historical observations
}>

Behavior:
  1. For each line item, normalize description
  2. Look up vendor_price_history for same vendorId + normalizedDescription
  3. Get most recent confirmed price (isConfirmed = true)
  4. Calculate % change
  5. Apply currency-specific thresholds:
     - SGD/MYR/USD/EUR: info >5%, warning >10%, alert >20%
     - IDR/VND/PHP/THB: info >8%, warning >15%, alert >25%
  6. If observationCount < 2, alertLevel = "none"
  7. Cross-vendor: find cheapest confirmed price for same normalized item across all vendors
  8. If another vendor is cheaper, include cheaperVendor details
```

#### `vendorPriceHistory.getCrossVendorComparison` (NEW query)

Returns all vendor prices for a specific item.

```typescript
Args: {
  businessId: Id<"businesses">
  normalizedDescription: string
}

Returns: Array<{
  vendorId: Id<"vendors">
  vendorName: string
  latestPrice: number
  currency: string
  lastObservedAt: string
  isCheapest: boolean
}>

Behavior:
  1. Find all vendor_price_history entries matching normalizedDescription
  2. Group by vendorId, take latest confirmed price per vendor
  3. Mark cheapest vendor
  4. Sort by latestPrice ascending
```

---

## New Internal Functions

### accountingEntries.markOverduePayables (NEW internal mutation)

Called by daily cron job. Mirrors `salesInvoices.markOverdue`.

```typescript
// Internal mutation — not exposed to client
Behavior:
  1. Get today's date as ISO string
  2. Query accounting_entries where:
     - transactionType in ["Expense", "Cost of Goods Sold"]
     - status = "pending"
     - dueDate < today
     - deletedAt is null
  3. For each entry: update status to "overdue"
  4. If any entries were updated, create Action Center insight:
     - category: "deadline"
     - priority: "high"
     - title: "X bills are now overdue"
     - description: summary of newly overdue entries
     - recommendedAction: "Review overdue payables and prioritize payments"
  5. Return count of entries marked overdue
```

### Cron Registration

```typescript
// In convex/crons.ts — add alongside existing salesInvoices.markOverdue
crons.daily(
  "mark-overdue-payables",
  { hourUTC: 0, minuteUTC: 5 },           // 5 minutes after AR overdue job
  internal.functions.accountingEntries.markOverduePayables
);
```

---

## Vendor Context for Invoice Review

### vendors.getVendorContext (NEW query)

Returns vendor context for display during invoice review.

```typescript
Args: {
  vendorId: Id<"vendors">
  businessId: Id<"businesses">
}

Returns: {
  vendor: {
    name: string
    paymentTerms?: string
    customPaymentDays?: number
    defaultCurrency?: string
  }
  outstanding: {
    totalAmount: number                   // Home currency
    entryCount: number
    oldestDueDate?: string
  }
  suggestedDueDate: string               // Calculated from vendor terms + today
}

Behavior:
  1. Fetch vendor by vendorId
  2. Count unpaid accounting_entries for this vendor (status in ["pending", "overdue"])
  3. Sum outstanding amounts in home currency
  4. Calculate suggested due date from vendor's payment terms
```
