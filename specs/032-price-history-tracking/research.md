# Research: Price History Tracking

**Branch**: `032-price-history-tracking` | **Date**: 2026-03-22

## Decision 1: Selling Price Capture Hook Point

**Decision**: Hook into `salesInvoices.send()` mutation (line 542 of `convex/functions/salesInvoices.ts`) — the `draft → sent` transition.

**Rationale**: This is the moment line items are finalized and the invoice is committed (AR journal entry created). Before `send()`, the invoice is still a draft that can change freely. After `send()`, prices are locked. This mirrors how `vendor_price_history` captures prices during invoice processing.

**Alternatives considered**:
- Hook on `create()` — rejected: draft invoices may be edited many times before sending
- Hook on payment — rejected: payment confirms cash flow, not pricing; also delayed
- Separate cron — rejected: unnecessary bandwidth; inline capture is cheaper

## Decision 2: Line Items Structure

**Decision**: Sales invoice line items are stored as an **inline array** (`lineItems[]`) within the `sales_invoices` document, NOT in a separate table.

**Rationale**: Each line item has `catalogItemId` (optional string), `unitPrice`, `quantity`, `currency`, `description`, `itemCode`. When a line item has `catalogItemId`, we capture a selling price record.

**Impact**: No join needed — read the invoice document directly. Iterate `lineItems.filter(li => li.catalogItemId)` to find catalog-linked items.

## Decision 3: New Table vs Extending Existing

**Decision**: Create a new `selling_price_history` table rather than extending `vendor_price_history` with a `type` discriminator.

**Rationale**:
- `vendor_price_history` is tightly coupled to vendor intelligence (has vendorId, matchConfidenceScore, fuzzy matching fields, anomaly detection integration)
- Selling prices have different relationships (customerId instead of vendorId, salesInvoiceId instead of invoiceId)
- Separate tables allow independent indexing strategies optimized for each query pattern
- Cleaner separation of concerns — vendor intelligence domain owns its table, this feature owns its own

**Alternatives considered**:
- Add `type: "purchase" | "sale"` to `vendor_price_history` — rejected: would require refactoring all existing vendor intelligence queries, adding complexity to anomaly detection, and mixing two different entity relationships in one table

## Decision 4: Vendor Item → Catalog Item Mapping Table

**Decision**: Create `catalog_vendor_item_mappings` table linking `catalog_items._id` to `vendor_price_history.itemIdentifier` + `vendorId`.

**Rationale**: Per clarification session — separate mapping table with fuzzy-match bootstrapping. This is architecturally similar to `cross_vendor_item_groups` but bridges the vendor→catalog boundary instead of vendor→vendor.

**Key design**:
- `catalogItemId: v.id("catalog_items")`
- `vendorId: v.id("vendors")`
- `vendorItemIdentifier: v.string()` — matches `vendor_price_history.itemIdentifier`
- `matchSource: "fuzzy-suggested" | "user-confirmed" | "user-created"`
- `confidenceScore: v.optional(v.number())`
- Indexes: `by_catalogItem` (for detail page), `by_vendor_item` (for dedup/lookup)

## Decision 5: Catalog Item Detail Page Route

**Decision**: Create at `/[locale]/sales-invoices/catalog/[itemId]/page.tsx` — nested under the existing sales-invoices catalog route.

**Rationale**: Catalog items are currently managed at `/sales-invoices/catalog/`. Adding `[itemId]` as a dynamic segment follows Next.js conventions and keeps items within their domain. No new sidebar entry needed.

**Impact**: Modify `catalog-item-manager.tsx` to make rows clickable with router navigation.

## Decision 6: Margin Threshold Storage

**Decision**: Add `marginAlertConfig` to the `businesses` table as an optional object field.

**Rationale**: Business-level default threshold + per-category overrides. The `businesses` table already holds business-specific configuration. Adding an optional field avoids a new table for simple config.

**Structure**:
```typescript
marginAlertConfig: v.optional(v.object({
  defaultThreshold: v.number(), // e.g., 15
  categoryOverrides: v.optional(v.array(v.object({
    category: v.string(),
    threshold: v.number(),
  }))),
}))
```

## Decision 7: Reusing Existing Components

**Decision**: Extend `PriceHistoryChart` from vendor intelligence for selling price charts. Reuse the same Recharts patterns.

**Rationale**: The existing `PriceHistoryChart` component (`src/domains/vendor-intelligence/components/price-history-chart.tsx`) accepts `PriceTrendDataPoint[]` with `{date, unitPrice, currency}`. This same interface works for selling prices. For the unified comparison chart, we'll create a new `PriceComparisonChart` component that renders two lines on the same chart.

## Decision 8: Bandwidth-Safe Data Access

**Decision**: Use `action` + `internalQuery` pattern for selling price history reads (not reactive `useQuery`).

**Rationale**: Per CLAUDE.md bandwidth rules — selling price history could have thousands of records for active businesses. Using `action` runs once on demand; client stores results in React state. Only use reactive `query` for single-document lookups (e.g., checking if mappings exist for a catalog item).

## Decision 9: Multi-Currency Margin Calculation

**Decision**: Use `manual_exchange_rates` table for conversion to `businesses.homeCurrency`.

**Rationale**: The system already has exchange rate infrastructure. Query the latest rate for each currency pair. If no rate exists, show margin as "N/A — exchange rate not configured" rather than guessing.

## Decision 10: MCP Tool for Chat Agent

**Decision**: Add `getPriceHistory` MCP tool following the `vendorIntelligenceMCP.ts` pattern — an `internalQuery` that returns enriched JSON.

**Rationale**: Consistent with existing MCP architecture. Returns both purchase and selling price data with margin calculations for a given catalog item.
