# UAT Test Report: Double-Entry Accounting System

**Date**: 2026-03-13
**Feature**: 001-accounting-double-entry
**Environment**: Production (https://finance.hellogroot.com)
**Convex Deployment**: kindhearted-lynx-129.convex.cloud

---

## Test Summary

| Category | Scenarios | Status |
|----------|-----------|--------|
| Backend Functions | 8 test scenarios | ✅ Ready for Testing |
| Integration Hooks | 3 test scenarios | ✅ Ready for Testing |
| Migration | 2 test scenarios | ✅ Ready for Testing |
| Frontend UI | 1 test scenario | ✅ Ready for Testing |
| **TOTAL** | **14 scenarios** | **✅ All Deployed** |

---

## Test Accounts

From `.env.local`:
- **Finance Admin**: `TEST_USER_ADMIN` / `TEST_USER_ADMIN_PW`
- **Owner**: `TEST_USER_OWNER` / `TEST_USER_OWNER_PW`
- **Manager**: `TEST_USER_MANAGER` / `TEST_USER_MANAGER_PW`

---

## Test Scenario 1: Chart of Accounts Setup

**Objective**: Verify default GAAP accounts are created
**User**: Finance Admin
**Steps**:
1. Log in as Finance Admin
2. Navigate to Accounting → Chart of Accounts (TODO: add route)
3. Run seed function: `npx convex run functions/seedAccounting:seedDefaultAccounts '{"businessId":"<your-business-id>"}'`

**Expected Results**:
- ✅ 13 accounts created:
  - 1000 - Cash (Asset)
  - 1200 - Accounts Receivable (Asset)
  - 1500 - Inventory (Asset)
  - 2100 - Accounts Payable (Liability)
  - 2200 - Sales Tax Payable (Liability)
  - 3000 - Owner's Equity (Equity)
  - 3100 - Retained Earnings (Equity)
  - 4100 - Sales Revenue (Revenue)
  - 4900 - Other Income (Revenue)
  - 5100 - Cost of Goods Sold (Expense)
  - 5200 - Operating Expenses (Expense)
  - 5800 - Platform Fees (Expense)
  - 5900 - Other Expenses (Expense)
- ✅ All marked as `isSystemAccount: true`
- ✅ All marked as `isActive: true`

**Backend Verification**:
```bash
npx convex run functions/chartOfAccounts:list '{"businessId":"<id>","isActive":true}'
```

---

## Test Scenario 2: Create Manual Journal Entry

**Objective**: Verify balance validation and posting
**User**: Finance Admin
**Convex Function**: `functions/journalEntries:create`

**Test Case 2.1: Balanced Entry (Success)**
```bash
npx convex run functions/journalEntries:create '{
  "businessId": "<id>",
  "transactionDate": "2026-03-13",
  "description": "Test: Record cash sale",
  "lines": [
    {
      "accountCode": "1000",
      "debitAmount": 100,
      "creditAmount": 0,
      "lineDescription": "Cash received"
    },
    {
      "accountCode": "4100",
      "debitAmount": 0,
      "creditAmount": 100,
      "lineDescription": "Sales revenue"
    }
  ]
}'
```

**Expected**: ✅ Entry created with status `draft`

**Test Case 2.2: Unbalanced Entry (Failure)**
```bash
npx convex run functions/journalEntries:create '{
  "businessId": "<id>",
  "transactionDate": "2026-03-13",
  "description": "Test: Unbalanced entry",
  "lines": [
    {"accountCode": "1000", "debitAmount": 100, "creditAmount": 0},
    {"accountCode": "4100", "debitAmount": 0, "creditAmount": 90}
  ]
}'
```

**Expected**: ❌ Error: "Unbalanced entry: Debits=100.00, Credits=90.00, Diff=10.00"

**Test Case 2.3: Post Entry**
```bash
npx convex run functions/journalEntries:post '{"entryId":"<entry-id-from-2.1>"}'
```

**Expected**: ✅ Status changed to `posted`, entry is now immutable

---

## Test Scenario 3: AR Reconciliation Integration

**Objective**: Verify journal entries auto-created when closing reconciliation period
**User**: Finance Admin
**Trigger**: `salesOrders.closePeriod()`

**Prerequisites**:
1. Import sales orders CSV (Shopee/Lazada data)
2. Match orders to invoices
3. At least 1 order with `matchStatus: "matched"` and `platformFee > 0`

**Test Steps**:
1. Close reconciliation period:
```bash
npx convex run functions/salesOrders:closePeriod '{
  "businessId": "<id>",
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-13",
  "closedBy": "test-admin"
}'
```

2. Verify response includes `accounting.entriesCreated >= 2` per matched order

3. Query created journal entries:
```bash
npx convex run functions/journalEntries:getBySource '{
  "sourceType": "ar_reconciliation",
  "sourceId": "<order-id>"
}'
```

**Expected Results**:
- ✅ Entry 1 (Platform Fees): Dr. 5800, Cr. 1200
- ✅ Entry 2 (Cash Received): Dr. 1000, Cr. 1200
- ✅ Entry 3 (Variance, if variance > 10%): Dr/Cr 1200, Cr/Dr 4900/5900
- ✅ All entries have `status: "posted"`
- ✅ `sales_orders.journalEntryIds` populated
- ✅ `sales_orders.reconciledAt` set
- ✅ `sales_invoices.status = "paid"`

---

## Test Scenario 4: Expense Claim Approval Integration

**Objective**: Verify journal entry created when claim approved
**User**: Manager
**Trigger**: `expenseClaims.updateStatus({status: "approved"})`

**Test Steps**:
1. Submit expense claim as Employee
2. Approve claim as Manager:
```bash
npx convex run functions/expenseClaims:updateStatus '{
  "id": "<claim-id>",
  "status": "approved",
  "reviewerNotes": "Approved for UAT testing"
}'
```

3. Query journal entry:
```bash
npx convex run functions/journalEntries:getBySource '{
  "sourceType": "expense_claim",
  "sourceId": "<claim-id>"
}'
```

**Expected Results**:
- ✅ Entry created: Dr. Expense (5xxx), Cr. AP (2100)
- ✅ Amount matches `claim.totalAmount`
- ✅ `entityType: "employee"` with correct user ID
- ✅ `expense_claims.journalEntryId` populated

---

## Test Scenario 5: Expense Claim Reimbursement Integration

**Objective**: Verify payment journal entry created when claim reimbursed
**User**: Finance Admin
**Trigger**: `expenseClaims.updateStatus({status: "reimbursed"})`

**Prerequisites**: Claim must be in `approved` status

**Test Steps**:
1. Mark claim as reimbursed:
```bash
npx convex run functions/expenseClaims:updateStatus '{
  "id": "<claim-id>",
  "status": "reimbursed"
}'
```

2. Query payment entry:
```bash
npx convex run functions/journalEntries:getBySource '{
  "sourceType": "expense_claim",
  "sourceId": "<claim-id>"
}'
```

**Expected Results**:
- ✅ New entry created: Dr. AP (2100), Cr. Cash (1000)
- ✅ Clears the AP liability from approval entry
- ✅ `expense_claims.paymentJournalEntryId` populated
- ✅ `expense_claims.paidAt` set

---

## Test Scenario 6: Sales Invoice Creation Integration

**Objective**: Verify journal entry created when invoice sent
**User**: Finance Admin
**Trigger**: `salesInvoices.send()`

**Test Steps**:
1. Create draft invoice
2. Send invoice:
```bash
npx convex run functions/salesInvoices:send '{
  "id": "<invoice-id>",
  "businessId": "<business-id>"
}'
```

3. Query journal entry:
```bash
npx convex run functions/journalEntries:getBySource '{
  "sourceType": "sales_invoice",
  "sourceId": "<invoice-id>"
}'
```

**Expected Results**:
- ✅ Entry created with 2-3 lines:
  - Dr. AR (1200) - full amount
  - Cr. Revenue (4100) - subtotal
  - Cr. Sales Tax (2200) - tax amount (if applicable)
- ✅ Balance validates (debits = credits)
- ✅ `sales_invoices.journalEntryId` populated

---

## Test Scenario 7: Sales Invoice Payment Integration

**Objective**: Verify payment entry created when invoice marked paid
**User**: Finance Admin
**Trigger**: `salesInvoices.recordPayment()`

**Test Steps**:
1. Record payment:
```bash
npx convex run functions/salesInvoices:recordPayment '{
  "id": "<invoice-id>",
  "businessId": "<business-id>",
  "amount": 100.00,
  "paymentDate": "2026-03-13",
  "paymentMethod": "Bank Transfer"
}'
```

2. Query payment entry:
```bash
npx convex run functions/journalEntries:getBySource '{
  "sourceType": "sales_invoice",
  "sourceId": "<invoice-id>"
}'
```

**Expected Results**:
- ✅ New entry created: Dr. Cash (1000), Cr. AR (1200)
- ✅ Clears the AR from invoice creation
- ✅ `sales_invoices.paymentJournalEntryId` populated
- ✅ `sales_invoices.paidAt` set
- ✅ `sales_invoices.status = "paid"`

---

## Test Scenario 8: Profit & Loss Statement

**Objective**: Verify P&L generates correctly from journal entries
**User**: Any authenticated user
**Convex Function**: `functions/financialStatements:profitLoss`

**Test Steps**:
1. Generate P&L for current month:
```bash
npx convex run functions/financialStatements:profitLoss '{
  "businessId": "<id>",
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-13"
}'
```

**Expected Results**:
- ✅ Revenue section shows all 4xxx account balances
- ✅ Expense section shows all 5xxx account balances
- ✅ Net Profit = Revenue - Expenses
- ✅ Calculation matches manual verification
- ✅ Response time < 5 seconds (even with 24k entries)

**Sample Output**:
```json
{
  "revenue": {
    "lines": [
      {"accountCode": "4100", "accountName": "Sales Revenue", "amount": 10000},
      {"accountCode": "4900", "accountName": "Other Income", "amount": 500}
    ],
    "total": 10500
  },
  "expenses": {
    "lines": [
      {"accountCode": "5200", "accountName": "Operating Expenses", "amount": 3000},
      {"accountCode": "5800", "accountName": "Platform Fees", "amount": 300}
    ],
    "total": 3300
  },
  "netProfit": 7200
}
```

---

## Test Scenario 9: Trial Balance

**Objective**: Verify trial balance proves fundamental equation (debits = credits)
**User**: Finance Admin
**Convex Function**: `functions/financialStatements:trialBalance`

**Test Steps**:
1. Generate trial balance:
```bash
npx convex run functions/financialStatements:trialBalance '{
  "businessId": "<id>",
  "asOfDate": "2026-03-13"
}'
```

**Expected Results**:
- ✅ Lists all accounts with debit/credit balances
- ✅ `totalDebits === totalCredits` (±0.01 tolerance)
- ✅ `balanced: true`
- ✅ No negative balances on wrong side (e.g., credit balance on Cash)

---

## Test Scenario 10: Dashboard Metrics

**Objective**: Verify real-time dashboard displays correct aggregates
**User**: Any authenticated user
**URL**: https://finance.hellogroot.com/en/accounting

**Test Steps**:
1. Log in as any user
2. Navigate to `/en/accounting`
3. Observe metrics cards

**Expected Results**:
- ✅ Revenue (This Month) matches P&L total revenue
- ✅ Expenses (This Month) matches P&L total expenses
- ✅ Net Profit = Revenue - Expenses
- ✅ Cash Balance matches Trial Balance 1000 account
- ✅ Load time < 1 second
- ✅ Real-time updates when new entries posted

---

## Test Scenario 11: Migration - Dry Run

**Objective**: Validate migration logic without creating entries
**User**: System Admin
**Convex Function**: `migrations/migrateAccountingEntries`

**Test Steps**:
1. Run migration in dry-run mode:
```bash
npx convex run migrations/migrateAccountingEntries:migrateAccountingEntries '{
  "businessId": "<id>",
  "dryRun": true
}'
```

**Expected Results**:
- ✅ Returns count of records that would be migrated
- ✅ Returns count of records that would be skipped
- ✅ No journal entries created
- ✅ No migration report created

---

## Test Scenario 12: Migration - Full Run

**Objective**: Migrate all single-entry records to double-entry system
**User**: System Admin
**Convex Function**: `migrations/migrateAccountingEntries`

**Prerequisites**: Run dry-run first to verify counts

**Test Steps**:
1. Run full migration:
```bash
npx convex run migrations/migrateAccountingEntries:migrateAccountingEntries '{
  "businessId": "<id>",
  "dryRun": false
}'
```

2. Review migration report:
```bash
npx convex run functions/migrationReports:getLatest '{"businessId":"<id>"}'
```

**Expected Results**:
- ✅ Success rate >= 90%
- ✅ All valid records migrated
- ✅ Skipped records logged with reasons
- ✅ Journal entries created with `sourceType: "migrated"`
- ✅ Trial balance still balanced after migration

**Sample Report**:
```json
{
  "totalRecords": 24000,
  "migratedCount": 22800,
  "errorCount": 1200,
  "successRate": "95.0%",
  "duration": 180,
  "skippedRecords": [
    {
      "id": "k1234",
      "reason": "Missing amount",
      "details": "Amount: null"
    }
  ]
}
```

---

## Test Scenario 13: RBAC - Finance Admin Access

**Objective**: Verify Finance Admin has full access
**User**: Finance Admin

**Test Steps**:
1. Log in as Finance Admin
2. Attempt to:
   - Create journal entry ✅
   - Post journal entry ✅
   - Reverse journal entry ✅
   - Create chart account ✅
   - Close accounting period ✅
   - View all financial statements ✅

**Expected**: All actions succeed

---

## Test Scenario 14: RBAC - Owner/Manager Limited Access

**Objective**: Verify non-Finance-Admin users have read-only access
**User**: Owner or Manager

**Test Steps**:
1. Log in as Owner
2. Attempt to:
   - View financial statements ✅ (should succeed)
   - Create journal entry ❌ (should fail)
   - Create chart account ❌ (should fail)
   - Close accounting period ❌ (should fail)

**Expected**: Read-only access, mutations blocked

---

## Performance Benchmarks

| Operation | Target | Actual | Status |
|-----------|--------|--------|--------|
| Dashboard load | < 1s | TBD | ⏳ |
| P&L generation (1 month) | < 5s | TBD | ⏳ |
| Trial balance (24k entries) | < 5s | TBD | ⏳ |
| Journal entry creation | < 500ms | TBD | ⏳ |
| Migration (24k records) | < 5 min | TBD | ⏳ |

---

## Known Limitations

1. **Frontend UI**: Only dashboard page implemented. Full UI (Chart of Accounts manager, Journal Entry form, Statement views) needs completion in separate task.

2. **Balance Sheet & Cash Flow**: Generators not yet implemented. P&L and Trial Balance are complete.

3. **Foreign Currency**: Manual exchange rate manager is backend-ready but UI not yet built.

4. **Account Hierarchy**: Schema supports parent-child accounts but UI doesn't display tree structure yet.

---

## Deployment Status

✅ **All backend functions deployed to production**
✅ **All integration hooks active**
✅ **Schema changes applied**
✅ **Migration script ready**
⚠️ **Frontend UI: Dashboard only (full UI pending)**

---

## Recommendations

1. **Complete Frontend UI** (Est: 2-3 days)
   - Chart of Accounts manager with create/edit/deactivate
   - Journal Entry form with multi-line entry and balance indicator
   - Full financial statement views (P&L, Balance Sheet, Cash Flow, Trial Balance)

2. **Run UAT Tests** (Est: 4 hours)
   - Execute all 14 test scenarios above
   - Document actual performance metrics
   - Capture screenshots of successful flows

3. **Performance Optimization** (If needed)
   - Add caching for financial statements
   - Optimize query indexes if response times > 5s

4. **User Training** (Est: 2 hours)
   - Finance Admin guide: Creating manual entries, closing periods
   - Manager guide: Understanding P&L, approving expenses
   - Owner guide: Viewing financial health, interpreting statements

---

## Sign-Off

**Backend Implementation**: ✅ **COMPLETE**
**Integration Hooks**: ✅ **COMPLETE**
**Migration**: ✅ **COMPLETE**
**UAT Testing**: ⏳ **READY TO EXECUTE**

**Implemented By**: Claude AI (grootdev-ai)
**Date**: 2026-03-13
**Build Status**: ✅ Passing
**Deployment**: ✅ Production (kindhearted-lynx-129.convex.cloud)
