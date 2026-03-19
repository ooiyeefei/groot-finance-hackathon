# Tasks: DSPy Observability Dashboard

**Branch**: `027-dspy-dash` | **Date**: 2026-03-19

## Task 1: Add `dspy_metrics_daily` table to Convex schema
**Priority**: P0 (blocks everything)
**Files**: `convex/schema.ts`
**Description**: Add the daily aggregate table with all counter fields and 3 indexes (by_business_tool_date, by_date, by_business).
**Acceptance**: Schema compiles, `npx convex deploy --yes` succeeds.

## Task 2: Create Convex metrics functions
**Priority**: P0 (blocks Task 3 + Task 5)
**Files**: `convex/functions/dspyMetrics.ts`
**Description**: Create:
- `upsertMetric` (internalMutation) — upsert daily aggregate row, increment counters
- `recordTier1Hit` (internalMutation) — increment tier1Hits counter
- `recordOverride` (internalMutation) — increment overrideCount counter
- `getDspyOverview` (action via internalQuery) — cross-business overview
- `getDspyBusinessDetail` (action via internalQuery) — single business drill-down
- `getCorrectionFunnels` (action via internalQuery) — correction counts from 5 correction tables
- `cleanupOldMetrics` (internalMutation) — delete rows older than 90 days
**Acceptance**: Functions compile, type-check passes.

## Task 3: Add Convex HTTP endpoint for Lambda ingestion
**Priority**: P0 (blocks Task 4)
**Files**: `convex/http.ts`
**Description**: Add POST `/ingest-dspy-metrics` endpoint. Validate `X-Internal-Key` header against `MCP_INTERNAL_SERVICE_KEY`. Parse body, call `upsertMetric` internalMutation.
**Acceptance**: HTTP endpoint responds to POST with valid auth.

## Task 4: Instrument Lambda handler with metrics emission
**Priority**: P1
**Files**: `src/lambda/fee-classifier-python/handler.py`, `src/lambda/fee-classifier-python/metrics_emitter.py` (new)
**Description**: After each tool dispatch in `lambda_handler()`, emit metrics via HTTP POST to Convex endpoint. Create `metrics_emitter.py` module with `emit_metric(tool, business_id, result, latency_ms, refine_retries, tokens)` function. Extract token counts from LiteLLM response metadata.
**Acceptance**: Lambda invocations produce rows in `dspy_metrics_daily` table.

## Task 5: Add Tier 1 hit counters in Convex mutations
**Priority**: P2
**Files**: `convex/functions/feeClassificationActions.ts` (and other actions that skip Lambda)
**Description**: In existing mutations where Tier 1 rules handle classification without calling Lambda, add `recordTier1Hit` call. Identify all code paths where rule-based classification is used.
**Acceptance**: Tier 1 classifications increment `tier1Hits` in `dspy_metrics_daily`.

## Task 6: Add override counter in correction mutations
**Priority**: P2
**Files**: Existing correction mutations (fee, bank recon, AR, PO, vendor item)
**Description**: When a user saves a correction (writes to any of the 5 correction tables), also call `recordOverride` to increment `overrideCount` in `dspy_metrics_daily`.
**Acceptance**: User corrections increment override counter.

## Task 7: Add 90-day cleanup cron
**Priority**: P2
**Files**: `convex/crons.ts`
**Description**: Add daily cron that calls `cleanupOldMetrics` to delete `dspy_metrics_daily` rows older than 90 days.
**Acceptance**: Cron runs daily, old rows are purged.

## Task 8: Create dashboard page and components
**Priority**: P1
**Files**: `src/app/[locale]/admin/dspy-observability/page.tsx`, `src/domains/admin/dspy-observability/components/*`, `src/domains/admin/dspy-observability/hooks/use-dspy-metrics.ts`
**Description**: Create the admin dashboard page with:
- Server component page shell (auth check, Sidebar, HeaderWithUser)
- Client component with 3 sections: Health Overview, Self-Improvement, Cost
- Cross-business overview as default view
- Business drill-down on click
- Time window filter (24h, 7d, 30d)
- Correction funnel progress bars
- Confidence trend charts (Recharts)
- Health degradation flags (retry rate >30%, fallback rate >10%)
- Uses `useAction` pattern for all data loading (no reactive queries)
**Acceptance**: Dashboard renders with mock/real data, `npm run build` passes.

## Dependency Order

```
Task 1 (schema) → Task 2 (functions) → Task 3 (HTTP endpoint) → Task 4 (Lambda)
                                      → Task 5 (Tier 1 counters)
                                      → Task 6 (override counters)
                                      → Task 7 (cleanup cron)
Task 2 (functions) → Task 8 (dashboard)
```
