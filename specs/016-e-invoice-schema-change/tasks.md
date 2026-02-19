# Tasks: e-Invoice Schema Changes (LHDN + Peppol Fields)

**Input**: Design documents from `/specs/016-e-invoice-schema-change/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema-contract.md, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by implementation layer (matching file dependency chain), with user story labels for traceability. US1-US5 all modify the same schema file so are grouped in the foundational phase. US6 uniquely touches application code and gets its own phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup — Status Constants & Validators

**Purpose**: Create the shared type definitions that all schema changes depend on

- [X] T001 Add LHDN_STATUSES constant object, LhdnStatus type, and LHDN_STATUS_VALUES array to `src/lib/constants/statuses.ts` — values: pending, submitted, valid, invalid, cancelled (per contracts/schema-contract.md)
- [X] T002 Add PEPPOL_STATUSES constant object, PeppolStatus type, and PEPPOL_STATUS_VALUES array to `src/lib/constants/statuses.ts` — values: pending, transmitted, delivered, failed
- [X] T003 Add EINVOICE_TYPES constant object, EinvoiceType type, and EINVOICE_TYPE_VALUES array to `src/lib/constants/statuses.ts` — values: invoice, credit_note, debit_note, refund_note
- [X] T004 Import LHDN_STATUS_VALUES, PEPPOL_STATUS_VALUES, EINVOICE_TYPE_VALUES in `convex/lib/validators.ts` and create lhdnStatusValidator, peppolStatusValidator, einvoiceTypeValidator using existing `literalUnion()` helper

**Checkpoint**: Constants and validators ready — schema extension can begin

---

## Phase 2: Foundational — Convex Schema Extension (US1–US5)

**Purpose**: Add all new fields and indexes to existing Convex tables. MUST complete before application code changes.

**⚠️ CRITICAL**: All tasks in this phase modify `convex/schema.ts`. Execute sequentially within this phase.

- [X] T005 [US1] Import lhdnStatusValidator, peppolStatusValidator, einvoiceTypeValidator at top of `convex/schema.ts`
- [X] T006 [US1] Add 8 LHDN tracking fields to `sales_invoices` table in `convex/schema.ts` — lhdnSubmissionId, lhdnDocumentUuid, lhdnLongId, lhdnStatus (use lhdnStatusValidator), lhdnSubmittedAt, lhdnValidatedAt, lhdnValidationErrors (array of {code, message, target?}), lhdnDocumentHash — all v.optional()
- [X] T007 [US4] Add 5 Peppol tracking fields to `sales_invoices` table in `convex/schema.ts` — peppolDocumentId, peppolStatus (use peppolStatusValidator), peppolTransmittedAt, peppolDeliveredAt, peppolErrors (array of {code, message}) — all v.optional()
- [X] T008 [US1] Add einvoiceType field to `sales_invoices` table in `convex/schema.ts` — use einvoiceTypeValidator, wrapped in v.optional()
- [X] T009 [US6] Extend customerSnapshot embedded v.object() in `sales_invoices` table in `convex/schema.ts` — add 9 optional fields: tin, brn, addressLine1, addressLine2, addressLine3, city, stateCode, postalCode, countryCode — all v.optional(v.string())
- [X] T010 [US1] [US4] Add 2 new indexes to `sales_invoices` table in `convex/schema.ts` — .index("by_businessId_lhdnStatus", ["businessId", "lhdnStatus"]) and .index("by_businessId_peppolStatus", ["businessId", "peppolStatus"])
- [X] T011 [US2] [US5] Add 7 fields to `businesses` table in `convex/schema.ts` — msicCode, msicDescription, sstRegistrationNumber, lhdnTin, businessRegistrationNumber, lhdnClientId, peppolParticipantId — all v.optional(v.string())
- [X] T012 [US3] Add 10 fields to `customers` table in `convex/schema.ts` — tin, brn, sstRegistration, peppolParticipantId, addressLine1, addressLine2, addressLine3, city, stateCode, postalCode, countryCode — all v.optional(v.string())
- [X] T013 [US3] Add 1 new index to `customers` table in `convex/schema.ts` — .index("by_businessId_tin", ["businessId", "tin"])

**Checkpoint**: All schema changes complete. US1-US5 data model is ready. Convex types will auto-generate on next deploy.

---

## Phase 3: User Story 6 — Customer Snapshot Integration (Priority: P1)

**Goal**: Extend the CustomerSnapshot across all application layers so new sales invoices capture TIN, BRN, and structured address from the customer record at creation time.

**Independent Test**: Create a new sales invoice with a customer that has TIN, BRN, and structured address populated — verify the snapshot on the saved invoice includes all new fields.

### Implementation for User Story 6

- [X] T014 [P] [US6] Extend CustomerSnapshot interface in `src/domains/sales-invoices/types/index.ts` — add 9 optional fields: tin, brn, addressLine1, addressLine2, addressLine3, city, stateCode, postalCode, countryCode
- [X] T015 [P] [US6] Extend customerSnapshotSchema Zod schema in `src/domains/sales-invoices/types/index.ts` — add z.string().optional() for each new field to match the interface
- [X] T016 [US6] Extend handleSelectCustomer function in `src/domains/sales-invoices/components/customer-selector.tsx` (~line 85) — copy tin, brn, addressLine1, addressLine2, addressLine3, city, stateCode, postalCode, countryCode from selected customer record to CustomerSnapshot object
- [X] T017 [US6] Extend handleSaveNewCustomer function in `src/domains/sales-invoices/components/customer-selector.tsx` (~line 129) — include new fields when creating customer from snapshot
- [X] T018 [US6] Extend handleSaveUpdatedCustomer function in `src/domains/sales-invoices/components/customer-selector.tsx` (~line 162) — include new fields when updating customer from snapshot
- [X] T019 [US6] Extend create mutation customerSnapshot arg validation in `convex/functions/salesInvoices.ts` (~line 252) — add v.optional(v.string()) for each new snapshot field in the args v.object()
- [X] T020 [US6] Extend update mutation customerSnapshot arg validation in `convex/functions/salesInvoices.ts` (~line 382) — same 9 optional fields as create
- [X] T021 [US6] Extend send mutation auto-customer creation in `convex/functions/salesInvoices.ts` (~line 539) — map customerSnapshot.tin → customer.tin, customerSnapshot.brn → customer.brn, and all 7 structured address fields when creating a new customer from invoice snapshot

### Discovered During Build (Not in Original Plan)

- [X] T021a [US3] Extend Customer TypeScript interface in `src/domains/sales-invoices/types/index.ts` — add 11 optional fields (tin, brn, sstRegistration, peppolParticipantId, addressLine1-3, city, stateCode, postalCode, countryCode) to match schema
- [X] T021b [US6] Extend `customers.create` mutation args in `convex/functions/customers.ts` — add 11 optional string args (tin, brn, sstRegistration, peppolParticipantId, addressLine1-3, city, stateCode, postalCode, countryCode) and map them in ctx.db.insert()
- [X] T021c [US6] Extend `customers.update` mutation args in `convex/functions/customers.ts` — add same 11 optional string args to accept new fields from customer-selector.tsx

**Checkpoint**: Full snapshot integration complete. New invoices capture all e-invoice customer fields.

---

## Phase 4: Build, Deploy & Verify

**Purpose**: Validate all changes compile correctly and deploy to Convex

- [X] T022 Run `npm run build` and fix any TypeScript compilation errors (TypeScript compilation passed; SSG env var issue is pre-existing)
- [ ] T023 Run `npx convex deploy --yes` to deploy schema changes to production — BLOCKED: CONVEX_DEPLOYMENT env var not set in this environment. Must be run from an environment with Convex credentials configured.
- [ ] T024 Verify existing sales invoices display correctly in the UI (no regression from schema changes) — BLOCKED: Requires T023 deployed first
- [ ] T025 Verify TypeScript types auto-generated by Convex match the new schema fields — BLOCKED: Requires T023 deployed first

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
  └──→ Phase 2 (Schema) — depends on validators existing
        └──→ Phase 3 (US6 Snapshot) — depends on schema having new customerSnapshot fields
              └──→ Phase 4 (Build & Deploy) — depends on all code changes complete
```

### User Story Dependencies

- **US1 (LHDN Invoice Tracking)**: Served by T001, T004, T005, T006, T008, T010 — schema-only, no app code
- **US2 (Business LHDN Fields)**: Served by T005, T011 — schema-only, no app code
- **US3 (Customer Tax IDs)**: Served by T012, T013 — schema-only, no app code
- **US4 (Peppol Invoice Tracking)**: Served by T002, T004, T005, T007, T010 — schema-only, no app code
- **US5 (Business Peppol ID)**: Served by T005, T011 — schema-only, no app code
- **US6 (Snapshot Extension)**: Served by T009, T014–T021 — spans schema + types + UI + mutations

### Within-Phase Parallelism

- **Phase 1**: T001, T002, T003 can be done in a single edit pass (same file, same pattern)
- **Phase 2**: Sequential within `schema.ts` (single file)
- **Phase 3**: T014 + T015 can run in parallel (same file but different sections). T016-T018 are sequential (same file). T019-T021 are sequential (same file).
- **Phase 4**: Sequential (build → deploy → verify)

### Parallel Opportunities (Cross-Phase)

```
After Phase 2 completes:
  T014 + T015 (types/index.ts)     can run in parallel with
  T019 + T020 + T021 (salesInvoices.ts)

Then:
  T016 + T017 + T018 (customer-selector.tsx) after T014/T015 complete
```

---

## Implementation Strategy

### MVP First (Schema Ready)

1. Complete Phase 1: Setup (constants + validators)
2. Complete Phase 2: Schema Extension (all table fields + indexes)
3. **STOP and VALIDATE**: `npm run build` should pass — schema is backward compatible
4. Run `npx convex deploy --yes` — production now has e-invoice fields available
5. **Result**: US1–US5 data model is live. External integrations can start writing to new fields.

### Full Delivery (Schema + Snapshot)

1. Complete Phases 1–2 (MVP above)
2. Complete Phase 3: US6 Snapshot Integration
3. Complete Phase 4: Build, Deploy, Verify
4. **Result**: All 6 user stories complete. New invoices capture full e-invoice customer data.

---

## Notes

- All tasks in Phase 2 modify `convex/schema.ts` — cannot be truly parallelized
- T001-T003 are logically separate but practically done in one edit pass (same file, same pattern)
- No test tasks included — feature spec did not request tests
- The `send` mutation auto-customer mapping (T021) is critical — without it, customers created from invoice snapshots would lose e-invoice fields
- LHDN client secret must NOT appear in any schema change — only `lhdnClientId` is stored in Convex
