# Tool Schemas: Multi-Currency Display & Historical Trend Analysis

## Tool 1: analyze_trends

OpenAI-compatible function calling schema for the chat agent.

```json
{
  "type": "function",
  "function": {
    "name": "analyze_trends",
    "description": "Analyze financial trends, compare periods, or calculate growth rates. Returns structured analysis with action card visualization. Use for: period comparisons ('Compare Q1 vs Q2'), trends ('6-month expense trend'), growth rates ('revenue growth rate').",
    "parameters": {
      "type": "object",
      "properties": {
        "mode": {
          "type": "string",
          "enum": ["compare", "trend", "growth"],
          "description": "Analysis mode: 'compare' for two-period comparison, 'trend' for multi-period time series, 'growth' for growth rate calculation"
        },
        "metric": {
          "type": "string",
          "enum": ["revenue", "expenses", "profit", "cash_flow"],
          "description": "Financial metric to analyze"
        },
        "period_a": {
          "type": "string",
          "description": "First period (compare mode) or start of range (trend mode). Natural language: 'Q1 2025', 'January 2026', 'last quarter'"
        },
        "period_b": {
          "type": "string",
          "description": "Second period for comparison (compare mode only). E.g., 'Q1 2026'"
        },
        "date_range": {
          "type": "string",
          "description": "Time range for trend mode. E.g., 'past 6 months', 'last year', 'past 12 months'"
        },
        "granularity": {
          "type": "string",
          "enum": ["monthly", "quarterly", "yearly"],
          "description": "Data aggregation granularity for trend mode. Default: 'monthly'"
        },
        "display_currency": {
          "type": "string",
          "description": "Optional currency to display results in (e.g., 'USD', 'SGD'). Shows both home currency and converted amounts."
        }
      },
      "required": ["mode", "metric"]
    }
  }
}
```

### Parameter Combinations by Mode

| Mode | Required | Optional |
|------|----------|----------|
| compare | mode, metric, period_a, period_b | display_currency |
| trend | mode, metric, date_range | granularity, display_currency |
| growth | mode, metric | period_a (defaults to latest complete period), display_currency |

## Extension: display_currency on Existing Tools

The following existing tools gain an optional `display_currency` parameter:

- `analyze_cash_flow` — converts runway, burn rate, balance to display currency
- `get_ar_summary` — converts receivables to display currency
- `get_ap_aging` — converts payables to display currency
- `get_business_transactions` — converts transaction amounts to display currency

Schema addition (same for all):
```json
{
  "display_currency": {
    "type": "string",
    "description": "Optional currency code (e.g., 'USD') to show converted amounts alongside home currency"
  }
}
```

## Convex Action Contract

### `financialIntelligence.analyzeTrends`

```typescript
// Convex action (not query — avoids reactive bandwidth)
export const analyzeTrends = action({
  args: {
    businessId: v.string(),
    mode: v.union(v.literal("compare"), v.literal("trend"), v.literal("growth")),
    metric: v.union(v.literal("revenue"), v.literal("expenses"), v.literal("profit"), v.literal("cash_flow")),
    startDateA: v.optional(v.string()),  // YYYY-MM-DD (resolved by tool)
    endDateA: v.optional(v.string()),
    startDateB: v.optional(v.string()),  // For compare mode
    endDateB: v.optional(v.string()),
    granularity: v.optional(v.union(v.literal("monthly"), v.literal("quarterly"), v.literal("yearly"))),
  },
  handler: async (ctx, args) => {
    // Returns MetricPeriodData + calculated changes
  }
})
```

## Action Card Data Contract

### trend_comparison_card

```typescript
interface TrendComparisonCardData {
  chartType: 'comparison' | 'trend'
  title: string
  currency: string
  displayCurrency?: string
  exchangeRate?: number

  // For comparison mode
  periodA?: { label: string; amount: number; convertedAmount?: number }
  periodB?: { label: string; amount: number; convertedAmount?: number }
  absoluteChange?: number
  percentageChange?: number
  direction?: 'up' | 'down' | 'stable'

  // For trend mode
  periods?: Array<{
    label: string
    amount: number
    convertedAmount?: number
  }>
  overallDirection?: 'up' | 'down' | 'stable'
  overallChangePercent?: number
}
```
