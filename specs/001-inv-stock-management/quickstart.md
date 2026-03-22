# Quickstart: Inventory / Stock Management

## Prerequisites
- Convex dev environment running (`npx convex dev` from main working directory only)
- At least one business with AP invoices and sales invoices

## Implementation Order

### Phase 1: Foundation (P1 stories)
1. **Schema** — Add 3 new tables + catalog_items enhancement to `convex/schema.ts`
2. **Location CRUD** — `convex/functions/inventoryLocations.ts` + UI at `src/domains/inventory/`
3. **Stock-In** — `convex/functions/inventoryMovements.ts` (stockIn) + `inventoryActions.ts` (receiveFromInvoice)
4. **AP Invoice Integration** — Add "Receive to Inventory" UI to invoice review flow
5. **Journal Entry Helpers** — Add inventory JE helpers to `convex/lib/journal_entry_helpers.ts`

### Phase 2: Visibility (P2 stories)
6. **Stock Levels** — `convex/functions/inventoryStock.ts` queries + catalog enhancement UI
7. **Stock-Out** — Hook into sales invoice status change mutation
8. **Sales Invoice Integration** — Location selector in `sales-invoice-form.tsx`

### Phase 3: Dashboard & Adjustments (P3 stories)
9. **Dashboard** — Inventory overview page with summary cards + movement history
10. **Manual Adjustments** — Adjustment form + mutation
11. **How It Works Drawer** — Info drawer for the inventory section

## Key Files to Create
```
src/domains/inventory/
├── components/
│   ├── inventory-dashboard.tsx        # P3: Dashboard overview
│   ├── location-management.tsx        # P1: Location CRUD
│   ├── location-form.tsx              # P1: Create/edit location form
│   ├── receive-inventory-modal.tsx    # P1: Stock-in from AP invoice
│   ├── stock-levels-table.tsx         # P2: Per-location stock view
│   ├── movement-history.tsx           # P2: Movement audit trail
│   ├── stock-adjustment-form.tsx      # P3: Manual adjustment
│   └── how-it-works-drawer.tsx        # P3: Feature info drawer
├── hooks/
│   └── use-inventory.ts               # Shared hooks
└── types/
    └── index.ts                        # Type definitions

convex/functions/
├── inventoryLocations.ts              # Location CRUD
├── inventoryStock.ts                  # Stock level queries
├── inventoryMovements.ts              # Movement mutations + queries
└── inventoryActions.ts                # Composite actions (receiveFromInvoice, etc.)

src/app/[locale]/inventory/
├── page.tsx                           # Server component (dashboard)
└── locations/
    └── page.tsx                       # Server component (location management)
```

## Key Files to Modify
```
convex/schema.ts                       # Add 3 tables + catalog_items.trackInventory
convex/lib/journal_entry_helpers.ts    # Add inventory JE helpers
convex/functions/salesInvoices.ts      # Hook stock-out into status change
src/domains/invoices/components/       # Add "Receive to Inventory" action
src/domains/sales-invoices/components/sales-invoice-form.tsx  # Location selector
src/lib/navigation/nav-items.ts        # Add Inventory sidebar item
```

## Testing Checklist
- [ ] Create location → verify in list
- [ ] Set default location → verify only one default
- [ ] Deactivate location with stock → verify warning
- [ ] Stock-in from AP invoice → verify stock levels increase
- [ ] Duplicate receipt prevention → verify warning shown
- [ ] View stock by product → verify per-location breakdown
- [ ] Sales invoice with stock item → verify location dropdown
- [ ] Issue sales invoice → verify stock decreases
- [ ] Void sales invoice → verify stock restores
- [ ] Manual adjustment → verify stock + movement + JE created
- [ ] Dashboard → verify summary metrics and filters
