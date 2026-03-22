# Convex Function Contracts: Price History Tracking

## New File: `convex/functions/sellingPriceHistory.ts`

### recordFromSalesInvoice (internalMutation)
Called by `salesInvoices.send()` after invoice status transitions to "sent".

```typescript
args: {
  businessId: v.id("businesses"),
  salesInvoiceId: v.id("sales_invoices"),
  customerId: v.optional(v.id("customers")),
  invoiceDate: v.string(),
  lineItems: v.array(v.object({
    catalogItemId: v.id("catalog_items"),
    unitPrice: v.number(),
    quantity: v.number(),
    currency: v.string(),
    totalAmount: v.number(),
    itemDescription: v.string(),
    itemCode: v.optional(v.string()),
  })),
}
// Returns: { recordsCreated: number }
```

### archiveBySalesInvoice (internalMutation)
Called by `salesInvoices.voidInvoice()` to soft-delete selling price records.

```typescript
args: {
  salesInvoiceId: v.id("sales_invoices"),
}
// Returns: { recordsArchived: number }
```

### getSalesHistory (action)
Bandwidth-safe action for catalog item detail page — Sales History tab.

```typescript
args: {
  businessId: v.id("businesses"),
  catalogItemId: v.id("catalog_items"),
  customerId: v.optional(v.id("customers")),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  limit: v.optional(v.number()), // default 100
}
// Returns: {
//   records: SellingPriceRecord[],
//   totalCount: number,
//   latestPrice: { unitPrice: number, currency: string, date: string } | null,
// }
```

### getSalesPriceTrend (action)
Returns Recharts-formatted data for the selling price trend chart.

```typescript
args: {
  businessId: v.id("businesses"),
  catalogItemId: v.id("catalog_items"),
  customerId: v.optional(v.id("customers")),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
}
// Returns: {
//   dataPoints: { date: string, unitPrice: number, currency: string, customerName?: string }[],
// }
```

### getMarginSummary (action)
Computes margin for a catalog item using both selling and purchase price data.

```typescript
args: {
  businessId: v.id("businesses"),
  catalogItemId: v.id("catalog_items"),
}
// Returns: {
//   latestSellingPrice: { unitPrice: number, currency: string, date: string, customerName: string } | null,
//   latestPurchaseCost: { unitPrice: number, currency: string, date: string, vendorName: string } | null,
//   marginPercent: number | null, // null if data missing
//   homeCurrency: string,
//   convertedSellingPrice: number | null,
//   convertedPurchaseCost: number | null,
//   marginWarning: string | null, // e.g., "Margin decreased — cost increased by X%"
//   hasMappings: boolean,
//   mappingCount: number,
// }
```

### exportSalesHistoryCSV (action)
Exports selling price history as CSV.

```typescript
args: {
  businessId: v.id("businesses"),
  catalogItemId: v.id("catalog_items"),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
}
// Returns: { csv: string, filename: string }
```

---

## New File: `convex/functions/catalogVendorMappings.ts`

### suggestMappings (action)
Fuzzy-match catalog item descriptions against vendor item descriptions.

```typescript
args: {
  businessId: v.id("businesses"),
  catalogItemId: v.id("catalog_items"),
}
// Returns: {
//   suggestions: {
//     vendorId: Id<"vendors">,
//     vendorName: string,
//     vendorItemIdentifier: string,
//     vendorItemDescription: string,
//     confidenceScore: number,
//     latestPrice: number,
//     currency: string,
//   }[],
// }
```

### confirmMapping (mutation)
User confirms a suggested or creates a manual mapping.

```typescript
args: {
  businessId: v.id("businesses"),
  catalogItemId: v.id("catalog_items"),
  vendorId: v.id("vendors"),
  vendorItemIdentifier: v.string(),
  vendorItemDescription: v.string(),
  matchSource: v.union(v.literal("user-confirmed"), v.literal("user-created")),
  confidenceScore: v.optional(v.number()),
}
// Returns: { mappingId: Id<"catalog_vendor_item_mappings"> }
```

### rejectMapping (mutation)
User rejects a fuzzy-suggested mapping.

```typescript
args: {
  mappingId: v.id("catalog_vendor_item_mappings"),
}
// Returns: void
```

### getMappings (query)
Get all confirmed mappings for a catalog item (small result set, safe for reactive query).

```typescript
args: {
  catalogItemId: v.id("catalog_items"),
  businessId: v.id("businesses"),
}
// Returns: CatalogVendorMapping[]
```

### getUnmappedVendorItemCount (query)
Check if vendor price data exists that could be mapped (for the banner).

```typescript
args: {
  businessId: v.id("businesses"),
  catalogItemId: v.id("catalog_items"),
}
// Returns: { count: number, hasData: boolean }
```

---

## New File: `convex/functions/priceHistoryMCP.ts`

### getPriceHistory (internalQuery)
MCP tool for chat agent — returns unified price data for a catalog item.

```typescript
args: {
  businessId: v.id("businesses"),
  catalogItemId: v.optional(v.id("catalog_items")),
  catalogItemName: v.optional(v.string()), // fuzzy search by name
  customerId: v.optional(v.id("customers")),
}
// Returns: {
//   catalogItem: { name, sku, category, currentPrice },
//   sellingHistory: { count, latestPrice, avgPrice, trend },
//   purchaseHistory: { count, latestCost, avgCost, trend },
//   margin: { current, previous, change, warning },
// }
```

---

## Modified Files

### `convex/functions/salesInvoices.ts`
- In `send()` mutation (line ~610): After status update, call `sellingPriceHistory.recordFromSalesInvoice` via `ctx.scheduler.runAfter(0, ...)` for each catalog-linked line item
- In `voidInvoice()` mutation (line ~700): Call `sellingPriceHistory.archiveBySalesInvoice` to soft-delete records

### `convex/functions/vendorPriceAnomalies.ts`
- In `detectAnomalies()` (line ~100): After creating anomaly record, check if item has catalog mapping → if yes, query selling price → enrich anomaly with margin impact in `potentialIndicators`

### `convex/schema.ts`
- Add `selling_price_history` table definition
- Add `catalog_vendor_item_mappings` table definition
- Add `marginAlertConfig` optional field to `businesses` table
