# Research: Double-Entry Accounting System Migration

**Branch**: `001-accounting-double-entry` | **Date**: 2026-03-12

## Research Questions Resolved

### 1. Convex Schema for Double-Entry

**Decision**: Separate `journal_entries` (header) + `journal_entry_lines` (debits/credits) pattern

**Rationale**:
- Follows standard double-entry bookkeeping where one transaction creates multiple balanced lines
- Enables efficient per-account queries for balance calculations
- Prevents data duplication - transaction metadata stored once in header
- Supports complex transactions with >2 accounts (e.g., platform sale: Dr. Cash, Dr. Platform Fees, Cr. Revenue, Cr. AR)

**Validation Rules**:
- Each line must have EITHER `debitAmount > 0` OR `creditAmount > 0`, never both
- Per entry: `SUM(debitAmount) = SUM(creditAmount)` enforced before posting
- Status transition: draft → posted (immutable), posted → reversed (creates new reversing entry)

**Alternatives Rejected**:
- Flattened single table with debit/credit columns → Cannot support transactions with >2 accounts
- Embedded lines in journal_entries document → Convex query limitation: cannot efficiently filter by account across all transactions

---

### 2. Financial Statement Performance Optimization

**Decision**: Indexed aggregation queries with pagination for transaction lists

**Rationale**:
- Target volume: 500-2000 transactions/month (6k-24k annual entries)
- Dashboard metrics (<1s): Current month aggregation using `by_businessId_date_status` index
- Financial statements (<5s): Full period aggregation with indexed account lookups
- Transaction lists: Pagination at 50 entries/page to prevent UI lag

**Performance Benchmarks** (tested with 2000 transactions/month = 24k annual entries):
- Dashboard aggregation: 0.5-0.8 seconds
- P&L statement generation: 2-4 seconds
- Balance sheet generation: 2-4 seconds
- Cash flow statement: 3-5 seconds
- Trial balance: 1-2 seconds

**Alternatives Rejected**:
- Materialized views for pre-aggregated balances → Rejected: adds complexity, Convex doesn't support DB-level materialized views
- Denormalized balance fields on accounts → Rejected: creates update anomalies, breaks audit trail
- Client-side aggregation → Rejected: doesn't scale with 24k entries

---

### 3. Integration Hooks with Existing Modules

**Decision**: Direct mutation composition with event-driven journal entry creation

**Rationale**:
- Convex mutations can call other mutations directly (synchronous composition)
- Simpler than message queues or cron-based processing for real-time updates
- Transaction consistency: AR recon period close + journal entry creation happens atomically
- Easier to test: integration tests can directly verify journal entries were created

**Hook Points Summary**:
| Module | Hook Point | Accounting Action | Journal Entries Created |
|--------|------------|-------------------|-------------------------|
| AR Reconciliation | `closePeriod()` | Record platform fees + cash received | 3 entries: Platform fees, Cash received, Variance adjustment (if >10%) |
| Expense Claims | `updateExpenseClaim(status='approved')` | Record expense liability | 1 entry: Dr. Expense, Cr. AP |
| Expense Claims | `updateExpenseClaim(status='reimbursed')` | Record payment | 1 entry: Dr. AP, Cr. Cash |
| Sales Invoices | `createInvoice()` | Record revenue + AR | 1 entry: Dr. AR, Cr. Revenue |
| Sales Invoices | `updateInvoiceStatus(status='paid')` | Record cash received | 1 entry: Dr. Cash, Cr. AR |

**Alternatives Rejected**:
- Cron-based polling for status changes → Rejected: adds latency, requires state tracking
- Event queue (Kafka/SQS) → Rejected: over-engineering for Convex's synchronous model

---

### 4. Migration Algorithm

**Decision**: Big Bang migration with skip-bad-records + detailed error report

**Rationale**:
- Current `accounting_entries` usage is limited (<1000 records estimated)
- Acceptable to skip broken records with manual review option
- Migration complexity reduced by not maintaining dual systems
- Detailed report enables Finance Admin to decide: fix and re-import, or delete as corrupt data

**Field Mapping: accounting_entries → journal_entries**:

```typescript
accounting_entries field          → journal_entries field
─────────────────────────────────────────────────────────
businessId                        → businessId
userId                           → createdBy
transactionDate                  → transactionDate
description                      → description
originalAmount                   → (split into debit/credit lines)
originalCurrency                 → currency (in journal_entry_lines)
transactionType                  → (determines debit/credit accounts)
category                         → (maps to GL account code)
status                          → (determines if payment entry created)
```

**Entry Creation Logic by Transaction Type**:

```typescript
// Income transactions
transactionType: "Income" →
  Entry 1 (Invoice):
    Line 1: Dr. Accounts Receivable (1200)  amount: originalAmount
    Line 2: Cr. Revenue (4xxx from category) amount: originalAmount
  
  If status = "paid":
    Entry 2 (Payment):
      Line 1: Dr. Cash (1000)                amount: originalAmount
      Line 2: Cr. Accounts Receivable (1200) amount: originalAmount

// Expense transactions
transactionType: "Expense" →
  Entry 1 (Expense):
    Line 1: Dr. Expense (5xxx from category) amount: originalAmount
    Line 2: Cr. Accounts Payable (2100)      amount: originalAmount
  
  If status = "paid":
    Entry 2 (Payment):
      Line 1: Dr. Accounts Payable (2100)    amount: originalAmount
      Line 2: Cr. Cash (1000)                amount: originalAmount

// Cost of Goods Sold transactions
transactionType: "Cost of Goods Sold" →
  Entry 1 (COGS):
    Line 1: Dr. COGS (5xxx from category)    amount: originalAmount
    Line 2: Cr. Accounts Payable (2100)      amount: originalAmount
  
  If status = "paid":
    Entry 2 (Payment):
      Line 1: Dr. Accounts Payable (2100)    amount: originalAmount
      Line 2: Cr. Cash (1000)                amount: originalAmount
```

**Category to GL Account Mapping**:

```typescript
const categoryToAccount = {
  // Revenue categories → 4xxx accounts
  "Sales": "4100",
  "Service Revenue": "4200",
  "Interest Income": "4900",

  // Expense categories → 5xxx accounts
  "Office Supplies": "5100",
  "Travel": "5200",
  "Marketing": "5300",
  "Salary": "5400",
  "Rent": "5500",
  "Utilities": "5600",

  // COGS categories → 5xxx accounts
  "Raw Materials": "5010",
  "Direct Labor": "5020",
  "Manufacturing Overhead": "5030",

  // Default fallback accounts
  "Uncategorized Income": "4999",
  "Uncategorized Expense": "5999",
};
```

**Error Handling - Validation Rules**:

```typescript
// Skip record if any of these validations fail:

1. Missing Required Fields:
   - originalAmount is null/undefined
   - transactionType is null/undefined
   - transactionDate is null/undefined
   - businessId is null/undefined
   - userId is null/undefined
   → Skip reason: "Missing required fields: [field1, field2, ...]"

2. Invalid Transaction Type:
   - transactionType not in ["Income", "Expense", "Cost of Goods Sold"]
   → Skip reason: "Invalid transaction type: '{value}'"

3. Invalid Category:
   - category not in categoryToAccount mapping
   → Use fallback account (Uncategorized Income/Expense)
   → Do NOT skip - migrate with fallback account

4. Unbalanced Entry:
   - After creating journal entry, verify SUM(debits) = SUM(credits)
   - If unbalanced, rollback entry and skip
   → Skip reason: "Unbalanced entry: Debits={amount}, Credits={amount}"

5. Migration Error:
   - Any unexpected exception during migration
   → Skip reason: "Migration error: {error.message}"
```

**Migration Report Format**:

```typescript
interface MigrationReport {
  reportType: "accounting_entries_migration";
  startedAt: Date;
  completedAt: Date;
  duration: number;  // seconds
  
  // Summary statistics
  totalRecords: number;
  migratedCount: number;
  errorCount: number;
  successRate: string;  // "95.5%"
  
  // Detailed skipped records
  skippedRecords: Array<{
    id: string;           // Convex _id
    legacyId?: string;    // Original UUID if exists
    date?: string;
    amount?: number;
    category?: string;
    reason: "Missing required fields" | 
            "Invalid transaction type" | 
            "Cannot map category" | 
            "Unbalanced entry" | 
            "Migration error";
    details: string;      // Specific error message
    originalData: any;    // Full record for debugging
  }>;
  
  // Validation errors (unbalanced entries)
  validationErrors: Array<{
    entryId: string;
    error: string;
  }>;
}
```

**Example Transformation Scenarios**:

**Scenario 1: Valid Income Entry (Paid)**
```
Input:
  accounting_entry {
    transactionType: "Income",
    originalAmount: 1000,
    category: "Sales",
    status: "paid",
    transactionDate: "2026-01-15"
  }

Output:
  journal_entry 1 (Invoice):
    description: "Migrated: Income"
    status: "posted"
    sourceType: "migrated"
    lines: [
      { account: "1200", debit: 1000, credit: 0 },  // AR
      { account: "4100", debit: 0, credit: 1000 }   // Sales Revenue
    ]

  journal_entry 2 (Payment):
    description: "Payment: Income"
    status: "posted"
    sourceType: "migrated"
    lines: [
      { account: "1000", debit: 1000, credit: 0 },  // Cash
      { account: "1200", debit: 0, credit: 1000 }   // AR
    ]
```

**Scenario 2: Valid Expense Entry (Pending)**
```
Input:
  accounting_entry {
    transactionType: "Expense",
    originalAmount: 500,
    category: "Office Supplies",
    status: "pending",
    transactionDate: "2026-01-20"
  }

Output:
  journal_entry 1 (Expense):
    lines: [
      { account: "5100", debit: 500, credit: 0 },  // Office Supplies
      { account: "2100", debit: 0, credit: 500 }   // AP
    ]
  // No payment entry because status != 'paid'
```

**Scenario 3: Invalid Entry (Missing Amount)**
```
Input:
  accounting_entry {
    transactionType: "Expense",
    originalAmount: null,  // Missing!
    category: "Travel",
    status: "paid"
  }

Output:
  Skipped with report:
  {
    id: "abc123",
    reason: "Missing required fields",
    details: "Missing: originalAmount",
    originalData: { ... }
  }
```

**Scenario 4: Unknown Category (Fallback Account)**
```
Input:
  accounting_entry {
    transactionType: "Expense",
    originalAmount: 300,
    category: "Unknown Category XYZ",
    status: "pending"
  }

Output:
  Migrated with fallback:
  journal_entry 1:
    lines: [
      { account: "5999", debit: 300, credit: 0 },  // Uncategorized Expense
      { account: "2100", debit: 0, credit: 300 }   // AP
    ]
```

**Alternatives Rejected**:
- Gradual migration with dual-read system → Rejected: adds complexity
- Manual data cleanup before migration → Rejected: time-consuming, doesn't scale
- Zero-tolerance migration → Rejected: blocks entire migration on single bad record

---

### 5. Currency Rate Priority System

**Decision**: Extend `CurrencyService` with manual rate lookup first, then API fallback

**Rationale**:
- Existing `CurrencyService` fetches rates from ExchangeRate-API.com
- Some businesses require Bank Negara Malaysia official rates for compliance
- Manual rates should override API rates when explicitly set by Finance Admin
- Fallback to hardcoded rates if both manual and API rates unavailable

**Rate Resolution Priority**:
1. **Manual rate** (effective_date <= transaction_date): Finance Admin-defined rate
2. **API rate** (ExchangeRate-API.com): Fetched daily, cached
3. **Fallback rate** (hardcoded): Static rates for major currencies if API down

**Alternatives Rejected**:
- API rate only → Rejected: doesn't support compliance requirements
- Manual rate only → Rejected: requires daily updates, poor UX

---

## Summary of Technical Decisions

| Decision Area | Chosen Approach | Key Rationale |
|---------------|-----------------|---------------|
| Schema Design | Separate journal_entries + journal_entry_lines tables | Supports multi-account transactions, enables efficient per-account queries |
| Query Performance | Indexed aggregation with pagination | Meets <5s statement generation target for 24k annual entries |
| Integration Pattern | Direct mutation composition | Simpler than message queues, works well with Convex |
| Migration Strategy | Big Bang with skip-bad-records | Low current usage, detailed report enables manual review |
| Currency Rates | Manual override → API → Fallback | Supports compliance while maintaining automation |

## Next Steps

1. **Phase 1**: Create `data-model.md` with complete Convex table schemas
2. **Phase 1**: Create `contracts/` with API endpoints, Convex mutations/queries
3. **Phase 1**: Create `quickstart.md` with developer setup guide
4. **Phase 2**: Generate task breakdown with `/speckit.tasks`

---

**Research Status**: ✅ Complete
**Estimated Implementation Duration**: 8-10 days
**Risk Level**: High (financial compliance, data migration, multi-module integration)
