# Research: e-Invoice Schema Changes (LHDN + Peppol Fields)

**Branch**: `016-e-invoice-schema-change` | **Date**: 2026-02-19

## Research Tasks & Findings

### R1: Status Enum Pattern for LHDN/Peppol

**Decision**: Follow existing three-layer status pattern — constants → validators → schema.

**Rationale**: The codebase consistently uses this pattern for all status enums (30+ types in `src/lib/constants/statuses.ts`). The `literalUnion()` helper in `convex/lib/validators.ts` generates Convex-compatible validators from the shared constants. This ensures type safety across both frontend TypeScript and Convex backend.

**Alternatives considered**:
- Inline `v.union(v.literal(...))` directly in schema.ts — rejected because it breaks the single-source-of-truth pattern and makes statuses unavailable to frontend code.
- Separate constants file for e-invoice statuses — rejected because all other statuses live in `statuses.ts` and splitting would fragment the pattern.

**Files involved**:
- `src/lib/constants/statuses.ts` — Define LHDN_STATUSES, PEPPOL_STATUSES, EINVOICE_TYPE constants
- `convex/lib/validators.ts` — Create lhdnStatusValidator, peppolStatusValidator, einvoiceTypeValidator
- `convex/schema.ts` — Use validators in table definitions

### R2: CustomerSnapshot Extension Pattern

**Decision**: Extend snapshot at all 4 layers — Convex schema, mutation args, TypeScript interface, UI component.

**Rationale**: The snapshot is built client-side in `customer-selector.tsx` (lines 85-103), passed as an argument to the Convex `create` mutation (lines 248-372 of `salesInvoices.ts`), and stored directly. The `send` mutation (lines 522-549) also creates customers from snapshot data. All layers must be extended consistently.

**Alternatives considered**:
- Server-side snapshot building (read customer in mutation, build snapshot there) — rejected because existing pattern has the client build the snapshot, and changing this pattern is out of scope.

**Files involved**:
- `convex/schema.ts` — Extend customerSnapshot embedded object
- `convex/functions/salesInvoices.ts` — Extend create/update mutation arg validation, extend send mutation auto-customer creation
- `src/domains/sales-invoices/types/index.ts` — Extend CustomerSnapshot interface + Zod schema
- `src/domains/sales-invoices/components/customer-selector.tsx` — Extend handleSelectCustomer to include new fields

### R3: Field Naming Convention

**Decision**: Use `lhdn*` prefix for LHDN-specific fields on `businesses` and `sales_invoices`. Use unprefixed names (`tin`, `brn`) on `customers` table.

**Rationale**: On `businesses`, the `lhdn` prefix distinguishes from the existing generic `taxId` field. On `customers`, the issue #198 defines `tin` and `brn` without prefix, which is consistent with the existing `taxId` field being generic while `tin` is specifically the LHDN Tax Identification Number. The `peppol*` prefix is used consistently on all tables for Peppol-specific fields.

**Alternatives considered**:
- Prefix all fields with `lhdn*` or `peppol*` on customers too — rejected because the issue design intentionally uses shorter names on customers where there's no ambiguity.

### R4: Index Strategy

**Decision**: Add 3 new indexes: `by_businessId_lhdnStatus` and `by_businessId_peppolStatus` on `sales_invoices`, `by_businessId_tin` on `customers`.

**Rationale**: These indexes support the primary query patterns: (1) listing invoices by e-invoice submission status per business, (2) looking up customers by TIN for LHDN validation. No indexes needed on `businesses` because e-invoice fields there are only accessed via the business record itself (already indexed by `_id`).

**Alternatives considered**:
- Index on `lhdnDocumentUuid` for direct LHDN document lookup — deferred to the actual LHDN integration feature since the lookup pattern isn't needed for schema-only changes.

### R5: Backward Compatibility

**Decision**: All new fields use `v.optional()`. No migration needed.

**Rationale**: Convex documents are schema-validated on write but tolerant of missing optional fields on read. Existing documents without the new fields will return `undefined` for those fields, which is the expected behavior. No backfill needed.

**Alternatives considered**:
- Adding default values via a migration script — rejected because optional fields with undefined are semantically correct (no e-invoice data exists yet).
