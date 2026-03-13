# Developer Quickstart: Double-Entry Accounting Module

**Branch**: `001-accounting-double-entry` | **Date**: 2026-03-12
**Target Audience**: Developers implementing the accounting system

## Overview

This guide walks you through setting up, testing, and developing the double-entry accounting module locally.

**Prerequisites**:
- Node.js 20.x installed
- Convex CLI installed (`npm install -g convex`)
- `.env.local` configured with test accounts
- Git branch `001-accounting-double-entry` checked out

---

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
# From repository root
npm install

# Verify Convex CLI
npx convex --version
```

### 2. Start Development Servers

```bash
# Terminal 1: Convex dev server
npx convex dev

# Terminal 2: Next.js dev server
npm run dev
```

### 3. Deploy Accounting Schema

```bash
# Apply new tables to Convex
npx convex deploy --yes

# Verify tables created
npx convex data

# Should see:
# - chart_of_accounts
# - journal_entries
# - journal_entry_lines
# - accounting_periods
# - manual_exchange_rates
```

### 4. Seed Default Chart of Accounts

```bash
# Run seed mutation
npx convex run functions/seedAccounting:seedDefaultAccounts \
  --businessId "$(convex run functions/getFirstBusiness:run | jq -r '.businessId')"

# Verify 12 default accounts created
npx convex data chart_of_accounts --count
```

### 5. Open Accounting Module

```bash
# Navigate to accounting dashboard
open http://localhost:3000/en/accounting

# Or manually visit:
# http://localhost:3000/en/accounting
```

---

## Test Account Setup

Use these credentials from `.env.local`:

### Finance Admin (Full Access)

```bash
Email:    ${TEST_USER_ADMIN}
Password: ${TEST_USER_ADMIN_PW}
Role:     Finance Admin
Can:      Create entries, post entries, close periods, manage COA, view all reports
```

### Owner (View-Only)

```bash
Email:    ${TEST_USER_OWNER}
Password: ${TEST_USER_OWNER_PW}
Role:     Owner
Can:      View financial statements, view dashboard (read-only)
Cannot:   Create/edit entries, close periods, manage COA
```

### Manager (Blocked)

```bash
Email:    ${TEST_USER_MANAGER}
Password: ${TEST_USER_MANAGER_PW}
Role:     Manager
Can:      Nothing - blocked from accounting module
Expected: Redirected to homepage or shown permission error
```

---

## Development Workflow

### File Structure

```text
Repository structure for accounting module:

src/domains/accounting/
├── components/
│   ├── dashboard.tsx                    # Main landing page
│   ├── chart-of-accounts-manager.tsx    # COA CRUD
│   ├── journal-entry-form.tsx           # Manual entry wizard
│   ├── journal-entry-list.tsx           # Transaction list
│   ├── financial-statements/
│   │   ├── profit-loss-statement.tsx
│   │   ├── balance-sheet.tsx
│   │   ├── cash-flow-statement.tsx
│   │   └── trial-balance.tsx
│   ├── accounting-period-manager.tsx
│   └── currency-rate-manager.tsx
├── hooks/
│   ├── use-journal-entries.tsx
│   ├── use-chart-of-accounts.tsx
│   ├── use-financial-statements.tsx
│   └── use-accounting-periods.tsx
├── lib/
│   ├── double-entry-validator.ts
│   ├── journal-entry-builder.ts
│   └── statement-generators/
│       ├── profit-loss-generator.ts
│       ├── balance-sheet-generator.ts
│       ├── cash-flow-generator.ts
│       └── trial-balance-generator.ts
└── types/
    └── index.ts

convex/functions/
├── journalEntries.ts         # CRUD mutations + queries
├── chartOfAccounts.ts         # COA mutations + queries
├── accountingPeriods.ts       # Period management
├── manualExchangeRates.ts     # Manual rate CRUD
├── financialStatements.ts     # Statement generation
└── integrations/
    ├── arReconciliationIntegration.ts
    ├── expenseClaimIntegration.ts
    └── salesInvoiceIntegration.ts

src/app/[locale]/accounting/
├── page.tsx                   # Dashboard
├── chart-of-accounts/page.tsx
├── journal-entries/
│   ├── page.tsx               # List
│   ├── new/page.tsx           # Create
│   └── [id]/page.tsx          # Detail
├── reports/
│   ├── profit-loss/page.tsx
│   ├── balance-sheet/page.tsx
│   ├── cash-flow/page.tsx
│   └── trial-balance/page.tsx
└── settings/
    └── currency-rates/page.tsx
```

### Adding a New Mutation

**Example**: Create journal entry mutation

**Step 1**: Define mutation in `convex/functions/journalEntries.ts`

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    description: v.string(),
    transactionDate: v.string(),
    lines: v.array(v.object({
      accountCode: v.string(),
      debitAmount: v.number(),
      creditAmount: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    // 1. Validate balance
    const totalDebits = args.lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredits = args.lines.reduce((sum, l) => sum + l.creditAmount, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error(`Unbalanced entry: Debits=${totalDebits}, Credits=${totalCredits}`);
    }

    // 2. Create journal entry
    const entryId = await ctx.db.insert("journal_entries", {
      businessId: args.businessId,
      description: args.description,
      transactionDate: args.transactionDate,
      status: "draft",
      totalDebit: totalDebits,
      totalCredit: totalCredits,
      lineCount: args.lines.length,
      // ... other fields
    });

    // 3. Create lines
    for (const [index, line] of args.lines.entries()) {
      await ctx.db.insert("journal_entry_lines", {
        journalEntryId: entryId,
        lineOrder: index + 1,
        accountCode: line.accountCode,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        // ... other fields
      });
    }

    return entryId;
  },
});
```

**Step 2**: Create React hook in `src/domains/accounting/hooks/use-journal-entries.tsx`

```typescript
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useCreateJournalEntry() {
  const createEntry = useMutation(api.functions.journalEntries.create);

  return {
    createEntry,
    isLoading: createEntry.isPending,
  };
}
```

**Step 3**: Use in component `src/domains/accounting/components/journal-entry-form.tsx`

```typescript
import { useCreateJournalEntry } from "../hooks/use-journal-entries";

export function JournalEntryForm() {
  const { createEntry } = useCreateJournalEntry();

  const handleSubmit = async (data) => {
    try {
      const entryId = await createEntry({
        businessId: currentBusinessId,
        description: data.description,
        transactionDate: data.date,
        lines: data.lines,
      });

      toast.success("Journal entry created");
      router.push(`/en/accounting/journal-entries/${entryId}`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

---

## Testing Workflows

### Test 1: Manual Journal Entry Creation

**Goal**: Verify double-entry balance validation

```bash
# Login as Finance Admin
# Navigate to: http://localhost:3000/en/accounting/journal-entries/new

# Enter:
Description: "Test entry - Office rent payment"
Date: Today
Line 1: Debit - Rent Expense (5500) - $1000
Line 2: Credit - Cash (1000) - $1000

# Click "Create Entry"
# Expected: Entry created with status "draft"

# Try invalid:
Line 1: Debit - Rent (5500) - $1000
Line 2: Credit - Cash (1000) - $900

# Click "Create Entry"
# Expected: Error "Unbalanced entry: Debits=1000, Credits=900, Diff=100"
```

### Test 2: Financial Statement Generation

**Goal**: Verify P&L calculation performance (<5s)

```bash
# Login as Finance Admin or Owner
# Navigate to: http://localhost:3000/en/accounting/reports/profit-loss

# Select date range: Jan 1 - Dec 31, 2026
# Click "Generate Report"

# Measure time: Should load in <5 seconds
# Verify:
# - Revenue section shows income accounts (4xxx)
# - Expense section shows expense accounts (5xxx)
# - Net Profit = Revenue - Expenses
# - All amounts match journal entries
```

### Test 3: AR Reconciliation Integration

**Goal**: Verify journal entries created automatically

```bash
# Prerequisites:
# 1. Create sales invoice: $1000
# 2. Import platform statement: Order $950 (platform fee $50)
# 3. Match order to invoice in AR recon

# Action:
# Login as Finance Admin
# Navigate to: http://localhost:3000/en/sales-invoices/reconciliation
# Click "Close Period"

# Expected Results:
# 1. Sales order status: "matched" → "reconciled"
# 2. Sales invoice status: "pending" → "paid"
# 3. Three journal entries created:
#    - Entry 1: Dr. Platform Fees $50, Cr. AR $50
#    - Entry 2: Dr. Cash $950, Cr. AR $950
#    - (No variance entry because variance = $0)

# Verify in accounting:
# Navigate to: http://localhost:3000/en/accounting/journal-entries
# Filter by sourceType: "ar_reconciliation"
# Should see 2 new entries with today's date
```

### Test 4: Expense Approval Integration

**Goal**: Verify expense creates accounting entry

```bash
# Login as Manager (can approve expenses)
# Navigate to: http://localhost:3000/en/expense-claims
# Find pending claim: Travel expense $200
# Click "Approve"

# Expected Results:
# 1. Expense status: "submitted" → "approved"
# 2. One journal entry created:
#    - Dr. Travel Expense (5200) $200
#    - Cr. Accounts Payable (2100) $200

# Verify:
# Login as Finance Admin
# Navigate to: http://localhost:3000/en/accounting/journal-entries
# Filter by sourceType: "expense_claim"
# Should see new entry linked to expense claim
```

### Test 5: Period Close (Prevents Modifications)

**Goal**: Verify closed periods are immutable

```bash
# Login as Finance Admin
# Navigate to: http://localhost:3000/en/accounting/periods
# Select January 2026
# Click "Close Period"
# Confirm dialog

# Expected:
# - Period status: "open" → "closed"
# - All January journal entries: isPeriodLocked = true

# Try to edit January entry:
# Navigate to: http://localhost:3000/en/accounting/journal-entries/{januaryEntryId}
# Click "Edit"

# Expected: Error "Cannot modify entry in closed accounting period"
```

### Test 6: Manual Exchange Rate Override

**Goal**: Verify manual rates override API rates

```bash
# Login as Finance Admin
# Navigate to: http://localhost:3000/en/accounting/settings/currency-rates
# Click "Add Manual Rate"

# Enter:
From: USD
To: MYR
Rate: 4.70
Effective Date: Jan 1, 2026
Reason: "Bank Negara Malaysia official rate"

# Click "Save"

# Create multi-currency entry:
# Navigate to: http://localhost:3000/en/accounting/journal-entries/new
# Line 1: Debit - Cash (USD) $100
# Transaction Date: Jan 5, 2026

# Expected:
# - System uses manual rate 4.70 (not API rate 4.65)
# - Home currency amount: 100 * 4.70 = $470 MYR
# - Rate source: "manual"
```

---

## Performance Testing

### Load Test: 2000 Transactions/Month

```bash
# Generate test data
npx convex run functions/testData:generateJournalEntries \
  --businessId "abc123" \
  --count 2000 \
  --startDate "2026-01-01"

# Measure statement generation time
time curl "http://localhost:3000/api/v1/accounting/statements/profit-loss?dateFrom=2026-01-01&dateTo=2026-12-31"

# Expected: <5 seconds
```

### Dashboard Load Time

```bash
# Measure dashboard render time
# Open: http://localhost:3000/en/accounting
# Check browser DevTools > Network tab
# Total load time: <1 second (target)
```

---

## Debugging Tips

### Check Convex Logs

```bash
# Real-time logs
npx convex logs --watch

# Filter by function
npx convex logs --watch | grep journalEntries
```

### Inspect Database

```bash
# List all journal entries
npx convex data journal_entries --limit 10

# Query specific entry
npx convex run functions/journalEntries:getById --entryId "abc123"

# Check balance of all entries
npx convex run functions/validation:checkAllBalances
```

### Test Balance Validation

```bash
# Run validation check
npx convex run functions/validation:validateAllJournalEntries

# Expected output:
# {
#   total: 150,
#   balanced: 150,
#   unbalanced: 0,
#   errors: []
# }
```

---

## Common Errors & Solutions

### Error: "Unbalanced entry"

**Cause**: `SUM(debits) ≠ SUM(credits)`
**Solution**: Check line amounts, ensure rounding to 2 decimals

```typescript
// Fix: Round to 2 decimals
const debitAmount = Math.round(rawAmount * 100) / 100;
```

### Error: "Cannot modify entry in closed period"

**Cause**: Trying to edit entry in closed accounting period
**Solution**: Reopen period or create reversing entry

```bash
# Reopen period (admin only)
npx convex run functions/accountingPeriods:reopen --periodId "abc123"
```

### Error: "Account code not found"

**Cause**: Account doesn't exist in chart_of_accounts
**Solution**: Create account first or use existing code

```bash
# List valid account codes
npx convex run functions/chartOfAccounts:listByCodes --businessId "abc123"
```

---

## UAT Test Checklist

Before marking implementation complete, verify all user stories:

- [ ] **User Story 1**: Finance Admin generates P&L, Balance Sheet, Trial Balance, Cash Flow
- [ ] **User Story 2**: User records sales transaction, creates balanced entry
- [ ] **User Story 3**: Finance Admin adds custom account to COA
- [ ] **User Story 4**: AR recon close creates journal entries automatically
- [ ] **User Story 5**: Non-accountant Owner views dashboard with simplified language

**Performance Targets**:
- [ ] Dashboard loads in <1 second
- [ ] P&L generates in <5 seconds (2000 transactions)
- [ ] Balance Sheet generates in <5 seconds
- [ ] Cash Flow generates in <5 seconds
- [ ] Trial Balance generates in <5 seconds

**RBAC Tests**:
- [ ] Finance Admin can create/edit entries, close periods, manage COA
- [ ] Owner can view reports but cannot edit
- [ ] Manager/Employee are blocked from accounting module

---

## Migration Testing

### Test Migration Script

```bash
# Run migration on test data
npx convex run migrations/migrateAccountingEntries:run \
  --businessId "test-business-123" \
  --dryRun true

# Review migration report
npx convex data migration_reports --limit 1 --order desc

# Expected output:
# {
#   totalRecords: 1000,
#   migratedCount: 950,
#   errorCount: 50,
#   successRate: "95%",
#   skippedRecords: [...]
# }

# If satisfied, run actual migration
npx convex run migrations/migrateAccountingEntries:run \
  --businessId "test-business-123" \
  --dryRun false
```

---

## Production Deployment

### Pre-Deploy Checklist

- [ ] All tests passing (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Convex schema deployed to prod (`npx convex deploy --prod --yes`)
- [ ] Migration script tested on staging data
- [ ] Performance benchmarks met (<5s statements, <1s dashboard)
- [ ] RBAC verified (Finance Admin, Owner, Manager/Employee)

### Deploy Steps

```bash
# 1. Deploy Convex backend (schema + functions)
npx convex deploy --prod --yes

# 2. Build Next.js app
npm run build

# 3. Deploy to Vercel (auto-deploy on main branch)
git push origin 001-accounting-double-entry

# 4. Run migration (after deployment)
npx convex run --prod migrations/migrateAccountingEntries:run \
  --businessId "<production-business-id>"

# 5. Verify production
open https://finance.hellogroot.com/en/accounting
```

---

## Support & Resources

- **Spec**: `specs/001-accounting-double-entry/spec.md`
- **Data Model**: `specs/001-accounting-double-entry/data-model.md`
- **API Docs**: `specs/001-accounting-double-entry/contracts/api-endpoints.yaml`
- **Integration Hooks**: `specs/001-accounting-double-entry/contracts/integration-hooks.md`
- **Research**: `specs/001-accounting-double-entry/research.md`

**Questions?** Contact development team or refer to CLAUDE.md for project-wide guidelines.

---

**Quick

Start Status**: ✅ Ready for development
**Estimated Setup Time**: 5 minutes
**Estimated Feature Completion**: 8-10 days
