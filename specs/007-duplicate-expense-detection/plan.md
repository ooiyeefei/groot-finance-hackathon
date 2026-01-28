# Implementation Plan: Duplicate Expense Claim Detection

**Branch**: `007-duplicate-expense-detection` | **Date**: 2026-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-duplicate-expense-detection/spec.md`

## Summary

Implement rule-based duplicate expense claim detection with multi-tier matching (exact reference, strong vendor+date+amount, fuzzy normalized). Add pre-submission validation UI, visual duplicate indicators, cross-user "shared expense" detection, and "Correct & Resubmit" flow for rejected claims. Zero LLM cost, <500ms detection latency.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15.4.6), Python 3.11 (Lambda)
**Primary Dependencies**: Next.js App Router, Convex (real-time DB), React Hook Form, Tailwind CSS, shadcn/ui
**Storage**: Convex (reactive database with indexes)
**Testing**: Vitest
**Target Platform**: Web (Vercel serverless)
**Project Type**: Web application (monorepo with domains)
**Performance Goals**: <500ms p95 for duplicate detection, <100ms for tier-1 exact match
**Constraints**: Zero additional LLM cost, must work with existing 4-field match, support multi-currency
**Scale/Scope**: ~1000s expense claims per business, 30-day active window optimization

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Simplicity | ✅ PASS | Rule-based approach, extends existing 4-field match |
| Prefer Modification | ✅ PASS | Enhances existing `data-access.ts`, adds to existing schema |
| Domain-Driven | ✅ PASS | All changes in `expense-claims` domain |
| Test-First | ⚠️ PENDING | Will add Vitest tests for duplicate detection |
| Build-Fix Loop | ⚠️ PENDING | Will run `npm run build` after each change |

## Project Structure

### Documentation (this feature)

```text
specs/007-duplicate-expense-detection/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/domains/expense-claims/
├── components/
│   ├── create-expense-page-new.tsx    # MODIFY: Add duplicate warning UI
│   ├── duplicate-warning-modal.tsx    # NEW: Duplicate warning dialog
│   ├── expense-list-item.tsx          # MODIFY: Add duplicate badge
│   └── correct-resubmit-button.tsx    # NEW: Resubmit rejected claims
├── hooks/
│   ├── use-expense-form.ts            # MODIFY: Add pre-submit duplicate check
│   └── use-duplicate-detection.ts     # NEW: Duplicate detection hook
├── lib/
│   ├── data-access.ts                 # MODIFY: Enhance server duplicate detection
│   ├── duplicate-detection.ts         # NEW: Core detection logic
│   └── vendor-normalizer.ts           # NEW: Vendor name normalization
├── types/
│   └── expense-claims.ts              # MODIFY: Add duplicate types

convex/
├── schema.ts                          # MODIFY: Add duplicate fields to expense claims
└── functions/
    └── expenseClaims.ts               # MODIFY: Add checkDuplicates query

tests/
└── domains/expense-claims/
    └── duplicate-detection.test.ts    # NEW: Unit tests
```

**Structure Decision**: Follows existing domain-driven structure. New files only where separation of concerns requires it. Most changes are modifications to existing files.

## Complexity Tracking

> No constitution violations requiring justification.

| Item | Complexity | Justification |
|------|------------|---------------|
| New `DuplicateMatch` entity | Low | Simple reference table, no complex relationships |
| Vendor normalization | Low | Pure function, ~50 lines |
| Multi-tier matching | Medium | Clear tiered logic, well-tested |
