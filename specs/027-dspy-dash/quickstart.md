# Quickstart: DSPy Observability Dashboard

## Prerequisites

- Node.js 20+, Python 3.11+
- Convex CLI (`npx convex`)
- Access to `groot-finance` repo on branch `027-dspy-dash`

## Development Setup

1. **Checkout branch**:
   ```bash
   git checkout 027-dspy-dash
   ```

2. **Deploy Convex schema** (adds `dspy_metrics_daily` table):
   ```bash
   npx convex deploy --yes
   ```

3. **Deploy Lambda** (adds metrics emission to handler.py):
   ```bash
   cd infra && npx cdk deploy DocumentProcessingStack --profile groot-finanseal --region us-west-2
   ```

4. **Run dev server** (from main working directory only, NOT worktrees):
   ```bash
   npm run dev
   ```

5. **Access dashboard**: Navigate to `http://localhost:3000/en/admin/dspy-observability`

## Verifying Instrumentation

1. Trigger a fee classification from the app (process an expense claim with fees)
2. Check Convex dashboard for new row in `dspy_metrics_daily` table
3. Refresh the observability dashboard — health metrics should appear

## Key Files

| File | Purpose |
|------|---------|
| `convex/schema.ts` | `dspy_metrics_daily` table definition |
| `convex/http.ts` | `/ingest-dspy-metrics` HTTP endpoint |
| `convex/functions/dspyMetrics.ts` | Metrics CRUD + dashboard queries |
| `src/lambda/fee-classifier-python/handler.py` | Instrumented tool dispatch |
| `src/lambda/fee-classifier-python/metrics_emitter.py` | HTTP POST to Convex |
| `src/app/[locale]/admin/dspy-observability/page.tsx` | Dashboard page |
| `src/domains/admin/dspy-observability/` | Dashboard components + hooks |
