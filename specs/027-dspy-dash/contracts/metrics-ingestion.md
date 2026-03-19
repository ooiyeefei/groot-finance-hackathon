# API Contract: DSPy Metrics Ingestion

## Endpoint: POST /ingest-dspy-metrics

**Purpose**: Lambda → Convex HTTP endpoint for recording classification metrics.
**Auth**: `X-Internal-Key` header (same as MCP server pattern via `MCP_INTERNAL_SERVICE_KEY`).

### Request Body

```json
{
  "businessId": "string (Convex business ID)",
  "tool": "classify_fees | classify_bank_transaction | match_orders | match_po_invoice | match_vendor_items",
  "usedDspy": true,
  "modelVersion": "fallback_gemini | inline_bootstrap | dspy-models/shopee/v2.json",
  "confidence": 0.85,
  "refineRetries": 1,
  "latencyMs": 2340,
  "inputTokens": 1200,
  "outputTokens": 350,
  "success": true,
  "errorType": null
}
```

### Response

**200 OK**: `{ "ok": true }`
**401 Unauthorized**: Missing or invalid `X-Internal-Key`
**400 Bad Request**: Missing required fields

### Behavior

1. Validate `X-Internal-Key` against `MCP_INTERNAL_SERVICE_KEY` env var
2. Compute today's date (UTC)
3. Upsert `dspy_metrics_daily` row for `businessId × tool × date`:
   - If row exists: increment counters
   - If row doesn't exist: create with initial values
4. Return `{ "ok": true }`

---

## Convex Actions (Frontend → Backend)

### `getDspyOverview` (action)

**Purpose**: Cross-business overview for dashboard landing page.
**Input**: `{ timeWindow: "24h" | "7d" | "30d" }`
**Output**: Array of per-business summaries with per-tool health indicators.

### `getDspyBusinessDetail` (action)

**Purpose**: Drill-down into single business metrics.
**Input**: `{ businessId: string, timeWindow: "24h" | "7d" | "30d" }`
**Output**: Per-tool daily time series + correction funnel data.

### `getCorrectionFunnels` (action)

**Purpose**: Per-business correction counts across all 5 tools.
**Input**: `{}`
**Output**: Array of `{ businessId, businessName, tools: [{ tool, correctionCount, threshold: 20 }] }`

### `recordTier1Hit` (internalMutation)

**Purpose**: Increment Tier 1 counter when Convex handles classification without Lambda.
**Input**: `{ businessId: Id, tool: string }`
**Output**: void
