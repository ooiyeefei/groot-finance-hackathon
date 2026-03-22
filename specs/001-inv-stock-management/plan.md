# Implementation Plan: Inventory / Stock Management

**Branch**: `001-inv-stock-management` | **Date**: 2026-03-22 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-inv-stock-management/spec.md`

## Summary

Add multi-location inventory tracking to Groot Finance, transforming it from pure accounting into a lightweight ERP. Stock-in is triggered from AP invoice OCR (atomically with journal posting), stock-out from sales invoice issuance. Three new Convex tables (`inventory_locations`, `inventory_stock`, `inventory_movements`) track quantities per product per location. Weighted average cost in home currency, with original currency preserved per IAS 2/21.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7, Convex 1.31.3)
**Primary Dependencies**: Convex (DB + real-time), React 19.1.2, Radix UI, Tailwind CSS, lucide-react
**Storage**: Convex (3 new tables + 2 modified tables)
**Testing**: Manual UAT via production URL (finance.hellogroot.com)
**Target Platform**: Web (Next.js on Vercel)
**Project Type**: Web application (Next.js frontend + Convex backend)
**Performance Goals**: Stock queries < 3 seconds, supports 50 locations + 10K catalog items per business
**Constraints**: Convex free plan bandwidth limits — use `action` for dashboard aggregations, not reactive `query`
**Scale/Scope**: SME businesses, 6 user stories, 29 functional requirements, ~15 files to create, ~6 files to modify

## Constitution Check

*No project-specific constitution gates defined. Following CLAUDE.md mandatory rules:*
- ✅ Domain-driven design: New `src/domains/inventory/` domain
- ✅ Convex bandwidth rules: Dashboard uses `action` not `query` for aggregations
- ✅ Page layout pattern: Server components with sidebar + header
- ✅ Design system: Semantic tokens, no hardcoded colors
- ✅ IFRS compliance: Double-entry bookkeeping, IAS 2 inventory valuation
- ✅ Least privilege: finance_admin only
- ✅ Feature info drawer: "How It Works" included

## Project Structure

### Documentation (this feature)

```text
specs/001-inv-stock-management/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Research findings
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Implementation guide
├── contracts/
│   └── convex-functions.md  # Phase 1: API contracts
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2: Implementation tasks (next step)
```

### Source Code (new files)

```text
src/domains/inventory/
├── components/
│   ├── inventory-dashboard.tsx        # Dashboard overview (P3)
│   ├── location-management.tsx        # Location CRUD list (P1)
│   ├── location-form.tsx              # Create/edit location dialog (P1)
│   ├── receive-inventory-modal.tsx    # Stock-in from AP invoice (P1)
│   ├── stock-levels-table.tsx         # Per-location stock view (P2)
│   ├── movement-history.tsx           # Movement audit trail (P2)
│   ├── stock-adjustment-form.tsx      # Manual adjustment dialog (P3)
│   └── how-it-works-drawer.tsx        # Feature info drawer (P3)
├── hooks/
│   └── use-inventory.ts               # Shared hooks (useLocations, useStock, etc.)
└── types/
    └── index.ts                        # TypeScript type definitions

src/app/[locale]/inventory/
├── page.tsx                           # Server component → inventory dashboard
└── locations/
    └── page.tsx                       # Server component → location management

convex/functions/
├── inventoryLocations.ts              # Location CRUD mutations + queries
├── inventoryStock.ts                  # Stock level queries + dashboard action
├── inventoryMovements.ts              # Movement mutations + queries
└── inventoryActions.ts                # Composite: receiveFromInvoice, reverseStockOut
```

### Source Code (modified files)

```text
convex/schema.ts                       # +3 tables, +1 field on catalog_items
convex/lib/journal_entry_helpers.ts    # +3 inventory JE helper functions
convex/functions/salesInvoices.ts      # Hook stock-out into status change
src/domains/invoices/components/       # "Receive to Inventory" button + modal trigger
src/domains/sales-invoices/components/sales-invoice-form.tsx  # Location selector per line
src/lib/navigation/nav-items.ts        # Add Inventory sidebar item
```

**Structure Decision**: Follows Groot's domain-driven architecture. `src/domains/inventory/` is the new business domain. Convex functions follow existing pattern of one file per entity with queries + mutations.

## Complexity Tracking

No constitution violations to justify — design follows established patterns.
