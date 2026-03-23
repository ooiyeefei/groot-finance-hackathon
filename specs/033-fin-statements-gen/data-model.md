# Data Model: Auto-Generated Financial Statements

## No New Tables Required

All four financial statements derive from existing tables. No schema changes needed.

## Source Tables (Existing)

### journal_entries (Header)
- `businessId`, `transactionDate`, `status` (posted/draft/reversed/voided)
- Key indexes: `by_businessId`, `by_business_date_status`

### journal_entry_lines (Detail)
- `journalEntryId`, `businessId`, `accountCode`, `accountName`, `accountType`
- `debitAmount`, `creditAmount`, `homeCurrencyAmount`
- Key indexes: `by_business_account`, `by_journal_entry`

### chart_of_accounts (Master)
- `businessId`, `accountCode`, `accountName`, `accountType`, `accountSubtype`, `normalBalance`, `isActive`
- Key index: `by_business_active`, `by_business_code`

## Generated Data Structures (In-Memory Only)

### TrialBalanceStatement
```
businessId, asOfDate, currency
lines[]: { accountCode, accountName, accountType, debitBalance, creditBalance }
totalDebits, totalCredits, balanced (boolean)
generatedAt
```

### ProfitLossStatement
```
businessId, dateFrom, dateTo, currency
revenue: { lines[], total }
costOfGoodsSold: { lines[], total }
grossProfit
operatingExpenses: { lines[], total }
operatingIncome
otherIncome: { lines[], total }
otherExpenses: { lines[], total }
netProfit
generatedAt
```

### ProfitLossComparison (NEW)
```
current: ProfitLossStatement
comparison: ProfitLossStatement
variance: {
  revenue: { amount, percentage }
  grossProfit: { amount, percentage }
  operatingExpenses: { amount, percentage }
  netProfit: { amount, percentage }
}
```

### BalanceSheetStatement (NEW)
```
businessId, asOfDate, currency
currentAssets: { lines[], total }       // 1000-1499
nonCurrentAssets: { lines[], total }    // 1500-1999
totalAssets
currentLiabilities: { lines[], total }  // 2000-2499
nonCurrentLiabilities: { lines[], total } // 2500-2999
totalLiabilities
equity: { lines[], total }              // 3000-3999
retainedEarnings                        // Dynamic: sum(Revenue) - sum(Expenses) all time
totalEquity                             // equity.total + retainedEarnings
totalLiabilitiesAndEquity
balanced (boolean)                      // totalAssets === totalLiabilitiesAndEquity
generatedAt
```

### CashFlowStatement (NEW)
```
businessId, dateFrom, dateTo, currency
openingBalance                          // Cash (1000) balance before dateFrom
operatingActivities: { lines[], total } // Contra: Revenue/Expense (4xxx-6xxx)
investingActivities: { lines[], total } // Contra: Non-Current Assets (1500-1999)
financingActivities: { lines[], total } // Contra: Liability/Equity (2xxx-3xxx)
netChange                               // operating + investing + financing
closingBalance                          // openingBalance + netChange
balanced (boolean)                      // closingBalance === actual cash balance at dateTo
generatedAt
```

## Account Code Classification

| Range | Type | Sub-classification |
|-------|------|-------------------|
| 1000-1499 | Current Assets | Cash, AR, Inventory, Prepaid |
| 1500-1999 | Non-Current Assets | Fixed Assets, Intangible |
| 2000-2499 | Current Liabilities | AP, Accrued, Short-term debt |
| 2500-2999 | Non-Current Liabilities | Long-term loans |
| 3000-3999 | Equity | Share capital, Retained earnings |
| 4000-4899 | Revenue | Sales, Service income |
| 4900-4999 | Other Income | Interest, Gains |
| 5100 | COGS | Cost of goods sold |
| 5200-5899 | Operating Expenses | Rent, Salaries, Utilities |
| 5900-5999 | Other Expenses | Interest expense, Losses |
