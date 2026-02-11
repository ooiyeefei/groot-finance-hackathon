# Research: Accounts Receivable & Debtor Management

**Feature**: 010-ar-debtor-management
**Date**: 2026-02-10

## R1: Payment Data Model — Separate Table vs Embedded

**Decision**: Use a separate `payments` table with embedded `allocations` array within each payment record.

**Rationale**: Payments need independent querying for debtor statements (date-range filtering across payments), aging calculations, and CSV export. Embedded arrays within invoices would require scanning all invoices to find payments in a date range. However, the allocations *within* a payment are always accessed together with the payment, so embedding them inside the payment record follows the Convex pattern used by `accounting_entries.lineItems`.

**Alternatives considered**:
- Fully embedded in `sales_invoices.paymentAllocations[]` — rejected because payments span multiple invoices and need independent date queries
- Separate `payment_allocations` junction table — rejected because Convex doesn't support joins; fetching allocations would require extra queries with no benefit since allocations are always read with their parent payment

## R2: Payment Immutability & Reversal Pattern

**Decision**: Payments use a `type` field: `"payment"` (normal) or `"reversal"` (correction). Reversals reference the original payment via `reversesPaymentId`. Both types are stored in the same `payments` table.

**Rationale**: Single table simplifies queries for debtor statements (all transactions in one query). The `type` field allows the UI to display reversals distinctly (e.g., negative amount, different color). This follows standard accounting practice where journal entries are never deleted — only offset.

**Alternatives considered**:
- Soft-delete pattern — rejected because it loses audit trail and complicates balance recalculation
- Separate `payment_reversals` table — rejected because it doubles the query complexity for statements

## R3: Debtor Aggregation Strategy

**Decision**: Compute debtor summaries server-side in Convex queries. Group outstanding invoices by `customerId`, calculate per-customer totals and aging buckets in a single-pass loop. No materialized views or cached aggregates.

**Rationale**: Convex queries are reactive — data updates trigger re-computation automatically. For SME scale (up to 500 customers, 5000 invoices), a single-pass aggregation is fast enough. This matches the existing `salesInvoices.list()` pattern which computes summary stats inline.

**Alternatives considered**:
- Materialized aggregate table updated via triggers — rejected because Convex doesn't support triggers; would require cron-based sync with stale data risk
- Client-side aggregation — rejected because it would transfer all invoice data to the client

## R4: Aging Bucket Calculation

**Decision**: Calculate aging from `dueDate` relative to today. Buckets: Current (dueDate >= today), 1-30 (1-30 days past due), 31-60, 61-90, 90+ days past due. Per-invoice calculation, then aggregated per customer.

**Rationale**: Standard AR aging practice. Due date (not invoice date) reflects when payment was expected. The spec explicitly states FR-014: "aging based on the invoice due date relative to today's date."

**Alternatives considered**:
- Aging from invoice date — rejected per spec requirement
- Configurable bucket boundaries — deferred; standard buckets sufficient for SME

## R5: PDF Statement Generation

**Decision**: Use existing `html2pdf.js` library (already a dependency). Render statement as a React component, then convert to PDF client-side.

**Rationale**: The pattern is already established in `use-invoice-pdf.ts`. No new dependencies needed. Client-side generation avoids server costs and works offline. A4 portrait format matches the existing invoice PDF pattern.

**Alternatives considered**:
- Server-side PDF with Puppeteer/Lambda — rejected; adds infrastructure complexity and cost for a feature that works well client-side
- jsPDF direct generation — rejected; html2pdf.js provides better layout control via HTML/CSS

## R6: CSV Export Approach

**Decision**: Use existing `csv-generator.ts` utility from `src/domains/exports/lib/`. Generate CSV client-side from query results, create Blob, trigger browser download.

**Rationale**: The export infrastructure already exists with RFC 4180 compliant CSV escaping, field mapping, and formatting. No need to build new export logic.

**Alternatives considered**:
- Server-side CSV generation — rejected; unnecessary for the data volumes involved
- Excel (.xlsx) format — deferred; CSV is the standard for accounting data exchange

## R7: Navigation Integration

**Decision**: Add "Debtors" as a third tab in `invoices-tab-container.tsx` using the same Radix Tabs pattern. Lazy-load the debtor components. Debtor detail is a separate route (`/sales-invoices/debtors/[customerId]`).

**Rationale**: Per clarification Q2, the user explicitly chose this approach to avoid sidebar bloat. The tab pattern is established and the component already supports lazy loading.

**Alternatives considered**:
- Separate sidebar entry — rejected per user preference
- Sub-navigation within Sales Invoices tab — rejected; debtors is a distinct enough concept to warrant its own tab
