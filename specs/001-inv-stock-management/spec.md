# Feature Specification: Inventory / Stock Management with Location Tracking

**Feature Branch**: `001-inv-stock-management`
**Created**: 2026-03-22
**Status**: Draft
**Input**: [GitHub Issue #368](https://github.com/grootdev-ai/groot-finance/issues/368) — Inventory / stock management with multi-location tracking, triggered from AP invoice OCR and decremented from sales invoice issuance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Location Management (Priority: P1)

As a business owner or admin, I need to define physical locations (warehouses, offices, branches, retail outlets) where my business stores inventory, so that stock levels can be tracked per location.

**Why this priority**: Locations are the foundational building block — every subsequent stock movement references a location. Without this, nothing else works. This also delivers immediate value: the business can model its physical structure in Groot.

**Independent Test**: Can be fully tested by creating, editing, and deactivating locations. Delivers value by giving the business a structured view of its premises, even before inventory tracking is enabled.

**Acceptance Scenarios**:

1. **Given** a business with no locations, **When** the admin opens the Inventory section for the first time, **Then** the system prompts them to create at least one location before proceeding.
2. **Given** an admin on the Location Management screen, **When** they fill in name, address, and type (warehouse/office/retail/other), **Then** the location is created and visible in the list.
3. **Given** multiple locations exist, **When** the admin marks one as default, **Then** the previous default is automatically unset, and the new default is used for all future stock movements that don't specify a location.
4. **Given** a location with existing stock, **When** the admin attempts to deactivate it, **Then** the system warns that stock exists at this location and requires confirmation (or transfer) before deactivation.
5. **Given** only one active location, **When** the admin tries to deactivate it, **Then** the system prevents deactivation with a message explaining at least one active location is required for inventory tracking.

---

### User Story 2 — Stock-In from AP Invoice (Priority: P1)

As a business owner/admin, after reviewing an OCR'd purchase invoice, I want to receive the purchased items into inventory at a specific location, so that my stock levels automatically update when goods arrive.

**Why this priority**: This is the primary stock inflow — connecting AP invoices (which Groot already processes) to inventory. Without stock-in, there's no inventory data to track. This story delivers the core "AP → Inventory" value proposition.

**Independent Test**: Can be tested by processing an AP invoice through OCR review and confirming items into inventory. Verify that stock levels at the chosen location increase by the correct quantities.

**Acceptance Scenarios**:

1. **Given** an AP invoice has been OCR'd and line items are displayed for review, **When** the user opens the "Receive & Post" action, **Then** each line item shows a toggle for "Track as inventory", a location dropdown (defaulting to the business's default location), and the quantity pre-filled from OCR.
2. **Given** an invoice with 5 line items where 3 are physical goods and 2 are services, **When** the user toggles off "Track as inventory" for the 2 service items, **Then** only the 3 goods items create stock-in movements.
3. **Given** all line items are destined for the same location, **When** the user selects a location in the "Apply to all" bulk selector, **Then** all line items update to that location simultaneously.
4. **Given** the user confirms stock-in, **Then** inventory movement records are created with the correct item, location, quantity, unit cost (from the invoice), and a reference back to the source AP invoice.
5. **Given** a stock-in has been confirmed for an AP invoice, **When** the same invoice is viewed later, **Then** a visual indicator shows that inventory has already been received for this invoice (preventing accidental double-receipt).
6. **Given** the user confirms stock-in for an item that does not yet exist in the product catalog, **Then** the system creates a new catalog entry for that item (or prompts the user to match it to an existing one).

---

### User Story 3 — View Stock Levels Per Location (Priority: P2)

As a business owner/admin, I want to see current stock quantities per product per location, with total quantities across all locations, so that I know what's in stock and where.

**Why this priority**: Visibility into current stock levels is the core read-only value of inventory management. Without this, users can't answer "How much of X do we have?" — the fundamental question this feature addresses.

**Independent Test**: Can be tested by viewing the product catalog with stock information. After stock-in movements have been recorded, verify that per-location quantities display correctly and totals are accurate.

**Acceptance Scenarios**:

1. **Given** a product has stock at 3 locations, **When** the user views the product in the catalog, **Then** they see a breakdown of quantity per location and a total across all locations.
2. **Given** a product has a reorder level set and the current stock falls below it, **When** viewing the product, **Then** a low-stock indicator is prominently displayed.
3. **Given** the user is on the product catalog list view, **Then** each product row shows the total stock quantity and a low-stock badge if applicable.
4. **Given** a product has inventory movements, **When** the user clicks "View movement history", **Then** they see a chronological list of all stock-in, stock-out, and adjustment movements with source references.

---

### User Story 4 — Stock-Out from Sales Invoice (Priority: P2)

As a business owner/admin, when I create and issue a sales invoice, I want the system to automatically deduct inventory from the specified location, so that stock levels reflect what has been sold.

**Why this priority**: This completes the core inventory cycle (in → track → out). Without stock-out, inventory grows infinitely and never reflects reality. This is critical but depends on P1 stories being functional.

**Independent Test**: Can be tested by creating a sales invoice with line items, selecting source locations, and issuing the invoice. Verify stock levels at the source location decrease by the invoiced quantities.

**Acceptance Scenarios**:

1. **Given** the user is creating a sales invoice and selects a catalog item, **When** the item has inventory tracking enabled, **Then** a location dropdown appears showing each location with its available quantity.
2. **Given** a location has 10 units of an item, **When** the user enters quantity 8, **Then** the system accepts it and shows 2 units remaining at that location.
3. **Given** a location has 5 units of an item, **When** the user enters quantity 7, **Then** the system shows a warning ("Insufficient stock — 5 available") but does not hard-block the entry (allowing pre-sell).
4. **Given** a sales invoice is in "draft" status, **Then** no stock deduction occurs — stock is only deducted when the invoice status changes to "sent" or "approved" (i.e., issuance).
5. **Given** an issued sales invoice that deducted stock, **When** the invoice is voided or cancelled, **Then** the stock-out is automatically reversed by creating a corresponding stock-in movement, restoring the original stock levels.
6. **Given** a catalog item with no inventory tracking (e.g., services), **When** it appears on a sales invoice, **Then** no location selector is shown and no stock deduction occurs.

---

### User Story 5 — Inventory Dashboard Overview (Priority: P3)

As a business owner, I want a centralized inventory dashboard showing stock levels, low-stock alerts, and recent movements, so that I have operational visibility at a glance.

**Why this priority**: This is the aggregation layer — it doesn't create new data, it visualizes what already exists from P1 and P2 stories. Valuable for day-to-day operations but not required for the inventory system to function.

**Independent Test**: Can be tested by navigating to the inventory dashboard and verifying that stock summaries, low-stock alerts, and movement history match the underlying data.

**Acceptance Scenarios**:

1. **Given** the user navigates to the Inventory section, **Then** they see a dashboard with: summary cards (total items tracked, total locations, low-stock item count), a stock-by-location table, and a recent movements feed.
2. **Given** 3 items are below their reorder level, **When** the dashboard loads, **Then** a "Low Stock" alert section lists those 3 items with their current quantity, reorder level, and location.
3. **Given** the user filters the movement history by date range and location, **Then** only matching movements are displayed.
4. **Given** the user clicks on a specific product in the dashboard, **Then** they navigate to that product's detail view showing per-location stock and full movement history.

---

### User Story 6 — Manual Stock Adjustment (Priority: P3)

As a business owner/admin, I need to manually adjust stock quantities to account for damaged goods, miscounts during stocktake, or samples given away, so that the system reflects actual physical inventory.

**Why this priority**: Real-world inventory always drifts from system records. Without adjustments, the system becomes untrustworthy over time. However, this is a correctional flow, not a primary workflow.

**Independent Test**: Can be tested by performing a manual stock adjustment (increase or decrease) for a specific item at a specific location and verifying the stock level updates accordingly.

**Acceptance Scenarios**:

1. **Given** a product at a location with 50 units, **When** the user creates an adjustment of -3 with a reason "Damaged in transit", **Then** the stock level updates to 47 and a movement record is created with type "adjustment" and the reason in notes.
2. **Given** a user performs a stocktake and finds 5 extra units, **When** they create a +5 adjustment with reason "Stocktake correction", **Then** stock increases and the movement is auditable.
3. **Given** any adjustment, **Then** the adjustment records the user who performed it, the date, the reason, and the before/after quantities.

---

### Edge Cases

- What happens when an AP invoice line item has no quantity (e.g., a lump-sum charge)? The system should skip inventory tracking for that line item and only track items with explicit quantities.
- What happens when a user tries to stock-in to an inactive location? The system should prevent this and prompt the user to select an active location.
- What happens when a catalog item is deleted but has existing stock? The item should be soft-deleted (archived) rather than hard-deleted, preserving stock and movement history.
- What happens when the same AP invoice is processed twice (duplicate receipt)? The system should detect that inventory was already received for this invoice and warn the user before allowing a second receipt.
- What happens when a sales invoice is partially voided (some line items cancelled, others remain)? Stock reversal should only apply to the voided line items, not the entire invoice.
- What happens when stock-out would make quantity negative (pre-sell scenario)? The system allows it with a warning, records the negative balance, and flags it on the dashboard.
- What happens when all locations are deactivated? The system prevents deactivating the last active location and displays an explanation.
- What happens to pending stock-outs when a location is deactivated? Draft invoices referencing that location should prompt the user to select an alternative location before issuance.

## Requirements *(mandatory)*

### Functional Requirements

**Location Management**
- **FR-001**: System MUST allow creation of inventory locations with a name, optional address, type classification (warehouse/office/retail/other), and active/inactive status.
- **FR-002**: System MUST enforce that exactly one location per business is marked as default at any time.
- **FR-003**: System MUST require at least one active location before inventory tracking features become available.
- **FR-004**: System MUST prevent deactivation of a location that has stock on hand, unless the user confirms or transfers stock first.
- **FR-005**: System MUST prevent deactivation of the sole remaining active location.

**Stock-In (AP Invoice Integration)**
- **FR-006**: System MUST provide a combined "Receive & Post" action during AP invoice review that atomically creates both inventory movements and the accounting journal entry in a single step.
- **FR-007**: System MUST pre-fill quantity and unit cost from the AP invoice line item data.
- **FR-008**: System MUST allow per-line-item location selection, defaulting to the business's default location.
- **FR-009**: System MUST provide a bulk "Apply to all items" location selector for convenience.
- **FR-010**: System MUST create auditable stock-in movement records linked to the source AP invoice.
- **FR-011**: System MUST prevent accidental double-receipt by flagging invoices that have already been received into inventory.
- **FR-012**: System MUST suggest catalog item matches for each incoming line item based on name similarity, with a dropdown to select or create new items.
- **FR-029**: System MUST provide a "Bulk Approve All Matches" action to accept all suggested catalog matches at once, after the user has reviewed them.

**Stock Levels & Visibility**
- **FR-013**: System MUST track stock quantity per product per location.
- **FR-014**: System MUST display per-location stock breakdown and total stock on the product catalog detail view.
- **FR-015**: System MUST support optional reorder levels per product, with a visual low-stock indicator when quantity falls below the threshold.
- **FR-016**: System MUST provide a chronological movement history per product, showing all stock-in, stock-out, adjustment, and transfer movements with source references.

**Stock-Out (Sales Invoice Integration)**
- **FR-017**: System MUST show a location selector with available quantities when adding inventory-tracked items to a sales invoice.
- **FR-018**: System MUST warn (not block) when the requested quantity exceeds available stock at the selected location.
- **FR-019**: System MUST only deduct stock upon invoice issuance (status change to "sent" or "approved"), not while in draft.
- **FR-020**: System MUST automatically reverse stock-out movements when an issued sales invoice is voided or cancelled.
- **FR-021**: System MUST skip location selection and stock deduction for non-inventory items (services, fees, etc.).

**Manual Adjustments**
- **FR-022**: System MUST allow manual stock adjustments (positive or negative) with a mandatory reason/note.
- **FR-023**: System MUST record who performed each adjustment and when, for audit purposes.

**Dashboard & Reporting**
- **FR-024**: System MUST provide an inventory dashboard showing summary metrics (total items, total locations, low-stock count), stock-by-location view, and recent movements.
- **FR-025**: System MUST allow filtering movements by date range, location, product, and movement type.

**Access Control**
- **FR-028**: All inventory operations (location management, stock-in, stock-out, adjustments, dashboard) MUST be restricted to users with the finance_admin permission (Owner/Admin role only), consistent with the existing AP and sales invoice access model.

**Accounting Integration**
- **FR-026**: Stock-in MUST record unit cost in both the original invoice currency and the home currency equivalent (converted at the invoice date exchange rate), per IAS 2 and IAS 21.
- **FR-027**: System MUST use weighted average cost method (in home currency) as the default valuation for stock-out cost tracking.

### Key Entities

- **Location**: A physical place where a business stores inventory. Has a name, optional address, type (warehouse/office/retail/other), default flag, and active/inactive status. One and only one location per business can be default.
- **Inventory Stock**: A per-product, per-location quantity record. Tracks the current quantity on hand and an optional reorder level. Updated by stock movements.
- **Inventory Movement**: An auditable record of stock entering, leaving, or being adjusted at a location. Captures the movement type (stock-in/stock-out/transfer/adjustment), quantity, unit cost in both original and home currency (for stock-in), source reference (AP invoice, sales invoice, manual), reason, and who performed it.
- **Catalog Item** (existing, enhanced): The product/item master record. Enhanced with inventory tracking flag. Related to inventory stock records per location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can set up their first location and receive their first AP invoice into inventory within 5 minutes of enabling the feature.
- **SC-002**: Stock-in from AP invoice requires no more than 2 additional clicks beyond the existing invoice review flow (toggle tracking + confirm).
- **SC-003**: After stock-in and stock-out transactions, inventory quantities are accurate — system-reported quantity matches expected quantity in 100% of non-pre-sell scenarios.
- **SC-004**: Sales invoice stock-out only deducts on issuance, never on draft save — verified across all invoice status transitions.
- **SC-005**: Voiding a sales invoice fully restores the stock that was deducted, with an auditable reversal movement.
- **SC-006**: Users can answer "How much of X do we have at location Y?" within 3 seconds from the product catalog or dashboard.
- **SC-007**: All stock movements (in, out, adjustment) are fully auditable — each movement records who, when, why, and the source document.
- **SC-008**: Low-stock alerts correctly identify all products below their reorder level, with zero false negatives.
- **SC-009**: The feature supports businesses with up to 50 locations and 10,000 catalog items without noticeable performance degradation.

## Clarifications

### Session 2026-03-22

- Q: Which roles can access inventory operations (locations, stock-in/out, adjustments, dashboard)? → A: Owner/Admin only — all inventory operations restricted to finance_admin role, consistent with existing AP and sales invoice access.
- Q: How should the system match OCR'd line items to existing catalog items during stock-in? → A: Semi-automatic with bulk approval — system suggests best matches in a dropdown per line item, user can review all suggestions and bulk-approve the entire set if matches are correct.
- Q: Should stock-in and journal posting happen together or as separate steps? → A: Together atomically — one action creates both the inventory movements and the accounting journal entry, preventing inconsistent states.
- Q: How should multi-currency unit costs be stored for inventory? → A: Store both the original invoice currency amount and the home currency equivalent (converted at the invoice date exchange rate), per IFRS 21 (IAS 2).

## Assumptions

- Businesses using this feature already have the product catalog (`catalog_items`) populated, or will populate it during the stock-in process.
- The existing AP invoice OCR and review flow is functional and provides structured line items with quantity and unit cost.
- The existing sales invoice creation flow allows line item selection from the catalog.
- Weighted average cost is the default (and initially only) inventory valuation method; FIFO support is deferred to a future phase.
- Inter-location transfers are deferred to Phase 2 (the movement type "transfer" is defined but the UI/workflow is not in scope for Phase 1).
- Stock valuation reports (total inventory value, cost of goods sold) are deferred to Phase 2.
- Integration with the chat agent (e.g., "How much of X do we have?") is a natural follow-on but not in scope for this spec.
- Physical stocktake/cycle-count workflow is deferred — only manual adjustments are supported in Phase 1.
