---
paths:
  - "convex/functions/journal*"
  - "convex/lib/journal*"
  - "src/domains/*/components/accounting*"
  - "convex/functions/invoices*"
  - "convex/functions/salesInvoices*"
---
# Accounting System Architecture (2026-03-14 Migration)

**CRITICAL:** Migrated to proper double-entry bookkeeping. Follow these rules.

## Current System (USE THIS)

- **Tables**: `journal_entries` (header) + `journal_entry_lines` (line items)
- **Structure**: Double-entry -- every transaction has balanced debits and credits
- **Creation**: Use helpers from `convex/lib/journal-entry-helpers.ts` + `journal-entries/createInternal.ts`
- **Querying**: Query `journal_entry_lines` with account code filters (e.g., `accountCode: "1200"` for AR)

### Helper Functions (`convex/lib/journal-entry-helpers.ts`)
```typescript
createExpenseJournalEntry({ amount, expenseAccountCode, description })
createInvoiceJournalEntry({ amount, expenseAccountCode, vendorId, description })
createSalesInvoiceJournalEntry({ amount, customerId, description })
createPaymentJournalEntry({ amount, accountCode, isCashIn, description })
```

### Example: Create a journal entry
```typescript
import { internal } from "./_generated/api";
import { createExpenseJournalEntry } from "./lib/journal-entry-helpers";

const lines = createExpenseJournalEntry({
  amount: 100.50,
  expenseAccountCode: "5100",
  description: "Office supplies"
});

await ctx.runMutation(internal.journal-entries.createInternal, {
  businessId,
  entryDate: "2026-03-14",
  description: "Office supplies purchase",
  referenceType: "expense_claim",
  referenceId: claimId,
  lines
});
```

### Example: Query journal entries
```typescript
const arLines = await ctx.db
  .query("journal_entry_lines")
  .withIndex("by_account_business", (q) =>
    q.eq("accountCode", "1200").eq("businessId", businessId)
  )
  .collect();

const arBalance = arLines.reduce((sum, line) =>
  sum + line.debitAmount - line.creditAmount, 0
);
```

## Deprecated (DO NOT USE)
- `accounting_entries` table was dropped -- use `journal_entries` + `journal_entry_lines` only
- Currency types moved to `src/lib/types/currency.ts`

## AP Subledger (Payment Tracking)
- **Invoices table** = AP subledger with `paidAmount`, `paymentStatus`, `dueDate`, `paymentHistory[]`
- **Payment recording**: `invoices.recordPayment` creates double-entry journal (Debit AP 2100, Credit Cash 1000)
- **AP aging**: Query `invoices` table directly (not accounting_entries)
- **AR aging**: Query `sales_invoices` table directly (own payment system)

## Rules for New Accounting Features
1. Always use `journal_entries` + `journal_entry_lines` for GL entries
2. Use helper functions for common patterns
3. AP payment: Use `invoices.recordPayment` (creates JE + updates invoice)
4. AP queries: `invoices` table with `paymentStatus` and `accountingStatus` filters
5. AR queries: `sales_invoices` table directly
6. Never write to `accounting_entries` -- all write mutations are deleted
