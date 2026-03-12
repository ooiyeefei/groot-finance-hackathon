# Research: AP 3-Way Matching

**Branch**: `021-ap-3-way` | **Date**: 2026-03-11

## Decision 1: Data Model for Match Records

**Decision**: Use a dedicated `po_matches` table with embedded line-item pairings, rather than a junction table per line-item pair.

**Rationale**: Convex favors denormalized documents with embedded arrays (same pattern as `accounting_entries.lineItems` and `accounting_entries.paymentHistory`). A single match record with an embedded `lineItemPairings` array keeps all match data in one document, enabling real-time subscriptions on the match record without cross-table joins.

**Alternatives considered**:
- Junction table per line-item pairing: Would require multiple queries to reconstruct a match view. Convex doesn't support SQL-style JOINs, making this pattern expensive.
- Storing match data on the accounting entry: Too tightly coupled; a PO may have matches before any payable is created (match gates payable creation per clarification).

## Decision 2: PO/GRN Number Generation

**Decision**: Use a `counters` document per business in Convex for sequential PO/GRN number generation (e.g., PO-2026-001, GRN-2026-001).

**Rationale**: Convex mutations are transactional and serialized, making an atomic read-increment-write on a counter document safe without race conditions. This is simpler than using external services and follows the existing pattern used for other sequential IDs in the codebase.

**Alternatives considered**:
- UUID-based IDs: Users need human-readable PO numbers to reference on printed documents and in communication with vendors.
- Timestamp-based: Risk of collisions under concurrent creation.

## Decision 3: CSV Parser Schema Extension

**Decision**: Add `purchase_order` and `goods_received_note` as new `SchemaType` values in the CSV parser, alongside existing `sales_statement` and `bank_statement`.

**Rationale**: The CSV parser is designed for extensibility — add new field definitions to `schema-definitions.ts` and register in `getSchemaFields()`. The existing alias-matching and AI fallback pipeline works unchanged for new schemas.

**Alternatives considered**:
- Custom CSV parsing logic in the payables domain: Would duplicate the sanitization, fingerprinting, template persistence, and AI mapping infrastructure already built.

## Decision 4: Navigation — Tabs within Payables

**Decision**: Add PO, GRN, and Matching tabs within the existing payables/invoices page structure. The current payables page redirects to `/invoices#ap-dashboard`; new tabs will be `#purchase-orders`, `#goods-received`, `#matching`.

**Rationale**: Per clarification, PO/GRN management lives within the payables domain. The tab-based pattern is already established (AP Dashboard tab exists). Adding tabs avoids new route creation and keeps the payables experience consolidated.

**Alternatives considered**:
- Separate routes per feature (e.g., `/payables/purchase-orders`): Would require new page files and sidebar entries, creating navigation complexity for what is a sub-workflow of AP.

## Decision 5: Auto-Match Trigger Point

**Decision**: Auto-matching runs as a post-processing step after invoice OCR extraction completes, triggered by the presence of `purchase_order_ref` in the extracted data.

**Rationale**: The `InvoiceSpecificData.purchase_order_ref` field is already extracted by the OCR pipeline. After extraction, a Convex mutation checks if a PO with that number exists for the same business and vendor. If found, a match record is created automatically. This requires no changes to the OCR pipeline itself — only a new post-extraction hook in the accounting entry creation flow.

**Alternatives considered**:
- Matching via a cron job that periodically scans unmatched invoices: Adds latency; users would expect matching to happen at upload time.
- Matching in the OCR Lambda: Would couple infrastructure layers and require Convex DB access from Lambda.

## Decision 6: Variance Detection — Inline vs. Separate Step

**Decision**: Variance detection runs inline as part of match record creation/update. Variances are embedded in the match record as a `variances` array.

**Rationale**: Variance detection is a pure computation (compare quantities and prices across documents). It adds negligible cost to the match mutation and avoids the complexity of a separate asynchronous variance detection pipeline. Results are immediately available for display.

**Alternatives considered**:
- Async variance detection via Convex action: Overkill for what is a deterministic comparison operation.
- Storing variances in a separate table: Would require cross-document queries for the review screen.

## Decision 7: Matching Gating Implementation

**Decision**: Add a `matchStatus` field to the invoice/accounting entry creation flow. When an invoice has a `purchase_order_ref`, the "Create Payable" button checks for an approved match record. If no approved match exists, the button shows a "Match Required" state with guidance.

**Rationale**: This implements the clarified requirement that matching gates payable creation without changing the existing create-payable mutation. The gating is UI-side with a server-side validation check — the mutation rejects payable creation for PO-linked invoices without an approved match.

**Alternatives considered**:
- Blocking the invoice at OCR stage: Too aggressive; users should be able to review the invoice and initiate matching.
- Pure UI gating without server validation: Bypassable; the mutation must enforce the gate.
