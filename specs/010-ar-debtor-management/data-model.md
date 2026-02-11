# Data Model: Accounts Receivable & Debtor Management

**Feature**: 010-ar-debtor-management
**Date**: 2026-02-10

## New Entities

### payments

Individual payment records received from customers. Immutable once created — corrections use reversal entries.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | Id<"businesses"> | Yes | Multi-tenant scope |
| customerId | Id<"customers"> | Yes | Customer who made the payment |
| userId | Id<"users"> | Yes | Finance admin who recorded the payment |
| type | "payment" \| "reversal" | Yes | Normal payment or reversal correction |
| amount | number | Yes | Total payment amount (positive for payments, positive for reversals — the reversal nature is indicated by type) |
| currency | string | Yes | Payment currency (e.g., "SGD", "MYR") |
| paymentDate | string | Yes | ISO date string (YYYY-MM-DD) when payment was received |
| paymentMethod | string | Yes | One of: bank_transfer, cash, cheque, card, other |
| paymentReference | string | No | Bank reference number, cheque number, or transaction ID |
| notes | string | No | Optional notes about the payment |
| reversesPaymentId | Id<"payments"> | No | For reversals: references the original payment being reversed |
| allocations | Array<PaymentAllocation> | Yes | How this payment is distributed across invoices |
| updatedAt | number | No | Last update timestamp |
| deletedAt | number | No | Soft delete timestamp (for data integrity only, not user-facing) |

**PaymentAllocation** (embedded object in allocations array):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| invoiceId | Id<"sales_invoices"> | Yes | Invoice this allocation applies to |
| amount | number | Yes | Amount allocated to this invoice |
| allocatedAt | number | Yes | Timestamp when allocation was made |

**Indexes**:
- `by_businessId` — Business-scoped queries
- `by_businessId_customerId` — Debtor detail: all payments for a customer
- `by_businessId_paymentDate` — Statement generation: date-range queries
- `by_reversesPaymentId` — Find reversals for a specific payment

**Validation Rules**:
- `amount > 0` always (reversals restore balance via type, not negative amounts)
- Sum of `allocations[].amount` must equal `amount`
- Each `allocations[].amount` must not exceed the target invoice's `balanceDue` at time of recording
- For type="reversal": `reversesPaymentId` must reference an existing payment of type="payment"
- `paymentMethod` must be one of the defined enum values
- `currency` must match the invoice currency for each allocation

**Immutability**:
- Payment records cannot be edited or deleted after creation
- To correct a mistake, create a new payment with `type: "reversal"` referencing the original
- Reversal payments have their own allocations that restore the invoice balances

## Modified Entities

### sales_invoices (existing — modifications)

No schema changes needed. The existing fields handle the AR lifecycle:
- `amountPaid` — Updated when payment allocations are applied
- `balanceDue` — Recalculated as `totalAmount - amountPaid`
- `status` — Transitions: sent → partially_paid → paid (or overdue)
- `customerId` — Links to customer (debtor)
- `accountingEntryId` — Links to accounting entry for AR tracking

The payment history for an invoice is queried from the `payments` table using `allocations[].invoiceId`.

### statuses.ts (existing — additions)

Add payment-related constants:

```
PAYMENT_TYPES: payment, reversal
PAYMENT_METHODS: bank_transfer, cash, cheque, card, other
```

### validators.ts (existing — additions)

Add validators:
- `paymentTypeValidator` — literalUnion of payment types
- `paymentMethodValidator` — literalUnion of payment methods

## Entity Relationships

```
businesses (1) ──── (N) customers
customers  (1) ──── (N) sales_invoices
customers  (1) ──── (N) payments
payments   (1) ──── (N) allocations ──── (1) sales_invoices
payments   (1) ──── (0..1) payments [reversesPaymentId → self-reference]
sales_invoices (1) ── (0..1) accounting_entries [accountingEntryId]
```

**Debtor (virtual entity)**:
- Not stored — derived at query time
- A customer is a "debtor" when they have ≥1 invoice with status in (sent, partially_paid, overdue)
- Debtor summary = aggregate of their outstanding invoices + payment history

## State Transitions

### Payment Lifecycle

```
Record Payment
  └─→ Create payment record (type: "payment")
  └─→ For each allocation:
        └─→ Update invoice.amountPaid += allocation.amount
        └─→ Update invoice.balanceDue = totalAmount - amountPaid
        └─→ Update invoice.status (partially_paid or paid)
        └─→ Update accounting_entries.status if fully paid

Record Reversal
  └─→ Create payment record (type: "reversal", reversesPaymentId set)
  └─→ For each allocation:
        └─→ Update invoice.amountPaid -= allocation.amount
        └─→ Update invoice.balanceDue = totalAmount - amountPaid
        └─→ Update invoice.status (revert to sent or partially_paid)
        └─→ Update accounting_entries.status back to pending
```

### Invoice Status (unchanged, for reference)

```
draft → sent → partially_paid → paid
                    ↑               ↓ (reversal)
              sent ←─── partially_paid ←── (reversal from paid)
         ↓
       overdue → partially_paid → paid
         ↓
       void (terminal — accounting entry cancelled)
```
