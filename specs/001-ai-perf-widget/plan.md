# Implementation Plan: AI Performance Widget

**Branch**: `001-ai-perf-widget` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ai-perf-widget/spec.md`

## Summary

Add an AI Performance Widget to the analytics dashboard that aggregates real-time metrics across AR matching, bank reconciliation, fee classification, and OCR. Reuses the existing `gatherAIActivity` bridge pattern from `aiDigest.ts` — extended with date-range filtering, confidence averaging, and trend comparison. No new tables needed; all data derived from existing tables via a new Convex query. Frontend is a single card component with donut chart (recharts, already installed), hero metric, and period selector.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, recharts (already installed), lucide-react
**Storage**: Convex document database (existing tables — no new tables)
**Testing**: `npm run build` (type checking + build validation)
**Target Platform**: Web (desktop + tablet responsive)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Widget loads within 2s, period switch within 1s
**Constraints**: Multi-tenant isolation (businessId scoping), no new Convex tables
**Scale/Scope**: Single widget component + 1 Convex query + integration into existing dashboard

## Constitution Check

*GATE: No project constitution defined — proceeding with CLAUDE.md rules.*

- [x] Domain-Driven Design: Widget is analytics domain (`src/domains/analytics/`) — correct placement
- [x] No new files without need: Minimal new files — 1 Convex query, 1 React component, 1 hook
- [x] Semantic design tokens: Will use `bg-card`, `text-foreground`, etc. per design system
- [x] Button styling: N/A (no action buttons in this widget)
- [x] Page layout pattern: Analytics page already has sidebar + header — adding to existing layout
- [x] Convex deploy: Will run `npx convex deploy --yes` after query changes

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-perf-widget/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── ai-performance-query.ts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
convex/functions/
└── aiPerformanceMetrics.ts    # New: Convex query aggregating AI metrics

src/domains/analytics/
├── components/
│   ├── complete-dashboard.tsx  # Modified: Add AIPerformanceWidget import
│   └── ai-performance/
│       └── AIPerformanceWidget.tsx  # New: Main widget component (donut + hero + metrics)
└── hooks/
    └── use-ai-performance.ts   # New: React hook wrapping Convex query with period state
```

**Structure Decision**: All new code fits within the existing `src/domains/analytics/` domain. The Convex query extends the bridge pattern from `aiDigest.ts` with date-range support and confidence averaging. No new domain or shared lib needed.
