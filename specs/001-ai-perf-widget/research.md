# Research: AI Performance Widget

## Decision 1: Data Aggregation Strategy

**Decision**: Extend the existing `gatherAIActivity` bridge pattern from `convex/functions/aiDigest.ts` into a new query (`getAIPerformanceMetrics`) with configurable date ranges and additional confidence/edit-rate calculations.

**Rationale**: The bridge pattern already normalizes AR, bank recon, and fee classification data into `NormalizedActivity`. Rather than building a parallel aggregation, we extend the same approach — adding confidence averaging, edit rate computation, and period comparison. When the `ai_traces` table is eventually built (mentioned in aiDigest.ts comments), only one bridge function needs updating.

**Alternatives considered**:
- Pre-computed materialized view (new table) — rejected: adds write complexity, stale data risk, not needed at current scale
- MCP server aggregation — rejected: MCP is for financial intelligence tools, not UI metric queries
- Client-side aggregation — rejected: too many DB round-trips, poor performance at scale

## Decision 2: Confidence Calculation Across Features

**Decision**: Volume-weighted average. Each feature contributes proportionally to its number of AI decisions.

**Rationale**: A feature with 500 decisions at 92% confidence should outweigh one with 10 decisions at 99%. Equal weighting would misrepresent the system's actual reliability.

**Sources**:
- AR matching: `sales_orders.aiMatchSuggestions[0].confidence` (0-1 float)
- Bank recon: `bank_transactions.classificationConfidence` (0-1 float)
- Fee classification: `sales_orders.classifiedFees[].confidence` (0-1 float)

## Decision 3: Chart Library

**Decision**: Use recharts (already installed, used in einvoice compliance dashboard).

**Rationale**: No new dependency needed. The einvoice dashboard (`einvoice-dashboard.tsx`) already uses `PieChart` and `ResponsiveContainer` — same components needed for the donut chart.

## Decision 4: Period Comparison for Trends

**Decision**: Compare current period to the equivalent previous period:
- "This Month" → compare to last month
- "Last 3 Months" → compare to the 3 months before that
- "All Time" → no trend (no previous period)

**Rationale**: Equivalent period comparison is the standard approach. Using a rolling window (e.g., 30 days vs prior 30 days) would be confusing for monthly billing cycles.

## Decision 5: "Hours Saved" Calculation

**Decision**: Reuse the `TIME_SAVED` constants from `aiDigest.ts`:
- AR matching: 120s (2 min per manual match)
- Bank recon: 90s (1.5 min per classification)
- Fee classification: 60s (1 min per fee)
- Auto-approval (Triple-Lock): 300s (5 min full auto cycle)

**Rationale**: These constants are already established and documented in the email digest. Using the same values ensures consistency between the daily email and the in-app widget.

## Decision 6: Missing Fields Metric

**Decision**: "Missing fields" applies to OCR/expense extraction only. For the widget, we calculate it as: fee line items with `tier === undefined` or missing `accountCode` divided by total fee line items.

**Rationale**: The issue explicitly defines "Missing Fields" as "OCR extractions with missing data." AR matching and bank recon don't have a "missing fields" concept — they have confidence scores and correction rates instead.

## Decision 7: Widget Placement

**Decision**: Place the AI Performance widget as the first item after the ProactiveActionCenter in `complete-dashboard.tsx`, before the KPI metric cards. It should be a full-width card above the financial KPIs.

**Rationale**: AI Performance is a trust signal — users should see it before diving into financial numbers. The MindHive competitor places it prominently at the top. Placing it after ActionCenter but before KPIs follows the information hierarchy: alerts → AI trust → financial data.
