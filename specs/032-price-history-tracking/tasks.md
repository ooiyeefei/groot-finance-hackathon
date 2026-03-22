# Tasks: Price History Tracking

**Input**: Design documents from `/specs/032-price-history-tracking/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/convex-functions.md

**Tests**: Not explicitly requested — no test tasks included.

**Organization**: Tasks grouped by user story for independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Schema & Shared Infrastructure)

**Purpose**: Add new tables and deploy schema changes before any feature code

- [x] T001 Add `selling_price_history` table definition to `convex/schema.ts` with fields: businessId, catalogItemId, customerId, salesInvoiceId, unitPrice, quantity, currency, totalAmount, invoiceDate, itemDescription, itemCode, isZeroPrice, archivedAt, createdAt. Add indexes: by_catalogItem_business, by_invoice, by_customer, by_business_date
- [x] T002 Add `catalog_vendor_item_mappings` table definition to `convex/schema.ts` with fields: businessId, catalogItemId, vendorId, vendorItemIdentifier, vendorItemDescription, matchSource, confidenceScore, rejectedAt, createdAt. Add indexes: by_catalogItem, by_vendor_item, by_business_source
- [x] T003 Add `marginAlertConfig` optional field to `businesses` table in `convex/schema.ts` as `v.optional(v.object({ defaultThreshold: v.number(), categoryOverrides: v.optional(v.array(v.object({ category: v.string(), threshold: v.number() }))) }))`
- [x] T004 Deploy schema changes: run `npx convex deploy --yes` (deferred — deploy from main after merge)

**Checkpoint**: Schema deployed — tables available for all subsequent phases

---

## Phase 2: User Story 1 + User Story 2 — Selling Price Capture & History View (Priority: P1) MVP

**Goal**: Automatically capture selling prices when sales invoices are sent, and display them on a new catalog item detail page with filtering and charts.

**Independent Test**: Issue 3+ sales invoices with catalog items → navigate to catalog item → view Sales History tab with correct data, filters, and chart.

### Backend: Selling Price Capture

- [x] T005 [US1] Create `convex/functions/sellingPriceHistory.ts` with `recordFromSalesInvoice` internalMutation — iterate lineItems, filter by catalogItemId, check dedup via by_invoice index, insert selling_price_history records with isZeroPrice flag for $0 items
- [x] T006 [US1] Add `archiveBySalesInvoice` internalMutation to `convex/functions/sellingPriceHistory.ts` — query by_invoice index, set archivedAt on all matching records
- [x] T007 [US1] Add internal queries `_getSalesHistory` and `_getSalesPriceTrend` to `convex/functions/sellingPriceHistory.ts` — filtered by catalogItemId, businessId, optional customerId and date range, exclude archived, sorted by invoiceDate desc
- [x] T008 [US1] Add `getSalesHistory` action and `getSalesPriceTrend` action to `convex/functions/sellingPriceHistory.ts` — call internal queries via ctx.runQuery, return formatted results with customer names resolved
- [x] T009 [US2] Hook `salesInvoices.send()` in `convex/functions/salesInvoices.ts` — after status update to "sent" (line ~610), filter lineItems for catalogItemId, call `ctx.scheduler.runAfter(0, internal.functions.sellingPriceHistory.recordFromSalesInvoice, {...})` with catalog-linked items
- [x] T010 [US2] Hook `salesInvoices.voidInvoice()` in `convex/functions/salesInvoices.ts` — after voiding (line ~700), call `ctx.scheduler.runAfter(0, internal.functions.sellingPriceHistory.archiveBySalesInvoice, { salesInvoiceId })`
- [x] T011 Deploy Convex changes: run `npx convex deploy --yes`

### Frontend: Catalog Item Detail Page

- [x] T012 [P] [US1] Create `src/domains/sales-invoices/hooks/use-selling-price-history.ts` — useAction + useState pattern for getSalesHistory and getSalesPriceTrend, with loading/error states
- [x] T013 [P] [US1] Create `src/domains/sales-invoices/components/sales-history-tab.tsx` — table (Date, Customer, Qty, Unit Price, Total, Invoice #), customer filter dropdown, date range picker, empty state message, reuse PriceHistoryChart from vendor-intelligence for trend chart
- [x] T014 [US1] Create `src/domains/sales-invoices/components/catalog-item-detail.tsx` — client component with Tabs (Overview, Sales History, Purchase History, Price Comparison), load catalog item by ID, display item header (name, SKU, category, current price, status)
- [x] T015 [US1] Create `src/app/[locale]/sales-invoices/catalog/[itemId]/page.tsx` — server component with Sidebar + HeaderWithUser + ClientProviders wrapping CatalogItemDetail, follow page layout pattern from CLAUDE.md
- [x] T016 [US1] Modify `src/domains/sales-invoices/components/catalog-item-manager.tsx` — make catalog item rows clickable with `router.push(\`/\${locale}/sales-invoices/catalog/\${item._id}\`)`, add cursor-pointer styling and chevron-right icon

**Checkpoint**: US1+US2 complete — selling prices captured automatically on send, visible on detail page with filters and charts. Build must pass: `npm run build`

---

## Phase 3: User Story 3 — Unified Price View with Margin Analysis (Priority: P2)

**Goal**: Show purchase cost vs selling price side-by-side with margin indicator and warning badges. Requires vendor item mapping infrastructure.

**Independent Test**: Have a catalog item with both purchase history (from AP) and selling history → view margin indicator and comparison chart. Test mapping bootstrapping flow.

### Backend: Vendor Item Mappings

- [x] T017 [P] [US3] Create `convex/functions/catalogVendorMappings.ts` with `getMappings` query and `getUnmappedVendorItemCount` query — getMappings returns confirmed/user-created mappings for a catalogItemId, getUnmappedVendorItemCount checks vendor_price_history for items matching catalog item name/description
- [x] T018 [US3] Add `suggestMappings` action to `convex/functions/catalogVendorMappings.ts` — query distinct vendor items from vendor_price_history, fuzzy match against catalog item name/description/SKU using normalized string comparison (Jaccard similarity), return sorted suggestions with confidence scores
- [x] T019 [P] [US3] Add `confirmMapping` mutation and `rejectMapping` mutation to `convex/functions/catalogVendorMappings.ts` — confirmMapping creates/updates mapping with user-confirmed source, rejectMapping sets rejectedAt timestamp
- [x] T020 [US3] Add `getMarginSummary` action to `convex/functions/sellingPriceHistory.ts` — query latest selling price (by invoiceDate desc), query vendor mappings, for each mapping query latest vendor_price_history record, convert to homeCurrency if needed via manual_exchange_rates, calculate margin percentage, generate warning if margin decreased >5pp

### Frontend: Mapping Banner + Purchase History + Margin View

- [x] T021 [P] [US3] Create `src/domains/sales-invoices/hooks/use-catalog-vendor-mappings.ts` — useQuery for getMappings and getUnmappedVendorItemCount (small result sets), useMutation for confirmMapping and rejectMapping
- [x] T022 [P] [US3] Create `src/domains/sales-invoices/hooks/use-margin-summary.ts` — useAction + useState for getMarginSummary with loading state
- [x] T023 [US3] Create `src/domains/sales-invoices/components/mapping-banner.tsx` — shows "Purchase price data available (X vendor items). Click to run smart matching." when no mappings exist. On click, calls suggestMappings action, displays suggestions in a dialog with confirm/reject/skip buttons per suggestion
- [x] T024 [US3] Create `src/domains/sales-invoices/components/purchase-history-tab.tsx` — shows mapping banner if no mappings, otherwise shows table (Date, Vendor, Qty, Unit Price, Total, Invoice #) from vendor_price_history via mappings, with PriceHistoryChart for purchase cost trend
- [x] T025 [US3] Create `src/domains/sales-invoices/components/price-comparison-chart.tsx` — dual-line Recharts LineChart with purchase cost (red) and selling price (blue) on same timeline, shared X-axis (dates), dual Y-axis if different currencies
- [x] T026 [US3] Create `src/domains/sales-invoices/components/price-comparison-tab.tsx` — margin indicator card (Latest Cost | Latest Price | Gross Margin %), warning badge for margin erosion, PriceComparisonChart, empty states for missing data
- [x] T027 [US3] Wire Purchase History and Price Comparison tabs into `src/domains/sales-invoices/components/catalog-item-detail.tsx` — import and render purchase-history-tab and price-comparison-tab in their respective tab panels
- [x] T028 Deploy Convex changes: run `npx convex deploy --yes`

**Checkpoint**: US3 complete — unified margin view works with vendor mappings. Build must pass: `npm run build`

---

## Phase 4: User Story 4 — Proactive Alerts & Chat Agent (Priority: P3)

**Goal**: Enrich vendor price anomaly alerts with margin impact, expose price data to chat agent via MCP, add configurable margin thresholds.

**Independent Test**: Create a vendor price anomaly for a mapped item → verify alert includes margin impact. Ask chat agent "What did I last charge Customer X for Item Y?" → verify accurate response.

### Backend: Alerts & MCP

- [x] T029 [US4] Modify `convex/functions/vendorPriceAnomalies.ts` `detectAnomalies` — after creating anomaly, query catalog_vendor_item_mappings for the itemIdentifier, if mapping exists query latest selling price, calculate margin impact, add to potentialIndicators array
- [x] T030 [P] [US4] Create `convex/functions/priceHistoryMCP.ts` with `getPriceHistory` internalQuery — accepts catalogItemId or catalogItemName (fuzzy search), returns unified response with sellingHistory, purchaseHistory, and margin data for chat agent
- [x] T031 [P] [US4] Add `exportSalesHistoryCSV` action to `convex/functions/sellingPriceHistory.ts` — query selling price records, format as CSV with headers (Date, Customer, Item, Qty, Unit Price, Currency, Total, Invoice #), return CSV string and filename

### Frontend: Margin Settings & CSV Export

- [x] T032 [P] [US4] Add margin alert threshold settings UI to the business settings page — default threshold input (number, 0-100%), category overrides list with add/remove, save to businesses.marginAlertConfig via mutation
- [x] T033 [P] [US4] Add CSV export button to `src/domains/sales-invoices/components/sales-history-tab.tsx` — calls exportSalesHistoryCSV action, triggers browser download
- [x] T034 Deploy Convex changes: run `npx convex deploy --yes`

**Checkpoint**: US4 complete — alerts include margin impact, chat agent can answer pricing queries, CSV export works. Build must pass: `npm run build`

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and documentation

- [x] T035 Run full build verification: `npm run build` — fix any remaining TypeScript errors
- [x] T036 [P] Update `src/domains/sales-invoices/CLAUDE.md` or create domain docs with price history tracking architecture, tables, functions, and UI components
- [x] T037 Final Convex deploy: `npx convex deploy --yes` — ensure production has all latest functions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1+US2)**: Depends on Phase 1 (schema must be deployed)
- **Phase 3 (US3)**: Depends on Phase 2 (needs selling price data to exist for margin calculations)
- **Phase 4 (US4)**: Depends on Phase 3 (needs vendor mappings for margin impact in alerts)
- **Phase 5 (Polish)**: Depends on all desired phases complete

### Within Phase Parallel Opportunities

**Phase 2**: T012 and T013 can run in parallel (different files). T005-T008 are sequential (same file).
**Phase 3**: T017 and T019 can run in parallel (queries vs mutations in same file, but independent logic). T021 and T022 can run in parallel (different hooks).
**Phase 4**: T029, T030, T031 can all run in parallel (different files). T032, T033 can run in parallel (different components).

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2)

1. Complete Phase 1: Schema setup (T001-T004)
2. Complete Phase 2: US1+US2 — selling price capture + detail page (T005-T016)
3. **STOP and VALIDATE**: Test by issuing sales invoices, navigating to catalog item detail, verifying Sales History tab
4. Deploy if ready — users can immediately see selling price history

### Incremental Delivery

1. Phase 1 + Phase 2 → MVP: selling price tracking live
2. Phase 3 → Margin analysis: vendor mappings + unified view
3. Phase 4 → AI-powered: chat agent + alerts + configurable thresholds
4. Each phase adds value without breaking previous functionality

---

## Notes

- All Convex changes require `npx convex deploy --yes` before frontend can use them
- Use `action` + `internalQuery` for large data reads (bandwidth-safe per CLAUDE.md)
- Use reactive `query` only for small result sets (mappings, unmapped count)
- Follow page layout pattern: server component → ClientProviders → Sidebar + HeaderWithUser + main
- Reuse `PriceHistoryChart` from `src/domains/vendor-intelligence/components/price-history-chart.tsx`
- Total: 37 tasks across 5 phases
