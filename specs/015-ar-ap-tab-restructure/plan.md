# Implementation Plan: AR/AP Two-Level Tab Restructure

**Branch**: `015-ar-ap-tab-restructure` | **Date**: 2026-02-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-ar-ap-tab-restructure/spec.md`

## Summary

Restructure the Invoices page from a flat 5-tab layout into a two-level tab architecture with Account Receivables (AR) and Account Payables (AP) as top-level tabs. Each top-level tab contains domain-specific sub-tabs. Two new components are needed: AR Dashboard (analytics) and Price Intelligence UI. The standalone `/en/payables` route and sidebar link are removed, with a redirect to the new AP section.

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Radix UI Tabs, Clerk 6.30.0, lucide-react
**Storage**: Convex (real-time document database with subscriptions)
**Testing**: UAT via Playwright MCP (no unit test framework in use)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Tab switches under 1 second (client-side, no server round-trip), lazy-loaded sub-tab content
**Constraints**: Must maintain existing hash-based routing pattern, must be finance_admin role-gated, mobile sub-tabs must be scrollable
**Scale/Scope**: 8 sub-tabs (4 AR + 4 AP), 2 new components, ~10 files modified/created

## Constitution Check

*Constitution is template (not project-customized). No specific gates to enforce. Following project CLAUDE.md guidelines instead:*

- [x] Use semantic design tokens (no hardcoded colors)
- [x] Use existing UI components from `@/components/ui`
- [x] Follow layer hierarchy: bg-background → bg-surface → bg-card → bg-muted
- [x] Action buttons: bg-primary, not gray/secondary
- [x] `npm run build` must pass before completion
- [x] Git author: grootdev-ai / dev@hellogroot.com

## Project Structure

### Documentation (this feature)

```text
specs/015-ar-ap-tab-restructure/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no new APIs)
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── domains/
│   ├── invoices/
│   │   └── components/
│   │       ├── invoices-tab-container.tsx    # REPLACE — new two-level AR/AP container
│   │       └── documents-container.tsx       # EXISTING — moves under AP > Incoming Invoices
│   ├── sales-invoices/
│   │   └── components/
│   │       ├── sales-invoice-list.tsx        # EXISTING — moves under AR > Sales Invoices
│   │       ├── debtor-list.tsx               # EXISTING — moves under AR > Debtors
│   │       ├── aging-report.tsx              # EXISTING — data reused in AR Dashboard
│   │       ├── catalog-item-manager.tsx      # EXISTING — moves under AR > Product Catalog
│   │       └── ar-dashboard.tsx              # NEW — AR analytics dashboard
│   └── payables/
│       └── components/
│           ├── ap-dashboard.tsx              # EXISTING — moves under AP > Dashboard
│           ├── vendor-manager.tsx            # EXISTING — moves under AP > Vendors
│           ├── payables-tab-container.tsx     # DELETE — replaced by unified container
│           └── price-intelligence.tsx         # NEW — price history/alerts/comparison UI
├── app/
│   └── [locale]/
│       ├── invoices/
│       │   └── page.tsx                     # MODIFY — no code changes needed (renders InvoicesTabContainer)
│       └── payables/
│           └── page.tsx                     # MODIFY — redirect to /invoices#ap-dashboard
└── components/
    └── ui/
        └── sidebar.tsx                      # MODIFY — remove Payables link
```

**Structure Decision**: Follows existing domain-driven structure. New components live in their respective domain folders. The unified tab container replaces both `InvoicesTabContainer` and `PayablesTabContainer`.

## Complexity Tracking

No constitution violations to justify.
