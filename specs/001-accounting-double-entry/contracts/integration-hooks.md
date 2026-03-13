# Integration Hooks: Accounting Events

**Branch**: `001-accounting-double-entry` | **Date**: 2026-03-12
**Source**: [research.md section 3](../research.md#3-integration-hooks)

## Overview

This document specifies how existing business modules (AR Reconciliation, Expense Claims, Sales Invoices) trigger journal entry creation in the double-entry accounting system.

**Integration Pattern**: Direct mutation composition (Pattern 1)
- Business mutation calls accounting mutation synchronously
- ACID atomicity - both succeed or both fail
- Immediate consistency - entries visible instantly
- Simple debugging - no async queues

---

## Hook 1: AR Reconciliation Period Close

### Trigger Event

**Module**: `src/domains/sales-invoices/` (AR Reconciliation)
**Function**: `closePeriod(periodId: Id<"reconciliation_periods">)`
**When**: Finance Admin clicks "Close Period" button after reviewing matched orders

### Accounting Action

Create **3 journal entries** for each matched order in the period:

#### Entry 1: Platform Fees Expense

**Description**: Record platform commission fees deducted from sales
**Lines**:
```typescript
{
  entry: {
    description: "Platform fees - Shopee Order #12345",
    sourceType: "ar_reconciliation",
    sourceId: orderId,
    transactionDate: order.paymentDate,
  },
  lines: [
    {
      accountCode: "5800",          // Platform Fees Expense
      debitAmount: order.platformFee,
      creditAmount: 0,
    },
    {
      accountCode: "1200",          // Accounts Receivable
      debitAmount: 0,
      creditAmount: order.platformFee,
    },
  ],
}
```

#### Entry 2: Cash Received from Platform

**Description**: Record net cash received after fees
**Lines**:
```typescript
{
  entry: {
    description: "Cash received - Shopee settlement",
    sourceType: "ar_reconciliation",
    sourceId: orderId,
    transactionDate: order.paymentDate,
  },
  lines: [
    {
      accountCode: "1000",          // Cash
      debitAmount: order.netAmount,  // gross - platform fee
      creditAmount: 0,
    },
    {
      accountCode: "1200",          // Accounts Receivable
      debitAmount: 0,
      creditAmount: order.netAmount,
    },
  ],
}
```

#### Entry 3: Variance Adjustment (if variance > 10%)

**Description**: Record difference between order amount and invoice amount
**Condition**: `ABS(order.amount - invoice.amount) / invoice.amount > 0.10`
**Lines**:
```typescript
{
  entry: {
    description: "AR variance adjustment - Order #12345",
    sourceType: "ar_reconciliation",
    sourceId: orderId,
    transactionDate: order.paymentDate,
  },
  lines: [
    // If order amount > invoice amount (gain)
    {
      accountCode: "1200",          // Accounts Receivable
      debitAmount: variance,
      creditAmount: 0,
    },
    {
      accountCode: "4900",          // Other Income
      debitAmount: 0,
      creditAmount: variance,
    },
    // OR if order amount < invoice amount (loss)
    {
      accountCode: "5900",          // Other Expense
      debitAmount: variance,
      creditAmount: 0,
    },
    {
      accountCode: "1200",          // Accounts Receivable
      debitAmount: 0,
      creditAmount: variance,
    },
  ],
}
```

### Side Effects

1. Update `sales_orders.status = 'reconciled'`
2. Update `sales_orders.reconciledAt = now()`
3. Link sales_invoice: `sales_invoices.status = 'paid'`
4. Link journal entries: `sales_orders.journalEntryIds = [entry1._id, entry2._id, entry3?._id]`

### Implementation Location

**File**: `convex/functions/integrations/arReconciliationIntegration.ts`
**Function**: `createJournalEntriesFromReconciliation(ctx, periodId)`

**Pseudocode**:
```typescript
export const createJournalEntriesFromReconciliation = internalMutation({
  args: { periodId: v.id("reconciliation_periods") },
  handler: async (ctx, { periodId }) => {
    // 1. Fetch all matched orders in period
    const orders = await ctx.db
      .query("sales_orders")
      .withIndex("by_period", (q) => q.eq("periodId", periodId))
      .filter((q) => q.eq(q.field("matchStatus"), "matched"))
      .collect();

    const journalEntryIds: Id<"journal_entries">[] = [];

    for (const order of orders) {
      // 2. Create Entry 1: Platform Fees
      const feeEntry = await ctx.db.insert("journal_entries", {
        businessId: order.businessId,
        description: `Platform fees - ${order.platform} Order #${order.orderRef}`,
        sourceType: "ar_reconciliation",
        sourceId: order._id,
        transactionDate: order.paymentDate,
        // ... other fields
      });

      await ctx.db.insert("journal_entry_lines", [
        { journalEntryId: feeEntry, accountCode: "5800", debitAmount: order.platformFee, creditAmount: 0 },
        { journalEntryId: feeEntry, accountCode: "1200", debitAmount: 0, creditAmount: order.platformFee },
      ]);

      // 3. Create Entry 2: Cash Received
      const cashEntry = await ctx.db.insert("journal_entries", { /* ... */ });
      await ctx.db.insert("journal_entry_lines", [ /* ... */ ]);

      // 4. Create Entry 3: Variance (if needed)
      if (variance > threshold) {
        const varianceEntry = await ctx.db.insert("journal_entries", { /* ... */ });
        await ctx.db.insert("journal_entry_lines", [ /* ... */ ]);
      }

      // 5. Update sales_orders
      await ctx.db.patch(order._id, {
        status: "reconciled",
        reconciledAt: Date.now(),
        journalEntryIds,
      });

      // 6. Update matched invoice
      if (order.matchedInvoiceId) {
        await ctx.db.patch(order.matchedInvoiceId, { status: "paid" });
      }
    }

    return { entriesCreated: journalEntryIds.length };
  },
});
```

### Testing Scenarios

1. **Happy path**: Order matched to invoice, platform fee 3%, no variance → 2 entries created
2. **With variance**: Order amount differs by 12% → 3 entries created (fee, cash, variance)
3. **Multiple orders**: Close period with 10 orders → 20-30 entries created
4. **Failure rollback**: Entry creation fails → period not closed, no partial entries

---

## Hook 2: Expense Claim Approval

### Trigger Event

**Module**: `src/domains/expense-claims/`
**Function**: `updateExpenseClaim(claimId, { status: "approved" })`
**When**: Manager approves employee expense claim

### Accounting Action

Create **1 journal entry** recording expense liability:

**Description**: Record approved expense as liability until reimbursed
**Lines**:
```typescript
{
  entry: {
    description: "Expense: {claim.description}",
    sourceType: "expense_claim",
    sourceId: claimId,
    transactionDate: claim.transactionDate,
  },
  lines: [
    {
      accountCode: claim.expenseCategory.glAccountCode,  // e.g., "5200" for Travel
      debitAmount: claim.totalAmount,
      creditAmount: 0,
      entityType: "employee",
      entityId: claim.userId,
      entityName: claim.userName,
    },
    {
      accountCode: "2100",          // Accounts Payable
      debitAmount: 0,
      creditAmount: claim.totalAmount,
      againstAccountCode: claim.expenseCategory.glAccountCode,
      againstAccountName: claim.expenseCategory.categoryName,
    },
  ],
}
```

### Side Effects

1. Link journal entry: `expense_claims.accountingEntryId = entry._id`
2. Status remains 'approved' (not 'reimbursed' yet)

### Implementation Location

**File**: `convex/functions/expenseClaims.ts` (existing file)
**Function**: `updateExpenseClaim` - add hook at line ~1171

**Modification** (existing code at lines 1171-1195):
```typescript
// EXISTING CODE - already implements this pattern correctly!
if (status === 'approved') {
  const accountingEntry = await createAccountingEntryFromExpenseClaim(ctx, {
    claim: existingClaim,
    status: 'pending',  // AP liability
  });

  updateData.accounting_entry_id = accountingEntry._id;
}
```

**New accounting function**:
```typescript
async function createAccountingEntryFromExpenseClaim(
  ctx: MutationCtx,
  { claim, status }: { claim: ExpenseClaim; status: "pending" | "paid" }
) {
  // Get expense category GL account
  const category = await ctx.db.get(claim.expenseCategoryId);

  // Create journal entry
  const entry = await ctx.db.insert("journal_entries", {
    businessId: claim.businessId,
    description: `Expense: ${claim.description}`,
    sourceType: "expense_claim",
    sourceId: claim._id,
    transactionDate: claim.transactionDate,
    status: "posted",
    // ... other fields
  });

  // Create lines
  await ctx.db.insert("journal_entry_lines", [
    {
      journalEntryId: entry,
      accountCode: category.glAccountCode,
      accountName: category.categoryName,
      accountType: "Expense",
      debitAmount: claim.totalAmount,
      creditAmount: 0,
      entityType: "employee",
      entityId: claim.userId,
      // ... other fields
    },
    {
      journalEntryId: entry,
      accountCode: "2100",
      accountName: "Accounts Payable",
      accountType: "Liability",
      debitAmount: 0,
      creditAmount: claim.totalAmount,
      againstAccountCode: category.glAccountCode,
      // ... other fields
    },
  ]);

  return entry;
}
```

---

## Hook 3: Expense Claim Reimbursement

### Trigger Event

**Module**: `src/domains/expense-claims/`
**Function**: `updateExpenseClaim(claimId, { status: "reimbursed" })`
**When**: Admin marks expense as reimbursed (payment made to employee)

### Accounting Action

Create **1 journal entry** recording payment:

**Description**: Clear AP liability and reduce cash
**Lines**:
```typescript
{
  entry: {
    description: "Payment: {claim.description}",
    sourceType: "expense_claim",
    sourceId: claimId,
    transactionDate: reimbursementDate,
  },
  lines: [
    {
      accountCode: "2100",          // Accounts Payable
      debitAmount: claim.totalAmount,
      creditAmount: 0,
      entityType: "employee",
      entityId: claim.userId,
    },
    {
      accountCode: "1000",          // Cash
      debitAmount: 0,
      creditAmount: claim.totalAmount,
      againstAccountCode: "2100",
    },
  ],
}
```

### Side Effects

1. Update existing accounting_entry: `accounting_entries.status = 'paid'`
2. Update expense_claim: `expense_claims.reimbursedAt = now()`

### Implementation Location

**File**: `convex/functions/expenseClaims.ts`
**Function**: `updateExpenseClaim` - add hook for status='reimbursed'

---

## Hook 4: Sales Invoice Creation

### Trigger Event

**Module**: `src/domains/sales-invoices/`
**Function**: `createInvoice(invoiceData)`
**When**: User creates and sends sales invoice to customer

### Accounting Action

Create **1 journal entry** recording revenue:

**Description**: Record sale as revenue and create AR
**Lines**:
```typescript
{
  entry: {
    description: "Invoice #{invoice.invoiceNumber}",
    sourceType: "sales_invoice",
    sourceId: invoiceId,
    transactionDate: invoice.invoiceDate,
  },
  lines: [
    {
      accountCode: "1200",          // Accounts Receivable
      debitAmount: invoice.totalAmount,
      creditAmount: 0,
      entityType: "customer",
      entityId: invoice.customerId,
      entityName: invoice.customerName,
    },
    {
      accountCode: "4100",          // Sales Revenue (or category-specific)
      debitAmount: 0,
      creditAmount: invoice.subtotal,
      againstAccountCode: "1200",
    },
    // If tax included
    {
      accountCode: "2200",          // Sales Tax Payable
      debitAmount: 0,
      creditAmount: invoice.taxAmount,
    },
  ],
}
```

### Side Effects

1. Link journal entry: `sales_invoices.journalEntryId = entry._id`

---

## Hook 5: Sales Invoice Payment

### Trigger Event

**Module**: `src/domains/sales-invoices/`
**Function**: `updateInvoiceStatus(invoiceId, { status: "paid" })`
**When**: Customer pays invoice (manually recorded by user)

### Accounting Action

Create **1 journal entry** recording payment:

**Description**: Clear AR and increase cash
**Lines**:
```typescript
{
  entry: {
    description: "Payment: Invoice #{invoice.invoiceNumber}",
    sourceType: "sales_invoice",
    sourceId: invoiceId,
    transactionDate: paymentDate,
  },
  lines: [
    {
      accountCode: "1000",          // Cash
      debitAmount: invoice.totalAmount,
      creditAmount: 0,
    },
    {
      accountCode: "1200",          // Accounts Receivable
      debitAmount: 0,
      creditAmount: invoice.totalAmount,
      entityType: "customer",
      entityId: invoice.customerId,
      againstAccountCode: "1000",
    },
  ],
}
```

### Side Effects

1. Update invoice: `sales_invoices.paidAt = now()`
2. Link payment entry: `sales_invoices.paymentJournalEntryId = entry._id`

---

## Error Handling

All integration hooks must handle errors gracefully:

### Validation Errors

```typescript
try {
  // Validate balance before creating entry
  validateBalance(lines);
} catch (error) {
  // Log error, DO NOT create journal entry
  console.error(`[Accounting Integration] Balance validation failed:`, error);

  // Keep business operation status as pending
  // e.g., expense_claims.status remains 'approved' (not reimbursed)
  // User can retry or create manual entry

  throw new ConvexError({
    message: "Failed to create accounting entry",
    code: "UNBALANCED_ENTRY",
    details: error.message,
  });
}
```

### Account Not Found

```typescript
const category = await ctx.db.get(claim.expenseCategoryId);

if (!category?.glAccountCode) {
  // Use fallback account "5999 - Uncategorized Expense"
  const glAccountCode = "5999";
  console.warn(`[Accounting Integration] Missing GL account for category ${claim.expenseCategoryId}, using fallback ${glAccountCode}`);
}
```

### Transaction Atomicity

```typescript
// Convex mutations are atomic - if ANY operation fails, ALL rollback
// No need for manual transaction management

// Example:
await ctx.db.insert("journal_entries", entry);     // Op 1
await ctx.db.insert("journal_entry_lines", lines); // Op 2
await ctx.db.patch(claim._id, { status: "paid" }); // Op 3

// If Op 3 fails → Op 1 and Op 2 automatically rollback
```

---

## Testing Checklist

### Integration Tests

- [ ] AR recon period close creates 2-3 entries per order (fee, cash, variance?)
- [ ] Expense approval creates 1 entry (Dr. Expense, Cr. AP)
- [ ] Expense reimbursement creates 1 entry (Dr. AP, Cr. Cash)
- [ ] Invoice creation creates 1 entry (Dr. AR, Cr. Revenue + Tax)
- [ ] Invoice payment creates 1 entry (Dr. Cash, Cr. AR)

### Balance Validation

- [ ] All journal entries balance (debits = credits)
- [ ] Trial balance sums to zero after integration hooks
- [ ] Financial statements reflect business operations correctly

### Rollback Scenarios

- [ ] If accounting entry creation fails, business operation reverts
- [ ] No orphaned journal entries (all link to source document)
- [ ] No partial entries (all lines created or none)

---

## Summary Table

| Hook | Module | Trigger | Entries Created | Lines per Entry |
|------|--------|---------|-----------------|-----------------|
| AR Recon Close | Sales Invoices | closePeriod() | 2-3 per order | 2 lines each |
| Expense Approval | Expense Claims | status='approved' | 1 | 2 lines |
| Expense Reimbursement | Expense Claims | status='reimbursed' | 1 | 2 lines |
| Invoice Creation | Sales Invoices | createInvoice() | 1 | 2-3 lines (with tax) |
| Invoice Payment | Sales Invoices | status='paid' | 1 | 2 lines |

**Total Integration Points**: 5 hooks across 3 modules
**Expected Volume**: 100-200 journal entries/day from automated hooks (500-2000/month)

---

## Next Steps

1. Implement `arReconciliationIntegration.ts` (new file)
2. Modify `expenseClaims.ts` to use new journal entries
3. Implement `salesInvoiceIntegration.ts` (new file)
4. Write integration tests for all 5 hooks
5. UAT test full workflows (AR recon → accounting, expense approval → accounting, invoice payment → accounting)

---

**Integration Status**: ✅ Specifications complete
**Pattern**: Direct mutation composition (Pattern 1 - synchronous)
**Atomicity**: Guaranteed via Convex transaction model
