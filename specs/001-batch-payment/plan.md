# Implementation Plan: Batch Payment Processing

**Branch**: `001-batch-payment` | **Date**: 2026-03-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-batch-payment/spec.md`

## Summary

Add a "Payment Processing" tab to the Manager Approvals page where finance admins can view all approved expense claims pending payment, select claims via checkboxes (with filters and group-by-employee), and batch-mark them as "reimbursed" — atomically updating both expense claims and their linked accounting entries. Running totals are grouped by currency. Optional payment details (date, method, reference) can be recorded.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0
**Storage**: Convex (document database with real-time subscriptions)
**Testing**: Manual + build verification (`npm run build`)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Process 100+ claims in a single batch without timeout
**Constraints**: Must follow existing design system (semantic tokens), role-based access (finance_admin, owner)
**Scale/Scope**: Typical SME usage — 1-50 claims per batch

## Constitution Check

*No project-specific constitution defined. Following CLAUDE.md project rules as constraints.*

Gates passed:
- Semantic design tokens: Will use `bg-card`, `text-foreground`, `bg-primary` etc.
- Button styling: Action buttons use `bg-primary hover:bg-primary/90 text-primary-foreground`
- Number formatting: Will use `formatCurrency` from `@/lib/utils/format-number`
- Date formatting: Will use `formatBusinessDate` from `@/lib/utils`
- Convex deployment: Will run `npx convex deploy --yes` after changes

## Project Structure

### Documentation (this feature)

```text
specs/001-batch-payment/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── tasks.md             # Phase 2 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
# Convex backend (mutations + queries)
convex/functions/
├── expenseClaims.ts          # Add batchMarkAsPaid mutation
└── payments.ts               # (existing, may reference)

# Frontend - Manager Approvals domain
src/domains/manager-approvals/
├── components/
│   └── payment-processing-tab.tsx    # NEW: Main batch payment UI
├── hooks/
│   └── use-payment-processing.ts     # NEW: Convex query + mutation hooks

# Manager Approvals page (add tab)
src/app/[locale]/manager-approvals/
└── page.tsx                          # MODIFY: Add Payment Processing tab
```

**Structure Decision**: Feature integrates into the existing Manager Approvals domain. One new component (payment processing tab), one new hook, one new Convex mutation, and a modification to the Manager Approvals page to add the tab. Minimal file creation, maximum reuse of existing patterns.
