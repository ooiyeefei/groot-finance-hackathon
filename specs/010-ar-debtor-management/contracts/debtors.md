# Contracts: Debtor Queries

**File**: `convex/functions/payments.ts` (shared with payment mutations)

## Queries

### getDebtorList

Get all customers with outstanding invoices, with aging summary per debtor.

**Args**:
```typescript
{
  businessId: Id<"businesses">
  filter?: {
    overdueOnly?: boolean           // Only show debtors with overdue invoices
    minOutstanding?: number          // Minimum outstanding amount
    currency?: string               // Filter by invoice currency
  }
  sort?: {
    field: "outstanding" | "daysOverdue" | "customerName"
    direction: "asc" | "desc"
  }
}
```

**Returns**:
```typescript
{
  debtors: Array<{
    customerId: Id<"customers">
    customerName: string
    openInvoiceCount: number          // Invoices with balanceDue > 0
    totalOutstanding: number          // Sum of balanceDue across open invoices
    currency: string                  // Currency of the outstanding amounts
    oldestOverdueDays: number         // Days since oldest overdue invoice's due date (0 if none overdue)
    aging: {
      current: number                 // Not yet due
      days1to30: number               // 1-30 days past due
      days31to60: number              // 31-60 days past due
      days61to90: number              // 61-90 days past due
      days90plus: number              // 90+ days past due
    }
  }>
  summary: {
    totalDebtors: number
    totalOutstanding: number
    currency: string
    aging: {
      current: number
      days1to30: number
      days31to60: number
      days61to90: number
      days90plus: number
    }
  }
}
```

**Validation**:
- User must be finance_admin for the business
- All data scoped to businessId

**Notes**:
- Debtors with mixed-currency invoices appear as separate entries per currency
- Computed server-side from `sales_invoices` table — no denormalized data
- Aging calculated from `dueDate` relative to today per FR-014

---

### getDebtorDetail

Get full invoice and payment history for a specific debtor (customer).

**Args**:
```typescript
{
  businessId: Id<"businesses">
  customerId: Id<"customers">
}
```

**Returns**:
```typescript
{
  customer: {
    _id: Id<"customers">
    name: string
    email?: string
    phone?: string
    address?: string
  }
  summary: {
    totalInvoiced: number             // Sum of all invoice totalAmounts
    totalPaid: number                 // Sum of all amountPaid
    totalOutstanding: number          // Sum of all balanceDue
    overdueCount: number             // Invoices past due date with balanceDue > 0
    currency: string
  }
  invoices: Array<{
    _id: Id<"sales_invoices">
    invoiceNumber: string
    issueDate: string                 // ISO date
    dueDate: string                   // ISO date
    totalAmount: number
    amountPaid: number
    balanceDue: number
    status: string
    currency: string
    payments: Array<{
      _id: Id<"payments">
      type: "payment" | "reversal"
      amount: number                  // Total payment amount
      allocatedAmount: number         // Amount allocated to THIS invoice
      paymentDate: string
      paymentMethod: string
      paymentReference?: string
      reversesPaymentId?: Id<"payments">
      _creationTime: number
    }>
  }>
  runningBalance: Array<{
    date: string                      // ISO date (issueDate for invoices, paymentDate for payments)
    type: "invoice" | "payment" | "reversal"
    description: string               // e.g., "Invoice INV-2026-001" or "Payment - Bank Transfer"
    debit: number                     // Invoice amounts (increase balance)
    credit: number                    // Payment amounts (decrease balance)
    balance: number                   // Running balance after this transaction
    referenceId: Id<"sales_invoices"> | Id<"payments">
  }>
}
```

**Validation**:
- User must be finance_admin for the business
- Customer must belong to the same business

**Notes**:
- Invoices sorted by issue date descending (newest first)
- Running balance sorted chronologically (oldest first)
- Running balance includes ALL invoices and payments for the customer (not date-filtered)

---

### getDebtorStatement

Generate statement data for a specific debtor and date range.

**Args**:
```typescript
{
  businessId: Id<"businesses">
  customerId: Id<"customers">
  dateFrom: string                   // ISO date YYYY-MM-DD (period start, inclusive)
  dateTo: string                     // ISO date YYYY-MM-DD (period end, inclusive)
}
```

**Returns**:
```typescript
{
  customer: {
    _id: Id<"customers">
    name: string
    email?: string
    address?: string
  }
  business: {
    name: string
    address?: string
    registrationNumber?: string
  }
  period: {
    from: string                      // ISO date
    to: string                        // ISO date
  }
  openingBalance: number              // Outstanding balance as of (dateFrom - 1 day)
  closingBalance: number              // Outstanding balance as of dateTo
  currency: string
  transactions: Array<{
    date: string                      // ISO date
    type: "invoice" | "payment" | "reversal"
    reference: string                 // Invoice number or payment reference
    description: string               // e.g., "Invoice issued" or "Payment received - Bank Transfer"
    debit: number                     // Invoice amounts
    credit: number                    // Payment amounts
    balance: number                   // Running balance after this transaction
  }>
  totals: {
    totalDebits: number               // Sum of invoices in period
    totalCredits: number              // Sum of payments in period
  }
}
```

**Validation**:
- User must be finance_admin for the business
- Customer must belong to the same business
- `dateFrom <= dateTo`
- Date range must not exceed 12 months

**Notes**:
- Opening balance = sum of balanceDue for invoices issued before `dateFrom` minus payments before `dateFrom`
- Transactions include only invoices issued and payments dated within [dateFrom, dateTo]
- Transactions sorted chronologically; ties broken by type (invoices before payments on same date)
- Running balance starts from openingBalance and accumulates through each transaction
- Closing balance = openingBalance + totalDebits - totalCredits

---

### getAgingReport

Generate the full AR aging report with per-debtor breakdown.

**Args**:
```typescript
{
  businessId: Id<"businesses">
  asOfDate?: string                  // ISO date — defaults to today. Aging calculated relative to this date.
}
```

**Returns**:
```typescript
{
  asOfDate: string                    // The date aging is calculated against
  currency: string
  summary: {
    current: number
    days1to30: number
    days31to60: number
    days61to90: number
    days90plus: number
    total: number
  }
  debtors: Array<{
    customerId: Id<"customers">
    customerName: string
    current: number
    days1to30: number
    days31to60: number
    days61to90: number
    days90plus: number
    total: number
  }>
}
```

**Validation**:
- User must be finance_admin for the business
- `asOfDate` cannot be in the future

**Notes**:
- Each invoice's balanceDue is placed in a single aging bucket based on its dueDate vs asOfDate
- Debtors sorted by total outstanding descending
- Summary row is the column-wise sum of all debtor rows
- Used for both the UI aging report view and CSV export
- CSV export transforms this same data structure into flat rows
