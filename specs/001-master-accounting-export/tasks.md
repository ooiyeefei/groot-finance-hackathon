# Tasks: Master Accounting Export Integration

**Input**: Design documents from `/specs/001-master-accounting-export/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Schema, Types & Engine Enhancements)

**Purpose**: Establish the data layer, type extensions, and engine capabilities needed by all Master Accounting templates.

- [x] T001 Add `export_code_mappings` table definition to `convex/schema.ts` with fields: businessId, targetSystem, mappingType, sourceValue, targetCode, isDefault, createdBy, updatedBy, updatedAt. Add indexes: by_business_system `[businessId, targetSystem]`, by_business_type `[businessId, targetSystem, mappingType]`, by_business_source `[businessId, targetSystem, mappingType, sourceValue]`. See `specs/001-master-accounting-export/data-model.md` for full schema.
- [x] T002 [P] Extend `PrebuiltTemplate` interface in `src/domains/exports/types/index.ts` — add optional fields: `sectionHeader?: string`, `includeColumnHeaders?: boolean`, `requiresCodeMapping?: boolean`, `codeMappingTypes?: string[]`.
- [x] T003 [P] Enhance `generateHierarchicalExport()` in `src/domains/exports/lib/export-engine.ts` — if the template has a `sectionHeader` property, prepend it as the first line of the output before any data rows. Update `generateExport()` dispatcher to pass `sectionHeader` from template.
- [x] T004 [P] Enhance `generateFlatExport()` in `src/domains/exports/lib/export-engine.ts` — add `includeColumnHeaders` option (default `true`). When `false`, skip the header row and output data rows only. Master Accounting master data files need this.
- [x] T005 [P] Add pipe character sanitization in `src/domains/exports/lib/value-extractor.ts` — in `escapeDelimitedValue()`, when delimiter is `|`, replace any `|` characters in field values with `-` to prevent delimiter corruption.
- [x] T006 Deploy Convex schema changes by running `npx convex deploy --yes`.

**Checkpoint**: Engine supports section headers, column header toggle, and pipe sanitization. Schema is deployed.

---

## Phase 2: Foundational (Code Mapping Backend & UI)

**Purpose**: Code mapping CRUD and inline mapping screen — MUST be complete before any transaction user story can be tested end-to-end.

**Ref**: `specs/001-master-accounting-export/contracts/convex-functions.md`

- [x] T007 Create `convex/functions/exportCodeMappings.ts` — implement `getCodeMappings` query that fetches all code mappings for a business + targetSystem, with optional `mappingType` filter. Requires finance_admin or owner role. Returns array of `{ _id, mappingType, sourceValue, targetCode, isDefault }`.
- [x] T008 [P] Implement `upsertCodeMapping` mutation in `convex/functions/exportCodeMappings.ts` — creates or updates a single mapping keyed by `businessId + targetSystem + mappingType + sourceValue`. Validates `targetCode` max 20 chars. If `isDefault: true`, unsets any existing default for same business + targetSystem + mappingType.
- [x] T009 [P] Implement `upsertCodeMappingsBatch` mutation in `convex/functions/exportCodeMappings.ts` — batch upsert for the mapping screen. Accepts array of mappings and optional defaults array. Returns `{ upserted, defaultsSet }`.
- [x] T010 [P] Implement `deleteCodeMapping` mutation in `convex/functions/exportCodeMappings.ts` — deletes a specific mapping by `_id`. Returns `{ success: boolean }`.
- [x] T011 Implement `getDistinctMappableValues` query in `convex/functions/exportCodeMappings.ts` — fetches distinct categories/vendors/customers from expense_claims, accounting_entries, or invoices tables based on module and filters, to populate the mapping screen. Returns `{ account_code?: string[], creditor_code?: string[], debtor_code?: string[], bank_code?: string[] }`.
- [x] T012 Create `src/domains/exports/hooks/use-code-mappings.ts` — React hook that wraps `getCodeMappings` query and `upsertCodeMappingsBatch` mutation. Provides: `mappings` (fetched from Convex), `saveMappings()` (batch upsert), `isLoading` state. Takes `businessId` and `targetSystem` as params.
- [x] T013 Create `src/domains/exports/components/code-mapping-step.tsx` — inline mapping screen component. Displays a table grouped by `mappingType` (Account Codes, Creditor Codes, Debtor Codes, Bank Codes) with: Groot Finance value on the left, text input for Master Accounting code on the right. Auto-fills from saved mappings. Default fallback code input at top of each group. "Save & Continue" button that batch-saves via `use-code-mappings` hook then calls `onComplete()` callback. "Skip" option that warns if no defaults configured. Use semantic tokens (`bg-card`, `text-foreground`) per design system rules. Action button: `bg-primary hover:bg-primary/90 text-primary-foreground`.
- [x] T014 Wire code mapping step into `src/domains/exports/components/exports-page-content.tsx` — insert as a new step between template selection and filters. Only render when selected template has `requiresCodeMapping: true`. Update step flow: Module → Template → **Code Mapping** → Filters & Preview → Export. Pass `codeMappingTypes` from template to determine which mapping groups to show.
- [x] T015 Deploy Convex after code mapping functions: `npx convex deploy --yes`.

**Checkpoint**: Code mapping backend + UI fully functional. Can save/load mappings, show inline mapping screen for Master Accounting templates.

---

## Phase 3: User Story 1 - Export Expense Claims as Purchase Bills (Priority: P1) MVP

**Goal**: Export approved/paid expense claims as Master Accounting Purchases Book-Bill pipe-delimited text files.

**Independent Test**: Select "Master Accounting (Purchases Book-Bill)" from expense module → mapping screen shows categories + vendors → map codes → filter by date/status → preview shows pipe-delimited rows → export downloads `.txt` file → import into Master Accounting succeeds.

### Implementation for User Story 1

- [x] T016 [US1] Define `MASTER_ACCOUNTING_PURCHASES_BILL` prebuilt template in `src/domains/exports/lib/prebuilt-templates.ts`. Set `id: "master-accounting-purchases-bill"`, `module: "expense"`, `targetSystem: "master-accounting"`, `formatType: "hierarchical"`, `delimiter: "|"`, `fileExtension: ".txt"`, `sectionHeader: "Purchases Book-Bill"`, `requiresCodeMapping: true`, `codeMappingTypes: ["account_code", "creditor_code"]`. Define `masterFields` (15 fields): M prefix, Invoice Code (from expense claim ID), Invoice Date (DD/MM/YYYY), Creditor Code (from code mapping), Description, Reference No, Amount, Currency Rate (1 for MYR), Term Code (empty), Staff Code (empty), Area Code (empty), Department Code (empty), Job Code (empty), Cancelled (N), Cancelled Remark (empty). Define `detailFields` (11 fields): D-Item prefix, Account Code (from code mapping), Description, Department Code (empty), Job Code (empty), Amount Before GST, GST Type Code, GST %, GST Inclusive (N), Taxable Amount, GST Amount. See `specs/001-master-accounting-export/contracts/prebuilt-templates.md` for exact field spec.
- [x] T017 [US1] Register `MASTER_ACCOUNTING_PURCHASES_BILL` in the `EXPENSE_TEMPLATES` array in `src/domains/exports/lib/prebuilt-templates.ts`.
- [x] T018 [US1] End-to-end verification: Export 5+ expense claims using the Purchases Book-Bill template. Validate the generated `.txt` file has: "Purchases Book-Bill" as first line, M rows with pipe-delimited fields, D-Item rows for each line item, DD/MM/YYYY dates, 2-decimal amounts, empty fields as `||`, Cancelled as `N`. Verify code mappings auto-fill on second export. Verify default fallback codes work for unmapped items.

**Checkpoint**: US1 complete — expense claims export as Purchases Book-Bill text files compatible with Master Accounting import.

---

## Phase 4: User Story 2 - Export Sales Invoices for Debtor Records (Priority: P2)

**Goal**: Export AR sales invoices as Master Accounting Sales Book-Invoice pipe-delimited text files.

**Independent Test**: Select "Master Accounting (Sales Book-Invoice)" from invoice module → mapping screen for account + debtor codes → export downloads `.txt` file → import into Master Accounting under Debtor > Sales Book-Invoice.

### Implementation for User Story 2

- [x] T019 [US2] Define `MASTER_ACCOUNTING_SALES_INVOICE` prebuilt template in `src/domains/exports/lib/prebuilt-templates.ts`. Set `id: "master-accounting-sales-invoice"`, `module: "invoice"`, `sectionHeader: "Sales Book-Invoice"`, `requiresCodeMapping: true`, `codeMappingTypes: ["account_code", "debtor_code"]`. Define `masterFields` (15 fields): M prefix, Invoice Code, Invoice Date, Debtor Code (from code mapping), Description, Reference No, Amount, Currency Rate, Term Code, Staff Code, Area Code, Department Code, Job Code, Cancelled (N), Cancelled Remark. Define `detailFields` (12 fields): D-Item prefix, Account Code (from code mapping), Description, Department Code, Job Code, Non-Sales Item (N), Amount Before GST, GST Type Code, GST %, GST Inclusive (N), Taxable Amount, GST Amount.
- [x] T020 [US2] Register `MASTER_ACCOUNTING_SALES_INVOICE` in the `INVOICE_TEMPLATES` array in `src/domains/exports/lib/prebuilt-templates.ts`.
- [x] T021 [US2] End-to-end verification: Export 3+ sales invoices. Validate file format, multi-currency handling (Currency Rate field), debtor code mapping, and D-Item rows for line items.

**Checkpoint**: US2 complete — sales invoices export as Sales Book-Invoice text files.

---

## Phase 5: User Story 3 - Export Cash Book Payments (Priority: P2)

**Goal**: Export paid expense claims as Master Accounting Cash Book-Payment pipe-delimited text files.

**Independent Test**: Select "Master Accounting (Cash Book-Payment)" from expense module → mapping screen for account + bank codes → export downloads `.txt` file → import into Master Accounting under GL > Cash Book-Payment.

### Implementation for User Story 3

- [x] T022 [US3] Define `MASTER_ACCOUNTING_CASHBOOK_PAYMENT` prebuilt template in `src/domains/exports/lib/prebuilt-templates.ts`. Set `id: "master-accounting-cashbook-payment"`, `module: "expense"`, `sectionHeader: "Cash Book-Payment"`, `requiresCodeMapping: true`, `codeMappingTypes: ["account_code", "bank_code"]`. Define `masterFields` (25 fields): M prefix, Payment Code, Payment Date, Payment Type (empty), Bank/Cash A/C Code (from bank_code mapping), Pay To, Description, Cheque No (empty), Bank/Cash Amount, Bank Currency Rate (1 for MYR), Amount, Staff Code, Area Code, Remark 1-8 (empty), Department Code, Job Code, Cancelled (N), Cancelled Remark. Define `detailFields` (15 fields): D-Item prefix, Account Code (from code mapping), Description 1, Description 2 (empty), Ref No 1 (empty), Ref No 2 (empty), Staff Code (empty), Department Code (empty), Job Code (empty), Amount Before GST, GST Type Code, GST %, GST Inclusive (N), Taxable Amount, GST Amount.
- [x] T023 [US3] Register `MASTER_ACCOUNTING_CASHBOOK_PAYMENT` in the `EXPENSE_TEMPLATES` array in `src/domains/exports/lib/prebuilt-templates.ts`.
- [x] T024 [US3] End-to-end verification: Export 3+ paid expense claims. Validate Bank Currency Rate is `1` for MYR, Bank/Cash Amount matches Amount, and bank code mapping works.

**Checkpoint**: US3 complete — cash payments export as Cash Book-Payment text files.

---

## Phase 6: User Story 4 - Export Accounting Journal Entries (Priority: P3)

**Goal**: Export journal entries as Master Accounting Journal Book pipe-delimited text files.

**Independent Test**: Select "Master Accounting (Journal Book)" from accounting module → mapping screen for account codes → export downloads `.txt` file → import into Master Accounting under GL > Journal Book.

### Implementation for User Story 4

- [x] T025 [US4] Define `MASTER_ACCOUNTING_JOURNAL` prebuilt template in `src/domains/exports/lib/prebuilt-templates.ts`. Set `id: "master-accounting-journal"`, `module: "accounting"`, `sectionHeader: "Journal Book"`, `requiresCodeMapping: true`, `codeMappingTypes: ["account_code"]`. Define `masterFields` (8 fields): M prefix, Journal Code, Journal Date, Journal Book Type (empty), Description, Reference No, Cancelled (N), Cancelled Remark. Define `detailFields` (21 fields): D-Item prefix, Account Code, Description 1, Description 2 (empty), Ref No 1 (empty), Ref No 2 (empty), Debit, Credit, Local Debit, Local Credit, GST Type Code, GST %, GST Inclusive (N), Taxable Amount, GST Amount, Staff/Agent Code (empty), Department Code (empty), Job Code (empty), Currency Rate (1 for MYR), Remark 1 (empty), Remark 2 (empty).
- [x] T026 [US4] Register `MASTER_ACCOUNTING_JOURNAL` in the `ACCOUNTING_TEMPLATES` array in `src/domains/exports/lib/prebuilt-templates.ts`.
- [x] T027 [US4] End-to-end verification: Export 3+ journal entries. Validate total debits equal total credits per entry, Currency Rate handling, and D-Item rows for each debit/credit line.

**Checkpoint**: US4 complete — journal entries export as Journal Book text files.

---

## Phase 7: User Story 5 - Export Master Data (Priority: P3)

**Goal**: Export Chart of Account, Creditor/Supplier, and Debtor/Customer reference data as Master Accounting master file text imports.

**Independent Test**: Export each master data type separately → each generates a `.txt` file with section header and pipe-delimited data rows (no column headers, no M/D-Item prefix) → import into Master Accounting's "Import Master File from Text File".

### Implementation for User Story 5

- [x] T028 [P] [US5] Define `MASTER_ACCOUNTING_CHART_OF_ACCOUNT` prebuilt template in `src/domains/exports/lib/prebuilt-templates.ts`. Set `id: "master-accounting-chart-of-account"`, `module: "accounting"`, `formatType: "flat"`, `delimiter: "|"`, `fileExtension: ".txt"`, `sectionHeader: "Chart of Account"`, `includeColumnHeaders: false`, `requiresCodeMapping: false`. Define `fieldMappings` (11 fields): Account Code, Description, Account Type (default SALES), Special Type (default NONE), DRCR (default DR), Cost Centre Code, Default GST Type Supply, Default GST Type Purchase, MSIC Code, Currency Code (default MYR), Customs Tariff/Service Type.
- [x] T029 [P] [US5] Define `MASTER_ACCOUNTING_CREDITOR` prebuilt template in `src/domains/exports/lib/prebuilt-templates.ts`. Set `id: "master-accounting-creditor"`, `module: "expense"`, `formatType: "flat"`, `sectionHeader: "Creditor/Supplier"`, `includeColumnHeaders: false`, `requiresCodeMapping: false`. Define `fieldMappings` (43 fields) per the Creditor/Supplier spec: Creditor Code, Name, Name 2, Register No, Address 1-4, City, Postal Code, State, Country Code, Contact Person, Phone 1-2, Fax 1-2, Email 1-2, Home Page, Business Nature, Suspended (N), Control Account Code, Area Code, Category Code, Group Code, Term Code, Staff Code, Currency Code (MYR), GST fields, SST fields, TIN, ID Type (Business Reg. No), MSIC Code, Tourism Tax Reg No.
- [x] T030 [P] [US5] Define `MASTER_ACCOUNTING_DEBTOR` prebuilt template in `src/domains/exports/lib/prebuilt-templates.ts`. Set `id: "master-accounting-debtor"`, `module: "invoice"`, `formatType: "flat"`, `sectionHeader: "Debtor/Customer"`, `includeColumnHeaders: false`, `requiresCodeMapping: false`. Define `fieldMappings` (44 fields) per the Debtor/Customer spec: Debtor Code, Name, Name 2, Register No, Address 1-4, City, Postal Code, State, Country Code, Contact Person, Contact Person Position, Phone 1-2, Fax 1-2, Email 1-2, Home Page, Business Nature, Suspended (N), Control Account Code, Area Code, Category Code, Group Code, Term Code, Staff Code 1-2, POS (N), Currency Code (MYR), Department Code, Cash Debtor (N), GST fields, SST fields, TIN, ID Type (Business Reg. No).
- [x] T031 [US5] Register all 3 master data templates in their respective module arrays: `MASTER_ACCOUNTING_CHART_OF_ACCOUNT` in `ACCOUNTING_TEMPLATES`, `MASTER_ACCOUNTING_CREDITOR` in `EXPENSE_TEMPLATES`, `MASTER_ACCOUNTING_DEBTOR` in `INVOICE_TEMPLATES`.
- [x] T032 [US5] End-to-end verification: Export each master data type. Validate: section header as first line, no column header row, flat pipe-delimited data rows, correct field count per row, defaults populated (N for Suspended, Business Reg. No for ID Type, MYR for Currency Code).

**Checkpoint**: US5 complete — master data exports as Chart of Account, Creditor/Supplier, Debtor/Customer text files.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge case handling, validation, and final build check.

- [x] T033 Add field length truncation logic for Master Accounting templates in `src/domains/exports/lib/value-extractor.ts` — when template `targetSystem` is `"master-accounting"`, enforce max lengths: Varchar(20) for codes, Varchar(200) for descriptions, Varchar(50) for reference numbers, Varchar(30) for registration numbers.
- [x] T034 Add skipped records summary to export flow in `src/domains/exports/components/exports-page-content.tsx` — after export completes, if any records were excluded due to missing mandatory fields (no mapping + no default), show a summary with record count and reason.
- [x] T035 Add re-export duplicate warning in `src/domains/exports/components/exports-page-content.tsx` — when exporting with a Master Accounting template, show a brief note that re-exporting may create duplicates in Master Accounting.
- [x] T036 Run `npm run build` and fix any type errors or build failures.
- [x] T037 Deploy final Convex changes: `npx convex deploy --yes`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on T001 (schema) and T002 (types) from Phase 1. BLOCKS all transaction user stories (US1-US4).
- **Phase 3 (US1)**: Depends on Phase 2 completion — MVP story
- **Phase 4 (US2)**: Depends on Phase 2 completion — can run parallel with US1
- **Phase 5 (US3)**: Depends on Phase 2 completion — can run parallel with US1/US2
- **Phase 6 (US4)**: Depends on Phase 2 completion — can run parallel with others
- **Phase 7 (US5)**: Depends on Phase 1 only (T003, T004 for engine enhancements) — does NOT need Phase 2 (no code mapping)
- **Phase 8 (Polish)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Phase 2 complete → independent (MVP)
- **US2 (P2)**: Phase 2 complete → independent
- **US3 (P2)**: Phase 2 complete → independent
- **US4 (P3)**: Phase 2 complete → independent
- **US5 (P3)**: Phase 1 complete → independent (no code mapping needed)

### Within Each User Story

- Template definition before registration
- Registration before end-to-end verification
- All templates go in `prebuilt-templates.ts` (same file — sequential within a story)

### Parallel Opportunities

- T002, T003, T004, T005 can all run in parallel (different files)
- T007, T008, T009, T010 can run in parallel (same file but independent functions)
- T028, T029, T030 can run in parallel (same file but independent template definitions)
- Once Phase 2 completes, US1 through US4 can be worked on in parallel
- US5 can start after Phase 1 (independent of Phase 2)

---

## Parallel Example: User Story 1

```bash
# After Phase 2 is complete, US1 tasks run sequentially (same file):
Task T016: "Define MASTER_ACCOUNTING_PURCHASES_BILL template in prebuilt-templates.ts"
Task T017: "Register template in EXPENSE_TEMPLATES array"
Task T018: "End-to-end verification of Purchases Book-Bill export"
```

## Parallel Example: User Story 5

```bash
# T028, T029, T030 can run in parallel (independent template definitions):
Task T028: "Define Chart of Account template in prebuilt-templates.ts"
Task T029: "Define Creditor/Supplier template in prebuilt-templates.ts"
Task T030: "Define Debtor/Customer template in prebuilt-templates.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T006)
2. Complete Phase 2: Foundational (T007-T015)
3. Complete Phase 3: User Story 1 (T016-T018)
4. **STOP and VALIDATE**: Export expense claims, import into Master Accounting
5. Deploy if ready — users can immediately start exporting expense claims

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready
2. Add US1 → Test → Deploy (MVP — expense claims)
3. Add US2 + US3 → Test → Deploy (sales invoices + cash payments)
4. Add US4 + US5 → Test → Deploy (journal entries + master data)
5. Phase 8 → Polish → Final deploy

### Single Developer Strategy

1. Phase 1 → Phase 2 → Phase 3 (US1, MVP) → Validate
2. Phase 4 (US2) → Phase 5 (US3) → Validate
3. Phase 6 (US4) → Phase 7 (US5) → Validate
4. Phase 8 → Final build check

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All 7 templates are defined in `prebuilt-templates.ts` — tasks that modify the same file within a story are sequential
- `npx convex deploy --yes` is required after Phase 1 (schema) and Phase 2 (functions) — see CLAUDE.md
- Commit after each phase checkpoint
- Edge case: pipe characters in vendor names (e.g., "A|B Sdn Bhd") → handled by T005
- Edge case: descriptions > 200 chars → handled by T033
