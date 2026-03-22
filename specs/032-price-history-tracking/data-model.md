# Data Model: Price History Tracking

**Branch**: `032-price-history-tracking` | **Date**: 2026-03-22

## New Tables

### selling_price_history

Stores point-in-time selling price observations captured when sales invoices are sent.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Business that owns this record |
| catalogItemId | id("catalog_items") | Yes | The catalog item being sold |
| customerId | id("customers") | No | Customer who was charged (may be null for draft-only) |
| salesInvoiceId | id("sales_invoices") | Yes | Source sales invoice |
| unitPrice | number | Yes | Price charged per unit |
| quantity | number | Yes | Quantity sold |
| currency | string | Yes | Currency code (e.g., "MYR", "SGD") |
| totalAmount | number | Yes | quantity * unitPrice (pre-tax) |
| invoiceDate | string | Yes | Date on the sales invoice (ISO date) |
| itemDescription | string | Yes | Description from the line item |
| itemCode | string | No | SKU/code from the line item |
| isZeroPrice | boolean | Yes | Flag for $0 promotional items |
| archivedAt | number | No | Soft-delete timestamp (set when invoice voided) |
| createdAt | number | Yes | Record creation timestamp |

**Indexes**:
- `by_catalogItem_business`: [catalogItemId, businessId, archivedAt] — primary query for detail page
- `by_invoice`: [salesInvoiceId] — for dedup check and void/archive operations
- `by_customer`: [businessId, customerId, invoiceDate] — for customer-filtered queries
- `by_business_date`: [businessId, invoiceDate] — for date-range queries

### catalog_vendor_item_mappings

Links catalog items to vendor item identifiers for the unified margin view.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | id("businesses") | Yes | Business scope |
| catalogItemId | id("catalog_items") | Yes | The catalog item |
| vendorId | id("vendors") | Yes | The vendor |
| vendorItemIdentifier | string | Yes | Matches vendor_price_history.itemIdentifier |
| vendorItemDescription | string | Yes | Human-readable vendor item name |
| matchSource | "fuzzy-suggested" \| "user-confirmed" \| "user-created" | Yes | How the mapping was created |
| confidenceScore | number | No | 0-100, for fuzzy-suggested mappings |
| rejectedAt | number | No | Set if user rejected this suggestion |
| createdAt | number | Yes | Creation timestamp |

**Indexes**:
- `by_catalogItem`: [catalogItemId, businessId] — get all vendor mappings for a catalog item
- `by_vendor_item`: [businessId, vendorId, vendorItemIdentifier] — dedup check
- `by_business_source`: [businessId, matchSource] — list pending suggestions

## Modified Tables

### businesses (existing)

Add optional field for margin alert configuration.

| New Field | Type | Description |
|-----------|------|-------------|
| marginAlertConfig | object (optional) | `{ defaultThreshold: number, categoryOverrides?: [{ category: string, threshold: number }] }` |

## Entity Relationships

```
catalog_items (1) ←→ (many) selling_price_history
    └── Each selling price record links to one catalog item

catalog_items (1) ←→ (many) catalog_vendor_item_mappings
    └── One catalog item can map to multiple vendor items

vendors (1) ←→ (many) catalog_vendor_item_mappings
    └── Each mapping ties one vendor's item identifier to a catalog item

catalog_vendor_item_mappings → vendor_price_history
    └── Uses vendorItemIdentifier to query purchase prices via existing indexes

sales_invoices (1) ←→ (many) selling_price_history
    └── One invoice generates one record per catalog-linked line item

customers (1) ←→ (many) selling_price_history
    └── Tracks which customer was charged
```

## State Transitions

### Selling Price Record Lifecycle
```
[Invoice Sent] → ACTIVE (archivedAt = null)
    ├── [Invoice Voided] → ARCHIVED (archivedAt = timestamp)
    └── [Invoice Re-issued] → ARCHIVED (old) + new ACTIVE record
```

### Vendor Item Mapping Lifecycle
```
[Bootstrapping] → SUGGESTED (matchSource = "fuzzy-suggested")
    ├── [User Confirms] → CONFIRMED (matchSource = "user-confirmed")
    ├── [User Rejects] → REJECTED (rejectedAt = timestamp)
    └── [User Creates Manually] → USER_CREATED (matchSource = "user-created")
```

## Validation Rules

- `selling_price_history.unitPrice` must be >= 0 (zero allowed for promotional items, flagged via `isZeroPrice`)
- `selling_price_history.quantity` must be > 0
- Duplicate prevention: unique constraint on (salesInvoiceId, catalogItemId) — check before insert
- `catalog_vendor_item_mappings`: unique constraint on (catalogItemId, vendorId, vendorItemIdentifier) — one mapping per vendor item per catalog item
- `marginAlertConfig.defaultThreshold` must be 0-100 (percentage)
- `marginAlertConfig.categoryOverrides[].threshold` must be 0-100
