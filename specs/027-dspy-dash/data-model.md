# Data Model: DSPy Observability Dashboard

## New Table: `dspy_metrics_daily`

Daily aggregate of DSPy classification metrics per business × tool × date.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `businessId` | `Id<"businesses">` | Business that owns these metrics |
| `tool` | `string` | Tool name: `classify_fees`, `classify_bank_transaction`, `match_orders`, `match_po_invoice`, `match_vendor_items` |
| `date` | `string` | ISO date (YYYY-MM-DD) — aggregation key |
| `tier1Hits` | `number` | Count of classifications handled by Tier 1 rules (no Lambda) |
| `tier2Invocations` | `number` | Count of Lambda invocations (Tier 2 AI) |
| `successCount` | `number` | Successful Tier 2 classifications |
| `failureCount` | `number` | Failed Tier 2 classifications (errors, timeouts) |
| `fallbackCount` | `number` | Classifications with confidence=0.0 (model gave up) |
| `dspyUsedCount` | `number` | Classifications where BootstrapFewShot/MIPROv2 was used (`usedDspy=true`) |
| `dspyNotUsedCount` | `number` | Classifications using base/fallback model (`usedDspy=false`) |
| `sumConfidence` | `number` | Sum of confidence scores (divide by tier2Invocations for avg) |
| `sumConfidenceDspy` | `number` | Sum of confidence scores when `usedDspy=true` (for before/after comparison) |
| `sumConfidenceBase` | `number` | Sum of confidence scores when `usedDspy=false` |
| `sumLatencyMs` | `number` | Sum of latency in ms (divide by tier2Invocations for avg) |
| `totalRefineRetries` | `number` | Total Refine retry attempts across all classifications |
| `sumInputTokens` | `number` | Estimated total input tokens consumed |
| `sumOutputTokens` | `number` | Estimated total output tokens consumed |
| `overrideCount` | `number` | User corrections/overrides recorded this day (from correction tables) |

### Indexes

| Index Name | Fields | Purpose |
|------------|--------|---------|
| `by_business_tool_date` | `[businessId, tool, date]` | Primary lookup: get metrics for a business×tool in a date range |
| `by_date` | `[date]` | Cleanup: find and delete rows older than 90 days |
| `by_business` | `[businessId]` | Overview: get all tool metrics for a business |

### Derived Metrics (computed at read time, not stored)

| Metric | Formula |
|--------|---------|
| Average confidence | `sumConfidence / tier2Invocations` |
| Average confidence (DSPy) | `sumConfidenceDspy / dspyUsedCount` |
| Average confidence (Base) | `sumConfidenceBase / dspyNotUsedCount` |
| Average latency | `sumLatencyMs / tier2Invocations` |
| Success rate | `successCount / tier2Invocations` |
| Refine retry rate | `totalRefineRetries / tier2Invocations` |
| Fallback rate | `fallbackCount / tier2Invocations` |
| Tier 1 hit rate | `tier1Hits / (tier1Hits + tier2Invocations)` |
| Estimated cost | `(sumInputTokens × $0.25/1M) + (sumOutputTokens × $1.50/1M)` |
| Accuracy | `1 - (overrideCount / (tier1Hits + tier2Invocations))` |

### State Lifecycle

1. **Created**: First classification of the day for a business×tool upserts a new row with initial counters
2. **Updated**: Subsequent classifications increment counters on the same row (atomic upsert)
3. **Purged**: Daily cron deletes rows where `date` < today - 90 days

### Bandwidth Analysis

- **Write**: 1 read + 1 write per classification (~500/day = 500 reads + 500 writes = ~200KB/day)
- **Dashboard read**: ~750 rows × 300 bytes = ~225KB per load. At 10 loads/day = 2.25MB/day = ~68MB/month
- **Cleanup cron**: ~50 reads + 50 deletes per day = negligible
- **Total estimated**: ~70MB/month — well within 2GB limit (3.5% usage)

## Existing Tables Used (Read Only)

### `fee_classification_corrections`
- Query by `businessId` to count corrections per business for fee tool
- Used for correction funnel (progress toward 20-correction threshold)

### `bank_recon_corrections`
- Same pattern for bank reconciliation tool

### `order_matching_corrections`
- Same pattern for AR matching tool

### `po_match_corrections`
- Same pattern for PO matching tool

### `vendor_item_matching_corrections`
- Same pattern for vendor item matching tool

### Correction Diversity Query
- For each correction table: count distinct original values / total corrections
- High ratio = diverse corrections (DSPy generalizing)
- Low ratio = repetitive corrections (DSPy not learning)
