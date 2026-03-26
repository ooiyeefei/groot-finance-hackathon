# Research: Self-Improving Action Center (DSPy Feedback Loops)

**Date**: 2026-03-24
**Feature**: 033-ai-action-center-dspy

## Decision 1: Which algorithms get DSPy modules?

### Analysis of all 7 detection algorithms

| # | Algorithm | Type | DSPy Fit | Reason |
|---|-----------|------|----------|--------|
| 1 | Statistical Anomaly (>2σ) | Pure statistics | NO | Math-based; feedback doesn't improve σ calculation |
| 2 | Categorization Quality | Binary fact check | NO | "Is accountName missing?" — no prediction involved |
| 3 | Cash Flow Warnings | Financial math | NO | Deterministic burn rate; dismissal = external context |
| 4a | Vendor Concentration | Policy threshold | NO | >50% is business policy, not classification |
| 4b | Vendor Spending Changes | Policy threshold | NO | >50% change is policy, not classification |
| 4c | Vendor Risk Scoring | Weighted scoring | NO | Policy weights; simpler to expose configurable weights |
| 4d | Price Anomalies | Surface pre-computed | NO | Just displays data from vendor_price_anomalies table |
| 5a | Deadline Alerts | Date comparison | NO | Calendar logic; no prediction |
| 5b | Cash Balance | Burn rate forecast | NO | Financial math |
| 5c | Duplicate Transactions | Deterministic match | NO | Same amount+date+desc grouping |
| 6 | Stale Payables | Age check | NO | Time-based fact |
| 7a | Split Claims | Heuristic | NO (yet) | Insufficient data; keep threshold for now |
| 7b | Employee Expense Spike | Classification | YES | Rich context for DSPy: role, history, merchants, timing |

### Decision: Unified post-filter relevance classifier

Rather than building per-algorithm DSPy modules (only 1 qualifies independently), build a **single unified post-filter** that classifies ANY candidate insight as relevant/noise for a specific business.

**Rationale**:
- All 7 algorithms produce candidate insights with the same structure (title, description, category, priority, affected entities)
- User feedback is always the same signal: "this insight is useful" vs "this is noise"
- A unified classifier learns cross-algorithm patterns: "Business X doesn't care about vendor concentration" or "Business Y finds expense spike alerts valuable"
- Training data accumulates faster across all algorithms (reaching 20-correction threshold sooner)
- Simpler architecture: one DSPy module, one training pipeline, one model per business

**Alternatives considered**:
- Per-algorithm modules: Only 1 algorithm (7b) has enough classification richness; the rest are policy thresholds. Per-algorithm models would starve for training data.
- No DSPy at all, just suppress repeated dismissals: Too simple — doesn't generalize to similar-but-not-identical insights.

## Decision 2: DSPy module design (post-filter relevance classifier)

### Input features (from candidate insight)
- `insightType` (e.g., "statistical_anomaly", "employee_expense_spike")
- `category` (anomaly, compliance, deadline, cashflow, optimization, categorization)
- `priority` (critical, high, medium, low)
- `title` (text)
- `description` (text, truncated to 200 chars for DSPy)
- `affectedEntities` (vendor names, employee names, account names)
- `businessId` (for per-business model loading)

### Output
- `relevant`: boolean (true = show to user, false = suppress)
- `confidence`: float 0-1 (for observability; not used in logic initially)

### Training signal
- `isUseful: true` (user actioned/reviewed) → relevant = true
- `isUseful: false` (user dismissed) → relevant = false
- Optional `feedbackText` provides rationale for few-shot examples

## Decision 3: Corrections table — new vs extend existing

### Decision: New `action_center_corrections` table

**Rationale**:
- Existing `chat_agent_corrections` is specific to chat intent/tool/parameter corrections
- Action Center corrections have different schema: insightType, algorithm, original insight context
- Separate table avoids polluting chat training data
- Follows same pattern: consumed flag, businessId isolation, correction type indexing

**Alternatives considered**:
- Extend `chat_agent_corrections` with new correction types: Mixes domains; chat optimization pipeline would need to filter out action center corrections
- Store in `actionCenterInsights.metadata`: Works for storage but hard to query efficiently for training (no index on metadata subfields)

## Decision 4: Where to store feedback — metadata vs new field

### Decision: Add `userFeedback` field to `actionCenterInsights` table + separate corrections table

**Rationale**:
- `userFeedback` on the insight record is the source of truth for "what the user said"
- `action_center_corrections` is the training-ready copy with denormalized context
- The `metadata` field exists but querying nested JSON for training is fragile
- A top-level `userFeedback` field is simpler to index and query

## Decision 5: Model storage and loading

### Decision: Reuse existing infrastructure

- **S3 key pattern**: `dspy-models/action-center-relevance/{businessId}/v{N}.json`
- **Convex table**: Reuse `dspy_model_versions` with `module: "action-center-relevance"`
- **Loading**: Extend `model-version-loader.ts` with business-scoped lookup
- **Cache**: Same 5min in-memory TTL

**Rationale**: Proven infrastructure; no new Lambda or S3 buckets needed.

## Decision 6: EventBridge scheduling

### Decision: Add new rule to existing `scheduled-intelligence-stack.ts`

- Schedule: Weekly, Sunday 2am UTC (same as chat optimization)
- Module name: `action-center-dspy-optimization`
- Lambda: Reuse `finanseal-dspy-optimizer` (Python Docker)
- Dispatcher: Reuse `finanseal-scheduled-intelligence` (Node.js)

**Rationale**: EventBridge-first architecture already handles DSPy optimization. Adding a new rule costs nothing on free tier.

## Decision 7: First-run quality gate behavior

### Decision: Auto-pass first run (no previous model to compare)

Following existing pattern in `chatOptimizationNew.ts`: when `previousAccuracy === undefined`, the candidate is automatically promoted. This is safe because the first model can only improve over the default (no filtering).
