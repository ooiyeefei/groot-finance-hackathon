# Quickstart: Price History Tracking

**Branch**: `032-price-history-tracking` | **Date**: 2026-03-22

## Prerequisites

- Node.js 20+
- Convex CLI (`npx convex`)
- Access to the Groot Finance codebase

## Implementation Order

### Phase 1: Schema & Data Layer (P1 foundation)
1. Add `selling_price_history` table to `convex/schema.ts`
2. Add `catalog_vendor_item_mappings` table to `convex/schema.ts`
3. Add `marginAlertConfig` to `businesses` table
4. Run `npx convex deploy --yes` to sync schema
5. Create `convex/functions/sellingPriceHistory.ts` with `recordFromSalesInvoice` and `archiveBySalesInvoice`
6. Hook into `salesInvoices.send()` and `salesInvoices.voidInvoice()`

### Phase 2: Catalog Item Detail Page (P1 UI)
7. Create route: `src/app/[locale]/sales-invoices/catalog/[itemId]/page.tsx`
8. Create client component with tabs: Overview, Sales History, Purchase History, Price Comparison
9. Modify `catalog-item-manager.tsx` to make rows clickable (navigate to detail page)
10. Build Sales History tab: table + Recharts chart + filters

### Phase 3: Vendor Item Mappings (P2)
11. Create `convex/functions/catalogVendorMappings.ts`
12. Build mapping suggestion UI (banner + confirmation dialog)
13. Build Purchase History tab using mappings + vendor_price_history data
14. Build unified Price Comparison chart with margin indicator

### Phase 4: Alerts & MCP (P3)
15. Add margin impact to `vendorPriceAnomalies.detectAnomalies()`
16. Create `convex/functions/priceHistoryMCP.ts` for chat agent
17. Add margin threshold settings to business settings page
18. CSV export for selling price history

## Key Files to Create

| File | Purpose |
|------|---------|
| `convex/functions/sellingPriceHistory.ts` | Selling price CRUD + queries |
| `convex/functions/catalogVendorMappings.ts` | Vendor↔catalog mapping management |
| `convex/functions/priceHistoryMCP.ts` | MCP tool for chat agent |
| `src/app/[locale]/sales-invoices/catalog/[itemId]/page.tsx` | Detail page route |
| `src/domains/sales-invoices/components/catalog-item-detail.tsx` | Detail page client component |
| `src/domains/sales-invoices/components/sales-history-tab.tsx` | Sales history tab |
| `src/domains/sales-invoices/components/purchase-history-tab.tsx` | Purchase history tab |
| `src/domains/sales-invoices/components/price-comparison-tab.tsx` | Unified margin view |
| `src/domains/sales-invoices/components/mapping-banner.tsx` | Fuzzy match bootstrapping UI |
| `src/domains/sales-invoices/hooks/use-selling-price-history.ts` | Data hook |
| `src/domains/sales-invoices/hooks/use-catalog-vendor-mappings.ts` | Mapping hook |
| `src/domains/sales-invoices/hooks/use-margin-summary.ts` | Margin calculation hook |

## Verification

After each phase:
1. `npm run build` — must pass
2. `npx convex deploy --yes` — after any Convex changes
3. Manual test via UAT accounts (see CLAUDE.md for credentials)
