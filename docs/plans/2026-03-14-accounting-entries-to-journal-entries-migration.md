# Accounting Entries → Journal Entries Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single-entry `accounting_entries` table with double-entry `journal_entries` system across entire codebase (31 files)

**Architecture:**
- Create reusable helper functions for common journal entry patterns (expense → debit expense/credit cash, invoice → debit AR/credit revenue)
- Migrate all write operations (18 Convex functions) to create journal entries instead of accounting entries
- Update all read operations (12 frontend files) to query journal_entry_lines with account filters
- Deprecate `accounting_entries` table after full migration

**Tech Stack:** TypeScript 5.9.3, Convex 1.31.3, double-entry bookkeeping (GAAP)

---

## Phase 1: Create Journal Entry Helper Functions

### Task 1.1: Create journal entry creation helpers

**Files:**
- Create: `convex/lib/journal-entry-helpers.ts`

**Step 1: Write helper function tests**

Create: `convex/lib/journal-entry-helpers.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { createExpenseJournalEntry, createInvoiceJournalEntry, createSalesInvoiceJournalEntry } from "./journal-entry-helpers";

describe("Journal Entry Helpers", () => {
  it("creates balanced expense journal entry", () => {
    const lines = createExpenseJournalEntry({
      amount: 100,
      expenseAccountCode: "5100",
      description: "Office supplies"
    });

    const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);

    expect(totalDebit).toBe(100);
    expect(totalCredit).toBe(100);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });

  it("creates balanced invoice journal entry", () => {
    const lines = createInvoiceJournalEntry({
      amount: 250,
      expenseAccountCode: "5200",
      description: "Vendor invoice"
    });

    const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);

    expect(totalDebit).toBe(250);
    expect(totalCredit).toBe(250);
  });

  it("creates balanced sales invoice journal entry", () => {
    const lines = createSalesInvoiceJournalEntry({
      amount: 500,
      revenueAccountCode: "4100",
      description: "Sales invoice"
    });

    const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);

    expect(totalDebit).toBe(500);
    expect(totalCredit).toBe(500);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- convex/lib/journal-entry-helpers.test.ts`
Expected: FAIL with "Module not found"

**Step 3: Implement helper functions**

Create: `convex/lib/journal-entry-helpers.ts`

```typescript
import { Id } from "../_generated/dataModel";

/**
 * Journal Entry Creation Helpers
 *
 * These helpers create balanced journal entry line arrays for common transaction patterns.
 * All amounts use GAAP debit/credit rules:
 * - Assets & Expenses increase with DEBIT
 * - Liabilities, Equity, Revenue decrease with CREDIT
 */

export interface JournalEntryLineInput {
  accountId: Id<"chart_of_accounts">;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  lineDescription?: string;
}

/**
 * Create expense journal entry (debit expense, credit cash/AP)
 *
 * Example: Office supplies $100
 * - Debit: 5100 Office Supplies $100
 * - Credit: 1000 Cash $100
 */
export function createExpenseJournalEntry(params: {
  amount: number;
  expenseAccountId: Id<"chart_of_accounts">;
  expenseAccountCode: string;
  expenseAccountName: string;
  description: string;
  cashAccountId?: Id<"chart_of_accounts">;
  cashAccountCode?: string;
  cashAccountName?: string;
  isPayable?: boolean; // If true, credit AP instead of Cash
  apAccountId?: Id<"chart_of_accounts">;
  apAccountCode?: string;
  apAccountName?: string;
}): JournalEntryLineInput[] {
  const lines: JournalEntryLineInput[] = [
    // Debit expense account
    {
      accountId: params.expenseAccountId,
      accountCode: params.expenseAccountCode,
      accountName: params.expenseAccountName,
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: params.description,
    },
  ];

  // Credit cash or AP
  if (params.isPayable && params.apAccountId) {
    lines.push({
      accountId: params.apAccountId,
      accountCode: params.apAccountCode || "2100",
      accountName: params.apAccountName || "Accounts Payable",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Payable - ${params.description}`,
    });
  } else {
    lines.push({
      accountId: params.cashAccountId || ("unknown" as any),
      accountCode: params.cashAccountCode || "1000",
      accountName: params.cashAccountName || "Cash",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Payment - ${params.description}`,
    });
  }

  return lines;
}

/**
 * Create vendor invoice journal entry (debit expense, credit AP)
 *
 * Example: Vendor invoice $250
 * - Debit: 5200 Operating Expenses $250
 * - Credit: 2100 Accounts Payable $250
 */
export function createInvoiceJournalEntry(params: {
  amount: number;
  expenseAccountId: Id<"chart_of_accounts">;
  expenseAccountCode: string;
  expenseAccountName: string;
  description: string;
  apAccountId?: Id<"chart_of_accounts">;
  apAccountCode?: string;
  apAccountName?: string;
}): JournalEntryLineInput[] {
  return [
    // Debit expense
    {
      accountId: params.expenseAccountId,
      accountCode: params.expenseAccountCode,
      accountName: params.expenseAccountName,
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: params.description,
    },
    // Credit AP
    {
      accountId: params.apAccountId || ("unknown" as any),
      accountCode: params.apAccountCode || "2100",
      accountName: params.apAccountName || "Accounts Payable",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Vendor invoice - ${params.description}`,
    },
  ];
}

/**
 * Create sales invoice journal entry (debit AR, credit revenue)
 *
 * Example: Sales invoice $500
 * - Debit: 1200 Accounts Receivable $500
 * - Credit: 4100 Sales Revenue $500
 */
export function createSalesInvoiceJournalEntry(params: {
  amount: number;
  revenueAccountId: Id<"chart_of_accounts">;
  revenueAccountCode: string;
  revenueAccountName: string;
  description: string;
  arAccountId?: Id<"chart_of_accounts">;
  arAccountCode?: string;
  arAccountName?: string;
}): JournalEntryLineInput[] {
  return [
    // Debit AR
    {
      accountId: params.arAccountId || ("unknown" as any),
      accountCode: params.arAccountCode || "1200",
      accountName: params.arAccountName || "Accounts Receivable",
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: params.description,
    },
    // Credit revenue
    {
      accountId: params.revenueAccountId,
      accountCode: params.revenueAccountCode,
      accountName: params.revenueAccountName,
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: params.description,
    },
  ];
}

/**
 * Create payment journal entry (debit AP, credit cash)
 *
 * Example: Pay vendor $300
 * - Debit: 2100 Accounts Payable $300
 * - Credit: 1000 Cash $300
 */
export function createPaymentJournalEntry(params: {
  amount: number;
  apAccountId: Id<"chart_of_accounts">;
  apAccountCode: string;
  apAccountName: string;
  description: string;
  cashAccountId?: Id<"chart_of_accounts">;
  cashAccountCode?: string;
  cashAccountName?: string;
}): JournalEntryLineInput[] {
  return [
    // Debit AP (reduce liability)
    {
      accountId: params.apAccountId,
      accountCode: params.apAccountCode,
      accountName: params.apAccountName,
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: `Payment - ${params.description}`,
    },
    // Credit cash
    {
      accountId: params.cashAccountId || ("unknown" as any),
      accountCode: params.cashAccountCode || "1000",
      accountName: params.cashAccountName || "Cash",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Payment - ${params.description}`,
    },
  ];
}

/**
 * Validate that journal entry lines are balanced
 */
export function validateBalancedEntry(lines: JournalEntryLineInput[]): {
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
} {
  const totalDebit = lines.reduce((sum, line) => sum + line.debitAmount, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.creditAmount, 0);
  const difference = Math.abs(totalDebit - totalCredit);

  return {
    isBalanced: difference < 0.01, // ±RM0.01 tolerance
    totalDebit,
    totalCredit,
    difference,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- convex/lib/journal-entry-helpers.test.ts`
Expected: PASS (all 3 tests green)

**Step 5: Commit**

```bash
git add convex/lib/journal-entry-helpers.ts convex/lib/journal-entry-helpers.test.ts
git commit -m "feat(accounting): add journal entry helper functions for common patterns"
```

---

### Task 1.2: Create internal journal entry creation function

**Files:**
- Modify: `convex/functions/journalEntries.ts`

**Step 1: Add internal creation function**

Add after line 100 in `convex/functions/journalEntries.ts`:

```typescript
/**
 * Internal function to create journal entries from other Convex functions
 * Does not require authentication (for system-generated entries)
 */
export const createInternal = internalMutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    description: v.string(),
    transactionDate: v.optional(v.string()),
    lines: v.array(
      v.object({
        accountId: v.id("chart_of_accounts"),
        accountCode: v.string(),
        accountName: v.string(),
        debitAmount: v.number(),
        creditAmount: v.number(),
        lineDescription: v.optional(v.string()),
      })
    ),
    sourceType: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("sales_invoice"),
        v.literal("expense_claim"),
        v.literal("vendor_invoice"),
        v.literal("payment"),
        v.literal("bank_reconciliation")
      )
    ),
    sourceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate balanced entry
    const totalDebit = args.lines.reduce((sum, line) => sum + line.debitAmount, 0);
    const totalCredit = args.lines.reduce((sum, line) => sum + line.creditAmount, 0);
    const difference = Math.abs(totalDebit - totalCredit);

    if (difference >= 0.01) {
      throw new Error(
        `Unbalanced journal entry: debits=${totalDebit}, credits=${totalCredit}, difference=${difference}`
      );
    }

    // Generate entry number
    const today = args.transactionDate || new Date().toISOString().split("T")[0];
    const year = today.split("-")[0];

    const existingEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const entriesThisYear = existingEntries.filter((e) =>
      e.entryNumber.startsWith(`JE-${year}`)
    );

    const nextNumber = entriesThisYear.length + 1;
    const entryNumber = `JE-${year}-${String(nextNumber).padStart(5, "0")}`;

    // Create journal entry header
    const entryId = await ctx.db.insert("journal_entries", {
      businessId: args.businessId,
      userId: args.userId,
      entryNumber,
      transactionDate: args.transactionDate || today,
      description: args.description,
      status: "posted",
      totalDebit: totalDebit,
      totalCredit: totalCredit,
      sourceType: args.sourceType || "manual",
      sourceId: args.sourceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create journal entry lines
    for (const line of args.lines) {
      await ctx.db.insert("journal_entry_lines", {
        journalEntryId: entryId,
        accountId: line.accountId,
        accountCode: line.accountCode,
        accountName: line.accountName,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        lineDescription: line.lineDescription,
        createdAt: Date.now(),
      });
    }

    return { entryId, entryNumber };
  },
});
```

**Step 2: Test internal function**

Run in Convex dashboard:
```bash
npx convex run functions/journalEntries:createInternal \
  --prod \
  '{
    "businessId": "jd70c6tmk9t80eahkt679j4dhh810kej",
    "userId": "jd7012zxqq1fvksx2vqf85hcch810k31",
    "description": "Test internal creation",
    "lines": [
      {
        "accountId": "k173n64j95hwcqayjb7ayjy2wh810hpg",
        "accountCode": "5100",
        "accountName": "Cost of Goods Sold",
        "debitAmount": 50,
        "creditAmount": 0,
        "lineDescription": "Test debit"
      },
      {
        "accountId": "k172hpc1f55wrs3dfpzn8yf0qh810hr3",
        "accountCode": "1000",
        "accountName": "Cash",
        "debitAmount": 0,
        "creditAmount": 50,
        "lineDescription": "Test credit"
      }
    ],
    "sourceType": "manual"
  }'
```

Expected: Returns `{ entryId: "...", entryNumber: "JE-2026-00029" }`

**Step 3: Commit**

```bash
git add convex/functions/journalEntries.ts
git commit -m "feat(accounting): add internal journal entry creation function"
```

---

## Phase 2: Migrate Write Operations (18 Convex Functions)

### Task 2.1: Migrate expense claim approval to journal entries

**Files:**
- Modify: `convex/functions/expenseClaims.ts:1171`

**Step 1: Import journal entry helpers**

Add at top of `convex/functions/expenseClaims.ts`:

```typescript
import { createExpenseJournalEntry } from "../lib/journal-entry-helpers";
import { internal } from "../_generated/api";
```

**Step 2: Replace accounting_entries insert (line 1171)**

Find this code block (around line 1165-1185):

```typescript
// Create the accounting entry with line items
const accountingEntryId = await ctx.db.insert("accounting_entries", {
  businessId: claim.businessId,
  userId: claim.userId,
  transactionType: "Expense",
  description: claim.businessPurpose || claim.description || "Expense claim",
  originalAmount: claim.totalAmount,
  originalCurrency: claim.currency,
  ...
});
```

Replace with:

```typescript
// Get or create expense account (default to 5200 - Operating Expenses)
const expenseAccount = await ctx.db
  .query("chart_of_accounts")
  .withIndex("by_code", (q) =>
    q.eq("businessId", claim.businessId).eq("accountCode", "5200")
  )
  .first();

if (!expenseAccount) {
  throw new Error("Expense account 5200 not found. Please seed default accounts.");
}

// Get cash account
const cashAccount = await ctx.db
  .query("chart_of_accounts")
  .withIndex("by_code", (q) =>
    q.eq("businessId", claim.businessId).eq("accountCode", "1000")
  )
  .first();

if (!cashAccount) {
  throw new Error("Cash account 1000 not found. Please seed default accounts.");
}

// Create journal entry lines
const lines = createExpenseJournalEntry({
  amount: claim.totalAmount,
  expenseAccountId: expenseAccount._id,
  expenseAccountCode: expenseAccount.accountCode,
  expenseAccountName: expenseAccount.accountName,
  description: claim.businessPurpose || claim.description || "Expense claim",
  cashAccountId: cashAccount._id,
  cashAccountCode: cashAccount.accountCode,
  cashAccountName: cashAccount.accountName,
});

// Create journal entry
const { entryId: journalEntryId, entryNumber } = await ctx.runMutation(
  internal.functions.journalEntries.createInternal,
  {
    businessId: claim.businessId,
    userId: claim.userId,
    description: claim.businessPurpose || claim.description || "Expense claim",
    transactionDate: new Date(claim.expenseDate).toISOString().split("T")[0],
    lines,
    sourceType: "expense_claim",
    sourceId: claimId,
  }
);
```

**Step 3: Update expense claim with journal entry reference**

Replace the line that updates `accountingEntryId`:

```typescript
// BEFORE
await ctx.db.patch(claimId, {
  accountingEntryId,
  ...
});

// AFTER
await ctx.db.patch(claimId, {
  journalEntryId, // Use new field
  ...
});
```

**Step 4: Deploy and test**

```bash
npx convex deploy --yes
```

Test: Approve an expense claim in the UI and verify journal entry is created.

**Step 5: Commit**

```bash
git add convex/functions/expenseClaims.ts
git commit -m "feat(accounting): migrate expense claim approval to journal entries"
```

---

### Task 2.2: Migrate invoice posting to journal entries

**Files:**
- Modify: `convex/functions/invoices.ts:1069`

**Step 1: Import helpers**

Add at top of `convex/functions/invoices.ts`:

```typescript
import { createInvoiceJournalEntry } from "../lib/journal-entry-helpers";
import { internal } from "../_generated/api";
```

**Step 2: Replace accounting_entries insert (line 1069)**

Find:

```typescript
const accountingEntryId = await ctx.db.insert("accounting_entries", {
  businessId: invoice.businessId,
  userId: invoice.userId,
  vendorId: matchedVendor?._id,
  transactionType: "Expense",
  description,
  ...
});
```

Replace with:

```typescript
// Get expense account (default 5200)
const expenseAccount = await ctx.db
  .query("chart_of_accounts")
  .withIndex("by_code", (q) =>
    q.eq("businessId", invoice.businessId!).eq("accountCode", "5200")
  )
  .first();

if (!expenseAccount) {
  throw new Error("Expense account 5200 not found");
}

// Get AP account
const apAccount = await ctx.db
  .query("chart_of_accounts")
  .withIndex("by_code", (q) =>
    q.eq("businessId", invoice.businessId!).eq("accountCode", "2100")
  )
  .first();

if (!apAccount) {
  throw new Error("AP account 2100 not found");
}

// Create journal entry
const lines = createInvoiceJournalEntry({
  amount: invoice.totalAmount!,
  expenseAccountId: expenseAccount._id,
  expenseAccountCode: expenseAccount.accountCode,
  expenseAccountName: expenseAccount.accountName,
  description,
  apAccountId: apAccount._id,
  apAccountCode: apAccount.accountCode,
  apAccountName: apAccount.accountName,
});

const { entryId: journalEntryId } = await ctx.runMutation(
  internal.functions.journalEntries.createInternal,
  {
    businessId: invoice.businessId!,
    userId: invoice.userId!,
    description,
    transactionDate: invoice.invoiceDate || new Date().toISOString().split("T")[0],
    lines,
    sourceType: "vendor_invoice",
    sourceId: invoiceId,
  }
);
```

**Step 3: Update invoice with journal entry reference**

```typescript
await ctx.db.patch(invoiceId, {
  journalEntryId,
  accountingStatus: "posted",
});
```

**Step 4: Deploy and test**

```bash
npx convex deploy --yes
```

**Step 5: Commit**

```bash
git add convex/functions/invoices.ts
git commit -m "feat(accounting): migrate invoice posting to journal entries"
```

---

### Task 2.3: Migrate sales invoice creation to journal entries

**Files:**
- Modify: `convex/functions/salesInvoices.ts:618`

**Step 1: Import helpers**

```typescript
import { createSalesInvoiceJournalEntry } from "../lib/journal-entry-helpers";
import { internal } from "../_generated/api";
```

**Step 2: Replace accounting_entries insert (line 618)**

Find:

```typescript
const entryId = await ctx.db.insert("accounting_entries", {
  businessId: args.businessId,
  userId: user._id,
  transactionType: "Income",
  originalAmount: invoice.totalAmount,
  ...
});
```

Replace with:

```typescript
// Get revenue account
const revenueAccount = await ctx.db
  .query("chart_of_accounts")
  .withIndex("by_code", (q) =>
    q.eq("businessId", args.businessId).eq("accountCode", "4100")
  )
  .first();

if (!revenueAccount) {
  throw new Error("Revenue account 4100 not found");
}

// Get AR account
const arAccount = await ctx.db
  .query("chart_of_accounts")
  .withIndex("by_code", (q) =>
    q.eq("businessId", args.businessId).eq("accountCode", "1200")
  )
  .first();

if (!arAccount) {
  throw new Error("AR account 1200 not found");
}

// Create journal entry
const lines = createSalesInvoiceJournalEntry({
  amount: invoice.totalAmount,
  revenueAccountId: revenueAccount._id,
  revenueAccountCode: revenueAccount.accountCode,
  revenueAccountName: revenueAccount.accountName,
  description: `Sales invoice ${invoice.invoiceNumber}`,
  arAccountId: arAccount._id,
  arAccountCode: arAccount.accountCode,
  arAccountName: arAccount.accountName,
});

const { entryId: journalEntryId } = await ctx.runMutation(
  internal.functions.journalEntries.createInternal,
  {
    businessId: args.businessId,
    userId: user._id,
    description: `Sales invoice ${invoice.invoiceNumber}`,
    transactionDate: invoice.invoiceDate,
    lines,
    sourceType: "sales_invoice",
    sourceId: invoiceId,
  }
);

// Update invoice with journal entry reference
await ctx.db.patch(invoiceId, {
  journalEntryId,
});
```

**Step 3: Deploy and test**

```bash
npx convex deploy --yes
```

**Step 4: Commit**

```bash
git add convex/functions/salesInvoices.ts
git commit -m "feat(accounting): migrate sales invoice to journal entries"
```

---

### Task 2.4: Migrate remaining 15 write operations

**Files to update (same pattern as above):**
- `convex/functions/expenseSubmissions.ts:773`
- `convex/functions/payments.ts` (if has accounting_entries inserts)
- `convex/functions/reconciliationMatches.ts` (if has accounting_entries inserts)
- `convex/functions/poMatches.ts` (if has accounting_entries inserts)
- `convex/functions/exportJobs.ts` (if has accounting_entries inserts)
- `convex/functions/actionCenterJobs.ts` (if has accounting_entries inserts)
- Any other files with `db.insert("accounting_entries")`

**Pattern for each file:**
1. Import helpers and internal API
2. Replace `db.insert("accounting_entries")` with helper function + `createInternal` call
3. Update source record with `journalEntryId` instead of `accountingEntryId`
4. Deploy and test
5. Commit with descriptive message

**Batch commit after all files:**

```bash
git add convex/functions/*.ts
git commit -m "feat(accounting): complete migration of all write operations to journal entries"
```

---

## Phase 3: Migrate Read Operations (12 Frontend Files)

### Task 3.1: Update analytics queries to read from journal_entry_lines

**Files:**
- Modify: `convex/functions/analytics.ts`

**Step 1: Find accounting_entries queries**

Search for:
```typescript
ctx.db.query("accounting_entries")
```

**Step 2: Replace with journal_entry_lines queries**

**BEFORE (single-entry):**
```typescript
const entries = await ctx.db
  .query("accounting_entries")
  .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
  .collect();

const totalExpenses = entries
  .filter((e) => e.transactionType === "Expense")
  .reduce((sum, e) => sum + e.originalAmount, 0);
```

**AFTER (double-entry):**
```typescript
// Get all expense account lines
const expenseLines = await ctx.db
  .query("journal_entry_lines")
  .collect();

// Filter by business and expense accounts (5000-5999)
const businessExpenseLines = expenseLines.filter(async (line) => {
  const account = await ctx.db.get(line.accountId);
  return (
    account?.businessId === businessId &&
    account.accountCode >= "5000" &&
    account.accountCode < "6000" &&
    line.debitAmount > 0 // Expenses increase with debit
  );
});

const totalExpenses = businessExpenseLines.reduce(
  (sum, line) => sum + line.debitAmount,
  0
);
```

**Step 3: Deploy and test**

```bash
npx convex deploy --yes
```

Test: Check analytics dashboard shows correct expense totals

**Step 4: Commit**

```bash
git add convex/functions/analytics.ts
git commit -m "feat(accounting): migrate analytics queries to journal_entry_lines"
```

---

### Task 3.2: Update financial intelligence queries

**Files:**
- Modify: `convex/functions/financialIntelligence.ts`

**Follow same pattern as Task 3.1:**
- Replace `accounting_entries` queries with `journal_entry_lines` + account filters
- Use account code ranges to filter by type (Assets 1000-1999, Expenses 5000-5999, etc.)
- Sum `debitAmount` for expense/asset analysis, `creditAmount` for revenue/liability analysis

**Commit:**
```bash
git add convex/functions/financialIntelligence.ts
git commit -m "feat(accounting): migrate financial intelligence to journal_entry_lines"
```

---

### Task 3.3: Update AI tools to query journal entries

**Files:**
- Modify: `src/lib/ai/tools/get-invoices-tool.ts`

**Step 1: Replace accounting_entries with journal_entry_lines**

Find:
```typescript
const accountingEntries = await ctx.runQuery(api.functions.accountingEntries.list, {
  businessId,
});
```

Replace with:
```typescript
// Get journal entries with lines
const journalEntries = await ctx.runQuery(api.functions.journalEntries.list, {
  businessId,
  limit: 100,
});

// Extract financial data from journal entry lines
const expenseLines = journalEntries.flatMap((entry) =>
  entry.lines?.filter((line) =>
    line.accountCode >= "5000" &&
    line.accountCode < "6000" &&
    line.debitAmount > 0
  ) || []
);

const totalExpenses = expenseLines.reduce((sum, line) => sum + line.debitAmount, 0);
```

**Step 2: Deploy and test**

```bash
npm run build
```

Test: Use AI chat to query invoices, verify correct data returned

**Step 3: Commit**

```bash
git add src/lib/ai/tools/get-invoices-tool.ts
git commit -m "feat(accounting): migrate AI tools to query journal entries"
```

---

### Task 3.4: Update frontend hooks to use journal entries

**Files:**
- `src/domains/invoices/hooks/use-invoices-realtime.ts`
- `src/domains/payables/hooks/use-payment-recorder.ts`
- `src/domains/accounting-entries/components/bank-recon/match-candidates-sheet.tsx`
- `src/domains/expense-claims/lib/data-access.ts`

**Pattern for each file:**
1. Replace `api.functions.accountingEntries.list` with `api.functions.journalEntries.list`
2. Update data mapping to extract amounts from `lines` arrays
3. Filter lines by account code ranges for specific account types
4. Test UI to verify data displays correctly
5. Commit with descriptive message

**Batch commit:**
```bash
git add src/domains/*/hooks/*.ts src/domains/*/components/*.tsx src/domains/*/lib/*.ts
git commit -m "feat(accounting): migrate frontend hooks to journal entries API"
```

---

### Task 3.5: Update type definitions

**Files:**
- Modify: `src/types/database.types.ts`
- Modify: `src/domains/accounting-entries/types/index.ts`
- Modify: `src/domains/expense-claims/types/expense-claims.ts`

**Step 1: Add journal entry types**

In `src/types/database.types.ts`, add:

```typescript
export interface JournalEntry {
  _id: Id<"journal_entries">;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  entryNumber: string;
  transactionDate: string;
  description: string;
  status: "draft" | "posted" | "reversed" | "voided";
  totalDebit: number;
  totalCredit: number;
  sourceType?: "manual" | "sales_invoice" | "expense_claim" | "vendor_invoice" | "payment" | "bank_reconciliation";
  sourceId?: string;
  lines?: JournalEntryLine[];
  createdAt: number;
  updatedAt: number;
}

export interface JournalEntryLine {
  _id: Id<"journal_entry_lines">;
  journalEntryId: Id<"journal_entries">;
  accountId: Id<"chart_of_accounts">;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  lineDescription?: string;
  createdAt: number;
}
```

**Step 2: Mark old types as deprecated**

```typescript
/**
 * @deprecated Use JournalEntry instead - single-entry accounting_entries deprecated
 */
export interface AccountingEntry {
  // ... existing fields
}
```

**Step 3: Commit**

```bash
git add src/types/database.types.ts src/domains/*/types/*.ts
git commit -m "feat(accounting): add journal entry types and deprecate accounting_entry types"
```

---

## Phase 4: Schema Changes & Deprecation

### Task 4.1: Add schema migration fields

**Files:**
- Modify: `convex/schema.ts`

**Step 1: Mark accounting_entries table as deprecated**

Add comment above `accounting_entries` table definition:

```typescript
/**
 * @deprecated This table is deprecated and will be removed in a future version.
 * Use journal_entries + journal_entry_lines instead (double-entry bookkeeping).
 *
 * Migration status: All writes migrated (2026-03-14)
 * Next step: Verify all reads migrated, then drop table
 */
accounting_entries: defineTable({
  // ... existing schema
})
```

**Step 2: Add migration tracking field to invoices/expenses**

```typescript
invoices: defineTable({
  // ... existing fields
  accountingEntryId: v.optional(v.id("accounting_entries")), // DEPRECATED
  journalEntryId: v.optional(v.id("journal_entries")),       // NEW
})

expense_claims: defineTable({
  // ... existing fields
  accountingEntryId: v.optional(v.id("accounting_entries")), // DEPRECATED
  journalEntryId: v.optional(v.id("journal_entries")),       // NEW
})
```

**Step 3: Deploy schema**

```bash
npx convex deploy --yes
```

**Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(accounting): deprecate accounting_entries schema, add journalEntryId fields"
```

---

### Task 4.2: Create accounting_entries deprecation migration

**Files:**
- Create: `convex/migrations/deprecateAccountingEntries.ts`

**Step 1: Write migration to verify no new writes**

```typescript
import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Verify no new accounting_entries created after migration date
 */
export const verifyNoNewWrites = internalQuery({
  args: {
    migrationDate: v.string(), // "2026-03-14"
  },
  handler: async (ctx, args) => {
    const cutoffTimestamp = new Date(args.migrationDate).getTime();

    const newEntries = await ctx.db
      .query("accounting_entries")
      .filter((q) => q.gt(q.field("createdAt"), cutoffTimestamp))
      .collect();

    return {
      count: newEntries.length,
      entries: newEntries.slice(0, 5), // Show first 5 as examples
      message:
        newEntries.length === 0
          ? "✅ No new accounting_entries created after migration"
          : `⚠️ ${newEntries.length} accounting_entries created after migration - check for unmigrated code`,
    };
  },
});

/**
 * Count records that still reference accounting_entries
 */
export const countLegacyReferences = internalQuery({
  handler: async (ctx) => {
    const invoicesWithOldRef = await ctx.db
      .query("invoices")
      .filter((q) =>
        q.and(
          q.neq(q.field("accountingEntryId"), undefined),
          q.eq(q.field("journalEntryId"), undefined)
        )
      )
      .collect();

    const claimsWithOldRef = await ctx.db
      .query("expense_claims")
      .filter((q) =>
        q.and(
          q.neq(q.field("accountingEntryId"), undefined),
          q.eq(q.field("journalEntryId"), undefined)
        )
      )
      .collect();

    return {
      invoices: invoicesWithOldRef.length,
      expenseClaims: claimsWithOldRef.length,
      total: invoicesWithOldRef.length + claimsWithOldRef.length,
    };
  },
});
```

**Step 2: Run verification**

```bash
npx convex run migrations/deprecateAccountingEntries:verifyNoNewWrites \
  --prod \
  '{"migrationDate": "2026-03-14"}'
```

Expected: `{"count": 0, "message": "✅ No new accounting_entries created after migration"}`

```bash
npx convex run migrations/deprecateAccountingEntries:countLegacyReferences --prod
```

Expected: `{"invoices": 0, "expenseClaims": 0, "total": 0}` (after full migration)

**Step 3: Commit**

```bash
git add convex/migrations/deprecateAccountingEntries.ts
git commit -m "feat(accounting): add migration verification for accounting_entries deprecation"
```

---

### Task 4.3: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add migration notice**

Add new section after "Active Technologies":

```markdown
## Accounting System Architecture (2026-03-14 Migration)

**Current System:** Double-entry bookkeeping with `journal_entries` + `journal_entry_lines`

**Deprecated System:** Single-entry `accounting_entries` table (DO NOT USE for new code)

**Migration Status:**
- ✅ All write operations migrated (invoices, expenses, payments post to journal_entries)
- ✅ All read operations migrated (analytics, AI tools query journal_entry_lines)
- ✅ Schema updated with deprecation notices
- ⏳ Legacy data preserved for historical queries
- ⏳ Table drop scheduled for 2026-Q2 (after 90-day verification period)

**Creating New Accounting Entries:**

Use helper functions in `convex/lib/journal-entry-helpers.ts`:
- `createExpenseJournalEntry()` - Expense claims, bill payments
- `createInvoiceJournalEntry()` - Vendor invoices (AP)
- `createSalesInvoiceJournalEntry()` - Customer invoices (AR)
- `createPaymentJournalEntry()` - Payment recording

Then call `internal.functions.journalEntries.createInternal()` to persist.

**Querying Accounting Data:**

Query `journal_entry_lines` with account filters:
- Assets (1000-1999): `accountCode >= "1000" && accountCode < "2000"`
- Expenses (5000-5999): `accountCode >= "5000" && accountCode < "6000"`
- Revenue (4000-4999): `accountCode >= "4000" && accountCode < "5000"`

Use `debitAmount` for expenses/assets, `creditAmount` for revenue/liabilities.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add accounting system migration notice to CLAUDE.md"
```

---

## Phase 5: Testing & Verification

### Task 5.1: End-to-end integration test

**Files:**
- Create: `tests/integration/accounting-migration.test.ts`

**Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { ConvexTestingHelper } from "convex-test";
import { api } from "../convex/_generated/api";

describe("Accounting Migration Integration", () => {
  let t: ConvexTestingHelper;
  let businessId: string;
  let userId: string;

  beforeAll(async () => {
    t = new ConvexTestingHelper();
    // Setup test business and user
    businessId = await t.mutation(api.functions.businesses.create, {
      name: "Test Business",
    });
    userId = await t.mutation(api.functions.users.create, {
      clerkId: "test-user",
    });

    // Seed default accounts
    await t.mutation(api.functions.seedAccounting.seedDefaultAccountsInternal, {
      businessId,
      force: true,
    });
  });

  it("creates journal entry when expense claim approved", async () => {
    // Create expense claim
    const claimId = await t.mutation(api.functions.expenseClaims.create, {
      businessId,
      userId,
      totalAmount: 100,
      description: "Test expense",
    });

    // Approve claim (should create journal entry)
    await t.mutation(api.functions.expenseClaims.approve, {
      claimId,
    });

    // Verify journal entry created
    const entries = await t.query(api.functions.journalEntries.list, {
      businessId,
      limit: 10,
    });

    expect(entries.length).toBe(1);
    expect(entries[0].totalDebit).toBe(100);
    expect(entries[0].totalCredit).toBe(100);
    expect(entries[0].sourceType).toBe("expense_claim");
  });

  it("creates journal entry when sales invoice posted", async () => {
    const invoiceId = await t.mutation(api.functions.salesInvoices.create, {
      businessId,
      userId,
      totalAmount: 500,
      invoiceNumber: "INV-001",
    });

    const entries = await t.query(api.functions.journalEntries.list, {
      businessId,
      limit: 10,
    });

    const salesEntry = entries.find((e) => e.sourceType === "sales_invoice");
    expect(salesEntry).toBeDefined();
    expect(salesEntry!.totalDebit).toBe(500);
    expect(salesEntry!.totalCredit).toBe(500);
  });

  it("financial statements use journal entry data", async () => {
    const profitLoss = await t.query(api.functions.financialStatements.profitLoss, {
      businessId,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });

    // Should show revenue from sales invoice + expenses from claim
    expect(profitLoss.revenue.total).toBe(500);
    expect(profitLoss.expenses.total).toBe(100);
    expect(profitLoss.netProfit).toBe(400);
  });

  it("no new accounting_entries created after migration", async () => {
    const legacyEntries = await t.query(api.functions.accountingEntries.list, {
      businessId,
    });

    expect(legacyEntries.length).toBe(0);
  });
});
```

**Step 2: Run tests**

```bash
npm test -- tests/integration/accounting-migration.test.ts
```

Expected: ALL PASS

**Step 3: Commit**

```bash
git add tests/integration/accounting-migration.test.ts
git commit -m "test: add end-to-end integration tests for accounting migration"
```

---

### Task 5.2: UAT in production

**Test Scenarios:**

1. **Create expense claim** → Approve → Verify journal entry in `/accounting/journal-entries`
2. **Create sales invoice** → Verify journal entry created automatically
3. **Post vendor invoice** → Verify journal entry with AP credit
4. **Check analytics dashboard** → Verify expenses/revenue match journal entries
5. **Ask AI agent** "Show me all expenses this month" → Verify queries journal entries
6. **Export accounting records** → Verify export uses journal entry data

**Verification checklist:**
- [ ] All expenses create balanced journal entries (debit expense, credit cash/AP)
- [ ] All invoices create balanced journal entries (debit expense/AR, credit AP/revenue)
- [ ] Trial balance shows balanced books (total debits = total credits)
- [ ] Financial statements render correctly
- [ ] No errors in browser console or Convex logs
- [ ] `accounting_entries` table not growing (no new inserts)

**Document results in:**
`specs/001-accounting-double-entry/MIGRATION-UAT-RESULTS.md`

---

## Phase 6: Cleanup & Table Drop (After 90-Day Verification)

### Task 6.1: Schedule table drop (2026-06-15)

**Files:**
- Create: `convex/migrations/dropAccountingEntries.ts`

**Migration to drop old table:**

```typescript
import { internalMutation } from "../_generated/server";

/**
 * DROP accounting_entries table after 90-day verification period
 *
 * ⚠️ DESTRUCTIVE OPERATION - Cannot be undone
 *
 * Prerequisites:
 * 1. All code migrated to journal_entries (verified)
 * 2. No new accounting_entries created for 90 days (verified)
 * 3. Historical data exported to backup (verified)
 *
 * Run date: 2026-06-15 or later
 */
export const dropTable = internalMutation({
  handler: async (ctx) => {
    // Safety check: Verify no recent writes
    const recentEntries = await ctx.db
      .query("accounting_entries")
      .filter((q) => q.gt(q.field("createdAt"), Date.now() - 90 * 24 * 60 * 60 * 1000))
      .collect();

    if (recentEntries.length > 0) {
      throw new Error(
        `Cannot drop table: ${recentEntries.length} accounting_entries created in last 90 days`
      );
    }

    // Export final snapshot before drop
    const allEntries = await ctx.db.query("accounting_entries").collect();

    console.log(`Exporting ${allEntries.length} accounting_entries for archival`);
    // TODO: Store in S3 or export to file

    // Drop table (remove from schema.ts and deploy)
    console.log("Table drop complete. Remove from schema.ts and deploy.");

    return {
      status: "ready_to_drop",
      entriesCount: allEntries.length,
      message: "Remove accounting_entries from schema.ts and run 'npx convex deploy --yes'",
    };
  },
});
```

**Do NOT run until 2026-06-15** (90 days after migration)

---

## Summary

**Completion Checklist:**

- [ ] Phase 1: Helper functions created and tested
- [ ] Phase 2: All 18 write operations migrated (invoices, expenses, payments)
- [ ] Phase 3: All 12 read operations migrated (analytics, AI, frontend)
- [ ] Phase 4: Schema marked as deprecated, docs updated
- [ ] Phase 5: Integration tests pass, UAT verified in production
- [ ] Phase 6: (June 2026) Table drop after 90-day verification

**Files Modified:** 31 code files
**Lines Changed:** ~1,500 lines (estimate)
**Testing:** Unit tests + integration tests + UAT
**Deployment:** Incremental (deploy after each phase)
**Risk Mitigation:** 90-day verification period before table drop

---

**Next Action:** Execute this plan task-by-task using superpowers:executing-plans skill.
