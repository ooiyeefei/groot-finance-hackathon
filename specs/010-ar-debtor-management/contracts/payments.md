# Contracts: Payment Functions

**File**: `convex/functions/payments.ts`

## Mutations

### recordPayment

Record a payment against one or more invoices.

**Args**:
```typescript
{
  businessId: Id<"businesses">
  customerId: Id<"customers">
  amount: number                    // Total payment amount (> 0)
  currency: string                  // Must match invoice currencies
  paymentDate: string               // ISO date YYYY-MM-DD
  paymentMethod: string             // bank_transfer | cash | cheque | card | other
  paymentReference?: string         // Bank ref / cheque number
  notes?: string
  allocations: Array<{
    invoiceId: Id<"sales_invoices">
    amount: number                  // Amount applied to this invoice (> 0)
  }>
}
```

**Returns**: `Id<"payments">` — the created payment record ID

**Validation**:
- User must be finance_admin for the business
- `amount > 0`
- Sum of `allocations[].amount === amount` (no unallocated funds)
- Each `allocations[].amount <= invoice.balanceDue`
- Each invoice must belong to the same business
- Each invoice must be in payable state (sent, partially_paid, overdue)
- Currency must match each invoice's currency

**Side Effects**:
- Creates payment record in `payments` table
- For each allocation: patches the invoice's `amountPaid`, `balanceDue`, `status`
- If invoice becomes fully paid: sets `paidAt`, updates linked accounting entry to "paid"

---

### recordReversal

Record a reversal to correct a previously recorded payment.

**Args**:
```typescript
{
  businessId: Id<"businesses">
  originalPaymentId: Id<"payments">  // Payment being reversed
  reason?: string                    // Optional note explaining reversal
}
```

**Returns**: `Id<"payments">` — the created reversal record ID

**Validation**:
- User must be finance_admin
- Original payment must exist, belong to same business, and be of type "payment"
- Original payment must not already have a reversal (prevent double-reversal)

**Side Effects**:
- Creates payment record with `type: "reversal"`, `reversesPaymentId` set
- Mirrors the original's allocations but restores balances (amountPaid decremented)
- For each allocation: patches invoice's `amountPaid`, `balanceDue`, reverts `status`
- Updates linked accounting entries back to "pending"

## Queries

### listByInvoice

Get all payments allocated to a specific invoice.

**Args**:
```typescript
{
  businessId: Id<"businesses">
  invoiceId: Id<"sales_invoices">
}
```

**Returns**:
```typescript
{
  payments: Array<{
    _id: Id<"payments">
    type: "payment" | "reversal"
    amount: number              // Total payment amount
    allocatedAmount: number     // Amount allocated to THIS invoice
    currency: string
    paymentDate: string
    paymentMethod: string
    paymentReference?: string
    notes?: string
    reversesPaymentId?: Id<"payments">
    _creationTime: number
  }>
}
```

---

### listByCustomer

Get all payments from a specific customer within a date range.

**Args**:
```typescript
{
  businessId: Id<"businesses">
  customerId: Id<"customers">
  dateFrom?: string             // ISO date
  dateTo?: string               // ISO date
}
```

**Returns**:
```typescript
{
  payments: Array<Payment>      // Full payment records with allocations
  totalPaid: number             // Sum of type="payment" amounts in range
  totalReversed: number         // Sum of type="reversal" amounts in range
}
```
