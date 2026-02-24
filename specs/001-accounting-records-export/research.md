# Research: Export System v2

**Branch**: `001-accounting-records-export` | **Date**: 2026-02-24

## Decision 1: GL Account Code & Debit/Credit Data Gap

**Problem**: The current `accounting_entries.lineItems` schema stores transaction-oriented data (`quantity`, `unitPrice`, `totalAmount`) but lacks journal-entry fields needed for accounting system exports:
- No GL account code per line item
- No debit/credit distinction (only `totalAmount`)
- No balancing entry (e.g., credit to bank account for an expense debit)

SQL Accounting GL_JE requires: `CODE` (GL account), `DR`, `LOCALDR`, `CR`, `LOCALCR` per detail row.

**Decision**: Derive journal entry structure at export time using a two-part approach:
1. **Export-time derivation**: For each accounting entry, generate debit lines from line items and a single balancing credit line from the entry's total. The transaction type determines which side is debit vs credit:
   - `Expense` / `Cost of Goods Sold`: Line items → DEBIT rows, balancing → CREDIT row
   - `Income`: Line items → CREDIT rows, balancing → DEBIT row
2. **GL account code**: Export as empty string by default. Users fill in account codes in the target system, or configure a category-to-account mapping in FinanSEAL (future enhancement). The `itemCategory` field on line items can serve as a hint.

**Rationale**: Schema changes to add GL fields would require migration of all existing data and changes to the posting workflows. Export-time derivation achieves the goal without schema changes, and the spec already assumes users will map GL codes.

**Alternatives considered**:
- Add `glAccountCode`, `debitAmount`, `creditAmount` fields to lineItems schema → Rejected: requires schema migration and upstream posting workflow changes, larger scope
- Require users to set up chart-of-accounts mapping table → Rejected: good future enhancement but too much scope for v1

## Decision 2: Hierarchical vs Flat Export Format Architecture

**Problem**: SQL Accounting requires MASTER/DETAIL row structure (semicolon-delimited, `.txt` file), while AutoCount and others use flat CSV. The current `generateCsv()` function only supports flat row output.

**Decision**: Extend the export engine with a format strategy pattern:
- `FlatFormatter`: Current behavior — one row per record/line item, comma-delimited
- `HierarchicalFormatter`: MASTER row followed by DETAIL rows, configurable delimiter
- Pre-built templates declare their format type; custom templates default to flat

**Rationale**: Clean separation of concerns. The formatter handles structure; the field mapper handles content. Both formatters share the same field extraction and value formatting logic.

**Alternatives considered**:
- Two completely separate export code paths → Rejected: duplicates field extraction, formatting, escaping logic
- Transform hierarchical into flat post-generation → Rejected: loses structural information needed for correct output

## Decision 3: Module Type Expansion in Convex Schema

**Problem**: The current `exportModuleValidator` only accepts `"expense" | "leave"`. Need to add `"invoice"` and `"accounting"`. This affects `export_templates`, `export_schedules`, and `export_history` tables.

**Decision**: Expand the validator to `"expense" | "invoice" | "leave" | "accounting"`. This is a non-breaking schema change — existing data with `"expense"` or `"leave"` values remains valid. Deploy schema change first before deploying code changes.

**Rationale**: Union type expansion is backwards-compatible in Convex. No data migration needed.

**Alternatives considered**:
- New separate tables per module → Rejected: duplicates schema, breaks existing history/schedule queries
- String field without validator → Rejected: loses type safety

## Decision 4: Invoice Data Sources — Two Tables

**Problem**: The "Invoices" export module needs to export both AP invoices and AR sales invoices, but these live in different Convex tables:
- AP invoices: `invoices` table (OCR-processed vendor invoices)
- AR invoices: `sales_invoices` table (generated customer invoices)

These tables have very different schemas.

**Decision**: The Invoices module retrieves from both tables, normalizing into a common export record shape. The AP/AR filter determines which table(s) to query:
- Filter "AP" → query `invoices` only
- Filter "AR" → query `sales_invoices` only
- Filter "All" → query both, merge results

Common export fields: `invoiceNumber`, `invoiceDate`, `dueDate`, `vendorOrCustomerName`, `totalAmount`, `currency`, `status`, `lineItems[]`.

**Rationale**: Users think of "invoices" as one concept. Hiding the two-table implementation behind a unified export interface matches user mental model.

**Alternatives considered**:
- Separate "AP Invoices" and "AR Invoices" modules → Rejected per clarification (Q4: chose filter approach over sub-modules)

## Decision 5: SQL Accounting Document Types per Module

**Problem**: SQL Accounting has many document types (GL_JE, AP_PI, AR_IV, etc.). Each module maps to different types:
- Accounting Records → GL_JE (General Ledger Journal Entry)
- Invoices (AP) → AP_PI (Supplier Invoice)
- Invoices (AR) → AR_IV (Customer Invoice)

Each document type has a completely different MASTER/DETAIL field specification.

**Decision**: Each SQL Accounting pre-built template targets one specific document type. For the Invoices module with "All" filter, the export generates sections per document type within one file (AP_PI entries first, then AR_IV entries).

SQL Accounting document type templates to build:
- `sql-accounting-gl-je` (Accounting Records module)
- `sql-accounting-ap-pi` (Invoices module, AP filter)
- `sql-accounting-ar-iv` (Invoices module, AR filter)

**Rationale**: SQL Accounting's Text Import tool processes one document type per import run, but the file can contain multiple types if clearly separated. Alternatively, users can filter AP or AR separately for cleaner imports.

## Decision 6: Pre-built Template Migration Strategy

**Problem**: Existing expense claims and leave records pre-built templates are defined in frontend code (`prebuilt-templates.ts`). The v2 rebuild replaces these with a new unified template system. Need to ensure the same target column names and formats are preserved.

**Decision**: Port existing templates directly — same `targetColumn` names, same field mappings, same date/number formats. The only change is they now run through the unified export engine. Add automated tests that compare v1 and v2 output for the same input data to verify parity.

**Rationale**: Existing users who import FinanSEAL exports into SQL Payroll, Xero, etc. depend on exact column names and formats. Any change breaks their workflow.

## Decision 7: Custom Template Migration

**Problem**: Users may have custom templates stored in the `export_templates` Convex table. The module field currently accepts `"expense" | "leave"`. After the v2 rebuild, these templates must continue to work.

**Decision**: No migration needed for custom templates. The schema expansion (adding "invoice" and "accounting" to the module validator) is backwards-compatible. Existing custom templates retain their `module: "expense"` or `module: "leave"` values and field mappings. They work unchanged in the rebuilt system because the new export engine supports the same `sourceField` dot-notation paths.

**Rationale**: Custom templates are data, not code. The field mapping interface hasn't changed, so templates remain compatible.

## Decision 8: AutoCount Export Format

**Problem**: AutoCount's primary import method is "paste from Excel clipboard" with case-sensitive column headers. No official CSV import specification is publicly documented.

**Decision**: Generate standard CSV (comma-delimited) with exact column headers matching AutoCount's known field names from their API and module documentation:
- Journal Entry: `DocNo`, `DocDate`, `Description`, `CurrencyCode`, `CurrencyRate`, `AccNo`, `Description2` (line description), `DR`, `CR`, `TaxCode`
- The CSV can be opened in Excel and pasted into AutoCount's import dialog.

**Rationale**: CSV → Excel → paste is a common workflow for AutoCount users in Malaysia. The headers match the API field names which are the canonical identifiers.

**Alternatives considered**:
- Generate .xlsx directly → Rejected: adds dependency on Excel generation library, CSV-to-Excel is trivial for users
- Use AutoCount API directly → Rejected: requires each user to have AutoCount API credentials, not in scope
