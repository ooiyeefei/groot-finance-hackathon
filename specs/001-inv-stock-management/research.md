# Research: Inventory / Stock Management

## R1: Convex Schema Integration Pattern

**Decision**: Add 3 new tables (`inventory_locations`, `inventory_stock`, `inventory_movements`) to `convex/schema.ts`. Enhance `catalog_items` with `trackInventory` boolean flag. Add `sourceLocationId` to sales invoice line items.

**Rationale**: Follows existing patterns — separate tables with indexes for efficient queries. The `catalog_items` table already supports extensions (Stripe sync fields). Inventory stock is a separate table (not embedded in catalog) because per-location tracking requires its own queries and indexes.

**Alternatives considered**:
- Embedding stock quantities in `catalog_items` — rejected because per-location tracking requires array of objects, which Convex can't index efficiently.
- Single `inventory` table combining stock + movements — rejected because movement history grows unbounded while stock levels are queried frequently.

## R2: AP Invoice → Stock-In Integration Point

**Decision**: Modify the `internalUpdateExtraction` mutation in `convex/functions/invoices.ts` to optionally trigger inventory stock-in alongside the existing journal entry auto-post. Add a new `receiveToInventory` mutation for manual stock-in after invoice review.

**Rationale**: Currently, AP invoices auto-post journal entries during `internalUpdateExtraction` (line 1009-1114). The stock-in action needs to be a **user-initiated** step (not automatic) because:
1. Not all line items are inventory (services, fees)
2. Users need to select destination locations
3. Catalog item matching requires user confirmation

The flow becomes: OCR extraction → auto-post JE (existing) → user reviews → "Receive to Inventory" action → stock-in + inventory JE adjustment.

**Key insight**: AP invoice line items are in `extractedData` JSON (not embedded schema), so we'll parse them at stock-in time.

## R3: Sales Invoice → Stock-Out Trigger Point

**Decision**: Hook into the sales invoice status change mutation. When status transitions to "sent" or "approved", create stock-out movements. When voided, create reversal movements.

**Rationale**: Sales invoice `lineItems` already have `catalogItemId`. We add `sourceLocationId` per line item. The existing `updateStatus` mutation in `convex/functions/salesInvoices.ts` is the trigger point.

**Key insight**: Draft → Sent/Approved triggers stock-out. Void triggers stock-in reversal. No stock changes on draft save.

## R4: Journal Entry Pattern for Inventory

**Decision**: Add new helper `createInventoryStockInJournalEntry` and `createInventoryStockOutJournalEntry` to `journal_entry_helpers.ts`.

**Rationale**: Per IFRS (IAS 2):
- **Stock-in**: Dr. Inventory Asset (1500) / Cr. Expense (5200) — reclassifies the expense already posted by AP auto-post into inventory asset
- **Stock-out (COGS)**: Dr. COGS (5100) / Cr. Inventory Asset (1500) — recognizes cost when goods are sold
- **Adjustment**: Dr./Cr. Inventory (1500) / Cr./Dr. Inventory Adjustment (6500)

**Important**: The AP auto-post already debits 5200 and credits 2100. When stock-in happens, we need a **reclassification entry**: Dr. 1500 Inventory / Cr. 5200 Operating Expenses — moving the cost from expense to inventory asset.

## R5: Weighted Average Cost Calculation

**Decision**: Calculate weighted average cost (WAC) per catalog item across all locations, stored in home currency.

**Formula**: `WAC = Total Inventory Value (home currency) / Total Quantity on Hand`

**Rationale**: Simplest IFRS-compliant method for SMEs. When stock-out occurs, use current WAC as the cost per unit for COGS journal entry.

**Implementation**: Recalculate WAC on each stock-in. Store current WAC on `inventory_stock` or compute on-the-fly from movement history.

## R6: Multi-Currency Unit Cost Storage

**Decision**: Store both `unitCostOriginal` (invoice currency) + `unitCostOriginalCurrency` + `unitCostHome` (home currency equivalent) on each `inventory_movements` record.

**Rationale**: Per IAS 21, transactions in foreign currencies are recorded at the exchange rate on the transaction date. Both values needed for audit trail and accurate WAC in home currency.

## R7: Navigation & Page Structure

**Decision**: Add "Inventory" as a new sidebar item in the finance admin group. Create new domain at `src/domains/inventory/` with sub-pages: dashboard, locations, movements.

**Rationale**: Follows Groot's domain-driven architecture. Inventory is a business domain (users navigate to it), not a shared capability.

## R8: Catalog Item Matching Strategy

**Decision**: During stock-in, fuzzy-match OCR line item descriptions against existing `catalog_items` by name. Present matches in a dropdown with confidence score. Provide "Bulk Approve All" action.

**Rationale**: Semi-automatic approach balances accuracy with speed. Exact match on name/SKU handles repeat purchases. Fuzzy match handles OCR variations. User always confirms.

**Implementation**: Use Convex `searchByName` query (already exists in `catalogItems.ts`) with extracted item description as search term.

## R9: Access Control Pattern

**Decision**: Gate all inventory pages with `finance_admin` permission check, matching existing AP/sales invoice access pattern.

**Rationale**: All invoice-related pages already use `const isAdmin = roleData?.permissions?.finance_admin` guard. Inventory follows the same pattern since it's tightly coupled to AP and sales workflows.
