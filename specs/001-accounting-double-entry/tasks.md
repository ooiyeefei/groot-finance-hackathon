# Task Breakdown: Double-Entry Accounting System

**Branch**: `001-accounting-double-entry` | **Date**: 2026-03-12
**Status**: Ready for implementation
**Source**: [plan.md](./plan.md), [data-model.md](./data-model.md)

## Task Organization

Tasks are organized in **dependency order** - complete Phase N before starting Phase N+1.
Each phase can have tasks executed in parallel where indicated.

**Estimated Duration**: 8-10 days
**Complexity**: High (financial compliance, data migration, multi-module integration)

---

## Phase 1: Database Schema & Core Infrastructure (Days 1-2)

### 1.1 ✅ Create Convex Schema Definitions

**Status**: ✅ Completed (contracts generated)
**Duration**: 2 hours
**Dependencies**: None
**Files**:
- `specs/001-accounting-double-entry/contracts/convex-schema.ts` (spec ready)
- `convex/schema.ts` (needs import)

**Tasks**:
- [x] Define `chart_of_accounts` table with 4 indexes
- [x] Define `journal_entries` table with 5 indexes
- [x] Define `journal_entry_lines` table with 5 indexes
- [x] Define `accounting_periods` table with 3 indexes
- [x] Define `manual_exchange_rates` table with 3 indexes
- [x] Define `migration_reports` table with 1 index
- [x] Add validation helper functions

**Implementation**:
```typescript
// convex/schema.ts
import { accountingSchema } from "../specs/001-accounting-double-entry/contracts/convex-schema";

export default defineSchema({
  // ... existing tables
  ...accountingSchema,
});
```

**Verification**:
```bash
npx convex deploy --yes
npx convex data  # Verify new tables exist
```

---

### 1.2 Create Validation Library

**Duration**: 3 hours
**Dependencies**: 1.1
**Files**:
- `convex/lib/validation.ts` (new)

**Tasks**:
- [ ] Implement `validateBalance(lines)` - ensures debits = credits ±0.01
- [ ] Implement `validateLine(line)` - ensures debit XOR credit
- [ ] Implement `validateAccountCode(code, type)` - ensures code in correct range
- [ ] Implement `calculateFiscalPeriod(date)` - converts date to fiscal period
- [ ] Implement `generateEntryNumber(year, seq)` - generates JE-YYYY-NNNNN
- [ ] Add unit tests for all validation functions

**Acceptance Criteria**:
- `validateBalance()` throws error if difference > 0.01
- `validateLine()` throws error if both debit and credit are non-zero
- All validation functions have unit tests

---

### 1.3 Seed Default Chart of Accounts

**Duration**: 2 hours
**Dependencies**: 1.1
**Files**:
- `convex/functions/seedAccounting.ts` (new)

**Tasks**:
- [ ] Create mutation `seedDefaultAccounts(businessId)`
- [ ] Insert 12 default accounts (see data-model.md):
  - 1000 - Cash
  - 1200 - Accounts Receivable
  - 1500 - Inventory
  - 2100 - Accounts Payable
  - 2200 - Sales Tax Payable
  - 3000 - Owner's Equity
  - 3100 - Retained Earnings
  - 4100 - Sales Revenue
  - 4900 - Other Income
  - 5100 - Cost of Goods Sold
  - 5200 - Operating Expenses
  - 5900 - Other Expenses
- [ ] Mark all as `isSystemAccount = true`
- [ ] Run seed for test business

**Verification**:
```bash
npx convex run functions/seedAccounting:seedDefaultAccounts --businessId "test-id"
npx convex data chart_of_accounts --count  # Should show 12
```

---

## Phase 2: Backend Mutations & Queries (Days 3-4)

### 2.1 Chart of Accounts CRUD

**Duration**: 4 hours
**Dependencies**: 1.1, 1.2
**Files**:
- `convex/functions/chartOfAccounts.ts` (new)

**Tasks**:
- [ ] `create(accountCode, accountName, accountType, ...)` mutation
- [ ] `update(accountId, updates)` mutation
- [ ] `deactivate(accountId)` mutation (soft delete)
- [ ] `list(businessId, filters)` query with indexes
- [ ] `getByCode(businessId, accountCode)` query
- [ ] Add validation: unique accountCode per business
- [ ] Add validation: system accounts cannot be deactivated

**Test Cases**:
- [ ] Create account with valid code (1000-5999)
- [ ] Reject duplicate account code
- [ ] Reject invalid code range for type (e.g., Revenue with code 1000)
- [ ] Deactivate non-system account successfully
- [ ] Reject deactivation of system account (1000, 1200, etc.)

---

### 2.2 Journal Entries CRUD

**Duration**: 6 hours
**Dependencies**: 2.1, 1.2
**Files**:
- `convex/functions/journalEntries.ts` (new)

**Tasks**:
- [ ] `create(entry, lines[])` mutation with balance validation
- [ ] `post(entryId)` mutation - changes status from draft to posted
- [ ] `reverse(entryId, reason, reversalDate)` mutation
- [ ] `list(businessId, filters, pagination)` query
- [ ] `getById(entryId)` query with lines
- [ ] `getBySource(sourceType, sourceId)` query
- [ ] Generate `entryNumber` sequentially (JE-2026-00001)
- [ ] Calculate `fiscalPeriod` from transaction date
- [ ] Prevent modification if `isPeriodLocked = true`

**Balance Validation**:
```typescript
// Before inserting
const { totalDebits, totalCredits, balanced } = validateBalance(lines);
if (!balanced) {
  throw new ConvexError({
    code: "UNBALANCED_ENTRY",
    message: `Debits=${totalDebits}, Credits=${totalCredits}`,
  });
}
```

**Test Cases**:
- [ ] Create balanced entry (2 lines: Dr. $100, Cr. $100)
- [ ] Reject unbalanced entry (Dr. $100, Cr. $90)
- [ ] Post entry successfully (draft → posted)
- [ ] Reverse entry creates mirror entry with flipped debits/credits
- [ ] Reject modification of posted entry
- [ ] Reject modification of entry in closed period

---

### 2.3 Financial Statements Generators

**Duration**: 8 hours
**Dependencies**: 2.2
**Files**:
- `convex/lib/statement-generators/profit-loss-generator.ts` (new)
- `convex/lib/statement-generators/balance-sheet-generator.ts` (new)
- `convex/lib/statement-generators/cash-flow-generator.ts` (new)
- `convex/lib/statement-generators/trial-balance-generator.ts` (new)
- `convex/functions/financialStatements.ts` (new)

**Tasks**:

**Profit & Loss**:
- [ ] Query all journal_entry_lines for date range
- [ ] Filter by accountType = Revenue or Expense
- [ ] Group by accountCode, sum debits and credits
- [ ] Calculate net for each account (credit - debit for Revenue, debit - credit for Expense)
- [ ] Calculate Net Profit = Total Revenue - Total Expenses
- [ ] Return nested structure: { revenue: { categories: [], total }, expenses: { categories: [], total }, netProfit }

**Balance Sheet**:
- [ ] Query all journal_entry_lines up to asOfDate
- [ ] Filter by accountType = Asset, Liability, or Equity
- [ ] Group by accountType and accountCode
- [ ] Calculate running balance for each account
- [ ] Calculate totals: Assets, Liabilities, Equity
- [ ] Verify equation: Assets = Liabilities + Equity
- [ ] Return nested structure with current vs non-current classification

**Cash Flow (Indirect Method)**:
- [ ] Start with Net Income from P&L
- [ ] Calculate changes in working capital (AR, AP, Inventory)
- [ ] Adjust for non-cash items (depreciation if implemented)
- [ ] Calculate Operating Activities cash flow
- [ ] Calculate Investing Activities (capital expenditures)
- [ ] Calculate Financing Activities (loans, equity)
- [ ] Return three sections with totals

**Trial Balance**:
- [ ] Query all accounts from chart_of_accounts (isActive = true)
- [ ] For each account, sum journal_entry_lines debits and credits
- [ ] Calculate balance (debit - credit or credit - debit based on normalBalance)
- [ ] Return list of accounts with debit/credit balances
- [ ] Verify SUM(debit balances) = SUM(credit balances)

**Performance Target**: <5 seconds for 24k annual entries
**Test Data**: Generate 2000 transactions/month (24k annual) and verify timing

---

### 2.4 Accounting Periods Management

**Duration**: 3 hours
**Dependencies**: 2.2
**Files**:
- `convex/functions/accountingPeriods.ts` (new)

**Tasks**:
- [ ] `create(businessId, periodCode, startDate, endDate)` mutation
- [ ] `close(periodId, closingNotes)` mutation
- [ ] `list(businessId, fiscalYear)` query
- [ ] `getCurrentPeriod(businessId, date)` query
- [ ] Validate no overlapping periods
- [ ] Lock all journal_entries in period when closing (set `isPeriodLocked = true`)
- [ ] Calculate period statistics (journalEntryCount, totalDebits, totalCredits)
- [ ] Verify balance before closing (totalDebits = totalCredits)

**Test Cases**:
- [ ] Create monthly period (Jan 1 - Jan 31)
- [ ] Reject overlapping period (Jan 15 - Feb 15)
- [ ] Close period successfully
- [ ] Reject modification of entry in closed period
- [ ] Prevent closing if unbalanced entries exist

---

### 2.5 Manual Exchange Rates

**Duration**: 2 hours
**Dependencies**: 2.1
**Files**:
- `convex/functions/manualExchangeRates.ts` (new)
- `src/lib/services/currency-service.ts` (extend existing)

**Tasks**:
- [ ] `create(businessId, fromCurrency, toCurrency, rate, effectiveDate, reason)` mutation
- [ ] `update(rateId, updates)` mutation
- [ ] `delete(rateId)` mutation
- [ ] `list(businessId)` query
- [ ] `getRate(businessId, from, to, date)` query - finds most recent rate before date
- [ ] Extend `CurrencyService.getCurrentRate()` to check manual rates first
- [ ] Add rate resolution priority: manual → API → fallback

**Verification**:
```typescript
// Test rate resolution priority
const rate = await currencyService.getCurrentRate("USD", "MYR", {
  businessId: "test",
  transactionDate: "2026-01-15",
});
// Should use manual rate if exists for date >= 2026-01-15
```

---

## Phase 3: Integration Hooks (Days 5-6)

### 3.1 AR Reconciliation Integration

**Duration**: 4 hours
**Dependencies**: 2.2
**Files**:
- `convex/functions/integrations/arReconciliationIntegration.ts` (new)
- `convex/functions/salesOrders.ts` (modify existing)

**Tasks**:
- [ ] Create `createJournalEntriesFromReconciliation(periodId)` internal mutation
- [ ] For each matched order in period:
  - [ ] Entry 1: Dr. Platform Fees Expense (5800), Cr. AR (1200)
  - [ ] Entry 2: Dr. Cash (1000), Cr. AR (1200)
  - [ ] Entry 3 (if variance > 10%): Dr/Cr. AR Variance
- [ ] Update sales_orders.status = "reconciled"
- [ ] Update sales_invoices.status = "paid"
- [ ] Link journal entries: sales_orders.journalEntryIds = []
- [ ] Modify `closePeriod()` mutation to call integration function

**Integration Point**:
```typescript
// In convex/functions/salesOrders.ts
export const closePeriod = mutation({
  handler: async (ctx, { periodId }) => {
    // ... existing logic

    // Call accounting integration
    await ctx.runMutation(internal.integrations.arReconciliationIntegration.create, {
      periodId,
    });

    // ... update period status
  },
});
```

**Test Cases**:
- [ ] Close period with 1 matched order → 2 journal entries created
- [ ] Close period with order having 12% variance → 3 entries created
- [ ] Verify sales_order.status = "reconciled"
- [ ] Verify sales_invoice.status = "paid"
- [ ] Verify all entries balance

---

### 3.2 Expense Claims Integration

**Duration**: 3 hours
**Dependencies**: 2.2
**Files**:
- `convex/functions/integrations/expenseClaimIntegration.ts` (new)
- `convex/functions/expenseClaims.ts` (modify existing lines 1171-1195)

**Tasks**:
- [ ] Create `createJournalEntryFromExpenseClaim(claimId, status)` internal mutation
- [ ] For status = "approved":
  - [ ] Entry: Dr. Expense (5xxx from category), Cr. AP (2100)
- [ ] For status = "reimbursed":
  - [ ] Entry: Dr. AP (2100), Cr. Cash (1000)
- [ ] Link journal entry: expense_claims.accountingEntryId
- [ ] Modify `updateExpenseClaim()` at lines 1171-1195 to use new journal entries instead of old accounting_entries

**Existing Code Replacement**:
```typescript
// OLD (lines 1171-1195):
const accountingEntry = await createAccountingEntryFromExpenseClaim(ctx, {
  claim: existingClaim,
  status: 'pending',
});

// NEW:
const journalEntry = await ctx.runMutation(
  internal.integrations.expenseClaimIntegration.create,
  { claimId: claim._id, status: 'approved' }
);
```

**Test Cases**:
- [ ] Approve expense claim → 1 journal entry created (Dr. Expense, Cr. AP)
- [ ] Reimburse expense → 1 journal entry created (Dr. AP, Cr. Cash)
- [ ] Verify expense_claims.accountingEntryId links to journal entry
- [ ] Verify entries balance

---

### 3.3 Sales Invoices Integration

**Duration**: 3 hours
**Dependencies**: 2.2
**Files**:
- `convex/functions/integrations/salesInvoiceIntegration.ts` (new)
- `convex/functions/salesInvoices.ts` (modify existing)

**Tasks**:
- [ ] Create `createJournalEntryFromInvoice(invoiceId, event)` internal mutation
- [ ] For event = "invoice_created":
  - [ ] Entry: Dr. AR (1200), Cr. Revenue (4100), Cr. Tax Payable (2200 if tax)
- [ ] For event = "invoice_paid":
  - [ ] Entry: Dr. Cash (1000), Cr. AR (1200)
- [ ] Link journal entries: sales_invoices.journalEntryId, sales_invoices.paymentJournalEntryId
- [ ] Modify `createInvoice()` to call integration
- [ ] Modify `updateInvoiceStatus(status='paid')` to call integration

**Test Cases**:
- [ ] Create invoice → 1 journal entry (Dr. AR, Cr. Revenue)
- [ ] Mark invoice paid → 1 journal entry (Dr. Cash, Cr. AR)
- [ ] Verify entries balance
- [ ] Verify links to invoice

---

## Phase 4: Frontend Components (Days 7-8)

### 4.1 Dashboard

**Duration**: 4 hours
**Dependencies**: 2.3
**Files**:
- `src/domains/accounting/components/dashboard.tsx` (new)
- `src/domains/accounting/hooks/use-dashboard-metrics.tsx` (new)
- `src/app/[locale]/accounting/page.tsx` (new)

**Tasks**:
- [ ] Display key metrics cards:
  - [ ] Current month revenue
  - [ ] Current month expenses
  - [ ] Net profit/loss
  - [ ] Cash balance
  - [ ] Accounts receivable balance
  - [ ] Accounts payable balance
- [ ] Revenue vs Expenses line chart (last 6 months)
- [ ] Expense breakdown pie chart
- [ ] Quick action buttons: Record Sale, Record Expense, View P&L, View Balance Sheet
- [ ] Use React Query with 1-minute cache for metrics
- [ ] Target load time: <1 second

**UI Pattern**:
```typescript
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card className="bg-card border-border">
    <CardHeader>
      <CardTitle className="text-sm text-muted-foreground">Revenue (This Month)</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-foreground">{formatCurrency(revenue, 'MYR')}</div>
      <p className="text-xs text-green-600">+12% from last month</p>
    </CardContent>
  </Card>
</div>
```

---

### 4.2 Chart of Accounts Manager

**Duration**: 3 hours
**Dependencies**: 2.1
**Files**:
- `src/domains/accounting/components/chart-of-accounts-manager.tsx` (new)
- `src/domains/accounting/hooks/use-chart-of-accounts.tsx` (new)
- `src/app/[locale]/accounting/chart-of-accounts/page.tsx` (new)

**Tasks**:
- [ ] List all accounts grouped by type (Asset, Liability, Equity, Revenue, Expense)
- [ ] Create account dialog with validation
- [ ] Edit account dialog (inline or modal)
- [ ] Deactivate account button (soft delete)
- [ ] Filter by active/inactive status
- [ ] Display hierarchical structure (parent-child accounts)

**RBAC**:
- Finance Admin: Full access (create, edit, deactivate)
- Owner: View only
- Manager/Employee: Blocked

---

### 4.3 Journal Entry Form

**Duration**: 5 hours
**Dependencies**: 2.2, 4.2
**Files**:
- `src/domains/accounting/components/journal-entry-form.tsx` (new)
- `src/domains/accounting/hooks/use-journal-entries.tsx` (new)
- `src/app/[locale]/accounting/journal-entries/new/page.tsx` (new)

**Tasks**:
- [ ] Multi-line entry form (add/remove lines dynamically)
- [ ] Account picker dropdown (searchable)
- [ ] Debit/Credit column toggle (only one can be filled per line)
- [ ] Real-time balance calculation (show running total)
- [ ] Balance indicator (green checkmark if balanced, red X if not)
- [ ] Save as draft button
- [ ] Post entry button (only enabled if balanced)
- [ ] Validation: prevent posting unbalanced entry
- [ ] Pre-fill common templates (optional dropdown):
  - Sales invoice
  - Expense payment
  - Bank deposit

**UI Pattern**:
```typescript
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Account</TableHead>
      <TableHead>Debit</TableHead>
      <TableHead>Credit</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {lines.map((line, index) => (
      <TableRow key={index}>
        <TableCell>
          <Select value={line.accountCode} onChange={...}>
            <SelectItem value="1000">1000 - Cash</SelectItem>
            <SelectItem value="4100">4100 - Sales Revenue</SelectItem>
          </Select>
        </TableCell>
        <TableCell>
          <Input type="number" value={line.debitAmount} disabled={line.creditAmount > 0} />
        </TableCell>
        <TableCell>
          <Input type="number" value={line.creditAmount} disabled={line.debitAmount > 0} />
        </TableCell>
        <TableCell>
          <Button onClick={() => removeLine(index)}>Remove</Button>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>

<div className="flex items-center gap-2">
  <span>Total Debits: ${totalDebits}</span>
  <span>Total Credits: ${totalCredits}</span>
  {balanced ? <CheckCircle className="text-green-600" /> : <XCircle className="text-red-600" />}
</div>
```

---

### 4.4 Journal Entry List

**Duration**: 3 hours
**Dependencies**: 2.2
**Files**:
- `src/domains/accounting/components/journal-entry-list.tsx` (new)
- `src/app/[locale]/accounting/journal-entries/page.tsx` (new)

**Tasks**:
- [ ] Paginated table (50 entries per page)
- [ ] Filters: status, sourceType, date range
- [ ] Sort by: transaction date, entry number, amount
- [ ] Click row to view detail
- [ ] Status badge colors: draft (blue), posted (green), reversed (gray)
- [ ] Quick actions: View, Reverse (if posted)

---

### 4.5 Financial Statement Views

**Duration**: 6 hours
**Dependencies**: 2.3
**Files**:
- `src/domains/accounting/components/financial-statements/profit-loss-statement.tsx` (new)
- `src/domains/accounting/components/financial-statements/balance-sheet.tsx` (new)
- `src/domains/accounting/components/financial-statements/cash-flow-statement.tsx` (new)
- `src/domains/accounting/components/financial-statements/trial-balance.tsx` (new)
- `src/app/[locale]/accounting/reports/profit-loss/page.tsx` (new)
- `src/app/[locale]/accounting/reports/balance-sheet/page.tsx` (new)
- `src/app/[locale]/accounting/reports/cash-flow/page.tsx` (new)
- `src/app/[locale]/accounting/reports/trial-balance/page.tsx` (new)

**Tasks**:

**Profit & Loss**:
- [ ] Date range picker (from/to)
- [ ] Display revenue section (grouped by category)
- [ ] Display expense section (grouped by category)
- [ ] Calculate and display net profit/loss
- [ ] Export to Excel/PDF button
- [ ] Print view

**Balance Sheet**:
- [ ] As-of-date picker
- [ ] Display assets section (current + non-current)
- [ ] Display liabilities section (current + non-current)
- [ ] Display equity section
- [ ] Show equation: Assets = Liabilities + Equity
- [ ] Verify balanced indicator

**Cash Flow Statement**:
- [ ] Date range picker
- [ ] Display operating activities section
- [ ] Display investing activities section
- [ ] Display financing activities section
- [ ] Calculate net cash flow
- [ ] Reconcile to net income

**Trial Balance**:
- [ ] As-of-date picker
- [ ] Table: Account Code | Account Name | Debit Balance | Credit Balance
- [ ] Display totals row
- [ ] Verify balanced (total debits = total credits)

---

### 4.6 Accounting Period Manager

**Duration**: 2 hours
**Dependencies**: 2.4
**Files**:
- `src/domains/accounting/components/accounting-period-manager.tsx` (new)
- `src/app/[locale]/accounting/periods/page.tsx` (new)

**Tasks**:
- [ ] List periods by fiscal year
- [ ] Status badge: open (green), closed (gray)
- [ ] Close period button (Finance Admin only)
- [ ] Confirmation dialog with warnings:
  - "This will lock all transactions in January 2026. You cannot undo this action."
- [ ] Display period statistics: entry count, total debits, total credits

---

### 4.7 Manual Exchange Rate Manager

**Duration**: 2 hours
**Dependencies**: 2.5
**Files**:
- `src/domains/accounting/components/currency-rate-manager.tsx` (new)
- `src/app/[locale]/accounting/settings/currency-rates/page.tsx` (new)

**Tasks**:
- [ ] List all manual rates for business
- [ ] Create rate dialog: from/to currency, rate, effective date, reason
- [ ] Edit rate dialog
- [ ] Delete rate button
- [ ] Display rate source indicator (manual vs API vs fallback)

---

### 4.8 Simplified Mode Toggle

**Duration**: 2 hours
**Dependencies**: 4.1, 4.3
**Files**:
- `src/domains/accounting/components/simplified-mode-toggle.tsx` (new)
- `src/domains/accounting/lib/simplified-language.ts` (new)

**Tasks**:
- [ ] Toggle switch: "Simplified Language" (default) vs "Accountant Mode"
- [ ] Store preference in local storage
- [ ] Replace terminology when simplified:
  - "Money In" instead of "Revenue"
  - "Money Out" instead of "Expense"
  - "Money Owed to Us" instead of "Accounts Receivable"
  - "Money We Owe" instead of "Accounts Payable"
- [ ] Apply to dashboard, journal entry form, financial statements

---

## Phase 5: Data Migration (Day 9)

### 5.1 Migration Script

**Duration**: 4 hours
**Dependencies**: 2.2, 2.1
**Files**:
- `convex/migrations/migrateAccountingEntries.ts` (new)

**Tasks**:
- [ ] Fetch all accounting_entries WHERE deleted_at IS NULL
- [ ] For each record:
  - [ ] Validate required fields (amount, type, date, businessId, userId)
  - [ ] Map transactionType → GL accounts (Income→4xxx, Expense→5xxx)
  - [ ] Create journal entry with 2 lines (debit + credit)
  - [ ] If status='paid', create second entry for payment
  - [ ] Validate entry balances
  - [ ] If validation fails, skip and log
- [ ] Generate migration report:
  - [ ] totalRecords, migratedCount, errorCount, successRate
  - [ ] skippedRecords array with reasons
- [ ] Store report in `migration_reports` table
- [ ] Mark entries as `sourceType = 'migrated'`

**Category Mapping**:
```typescript
const categoryToAccount = {
  // Revenue
  "Sales": "4100",
  "Service Revenue": "4200",
  "Interest Income": "4900",

  // Expense
  "Office Supplies": "5100",
  "Travel": "5200",
  "Marketing": "5300",
  "Salary": "5400",
  "Rent": "5500",
  "Utilities": "5600",

  // Fallback
  "Uncategorized Income": "4999",
  "Uncategorized Expense": "5999",
};
```

**Test Cases**:
- [ ] Migrate 100 valid records → 100 journal entries
- [ ] Migrate 10 records with missing amount → skip 10, log errors
- [ ] Migrate 5 records with status='paid' → create 10 entries (invoice + payment)
- [ ] Generate migration report with 90% success rate

---

### 5.2 Migration Report UI

**Duration**: 2 hours
**Dependencies**: 5.1
**Files**:
- `src/domains/accounting/components/migration-report-viewer.tsx` (new)
- `src/app/[locale]/accounting/migration/report/page.tsx` (new)

**Tasks**:
- [ ] Display migration summary: total, migrated, errors, success rate
- [ ] Table of skipped records: ID, Date, Amount, Category, Reason
- [ ] Download report as CSV button
- [ ] "Review and Fix" links to edit form (manual entry)

---

## Phase 6: UAT Testing & Performance Validation (Day 10)

### 6.1 Role-Based Access Control Testing

**Duration**: 2 hours
**Dependencies**: All Phase 4 tasks
**Test Accounts**: `.env.local` (TEST_USER_ADMIN, TEST_USER_OWNER, TEST_USER_MANAGER)

**Test Cases**:
- [ ] Finance Admin can create journal entries
- [ ] Finance Admin can close accounting periods
- [ ] Finance Admin can manage chart of accounts
- [ ] Finance Admin can add manual exchange rates
- [ ] Owner can view dashboard (read-only)
- [ ] Owner can view financial statements (read-only)
- [ ] Owner cannot create/edit entries
- [ ] Owner cannot close periods
- [ ] Manager is blocked from /en/accounting (redirect or 403 error)
- [ ] Employee is blocked from /en/accounting

---

### 6.2 User Story Validation

**Duration**: 3 hours
**Dependencies**: All Phase 4 tasks

**User Story 1: View Accurate Financial Statements** (P1)
- [ ] Login as Owner
- [ ] Navigate to P&L report
- [ ] Select Jan 1 - Dec 31, 2026
- [ ] Verify revenue, expenses, net profit display
- [ ] Export to Excel → verify file downloads
- [ ] Navigate to Balance Sheet
- [ ] Verify Assets = Liabilities + Equity

**User Story 2: Record Business Transactions** (P2)
- [ ] Login as Finance Admin
- [ ] Create manual journal entry: sale transaction
- [ ] Verify balanced entry validation
- [ ] Try to create unbalanced entry → verify error
- [ ] Post entry successfully
- [ ] Try to edit posted entry → verify blocked

**User Story 3: Manage Chart of Accounts** (P3)
- [ ] Login as Finance Admin
- [ ] View default chart of accounts (12 accounts)
- [ ] Create custom account: 5250 - Advertising Expense
- [ ] Deactivate account
- [ ] Try to deactivate system account (Cash) → verify blocked

**User Story 4: AR Reconciliation Integration** (P3)
- [ ] Login as Finance Admin
- [ ] Create sales invoice: $1000
- [ ] Import platform statement: Order $950 (fee $50)
- [ ] Match order to invoice
- [ ] Close reconciliation period
- [ ] Verify 2 journal entries created (platform fees, cash received)
- [ ] Verify sales_order.status = "reconciled"
- [ ] Verify sales_invoice.status = "paid"

**User Story 5: User-Friendly Dashboard** (P3)
- [ ] Login as Owner (non-accountant)
- [ ] View dashboard
- [ ] Verify cards show: revenue, expenses, net profit, cash, AR, AP
- [ ] Verify charts display (revenue vs expenses line chart, expense pie chart)
- [ ] Toggle "Simplified Language" mode
- [ ] Verify terminology changes: "Money In" not "Revenue"

---

### 6.3 Performance Validation

**Duration**: 2 hours
**Dependencies**: 2.3

**Dashboard Load Time (<1s target)**:
- [ ] Generate 500 transactions for current month
- [ ] Measure dashboard load time
- [ ] Target: <1 second

**Financial Statement Generation (<5s target)**:
- [ ] Generate 2000 transactions per month (24k annual)
- [ ] Measure P&L generation time → Target: <5 seconds
- [ ] Measure Balance Sheet generation → Target: <5 seconds
- [ ] Measure Trial Balance generation → Target: <5 seconds
- [ ] Measure Cash Flow generation → Target: <5 seconds

**Pagination Performance**:
- [ ] Navigate to journal entries list
- [ ] Measure page load time (50 entries) → Target: <1 second
- [ ] Navigate to page 10
- [ ] Verify cursor-based pagination works

---

### 6.4 Integration Testing

**Duration**: 2 hours
**Dependencies**: Phase 3 tasks

**AR Reconciliation → Journal Entries**:
- [ ] Close period with 10 matched orders
- [ ] Verify 20 journal entries created (2 per order)
- [ ] Verify all entries balance
- [ ] Verify all sales_orders.status = "reconciled"

**Expense Approval → Journal Entry**:
- [ ] Approve expense claim ($200 travel)
- [ ] Verify 1 journal entry created (Dr. Travel, Cr. AP)
- [ ] Mark reimbursed
- [ ] Verify 1 journal entry created (Dr. AP, Cr. Cash)

**Invoice Payment → Journal Entry**:
- [ ] Create sales invoice ($500)
- [ ] Verify 1 journal entry created (Dr. AR, Cr. Revenue)
- [ ] Mark paid
- [ ] Verify 1 journal entry created (Dr. Cash, Cr. AR)

**Trial Balance Verification**:
- [ ] After all integrations, generate trial balance
- [ ] Verify total debits = total credits
- [ ] Verify no unbalanced entries

---

## Success Criteria Verification

Before marking implementation complete, verify all success criteria from spec.md:

- [ ] **SC-001**: 100% of journal entries balance (enforced by validation)
- [ ] **SC-002**: Trial balance sums to zero
- [ ] **SC-003**: Balance sheet satisfies Assets = Liabilities + Equity
- [ ] **SC-005**: Financial statements generate in <5 seconds (24k entries)
- [ ] **SC-006**: Dashboard loads in <1 second (2000 transactions)
- [ ] **SC-007**: 90% of users can record transaction in <2 minutes
- [ ] **SC-008**: Export to Excel/PDF in <10 seconds
- [ ] **SC-009**: AR recon close creates entries in <5 seconds
- [ ] **SC-010**: Prevents 100% of closed period modifications
- [ ] **SC-011**: Migration completes with detailed report
- [ ] **SC-013**: Multi-currency transactions use correct rates (manual → API → fallback)
- [ ] **SC-014**: Cash flow reconciles to P&L with 100% accuracy

---

## Post-Implementation

### Documentation Updates

- [ ] Update `CLAUDE.md` with accounting module patterns
- [ ] Create `src/domains/accounting/CLAUDE.md` with module-specific docs
- [ ] Update API documentation in `src/app/api/v1/CLAUDE.md`

### Deployment Checklist

- [ ] All tests passing (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Convex schema deployed to prod (`npx convex deploy --prod --yes`)
- [ ] Migration tested on staging
- [ ] Performance benchmarks met
- [ ] RBAC verified with test accounts

### Monitoring & Alerting

- [ ] Add Sentry error tracking for accounting mutations
- [ ] Add CloudWatch metrics for statement generation time
- [ ] Add alert for unbalanced entries (should never happen)

---

## Task Status Summary

| Phase | Tasks | Status | Duration |
|-------|-------|--------|----------|
| Phase 1: Schema | 3 | ✅ 1/3 complete | 2 days |
| Phase 2: Backend | 5 | ⏳ Not started | 2 days |
| Phase 3: Integration | 3 | ⏳ Not started | 2 days |
| Phase 4: Frontend | 8 | ⏳ Not started | 2 days |
| Phase 5: Migration | 2 | ⏳ Not started | 1 day |
| Phase 6: UAT | 4 | ⏳ Not started | 1 day |

**Total Estimated Duration**: 10 days
**Current Progress**: 5% (schema contracts completed)

---

**Task Breakdown Status**: ✅ Complete
**Ready for Implementation**: Yes
**Next Step**: Begin Phase 1 implementation or use `/speckit.implement` to execute tasks
