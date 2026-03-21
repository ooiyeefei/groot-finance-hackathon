# Data Model: Multi-Currency Display & Historical Trend Analysis

**Date**: 2026-03-21

## Existing Entities (No Schema Changes Required)

### journal_entries (read-only for this feature)
- `businessId`: tenant isolation
- `transactionDate`: YYYY-MM-DD — primary date filter for period queries
- `status`: must be "posted" for aggregation
- `homeCurrency`: business home currency at time of entry

### journal_entry_lines (read-only for this feature)
- `businessId`: tenant isolation
- `accountCode`: Chart of Accounts code (determines metric type)
- `accountType`: "Revenue", "Expense", "Asset", etc.
- `debitAmount`, `creditAmount`: amounts for aggregation
- `homeCurrencyAmount`: amount in business home currency
- Index: `by_business_account` (businessId, accountCode)

### manual_exchange_rates (read-only for this feature)
- `businessId`, `fromCurrency`, `toCurrency`, `rate`, `effectiveDate`
- Index: `by_business_pair_date` for latest rate lookup

### businesses (read-only for this feature)
- `homeCurrency`: default display currency (e.g., "MYR")

## New Data Structures (In-Memory, Not Persisted)

### MetricPeriodData
Returned by the Convex aggregation action — not stored in a table.

```
{
  metric: 'revenue' | 'expenses' | 'profit' | 'cash_flow'
  periods: Array<{
    label: string           // "Jan 2026", "Q1 2025"
    startDate: string       // YYYY-MM-DD
    endDate: string         // YYYY-MM-DD
    amount: number          // In home currency
    convertedAmount?: number // In display currency (if requested)
    transactionCount: number
  }>
  homeCurrency: string
  displayCurrency?: string
  exchangeRate?: number     // Current rate used for conversion
}
```

### TrendComparisonResult
Returned by the analyze_trends tool to the LLM.

```
{
  mode: 'compare' | 'trend' | 'growth'
  metric: string
  homeCurrency: string
  displayCurrency?: string
  exchangeRate?: number

  // For compare mode:
  periodA?: { label, amount, convertedAmount? }
  periodB?: { label, amount, convertedAmount? }
  absoluteChange?: number
  percentageChange?: number
  direction?: 'up' | 'down' | 'stable'

  // For trend mode:
  periods?: Array<{ label, amount, convertedAmount? }>
  overallDirection?: 'up' | 'down' | 'stable'
  overallChangePercent?: number

  // For growth mode:
  growthRate?: number        // Percentage
  currentPeriod?: { label, amount }
  previousPeriod?: { label, amount }

  // Action card data
  actionCard: {
    type: 'trend_comparison_card'
    data: { ... }            // Passed directly to the React component
  }
}
```

## Account Code → Metric Mapping

| Metric | Account Range | Amount Field | Notes |
|--------|--------------|-------------|-------|
| Revenue | 4000-4999 | creditAmount | Standard revenue accounts |
| Expenses | 5000-5999 | debitAmount | Operating expenses |
| COGS | 5000-5099 | debitAmount | Cost of goods sold (subset) |
| Profit | Derived | revenue - expenses | Not a direct query |
| Cash Flow | 1000-1099 | net (debit - credit) | Cash and bank accounts |

## Validation Rules

- `metric` must be one of: 'revenue', 'expenses', 'profit', 'cash_flow'
- Date ranges must not exceed 24 months (to limit query scope)
- `display_currency` must be a valid `SupportedCurrency` from `src/lib/types/currency.ts`
- Granularity must be 'monthly', 'quarterly', or 'yearly'
