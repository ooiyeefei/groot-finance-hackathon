# Data Model: Inventory / Stock Management

## New Tables

### inventory_locations

Physical locations where a business stores inventory.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | yes | Owner business |
| name | string | yes | Location name (e.g., "HQ", "Warehouse A") |
| address | string | no | Physical address |
| type | "warehouse" \| "office" \| "retail" \| "other" | yes | Location classification |
| isDefault | boolean | yes | Whether this is the business's default location |
| status | "active" \| "inactive" | yes | Operational status |
| deletedAt | number | no | Soft delete timestamp |
| updatedAt | number | no | Last update timestamp |

**Indexes**:
- `by_businessId` → [businessId]
- `by_businessId_status` → [businessId, status]
- `by_businessId_isDefault` → [businessId, isDefault]

**Constraints**:
- Exactly one location per business can have `isDefault: true`
- Cannot deactivate the last active location
- Cannot deactivate a location with stock on hand (without confirmation)

---

### inventory_stock

Current stock quantity per product per location. Materialized view updated by movements.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | yes | Owner business |
| catalogItemId | id("catalog_items") | yes | Product reference |
| locationId | id("inventory_locations") | yes | Location reference |
| quantityOnHand | number | yes | Current quantity (can be negative for pre-sell) |
| reorderLevel | number | no | Alert threshold |
| weightedAvgCostHome | number | no | WAC in home currency |
| lastMovementAt | number | no | Timestamp of last stock change |

**Indexes**:
- `by_businessId` → [businessId]
- `by_catalogItem_location` → [catalogItemId, locationId] (unique pair)
- `by_locationId` → [locationId]
- `by_businessId_low_stock` → [businessId] (filter in code: quantityOnHand < reorderLevel)

**Constraints**:
- Unique constraint on (catalogItemId, locationId) — one record per product-location pair
- `quantityOnHand` can go negative (pre-sell allowed with warning)

---

### inventory_movements

Immutable audit trail of all stock changes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | yes | Owner business |
| catalogItemId | id("catalog_items") | yes | Product reference |
| locationId | id("inventory_locations") | yes | Location reference |
| movementType | "stock_in" \| "stock_out" \| "transfer" \| "adjustment" | yes | Movement classification |
| quantity | number | yes | Positive for in, negative for out |
| unitCostOriginal | number | no | Unit cost in original invoice currency |
| unitCostOriginalCurrency | string | no | Currency code of original cost (e.g., "USD") |
| unitCostHome | number | no | Unit cost in business home currency |
| sourceType | "ap_invoice" \| "sales_invoice" \| "manual_adjustment" \| "transfer" \| "void_reversal" | yes | What triggered this movement |
| sourceId | string | no | ID of source document |
| notes | string | no | Reason/description |
| createdBy | string | yes | User ID who performed the action |
| date | string | yes | Movement date (YYYY-MM-DD) |
| createdAt | number | yes | Record creation timestamp |

**Indexes**:
- `by_businessId` → [businessId]
- `by_businessId_date` → [businessId, date]
- `by_catalogItem` → [catalogItemId]
- `by_locationId` → [locationId]
- `by_sourceType_sourceId` → [sourceType, sourceId]

---

## Modified Tables

### catalog_items (existing — add fields)

| New Field | Type | Required | Description |
|-----------|------|----------|-------------|
| trackInventory | boolean | no | Whether this item has inventory tracking enabled. Defaults to false. |

---

### sales_invoices.lineItems (existing embedded array — add field)

| New Field | Type | Required | Description |
|-----------|------|----------|-------------|
| sourceLocationId | string | no | ID of the inventory location stock is drawn from |

---

## Entity Relationships

```
businesses (1) ──→ (many) inventory_locations
businesses (1) ──→ (many) inventory_stock
businesses (1) ──→ (many) inventory_movements

catalog_items (1) ──→ (many) inventory_stock (per location)
catalog_items (1) ──→ (many) inventory_movements

inventory_locations (1) ──→ (many) inventory_stock
inventory_locations (1) ──→ (many) inventory_movements

invoices (AP) ──→ (many) inventory_movements (via sourceType="ap_invoice", sourceId)
sales_invoices ──→ (many) inventory_movements (via sourceType="sales_invoice", sourceId)
```

## State Transitions

### Location Lifecycle
```
created (active) → deactivated (inactive) → reactivated (active)
                                           → deleted (soft)
```

### Inventory Movement Types
```
AP Invoice posted → "Receive to Inventory" → stock_in movement → inventory_stock.quantityOnHand increases
Sales Invoice issued → stock_out movement → inventory_stock.quantityOnHand decreases
Sales Invoice voided → void_reversal movement → inventory_stock.quantityOnHand restored
Manual adjustment → adjustment movement → inventory_stock.quantityOnHand updated
```

## Chart of Accounts Additions

| Code | Name | Type | Purpose |
|------|------|------|---------|
| 1500 | Inventory Asset | Asset | Tracks value of stock on hand |
| 5100 | Cost of Goods Sold | Expense | Records cost when inventory is sold |
| 6500 | Inventory Adjustments | Expense | Records gains/losses from manual adjustments |

**Journal Entry Patterns**:
- **Stock-in reclassification**: Dr. 1500 Inventory / Cr. 5200 Operating Expenses
- **Stock-out (sale)**: Dr. 5100 COGS / Cr. 1500 Inventory
- **Adjustment (loss)**: Dr. 6500 Inventory Adjustments / Cr. 1500 Inventory
- **Adjustment (gain)**: Dr. 1500 Inventory / Cr. 6500 Inventory Adjustments
