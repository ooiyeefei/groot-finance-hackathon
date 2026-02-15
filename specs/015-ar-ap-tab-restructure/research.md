# Research: AR/AP Two-Level Tab Restructure

**Date**: 2026-02-15
**Feature**: 015-ar-ap-tab-restructure

## R1: Two-Level Tab Navigation Pattern

**Decision**: Use nested Radix UI Tabs with a single URL hash encoding both levels.

**Rationale**: Radix UI's `@radix-ui/react-tabs` (already used in `src/components/ui/tabs.tsx`) natively supports nesting — a `TabsContent` can contain another full `Tabs` tree. The existing `InvoicesTabContainer` already implements hash-based routing with `window.location.hash`. We extend this to encode both levels: `#ar-dashboard`, `#ar-sales`, `#ap-vendors`, etc.

**Alternatives considered**:
- Separate routes (`/invoices/ar`, `/invoices/ap`): Rejected — requires server-side routing changes, slower navigation, breaks the existing client-side tab pattern.
- Single flat hash with prefix parsing: Rejected — less maintainable than nested Tabs with a combined hash map.
- React Router nested routes: Rejected — project doesn't use React Router, would add unnecessary dependency.

## R2: AR Dashboard Data Sources

**Decision**: Build AR Dashboard using existing `useAgingReport()` hook and `useDebtorList()` hook from `src/domains/sales-invoices/hooks/use-debtor-management.ts`.

**Rationale**: The `getAgingReport` Convex query already returns exactly what's needed: summary totals (current, 1-30, 31-60, 61-90, 90+, total) plus per-debtor breakdown. The `getDebtorList` query provides total debtors count, total outstanding, and aging buckets in its summary. No new backend queries needed.

**Data mapping for AR Dashboard summary cards**:
- Total Receivables → `agingReport.summary.total`
- Overdue Amount → sum of `days1to30 + days31to60 + days61to90 + days90plus`
- Due This Week / Due This Month → derive from debtor list `oldestOverdueDays` or use aging buckets

**Alternatives considered**:
- Creating a new dedicated AR summary Convex query: Rejected — existing queries provide all needed data.
- Reusing the AgingReport component directly: Rejected — it's a full table view, not summary cards. But we can reuse the data hooks.

## R3: Price Intelligence UI Data Sources

**Decision**: Build Price Intelligence UI using existing public Convex queries: `getVendorItems`, `detectPriceChanges`, `getCrossVendorComparison`, `getVendorPriceHistory`, `getItemPriceHistory`.

**Rationale**: The backend is fully built with:
- `getVendorItems(vendorId)` → lists unique items per vendor with latest price and observation count
- `detectPriceChanges(vendorId, lineItems)` → compares current vs historical with alert severity
- `getCrossVendorComparison(businessId, normalizedDescription)` → cross-vendor price comparison with cheapest highlighted
- Price thresholds in `src/domains/payables/lib/price-thresholds.ts` with currency-aware alert levels (5/10/20% for stable, 8/15/25% for high-inflation currencies)

**UI approach**: Item-centric view — list all tracked items across vendors, show latest price, alert indicator, and expand for cross-vendor comparison and price history chart.

**Alternatives considered**:
- Vendor-centric view (browse by vendor first, then items): Considered but item-centric is more useful for procurement decisions.
- Dashboard-only (just alerts, no browsing): Rejected — users need to proactively compare prices, not just react to alerts.

## R4: Existing AR Aging Report Disposition

**Decision**: The existing AR Aging Report component (`aging-report.tsx`) is subsumed by the AR Dashboard. It is not a separate sub-tab.

**Rationale**: Having both "Dashboard" and "Aging Report" as separate AR sub-tabs would create redundancy — the dashboard shows the same aging data in summary form, and the full aging table can be embedded in the dashboard. The aging report's CSV export capability will be available from the dashboard.

**Alternatives considered**:
- Keep Aging Report as a 5th AR sub-tab: Rejected — creates tab clutter and confusing duplication.
- Remove Aging Report entirely: Rejected — the full table with per-debtor drill-down is valuable and should be part of the dashboard.

## R5: URL Hash Encoding Scheme

**Decision**: Use `#ar-{subtab}` and `#ap-{subtab}` format.

**Hash mapping**:
| Hash | Top-Level | Sub-Tab |
|------|-----------|---------|
| `#ar-dashboard` | AR | Dashboard |
| `#ar-sales` | AR | Sales Invoices |
| `#ar-debtors` | AR | Debtors |
| `#ar-catalog` | AR | Product Catalog |
| `#ap-dashboard` | AP | Dashboard |
| `#ap-incoming` | AP | Incoming Invoices |
| `#ap-vendors` | AP | Vendors |
| `#ap-prices` | AP | Price Intelligence |

**Default**: No hash or unrecognized hash → `#ar-dashboard` (AR Dashboard).

**Rationale**: Prefix-based scheme is human-readable, allows easy parsing to determine both top-level and sub-tab, and is consistent with the existing hash pattern. The prefix also makes it clear which section a bookmark/link refers to.

## R6: Payables Route Redirect Strategy

**Decision**: Modify `/en/payables` page to redirect to `/en/invoices#ap-dashboard` using Next.js `redirect()`.

**Rationale**: Server-side redirect ensures bookmarks and external links continue working. The redirect is immediate (before page render). This is the same pattern used for auth redirects already in the codebase.

**Alternatives considered**:
- Client-side redirect with `useRouter`: Rejected — causes a flash of content before redirect.
- 404 response: Rejected — breaks existing bookmarks silently.
- Keep payables page as a wrapper that embeds the AP tab: Rejected — creates maintenance burden with two entry points.

## R7: Mobile Tab Scrolling

**Decision**: Apply `overflow-x-auto` to sub-tab `TabsList` containers on mobile viewports.

**Rationale**: With 4 sub-tabs per section, horizontal space may be tight on mobile. The top-level tabs (AR/AP) are only 2 items and fit on any screen. Sub-tabs need scrolling. This is a CSS-only solution using Tailwind's responsive utilities.
