# Feature Specification: Price History Tracking — Selling Prices + Unified Margin View

**Feature Branch**: `032-price-history-tracking`
**Created**: 2026-03-22
**Status**: Draft
**GitHub Issue**: #369
**Input**: Track price history for catalog items from two sources: purchase prices (AP invoices — already implemented via vendor intelligence) and selling prices (sales invoices — new). Enable unified price view with margin analysis.

## Context: What Already Exists

The **vendor intelligence domain** (#320) already provides complete purchase price tracking:
- `vendor_price_history` table with anomaly detection, scoring, and DSPy matching
- Price trend charts (Recharts), cross-vendor comparison, CSV export
- Tier 1 (rule-based) + Tier 2 (DSPy) intelligence
- MCP tool for chat agent access (`analyzeVendorPricing`)

**This feature focuses on the NEW capabilities**:
1. Selling price history capture from sales invoices
2. Catalog item detail page with purchase + selling price views
3. Margin analysis (purchase cost vs selling price)
4. Proactive margin alerts

---

## Clarifications

### Session 2026-03-22

- Q: How should the system link vendor price history (which uses `itemIdentifier` — vendor item codes or description hashes) to catalog items (which use `catalogItemId`)? → A: Separate mapping table with fuzzy-match bootstrapping. One-time setup uses description-based matching (leveraging existing DSPy infrastructure) to generate initial vendor item → catalog item mappings. Users confirm/reject suggested matches. Once mappings exist, they're maintained going forward. This allows the same catalog item to be sourced from multiple vendors (each with their own item codes) and handles businesses without pre-existing vendor code systems.

- Q: How should users navigate to the catalog item detail page with price history? → A: Option B — Click a catalog item row in the existing catalog items list → navigate to `/catalog/[itemId]` detail page with tabs. This follows standard master-detail patterns.

- Q: How should "latest" cost and price be defined for margin calculations? → A: Option B — Most recent by transaction date (invoice date field). If multiple transactions share the same date, use the most recently created record (creation timestamp as tiebreaker). This reflects actual business transaction timing.

- Q: When should the fuzzy-match bootstrapping flow be triggered to generate catalog item ↔ vendor item mappings? → A: Option C — On-demand via UI button. When a user opens the catalog item detail page and no mappings exist, show a banner: "Purchase price data is available but not linked. Click to run smart matching." The banner includes a preview count of how many vendor items could be matched. This gives users control without adding friction to invoice workflows.

- Q: Should the margin alert threshold (currently "below 10%") be configurable, and at what level? → A: Option B — Configurable per business with optional per-category override. Business settings include a default threshold (e.g., "Alert when margin < 15%"). Users can optionally override this for specific catalog item categories (e.g., "Groceries: 5%", "Consulting: 40%"). This handles different business models (grocery stores vs SaaS) and mixed-margin product portfolios.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View Selling Price History for a Catalog Item (Priority: P1)

As a business owner or sales manager, I want to see what I've charged each customer for a specific catalog item over time, so I can quote consistently and identify pricing trends.

**Why this priority**: This is the core new capability — without selling price history, none of the margin or comparison features work. It also directly answers the user question: "What did I last charge Customer X for this item?"

**Independent Test**: Can be fully tested by issuing 3+ sales invoices with the same catalog item to different customers, then clicking the catalog item in the catalog items list to open the detail page, and viewing the "Sales History" tab with correct data, filtering, and chart.

**Acceptance Scenarios**:

1. **Given** a catalog item "Widget A" with 5 past sales invoices to 3 different customers, **When** the user clicks "Widget A" in the catalog items list to open `/catalog/[itemId]` and selects the "Sales History" tab, **Then** they see a table showing Date, Customer, Qty, Unit Price, Total, and Invoice # for all 5 transactions, sorted by date descending.

2. **Given** the Sales History tab is displayed, **When** the user filters by a specific customer "Acme Corp", **Then** only sales to Acme Corp are shown in both the table and the price trend chart.

3. **Given** the Sales History tab is displayed, **When** the user filters by a date range (e.g., last 3 months), **Then** only transactions within that range appear.

4. **Given** the Sales History tab with data, **When** the user views the price trend chart, **Then** a Recharts line chart shows unit price over time, with data points labeled by customer name.

5. **Given** a catalog item with NO sales history, **When** the user opens the Sales History tab, **Then** they see an empty state message: "No sales recorded for this item yet. Sales prices are captured automatically when you issue sales invoices."

---

### User Story 2 — Automatic Selling Price Capture from Sales Invoices (Priority: P1)

As a system, when a sales invoice is issued (status transitions to "sent" or "posted"), the selling price for each line item linked to a catalog item should be automatically recorded, so that the sales history builds up over time without manual entry.

**Why this priority**: Without automatic capture, the sales history feature has no data. This is a foundational requirement that runs silently in the background.

**Independent Test**: Can be tested by issuing a sales invoice with 2 catalog item line items, then querying the selling price history table to confirm both records were created with correct fields.

**Acceptance Scenarios**:

1. **Given** a sales invoice with line items linked to catalog items, **When** the invoice is issued/posted, **Then** a selling price record is created for each catalog-linked line item with: catalogItemId, customerId, unitPrice, quantity, currency, invoiceDate, and invoiceId.

2. **Given** a sales invoice line item that is NOT linked to any catalog item (free-text item), **When** the invoice is issued, **Then** no selling price record is created for that line item.

3. **Given** a sales invoice that is voided or reversed after being posted, **When** the reversal happens, **Then** the corresponding selling price records are soft-deleted (archived) so they don't appear in history or margin calculations.

4. **Given** a sales invoice that is edited and re-issued, **When** the re-issue happens, **Then** the old selling price records are archived and new records are created with the updated prices.

---

### User Story 3 — Unified Price View with Margin Analysis (Priority: P2)

As a business owner, I want to see purchase cost vs selling price for a catalog item side-by-side, with a gross margin indicator, so I can quickly assess profitability and spot margin erosion.

**Why this priority**: Builds on P1 stories. Delivers the "Am I making money on this item?" insight that drives pricing decisions. Requires both purchase and selling data to exist.

**Independent Test**: Can be tested by having a catalog item with both purchase history (from AP invoices via existing vendor intelligence) and selling history (from sales invoices), then viewing the unified price view showing margin calculation.

**Acceptance Scenarios**:

1. **Given** a catalog item with both purchase history (latest cost: $10) and selling history (latest price: $15), **When** the user views the catalog item detail page, **Then** they see a margin indicator showing: Latest Cost: $10 | Latest Price: $15 | Gross Margin: 33.3%.

2. **Given** the catalog item detail page, **When** the user selects a "Price Comparison" view, **Then** they see a dual-axis or overlaid Recharts line chart showing both purchase cost and selling price trends over time on the same timeline.

3. **Given** a catalog item where the latest purchase cost increased but the selling price hasn't changed (margin decreased by >5 percentage points), **When** the user views the item, **Then** a warning badge is displayed: "Margin decreased — cost increased by X% but selling price unchanged."

4. **Given** a catalog item with purchase history but NO selling history, **When** the user views the unified view, **Then** only the purchase cost trend is shown with a message: "No sales recorded. Add this item to a sales invoice to track selling prices."

5. **Given** a catalog item with multi-currency transactions (e.g., purchased in MYR, sold in SGD), **When** the margin is calculated, **Then** the system converts to the business's home currency using the latest exchange rate for comparison, with a note showing the currencies used.

6. **Given** a catalog item with NO vendor item mappings but vendor price history exists in the system, **When** the user opens the catalog item detail page, **Then** they see a banner: "Purchase price data is available (X vendor items). Click to run smart matching." Clicking the button triggers the fuzzy-match bootstrapping flow.

7. **Given** the bootstrapping flow has run and suggested 5 potential mappings for a catalog item, **When** the user reviews the suggestions, **Then** they can confirm matches (creates mapping), reject matches (blocks future suggestions), or skip (revisit later).

---

### User Story 4 — Proactive Margin & Price Alerts via Chat Agent (Priority: P3)

As a business owner using the chat agent, I want to be proactively alerted when my margins erode, and to ask the chat agent pricing questions, so I can take corrective action before profitability suffers.

**Why this priority**: Extends the self-improving AI value proposition. Depends on P1-P2 being stable. This is the "agentic" differentiator — the AI notices things the user might miss.

**Independent Test**: Can be tested by creating a scenario where a vendor's price increases by >15% on a subsequent invoice for an item with selling history, then verifying the alert includes margin impact.

**Acceptance Scenarios**:

1. **Given** the vendor intelligence system detects a price anomaly (already implemented in vendor_price_anomalies), **When** the anomaly is for an item that also has selling price history, **Then** the alert includes margin impact: "Vendor A increased Widget price by 15%. Your current selling price gives you X% margin (was Y%)."

2. **Given** the user asks the chat agent "What's the price trend for Widget A?", **When** the agent queries the MCP tool, **Then** it returns both purchase cost trend and selling price trend with current margin.

3. **Given** a catalog item where the margin has dropped below the configured threshold (business default or category-specific override), **When** the Action Center runs its periodic analysis, **Then** a "Margin Alert" is generated recommending the user review their selling price.

---

### Edge Cases

- **Same item, multiple currencies**: A catalog item purchased in MYR from one vendor and sold in SGD — price comparison must normalize to the business's home currency.
- **Catalog item deleted or deactivated**: Selling price history should be retained and viewable even if the catalog item is deactivated (soft delete).
- **Bulk sales invoice with 50+ line items**: Selling price capture must handle batch recording efficiently without excessive Convex bandwidth consumption.
- **Duplicate capture prevention**: If a sales invoice is processed twice (e.g., webhook retry), the system must not create duplicate selling price records. Use invoiceId + catalogItemId as a deduplication key.
- **Zero-price line items**: Items with $0 unit price (e.g., free samples, promotional items) should be captured but flagged as non-standard pricing so they don't skew margin calculations.
- **Quantity-based pricing**: If different quantities yield different unit prices (volume discounts), each observation is recorded as-is — the chart naturally reveals price-vs-quantity patterns.
- **Linking vendor_price_history to catalog items**: Requires a separate mapping table. Initial bootstrapping uses fuzzy matching (description similarity) to suggest mappings. User confirms or rejects. Once a mapping exists, it persists. A catalog item can be mapped to multiple vendor items (multi-vendor sourcing), and vendor items from different vendors can map to the same catalog item.
- **Margin threshold defaults**: If a business has no configured threshold, use 15% as the system default. If a category has no override, use the business default. This ensures alerts work out-of-the-box while allowing customization.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically record a selling price observation for each catalog-linked line item when a sales invoice is issued or posted.
- **FR-002**: System MUST store selling price records with: catalog item reference, customer reference, unit price, quantity, currency, invoice date, and source invoice reference.
- **FR-003**: System MUST display a "Sales History" tab on the catalog item detail page showing a chronological table of all selling price records for that item.
- **FR-004**: System MUST display a price trend line chart on the Sales History tab showing unit price over time.
- **FR-005**: Users MUST be able to filter sales history by customer and by date range.
- **FR-006**: System MUST display a "Purchase History" tab on the catalog item detail page showing purchase price data from the existing vendor intelligence system.
- **FR-007**: System MUST calculate and display a gross margin indicator when both purchase and selling price data exist: `margin = (sellingPrice - purchaseCost) / sellingPrice × 100`. "Latest" cost and price are determined by most recent invoice date, with creation timestamp as tiebreaker.
- **FR-008**: System MUST display a unified price comparison chart showing both purchase cost and selling price trends on the same timeline.
- **FR-009**: System MUST archive (soft-delete) selling price records when the associated sales invoice is voided or reversed.
- **FR-010**: System MUST prevent duplicate selling price records for the same invoice + catalog item combination.
- **FR-011**: System MUST handle multi-currency scenarios by converting prices to the business's home currency for margin calculations.
- **FR-012**: System MUST enrich existing vendor price anomaly alerts with margin impact when selling price data is available for the affected item.
- **FR-013**: System MUST expose selling price history through an MCP tool so the chat agent can answer pricing queries.
- **FR-014**: System MUST support CSV export of selling price history, consistent with existing purchase price CSV export.
- **FR-015**: System MUST provide a mapping table linking catalog items to vendor item identifiers, supporting one-to-many relationships (one catalog item can map to multiple vendor items).
- **FR-016**: System MUST provide a one-time bootstrapping flow using fuzzy description matching to suggest initial catalog item ↔ vendor item mappings.
- **FR-017**: System MUST trigger bootstrapping on-demand when the user clicks a "Link to vendor prices" button on the catalog item detail page.
- **FR-018**: System MUST display a banner on the catalog item detail page when no mappings exist but vendor price data is available, showing a count of potentially matchable vendor items.
- **FR-019**: Users MUST be able to confirm, reject, or manually create catalog item ↔ vendor item mappings.
- **FR-020**: System MUST use the mapping table to bridge vendor price history and catalog items in the unified margin view.
- **FR-021**: System MUST allow businesses to configure a default margin alert threshold (percentage below which alerts are generated).
- **FR-022**: System MUST allow per-category margin alert threshold overrides for catalog item categories.
- **FR-023**: System MUST use category-specific thresholds when available, falling back to business default threshold when no category override exists.

### Key Entities

- **Selling Price Record**: A point-in-time observation of the price charged to a customer for a catalog item. Key attributes: catalog item, customer, unit price, quantity, currency, date, source invoice. Lifecycle: created on invoice issuance, archived on invoice voiding.
- **Catalog Item** (existing): The shared item that links purchase prices (from vendors) and selling prices (to customers). Extended with a detail view containing price history tabs.
- **Vendor Item Mapping**: Links catalog items to vendor item identifiers (from `vendor_price_history.itemIdentifier`). Key attributes: catalog item reference, vendor reference, vendor item identifier, match source (fuzzy-suggested, user-confirmed, user-created), confidence score. Lifecycle: created during bootstrapping or manual entry, updated when user confirms/rejects suggestions.
- **Margin Summary** (derived): Combines the latest purchase cost and latest selling price for a catalog item. Calculated on demand, not stored separately. Uses Vendor Item Mapping to retrieve purchase costs.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view the complete selling price history for any catalog item within 2 seconds of navigating to the item detail page.
- **SC-002**: Selling price records are captured automatically for 100% of catalog-linked sales invoice line items without manual intervention.
- **SC-003**: Users can identify their most and least profitable items by viewing margin indicators, reducing the time to answer "Am I making money on this?" from manual spreadsheet analysis to under 10 seconds.
- **SC-004**: Margin erosion warnings are surfaced within 1 business day of a vendor price increase affecting an item with active selling prices.
- **SC-005**: The chat agent can answer "What did I last charge [Customer] for [Item]?" with accurate data from the selling price history.
- **SC-006**: The feature handles businesses with 500+ catalog items and 10,000+ historical price records without performance degradation.

---

## Assumptions

- **A-001**: A new catalog item detail page at `/catalog/[itemId]` will be created (currently the catalog items list has no detail view). Users navigate to it by clicking a row in the existing catalog items list. The detail page will contain tabs for Sales History, Purchase History, and Price Comparison.
- **A-002**: The existing vendor intelligence system's `vendor_price_history` table will be queried (not duplicated) for purchase price data in the unified view.
- **A-003**: Sales invoices have a well-defined "issued/posted" lifecycle event that can trigger price capture.
- **A-004**: The existing Recharts chart components from vendor intelligence can be reused or extended for selling price charts.
- **A-005**: Multi-currency conversion will use the `manual_exchange_rates` table already present in the system.
- **A-006**: The selling price history follows the same Convex bandwidth-safe patterns as vendor intelligence (actions for large reads, reactive queries only for small lookups).
- **A-007**: The system-wide default margin alert threshold is 15% (used when business has no configured threshold). This is a reasonable middle ground for most businesses and can be overridden.

---

## Out of Scope

- **Inventory/stock tracking**: This feature tracks prices only, not stock levels or inventory movements.
- **Automated repricing**: The system shows margin data and alerts but does not automatically adjust selling prices.
- **Customer-specific pricing tiers**: No formal "price list per customer" management — this tracks what was actually charged historically.
- **Purchase order pricing**: Only captures prices from posted AP invoices and issued sales invoices, not from purchase orders or quotes.
- **Competitor pricing**: No external market price data integration.
