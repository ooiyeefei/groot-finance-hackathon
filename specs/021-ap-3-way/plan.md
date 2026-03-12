# Implementation Plan: AP 3-Way Matching

**Branch**: `021-ap-3-way` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)

## Summary

Build PO and GRN management with 3-way matching (PO ↔ Invoice ↔ GRN) within the existing Payables domain. Adds 4 new Convex tables, extends the CSV parser with PO/GRN schemas, and builds tab-based UI for purchase order lifecycle, goods receipt, matching engine with variance detection, and review workflows. Auto-matching triggers when invoices contain PO references. Matching gates payable creation for PO-linked invoices.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Clerk 6.30.0, lucide-react, Radix UI
**Storage**: Convex (document database with real-time subscriptions)
**Testing**: `npm run build` (TypeScript compilation + Next.js build)
**Target Platform**: Web (responsive)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Match creation + variance detection < 5 seconds; dashboard loads within acceptable time for 500 active POs
**Constraints**: PO and GRN tabs within existing payables domain; matching gates payable creation; admin/manager role for match approval
**Scale/Scope**: SMEs with up to 500 active POs, 100k accounting entries

## Constitution Check

No project-specific constitution gates defined. Proceeding with standard codebase conventions from CLAUDE.md.

## Project Structure

### Documentation (this feature)

```text
specs/021-ap-3-way/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Schema design
├── quickstart.md        # Build order reference
├── contracts/
│   └── convex-functions.md  # Convex function signatures
├── checklists/
│   └── requirements.md  # Spec quality validation
└── tasks.md             # Implementation tasks (from /speckit.tasks)
```

### Source Code (repository root)

```text
convex/
├── schema.ts                    # MODIFY: Add 4 new tables + accounting_entries fields
└── functions/
    ├── purchaseOrders.ts        # NEW: PO CRUD + number generation
    ├── goodsReceivedNotes.ts    # NEW: GRN CRUD + PO status sync
    ├── poMatches.ts             # NEW: Matching engine + variance detection + review
    ├── matchingSettings.ts      # NEW: Business-level tolerance settings
    └── accountingEntries.ts     # MODIFY: Add match gating check

src/lib/csv-parser/
├── lib/schema-definitions.ts   # MODIFY: Add PO_FIELDS and GRN_FIELDS
└── types/index.ts               # MODIFY: Extend SchemaType union

src/domains/payables/
├── components/
│   ├── po-list.tsx              # NEW: Purchase order list with filters
│   ├── po-form.tsx              # NEW: Create/edit PO form
│   ├── po-detail.tsx            # NEW: PO detail view with GRN/match context
│   ├── grn-list.tsx             # NEW: GRN list view
│   ├── grn-form.tsx             # NEW: GRN form (pre-populated from PO)
│   ├── match-list.tsx           # NEW: Match records list
│   ├── match-review.tsx         # NEW: Side-by-side match comparison
│   ├── unmatched-report.tsx     # NEW: Unmatched documents tabs
│   ├── matching-summary.tsx     # NEW: Dashboard summary cards
│   ├── matching-settings.tsx    # NEW: Tolerance configuration
│   └── ap-dashboard.tsx         # MODIFY: Add matching summary section
├── hooks/
│   ├── use-purchase-orders.ts   # NEW: PO query/mutation hooks
│   ├── use-grns.ts              # NEW: GRN query/mutation hooks
│   └── use-matches.ts           # NEW: Match query/mutation hooks
└── lib/
    └── variance-detector.ts     # NEW: Shared variance calculation logic
```

**Structure Decision**: All new code lives within the existing `src/domains/payables/` domain and `convex/functions/`. No new domains, routes, or sidebar entries. PO, GRN, and Matching are accessed via tabs within the payables page.
