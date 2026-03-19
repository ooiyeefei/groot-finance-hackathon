# Implementation Plan: DSPy Observability Dashboard

**Branch**: `027-dspy-dash` | **Date**: 2026-03-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/027-dspy-dash/spec.md`

## Summary

Internal dashboard to measure whether DSPy's self-improvement loop actually works. Instruments all 5 DSPy Lambda tools to emit classification metrics via Convex HTTP action, stores daily aggregates (not raw per-invocation rows) to minimize Convex bandwidth, and provides an admin-only dashboard at `/admin/dspy-observability/` with health, self-improvement, and cost views.

**Key design decision**: Daily aggregate table (`dspy_metrics_daily`) instead of raw per-invocation metrics. Each Lambda call upserts counters on one row per business×tool×day. Dashboard reads ~150-750 aggregate rows instead of scanning thousands of raw rows. This cuts Convex bandwidth by ~95%.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (frontend + Convex), Python 3.11 (Lambda instrumentation)
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, Recharts (existing), Radix UI (existing)
**Storage**: Convex (`dspy_metrics_daily` aggregate table + existing correction tables)
**Testing**: `npm run build` (type-check), manual UAT via dashboard
**Target Platform**: Web (internal admin page)
**Project Type**: Web application (existing Next.js + Convex monolith)
**Performance Goals**: Dashboard loads <5s, Lambda metrics overhead <100ms per classification
**Constraints**: Convex free plan (2GB bandwidth/mo, 1GB storage). Must use `action` + `internalQuery` for all dashboard reads (no reactive `query`)
**Scale/Scope**: ~10 businesses, 5 tools, ~500 classifications/day, 90-day retention

## Constitution Check

*GATE: Pass — constitution.md is a template with no project-specific gates defined.*

## Project Structure

### Documentation (this feature)

```text
specs/027-dspy-dash/
├── plan.md              # This file
├── research.md          # Phase 0 — design decisions
├── data-model.md        # Phase 1 — Convex table schema
├── quickstart.md        # Phase 1 — dev setup
├── contracts/           # Phase 1 — API contracts
│   └── metrics-ingestion.md
└── tasks.md             # Phase 2 — implementation tasks
```

### Source Code (repository root)

```text
# Lambda instrumentation (Python)
src/lambda/fee-classifier-python/
├── handler.py                    # MODIFY — add metrics emission after each tool dispatch
└── metrics_emitter.py            # NEW — HTTP POST to Convex HTTP endpoint

# Convex backend
convex/
├── schema.ts                     # MODIFY — add dspy_metrics_daily table
├── http.ts                       # MODIFY — add /ingest-dspy-metrics HTTP endpoint
├── functions/
│   ├── dspyMetrics.ts            # NEW — internalMutation for metrics upsert, internalQuery for dashboard reads, action for frontend
│   └── feeClassificationActions.ts  # MODIFY — add Tier 1 hit counter
│   └── bankReconActions.ts       # MODIFY — add Tier 1 hit counter (if applicable)

# Frontend dashboard
src/domains/admin/
├── dspy-observability/
│   ├── components/
│   │   ├── dspy-dashboard.tsx          # NEW — main dashboard client component
│   │   ├── health-overview.tsx         # NEW — per-tool health cards
│   │   ├── self-improvement-panel.tsx  # NEW — correction funnel + confidence trends
│   │   ├── cost-panel.tsx              # NEW — Gemini spend + Tier 1/2 breakdown
│   │   └── business-detail.tsx         # NEW — drill-down view
│   └── hooks/
│       └── use-dspy-metrics.ts         # NEW — useAction-based data fetching
src/app/[locale]/admin/
    └── dspy-observability/
        └── page.tsx                    # NEW — server component page shell
```

**Structure Decision**: This is an internal admin feature within the existing Next.js + Convex app. It follows the domain-driven design pattern from CLAUDE.md — admin dashboards go under `src/domains/admin/` with their page route at `src/app/[locale]/admin/`. All dashboard data uses `action` + `internalQuery` (not reactive `query`) per the Convex bandwidth rules.
