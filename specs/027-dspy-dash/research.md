# Research: DSPy Observability Dashboard

## Decision 1: Raw Metrics vs Daily Aggregates

**Decision**: Daily aggregate table (`dspy_metrics_daily`) — one row per business×tool×date.

**Rationale**: Convex free plan has 2GB bandwidth/month. Raw per-invocation metrics at ~500 rows/day × 90 days = 45K rows. Each dashboard load would scan ~15K rows (30-day window) × ~200 bytes = 3MB. At 10 loads/day = 900MB/month — dangerously close to the 2GB limit. Daily aggregates reduce this to ~750 rows × ~300 bytes = 225KB per load. 95% bandwidth reduction.

**Alternatives considered**:
- Raw per-invocation table: Most flexible but bandwidth-prohibitive on free plan
- CloudWatch Logs Insights at read time: Would avoid Convex storage but adds latency (5-15s per query) and AWS cost
- DynamoDB intermediate store: Extra infrastructure, sync complexity, no clear benefit

## Decision 2: Metrics Transport — Lambda → Convex

**Decision**: Lambda calls a Convex HTTP action directly after each classification.

**Rationale**: Simplest architecture, near-real-time data, no intermediate stores. The HTTP POST overhead (~50-100ms) is acceptable given classifications already take 1-10s. Convex HTTP endpoints support `httpAction` which can call `internalMutation`.

**Alternatives considered**:
- CloudWatch → cron sync: Delayed data (minutes to hours), complex log parsing
- S3/DynamoDB intermediate: Extra infrastructure for no clear benefit

## Decision 3: Tier 1 Hit Tracking

**Decision**: Add a lightweight counter increment in existing Convex mutations that handle rule-based classification (before Lambda is called).

**Rationale**: Tier 1 hits never invoke Lambda, so they produce no Lambda metrics. To show Tier 1 vs Tier 2 breakdown, we need Convex-side counting. The counter upserts the same `dspy_metrics_daily` aggregate row, so it's a single read+write per Tier 1 hit.

**Alternatives considered**:
- Infer from total transactions minus Lambda invocations: Inaccurate if some transactions don't involve classification at all
- Skip Tier 1 tracking: Loses a key cost metric

## Decision 4: Dashboard Data Loading Pattern

**Decision**: `action` + `internalQuery` (one-time load on mount, stored in React state). Not reactive `query`.

**Rationale**: Per CLAUDE.md rule: "Never use reactive `query` for heavy aggregations." Dashboard widgets use `useAction` + `useEffect` on mount. Results stored in React state. Manual refresh button for re-fetching.

**Existing pattern**: `use-ai-performance.ts` and `use-automation-rate.ts` already use this exact pattern.

## Decision 5: Data Retention

**Decision**: 90 days, with a daily Convex cron that purges older aggregate rows.

**Rationale**: 90 days covers ~3 months of trend data, sufficient to observe BootstrapFewShot ramp-up cycles. With daily aggregates, 90 days × 10 businesses × 5 tools = 4,500 rows max — well within storage limits. Cleanup cron reads/deletes ~50 rows/day, negligible bandwidth.

## Decision 6: Correction Funnel Data Source

**Decision**: Query existing correction tables directly (no new data needed).

**Rationale**: The 5 correction tables (`fee_classification_corrections`, `bank_recon_corrections`, `order_matching_corrections`, `po_match_corrections`, `vendor_item_matching_corrections`) already have businessId indexes. Count per business per tool gives the correction funnel. The 20-correction threshold check is a simple count query.

## Decision 7: Accuracy Tracking

**Decision**: Track `correct_count` and `override_count` in daily aggregates. Accuracy = correct_count / (correct_count + override_count).

**Rationale**: "Correct on first try" means the user didn't override the classification. When a user submits a correction (writes to a correction table), that's an override. When no correction is submitted, it's correct. We track both counters in the daily aggregate. Override count comes from the Convex mutation that saves corrections (increment override counter on `dspy_metrics_daily`).

## Decision 8: Cost Estimation

**Decision**: Estimate tokens from Gemini response metadata (prompt_tokens + completion_tokens) × Gemini Flash-Lite pricing ($0.25/1M input, $1.50/1M output).

**Rationale**: LiteLLM (used by DSPy) returns token counts in response metadata. The Lambda handler can extract these and include them in the metrics payload. Exact billing-level accuracy isn't required per spec (SC-005 says ±20%).

## Decision 9: Admin Access Control

**Decision**: Clerk-based role check. Only users with `admin` role (from `business_memberships` table) can access the dashboard.

**Rationale**: Existing pattern — the app already has role-based access via Clerk + `business_memberships`. The page server component checks `auth()` and verifies admin role before rendering.
