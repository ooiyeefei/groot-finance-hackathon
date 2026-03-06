# Data Model: Batch Payment Processing

## Entity Changes

### Expense Claim (existing table: `expense_claims`)

**New fields:**
- `paymentMethod`: optional string — Bank Transfer, Cheque, Cash, etc.
- `paymentReference`: optional string — Transaction reference number
- `paidBy`: optional string — User ID of the finance admin who processed payment

**Existing fields used:**
- `status`: "approved" → "reimbursed" (existing transition)
- `paidAt`: optional number (timestamp) — already exists in schema
- `submittedBy` / `userId`: links to the employee who submitted
- `amount` / `totalAmount`: claim amount
- `currency`: claim currency
- `vendorName`: vendor
- `expenseCategory`: category
- `referenceNumber`: receipt/claim reference

**Status transition:**
```
draft → submitted → approved → reimbursed
                  ↓
              rejected
```

### Accounting Entry (existing table: `accounting_entries`)

**No new fields needed.**

**Existing fields used:**
- `status`: "pending" → "paid" (existing field, new transition for batch payment)
- Linked from expense claims via the approval process

## Relationships

```
Expense Claim (1) ←→ (0..1) Accounting Entry
  - Created when claim is approved
  - Both updated atomically during batch payment

Finance Admin (1) → (many) Expense Claims
  - paidBy field records who processed the payment
  - paidAt records when
```

## Query Patterns

1. **List pending claims**: All expense_claims WHERE status = "approved" AND businessId = current business
2. **Group by employee**: Group results by userId/submittedBy, with employee name resolution
3. **Filter by date range**: Filter on submission date (createdAt or submittedAt)
4. **Filter by category**: Filter on expenseCategory field
5. **Filter by employee**: Filter on userId/submittedBy
