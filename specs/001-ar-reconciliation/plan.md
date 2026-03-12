# Implementation Plan: AR Reconciliation

**Branch**: `001-ar-reconciliation` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ar-reconciliation/spec.md`

## Summary

Build a platform-agnostic AR reconciliation system that ingests sales statements (CSV/XLSX) via the shared CSV parser, stores them as sales orders in a new Convex table, automatically matches them against existing sales invoices, and presents a reconciliation dashboard with manual resolution capabilities.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0
**Storage**: Convex (new `sales_orders` table, real-time subscriptions)
**Testing**: `npm run build` + manual UAT with test accounts
**Target Platform**: Web (desktop-first, responsive)
**Project Type**: Web application (existing monorepo)
**Performance Goals**: Synchronous matching for up to 5,000 orders per import
**Constraints**: Source-agnostic design — platform is metadata only, no code branching
**Scale/Scope**: Up to 5,000 orders per file, typical SME monthly volumes

## Constitution Check

*No constitution defined — proceeding without formal gates.*

## Project Structure

### Documentation (this feature)

```text
specs/001-ar-reconciliation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── convex-functions.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── spec.md              # Feature specification
```

### Source Code (repository root)

```text
# New files for AR Reconciliation
convex/
├── schema.ts                          # ADD: sales_orders table
└── functions/
    └── salesOrders.ts                 # NEW: CRUD + matching queries

src/domains/sales-invoices/
├── components/
│   ├── ar-reconciliation.tsx          # NEW: Main reconciliation tab
│   ├── reconciliation-dashboard.tsx   # NEW: Summary cards + filters
│   ├── reconciliation-table.tsx       # NEW: Order list with match status
│   ├── match-detail-sheet.tsx         # NEW: Side-by-side comparison
│   └── manual-match-dialog.tsx        # NEW: Manual match picker
├── hooks/
│   └── use-reconciliation.ts          # NEW: Reconciliation queries + mutations
└── lib/
    └── matching-engine.ts             # NEW: Order-to-invoice matching logic

src/domains/invoices/components/
└── invoices-tab-container.tsx         # MODIFY: Add 'reconciliation' sub-tab
```

**Structure Decision**: AR Reconciliation lives within the existing `sales-invoices` domain since it's an extension of AR management. The matching engine is domain logic (not shared lib) because it's specific to sales order ↔ invoice matching. The CSV parser is consumed from `src/lib/csv-parser/` as designed.

## Implementation Phases

### Phase 1: Data Layer (Convex Schema + Functions)
1. Add `sales_orders` table to `convex/schema.ts`
2. Create `convex/functions/salesOrders.ts` with:
   - `importBatch` mutation — bulk create sales orders from CSV import result
   - `list` query — list orders with filters (status, date range, platform)
   - `getById` query — single order detail
   - `updateMatchStatus` mutation — set match result (auto or manual)
   - `getReconciliationSummary` query — aggregated counts by match status
   - `detectDuplicates` query — check for existing orders by orderReference + platform

### Phase 2: Matching Engine
1. Create `matching-engine.ts` with:
   - `matchOrdersToInvoices()` — main matching orchestrator
   - Exact match: orderReference ↔ invoiceNumber
   - Fuzzy match: product + quantity + amount within date window
   - Variance detection: gross amount comparison with fee-adjusted tolerance
   - Conflict detection: multiple orders claiming same invoice

### Phase 3: UI Components
1. Add "Reconciliation" sub-tab to invoices tab container
2. Build reconciliation dashboard (summary cards, filters, order table)
3. Build match detail sheet (side-by-side comparison)
4. Build manual match dialog (invoice picker)
5. Integrate CSV import modal with `schemaType="sales_statement"`

### Phase 4: Integration & Polish
1. Wire up import → match → display flow
2. Fee extraction and display
3. Period-based filtering
4. Reconciliation report export (CSV)
