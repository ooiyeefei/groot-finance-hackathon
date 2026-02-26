# Research: Master Accounting Export Integration

**Branch**: `001-master-accounting-export` | **Date**: 2026-02-26

## 1. Master Accounting Text File Format — Structural Patterns

### Decision: Use hierarchical format with section header prefix

**Rationale**: Master Accounting's text import uses a pipe-delimited (`|`) format that closely mirrors the existing `hierarchical` format type in the export engine, but with key differences:

| Aspect | SQL Accounting (existing) | Master Accounting (new) |
|--------|--------------------------|------------------------|
| Record type prefix | `"MASTER"` / `"DETAIL"` literal | `M` / `D-Item` literal |
| Delimiter | Semicolon (`;`) | Pipe (`\|`) |
| File header | None (starts with first MASTER row) | Section name line (e.g., `Purchases Book-Bill`) |
| Column header | None | None |
| Extension | `.txt` | `.txt` |
| Date format | `DD/MM/YYYY` | `DD/MM/YYYY` |

**Alternatives considered**:
- Flat format with header-per-line-item expansion: Rejected — Master Accounting explicitly requires `M` + `D-Item` rows, not repeating headers.
- Custom format type: Rejected — extending `hierarchical` with a `sectionHeader` config property is simpler and reuses the existing engine.

### Decision: Extend `generateHierarchicalExport` with section header support

**Rationale**: The existing `generateHierarchicalExport()` in `export-engine.ts` already handles MASTER/DETAIL row generation. Only two additions needed:
1. Prepend a section header line when `template.sectionHeader` is defined
2. The M/D-Item prefix is already handled via literal `sourceField` values (e.g., `'"M"'`)

No need for a new format type — keep `hierarchical` and add the optional `sectionHeader` property to `PrebuiltTemplate`.

## 2. Code Mapping Persistence — Storage Design

### Decision: New `export_code_mappings` Convex table, scoped per business + target system

**Rationale**: Code mappings need to persist across export sessions and be shared by all users in the same business. Keyed by `businessId + targetSystem + sourceType + sourceValue` to allow different mappings for different target accounting systems.

**Alternatives considered**:
- Store mappings inside `export_templates` table: Rejected — mappings are shared across template types (Purchases Book-Bill and Cash Book-Payment both need creditor code mappings), so duplicating them per template wastes space and creates sync issues.
- Store in business settings: Rejected — too generic; mappings are export-specific and per-target-system.
- LocalStorage/client-side only: Rejected — won't persist across devices or users in the same business.

## 3. Inline Mapping Screen — UX Pattern

### Decision: New step in export workflow between template selection and filters

**Rationale**: The existing export flow is: Module Selection → Template Selection → Filters & Preview → Export. The mapping screen inserts between Template Selection and Filters:
- Module Selection → Template Selection → **Code Mapping** → Filters & Preview → Export
- Only shown for Master Accounting templates (templates with `targetSystem: "master-accounting"`)
- Screen displays a table: Groot Finance value → Master Accounting code input → auto-filled if previously saved
- Default fallback codes shown at the top of the mapping screen

**Alternatives considered**:
- Modal overlay instead of new step: Rejected — mapping tables can be long (many categories/vendors); a full step provides better UX.
- Separate settings page: Rejected — user clarification specifically requested inline during export.

## 4. Field Mapping Analysis — Groot Finance → Master Accounting

### Decision: Map existing source fields to Master Accounting's pipe-delimited positions

Key mapping decisions for the 4 transaction types:

**Purchases Book-Bill** (expense claims → creditor bills):
- `M` row: Expense claim ID → Invoice Code, transactionDate → Invoice Date, vendorName → looked up via code mapping → Creditor Code, totalAmount → Amount
- `D-Item` row: expenseCategory → looked up via code mapping → Account Code, description → Description, amount → Amount Before GST
- GST fields: Populated from expense claim tax data when available

**Sales Book-Invoice** (AR invoices → debtor invoices):
- `M` row: invoiceNumber → Invoice Code, invoiceDate → Invoice Date, entityCode → looked up → Debtor Code, totalAmount → Amount
- `D-Item` row: lineItem.itemCode → Account Code, lineItem.description → Description, lineItem.totalAmount → Amount Before GST

**Cash Book-Payment** (paid expenses → cash payments):
- `M` row: Payment Code (generated), paymentDate → Payment Date, Bank/Cash A/C Code (from code mapping), totalAmount → Amount
- `D-Item` row: Account Code (from code mapping), description → Description, amount → Amount Before GST

**Journal Book** (accounting entries → journal vouchers):
- `M` row: documentNumber → Journal Code, transactionDate → Journal Date, description → Description
- `D-Item` row: lineItem.itemCode → Account Code, lineItem.debitAmount/creditAmount → Debit/Credit, exchangeRate → Currency Rate

## 5. Master Data Export — Flat Format with Section Header

### Decision: Use flat format (no M/D-Item) for master data files

**Rationale**: Master data files (Chart of Account, Creditor/Supplier, Debtor/Customer) in Master Accounting use a simple pipe-delimited flat format — one row per record, no record type prefix. Only a section header line at the top.

This is a new variation: `flat` format + section header + pipe delimiter + no column header row. Can be handled by adding `includeColumnHeaders: false` option to `generateFlatExport`.

## 6. Value Extractor — Pipe Character Handling

### Decision: Replace pipe characters with hyphen in field values

**Rationale**: Since pipe (`|`) is the delimiter, any pipe characters in data values would corrupt the file. Replacing with hyphen (`-`) is the safest approach — it preserves readability without breaking parsing.

**Alternatives considered**:
- Strip pipes entirely: Could merge words unexpectedly (e.g., "A|B" → "AB")
- Escape with backslash: Master Accounting's import doesn't support escape sequences
- Replace with comma: Could confuse if data is later viewed in CSV context
