# Implementation Tasks: Inventory / Stock Management

**Branch**: `001-inv-stock-management`
**Generated**: 2026-03-22
**Source**: [spec.md](spec.md) + [plan.md](plan.md) + [data-model.md](data-model.md) + [contracts/convex-functions.md](contracts/convex-functions.md)

## Task Dependency Graph

```
T1 (Schema) ──→ T2 (Location Backend) ──→ T3 (Location UI) ──→ T4 (Navigation)
                                                                      │
T1 ──→ T5 (JE Helpers) ──→ T6 (Stock-In Backend) ──→ T7 (Stock-In UI)│
                                                                      │
T1 ──→ T8 (Stock Queries) ──→ T9 (Stock Levels UI) ──────────────────┘
                                                                      │
T6 ──→ T10 (Stock-Out Backend) ──→ T11 (Sales Invoice Integration) ───┘
                                                                      │
T8 ──→ T12 (Dashboard) ──────────────────────────────────────────────┘
                                                                      │
T6 ──→ T13 (Manual Adjustments) ─────────────────────────────────────┘
                                                                      │
T12 ──→ T14 (How It Works Drawer) ───────────────────────────────────┘
                                                                      │
ALL ──→ T15 (Convex Deploy + Build) ─────────────────────────────────┘
```

---

## Phase 1: Foundation (P1 Stories)

### T1: Add Inventory Tables to Convex Schema
- **Status**: [ ] Todo
- **Priority**: P1 — blocks everything
- **Depends on**: Nothing
- **Files to modify**:
  - `convex/schema.ts` — Add `inventory_locations`, `inventory_stock`, `inventory_movements` tables with all indexes per data-model.md. Add `trackInventory: v.optional(v.boolean())` to `catalog_items`. Add `sourceLocationId: v.optional(v.string())` to `sales_invoices.lineItems` embedded array. Add `inventoryReceivedAt: v.optional(v.number())` to `invoices` table.
- **Acceptance**: `npx convex dev` syncs without errors. All 3 tables visible in Convex dashboard.

---

### T2: Location Management Backend
- **Status**: [ ] Todo
- **Priority**: P1
- **Depends on**: T1
- **Files to create**:
  - `convex/functions/inventoryLocations.ts` — CRUD per contracts/convex-functions.md: `list` query, `getDefault` query, `create` mutation, `update` mutation, `deactivate` mutation (with stock check), `reactivate` mutation.
- **Key logic**:
  - `create`: If `isDefault=true`, unset previous default. If first location for business, force `isDefault=true`.
  - `deactivate`: Check `inventory_stock` for this location. If stock exists and `confirmWithStock !== true`, return error. Prevent deactivating last active location.
  - All mutations require finance_admin auth (check `business_memberships` role).
- **Acceptance**: Can create, update, deactivate, reactivate locations via Convex dashboard/API.

---

### T3: Location Management UI
- **Status**: [ ] Todo
- **Priority**: P1
- **Depends on**: T2
- **Files to create**:
  - `src/domains/inventory/types/index.ts` — Type definitions for locations, stock, movements.
  - `src/domains/inventory/components/location-management.tsx` — List of locations with name, type, status, default badge. Edit/deactivate actions per row.
  - `src/domains/inventory/components/location-form.tsx` — Dialog form: name (required), address (optional), type dropdown, isDefault toggle.
  - `src/app/[locale]/inventory/locations/page.tsx` — Server component: auth check → `<Sidebar />` + `<HeaderWithUser />` + `<LocationManagement />`.
- **Design**:
  - Table layout with columns: Name, Type, Address, Default (badge), Status, Actions
  - Action buttons: `bg-primary` for create, ghost icons for row edit/deactivate
  - Empty state: prompt to create first location
  - Deactivation confirmation dialog when stock exists
- **Acceptance**: Admin can CRUD locations. Default enforcement works. Deactivation guards work.

---

### T4: Navigation — Add Inventory Sidebar Item
- **Status**: [ ] Todo
- **Priority**: P1
- **Depends on**: T3
- **Files to modify**:
  - `src/lib/navigation/nav-items.ts` — Add `{ icon: Package, label: 'inventory', path: '/inventory' }` to finance admin group. Import `Package` from lucide-react.
- **Acceptance**: "Inventory" appears in sidebar for admin users. Clicking navigates to `/inventory`.

---

### T5: Inventory Journal Entry Helpers
- **Status**: [ ] Todo
- **Priority**: P1
- **Depends on**: T1
- **Files to modify**:
  - `convex/lib/journal_entry_helpers.ts` — Add 3 new functions:
    1. `createInventoryStockInJournalEntry({ amount, inventoryAccountId/Code/Name, expenseAccountId/Code/Name })` → Dr. 1500 Inventory / Cr. 5200 Operating Expenses
    2. `createInventoryStockOutJournalEntry({ amount, cogsAccountId/Code/Name, inventoryAccountId/Code/Name })` → Dr. 5100 COGS / Cr. 1500 Inventory
    3. `createInventoryAdjustmentJournalEntry({ amount, isGain, inventoryAccountId/Code/Name, adjustmentAccountId/Code/Name })` → Dr/Cr 1500 vs 6500
- **Acceptance**: Each function returns balanced `JournalEntryLineInput[]`. `validateBalancedEntry()` passes for all.

---

### T6: Stock-In Backend (Movements + Actions)
- **Status**: [ ] Todo
- **Priority**: P1
- **Depends on**: T1, T5
- **Files to create**:
  - `convex/functions/inventoryMovements.ts` — `stockIn` internal mutation: creates movement records, upserts `inventory_stock` (increment quantityOnHand), recalculates WAC.
  - `convex/functions/inventoryActions.ts` — `receiveFromInvoice` public action: validates inputs, calls stockIn, creates reclassification JE (Dr. 1500 / Cr. 5200), patches invoice with `inventoryReceivedAt`.
- **Key logic**:
  - WAC formula: `newWAC = (existingQty * existingWAC + newQty * newUnitCostHome) / (existingQty + newQty)`
  - If `inventory_stock` record doesn't exist for (catalogItem, location), create it.
  - Store both `unitCostOriginal` + `unitCostHome` on movement.
- **Acceptance**: Calling `receiveFromInvoice` creates movements, updates stock levels, creates JE, marks invoice.

---

### T7: Stock-In UI (Receive to Inventory Modal)
- **Status**: [ ] Todo
- **Priority**: P1
- **Depends on**: T6, T3
- **Files to create**:
  - `src/domains/inventory/components/receive-inventory-modal.tsx` — Modal dialog showing:
    - Invoice info header (vendor, date, total)
    - Line items table with columns: Description, Qty, Unit Cost, Track (toggle), Catalog Match (dropdown), Location (dropdown)
    - "Apply location to all" bulk selector at top
    - "Bulk Approve All Matches" button
    - Confirm button (`bg-primary`)
  - `src/domains/inventory/hooks/use-inventory.ts` — Hook for catalog item search (uses existing `catalogItems.searchByName`), location list, stock-in action.
- **Files to modify**:
  - `src/domains/invoices/components/documents-container.tsx` (or appropriate invoice detail component) — Add "Receive to Inventory" button. Show "Inventory Received" badge if `inventoryReceivedAt` is set. Clicking opens `ReceiveInventoryModal`.
- **Design**:
  - Modal uses `Sheet` component (slide from right, wider for table)
  - Track toggle: default ON for items with quantity, OFF for lump-sum/service items
  - Catalog match: searchable `Select` component using `catalogItems.searchByName`
  - "Already received" state: disabled button + green badge
- **Acceptance**: Admin reviews AP invoice → clicks "Receive to Inventory" → selects locations → confirms → stock levels update. Double-receipt prevented.

---

## Phase 2: Visibility & Stock-Out (P2 Stories)

### T8: Stock Level Queries
- **Status**: [ ] Todo
- **Priority**: P2
- **Depends on**: T1
- **Files to create/modify**:
  - `convex/functions/inventoryStock.ts` — Queries per contracts: `getByProduct`, `getByLocation`, `getAvailableStock`, `getDashboardSummary` (action, not query).
- **Key logic**:
  - `getDashboardSummary` is a public **action** (not reactive query) to avoid bandwidth burn on large datasets.
  - `getAvailableStock` is a lightweight query used inline in sales invoice form — returns locationId, locationName, quantityOnHand for a given catalogItemId.
  - Low stock detection: compare `quantityOnHand` vs `reorderLevel` in code.
- **Acceptance**: Queries return correct stock data. Dashboard summary works as action.

---

### T9: Stock Levels UI (Product Catalog Enhancement)
- **Status**: [ ] Todo
- **Priority**: P2
- **Depends on**: T8, T3
- **Files to create**:
  - `src/domains/inventory/components/stock-levels-table.tsx` — Table showing: Product, SKU, Location, Qty on Hand, Reorder Level, Status (badge: OK/Low/Out). Collapsible rows by product showing per-location breakdown.
  - `src/domains/inventory/components/movement-history.tsx` — Chronological list: Date, Type (badge), Qty, Location, Source, User. Filterable.
- **Files to modify**:
  - `src/domains/sales-invoices/components/catalog-item-manager.tsx` (or catalog detail view) — Add stock info section showing per-location quantities and total. Low-stock badge. Link to movement history.
- **Acceptance**: Catalog items show stock quantities per location. Low-stock indicator visible. Movement history accessible.

---

### T10: Stock-Out Backend
- **Status**: [ ] Todo
- **Priority**: P2
- **Depends on**: T6
- **Files to modify**:
  - `convex/functions/inventoryMovements.ts` — Add `stockOut` internal mutation: creates movement records (negative qty), decrements `inventory_stock.quantityOnHand`.
  - `convex/functions/inventoryActions.ts` — Add `reverseStockOut` internal action: finds stock_out movements for a sales invoice, creates void_reversal movements to restore stock.
  - `convex/functions/salesInvoices.ts` — Hook into status change:
    - When status → "sent" or "approved": iterate line items with `catalogItemId` + `sourceLocationId`, call `stockOut`. Create COGS JE (Dr. 5100 / Cr. 1500).
    - When status → "voided" or "cancelled": call `reverseStockOut`. Create reversal JE.
    - Skip items without `trackInventory` flag or without `sourceLocationId`.
- **Acceptance**: Issuing a sales invoice decreases stock. Voiding restores stock. Draft changes don't affect stock.

---

### T11: Sales Invoice Integration (Location Selector)
- **Status**: [ ] Todo
- **Priority**: P2
- **Depends on**: T10, T8
- **Files to modify**:
  - `src/domains/sales-invoices/components/sales-invoice-form.tsx` — For each line item with a `catalogItemId`:
    - Check if catalog item has `trackInventory: true`
    - If yes: show location dropdown using `inventoryStock.getAvailableStock`
    - Dropdown shows: "Location Name (X available)"
    - If entered qty > available: show amber warning text (not blocking)
    - Save selected location as `sourceLocationId` on line item
    - If `trackInventory: false`: no location dropdown, no stock changes
  - `src/domains/sales-invoices/hooks/use-sales-invoice-form.ts` — Add `sourceLocationId` to LineItem interface.
- **Acceptance**: Sales invoice form shows location picker for tracked items. Warning on insufficient stock. Stock deducted on issuance.

---

## Phase 3: Dashboard & Adjustments (P3 Stories)

### T12: Inventory Dashboard
- **Status**: [ ] Todo
- **Priority**: P3
- **Depends on**: T8
- **Files to create**:
  - `src/domains/inventory/components/inventory-dashboard.tsx` — Client component with:
    - Summary cards: Total items tracked, Total locations, Low stock count (using `getDashboardSummary` action)
    - Low Stock Alerts section: items below reorder level with qty, reorder level, location
    - Recent Movements feed: last 20 movements with source links
    - Filters: date range, location, product, movement type (using `listFiltered` action)
  - `src/app/[locale]/inventory/page.tsx` — Server component: auth check → app shell → `<InventoryDashboard />`
- **Design**:
  - Summary cards in a 3-column grid (`bg-card` with `text-foreground`)
  - Low stock items: table with red/amber badges
  - Movement history: table with type badges (stock_in=green, stock_out=red, adjustment=amber)
  - Use `useAction` + `useEffect` pattern (NOT `useQuery`) per bandwidth rules
- **Acceptance**: Dashboard shows accurate summary. Filters work. Clicking product navigates to detail.

---

### T13: Manual Stock Adjustments
- **Status**: [ ] Todo
- **Priority**: P3
- **Depends on**: T6
- **Files to create**:
  - `src/domains/inventory/components/stock-adjustment-form.tsx` — Dialog form:
    - Product selector (searchable dropdown)
    - Location selector (active locations only)
    - Current qty display (read-only)
    - Adjustment amount (positive or negative number input)
    - New qty display (calculated: current + adjustment)
    - Reason (required textarea)
    - Confirm button (`bg-primary`), Cancel (`bg-secondary`)
- **Files to modify**:
  - `convex/functions/inventoryMovements.ts` — Add `adjust` public mutation per contracts: creates adjustment movement, updates stock, creates adjustment JE (Dr/Cr 1500 vs 6500).
- **Acceptance**: Admin can adjust stock up/down. Reason required. Movement + JE created. Stock level updated.

---

### T14: How It Works Drawer
- **Status**: [ ] Todo
- **Priority**: P3
- **Depends on**: T12
- **Files to create**:
  - `src/domains/inventory/components/how-it-works-drawer.tsx` — Sheet component (per CLAUDE.md mandatory pattern):
    - Title: "How Inventory Tracking Works"
    - Steps: 1) Set up locations 2) Receive from AP invoices 3) Track stock levels 4) Auto-deduct on sales 5) Adjust for discrepancies
    - Status legend: Stock-in (green), Stock-out (red), Adjustment (amber)
    - Tips: "Start with one default location", "Service items are automatically excluded"
- **Files to modify**:
  - `src/domains/inventory/components/inventory-dashboard.tsx` — Add ghost Info icon button (ⓘ) in header to trigger the drawer.
- **Acceptance**: Info button visible on dashboard. Drawer opens with clear feature explanation.

---

### T15: Convex Deploy + Build Verification
- **Status**: [ ] Todo
- **Priority**: P1 (final gate)
- **Depends on**: All tasks
- **Commands**:
  ```bash
  npx convex deploy --yes          # Deploy schema + functions to prod
  npm run build                     # Verify Next.js build passes
  ```
- **Verification**:
  - No Convex deployment errors
  - No TypeScript build errors
  - All new pages accessible at correct routes
  - Sidebar shows Inventory for admin users
- **Acceptance**: Production deployment successful. `npm run build` passes clean.
