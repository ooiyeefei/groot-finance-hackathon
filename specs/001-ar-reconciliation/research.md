# Research: AR Reconciliation

## Decision 1: Sales Order Storage

**Decision**: New `sales_orders` Convex table separate from `sales_invoices`.
**Rationale**: Sales orders represent external platform data (what Shopee/Lazada reports), while sales invoices represent internal records (what the business issued). Reconciliation requires comparing two independent sources of truth. Merging them would conflate external and internal data, making variance detection impossible.
**Alternatives**: (1) Adding fields to `sales_invoices` — rejected because it mixes source data with internal records. (2) Temporary in-memory only — rejected because users need persistent reconciliation state across sessions.

## Decision 2: Matching Engine Location

**Decision**: Client-side matching logic in `src/domains/sales-invoices/lib/matching-engine.ts`, invoked from a Convex mutation that loads both datasets.
**Rationale**: Matching needs access to both the imported rows and the invoice dataset. Running the logic inside a Convex mutation allows atomic updates (match + update status in one transaction). The matching algorithm itself is pure TypeScript with no external dependencies.
**Alternatives**: (1) Separate Lambda — rejected as over-engineering for synchronous <5K row matching. (2) Pure client-side — rejected because match results need to be persisted atomically.

## Decision 3: Platform Detection

**Decision**: Hybrid auto-detect from column header patterns + user confirmation.
**Rationale**: Column headers contain platform-specific patterns (e.g., "Seller SKU" = Shopee, "Campaign ID" = Lazada). Auto-detection reduces friction; user confirmation prevents misclassification. Platform label is metadata only — no code branching.
**Alternatives**: (1) Manual selection only — rejected as unnecessary friction when headers are distinctive. (2) Full auto-detect without confirmation — rejected due to misclassification risk.

## Decision 4: Variance Threshold

**Decision**: Compare invoice total to order gross amount. After subtracting known platform fees, residual must be ≤ 10% of invoice total or RM 5 equivalent (whichever is greater) to qualify as "variance" match.
**Rationale**: Platform fees (commissions, shipping, marketing) explain most differences between gross sales and invoice amounts. A 10% / RM 5 threshold catches legitimate fee-adjusted matches while rejecting truly unrelated amounts.
**Alternatives**: (1) Exact match only — rejected as too strict for real-world SEA e-commerce data. (2) Always match by reference regardless of amount — rejected due to false match risk.

## Decision 5: Conflict Resolution

**Decision**: Flag all competing orders as "conflict" and present side-by-side for user resolution.
**Rationale**: Multi-channel sellers may have legitimate overlapping orders. Auto-resolution (first-imported wins, highest-confidence wins) risks silently linking the wrong order. User resolution preserves data integrity.
**Alternatives**: (1) First-imported wins — rejected as arbitrary. (2) Highest confidence auto-wins — rejected because confidence scores may be tied.
