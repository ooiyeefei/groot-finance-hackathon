# Quickstart: Accounts Receivable & Debtor Management

**Feature**: 010-ar-debtor-management
**Date**: 2026-02-10

## Prerequisites

- Convex dev server running (`npx convex dev`)
- At least 1 business created with finance_admin user
- At least 3 customers created
- At least 5 sales invoices in various states (sent, partially_paid, overdue, paid)
- `npm run dev` running for Next.js frontend

## Test Scenarios

### Scenario 1: Record a Payment (US1)

**Setup**: Create an invoice for $1,000 SGD to Customer A, status = "sent"

1. Open the invoice detail page
2. Click "Record Payment"
3. Enter: amount = $400, method = bank_transfer, reference = "TXN-001", date = today
4. Allocate full $400 to this invoice
5. Submit

**Expected**:
- Payment record created with all details
- Invoice balanceDue = $600
- Invoice status = "partially_paid"
- Invoice amountPaid = $400

### Scenario 2: Split Payment Across Invoices (US1)

**Setup**: 2 invoices — INV-A ($500 due) and INV-B ($300 due) for Customer B

1. Record a payment of $800 for Customer B
2. Allocate $500 to INV-A, $300 to INV-B
3. Submit

**Expected**:
- Single payment record with 2 allocations
- INV-A: paid ($0 due)
- INV-B: paid ($0 due)

### Scenario 3: Payment Reversal (US1)

**Setup**: A payment of $400 was recorded against INV-C (originally $1,000 due, now $600 due)

1. Navigate to the payment record
2. Click "Record Reversal"
3. Confirm

**Expected**:
- New reversal payment record created referencing the original
- INV-C balanceDue restored to $1,000
- INV-C status reverts to "sent" (or "overdue" if past due)
- Original payment still visible in history (not deleted)
- Accounting entry status reverted to "pending"

### Scenario 4: View Debtor List (US2)

**Setup**: 5 customers with varying outstanding amounts and aging

1. Navigate to Invoices page
2. Click "Debtors" tab (third tab)

**Expected**:
- List shows all customers with outstanding invoices
- Each row: customer name, total outstanding, open invoice count, oldest overdue days
- Aging summary at top: Current, 1-30, 31-60, 61-90, 90+ totals
- Sort by outstanding amount works
- "Overdue only" filter hides non-overdue debtors

### Scenario 5: View Debtor Detail (US3)

**Setup**: Customer C with 3 invoices (1 paid, 1 partial, 1 overdue) and 2 payments

1. From debtor list, click Customer C
2. View the detail page

**Expected**:
- Summary: total invoiced, total paid, total outstanding, overdue count
- All 3 invoices listed with status, amounts, dates
- Expanding partial/overdue invoices shows payment history
- Running balance section shows chronological transactions

### Scenario 6: Generate Debtor Statement (US4)

**Setup**: Customer D with transactions in Jan-Feb 2026 and 1 invoice from Dec 2025

1. From Customer D's detail page, click "Generate Statement"
2. Select date range: Jan 1, 2026 to Feb 28, 2026
3. View the generated statement

**Expected**:
- Opening balance reflects Dec 2025 outstanding
- All Jan-Feb invoices and payments listed chronologically
- Running balance column
- Closing balance = opening + debits - credits
- PDF download works with business letterhead
- Email sends PDF to customer's email

### Scenario 7: AR Aging Report (US5)

**Setup**: Multiple customers with invoices at various aging stages

1. Navigate to "Debtors" tab
2. Click "Aging Report" button

**Expected**:
- Summary row: Current, 1-30, 31-60, 61-90, 90+, Total
- Per-debtor breakdown rows
- Each invoice placed in correct bucket based on due date vs today
- CSV export downloads with all data

## Validation Checklist

- [ ] Payment allocations sum equals payment amount
- [ ] Invoice balanceDue = totalAmount - amountPaid after each payment
- [ ] Reversal restores original invoice balance
- [ ] Debtor list excludes fully-paid customers
- [ ] Aging buckets calculate from due date, not invoice date
- [ ] Statement opening/closing balances reconcile
- [ ] Multi-currency debtors show separate entries per currency
- [ ] All views restricted to finance_admin role
- [ ] All data scoped to active business
