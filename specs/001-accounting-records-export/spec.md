# Feature Specification: Export System v2 — Accounting Records, Invoices & Unified Rebuild

**Feature Branch**: `001-accounting-records-export`
**Created**: 2026-02-24
**Status**: Draft
**Input**: User description: "Accounting Records Export to 3rd Party Accounting Systems - Research CSV import formats for SQL Accounting (Malaysia), AutoCount, and Master Accounting System. Build pre-built export templates for accounting records (expense claims and invoices posted to accounting records) that can be exported in CSV format compatible with these 3 accounting systems. Integrate with existing export tab and templates tab in the reporting page."

## Clarifications

### Session 2026-02-24

- Q: What export modules should the system offer? → A: Expand to 4 modules — Expense Claims (all statuses), Invoices (all stages including OCR/draft/sent), Leave Records, and Accounting Records (only finalized posted entries). Each serves a distinct use case.
- Q: How to handle Master Accounting template given no public CSV import documentation? → A: Defer entirely. Ship only SQL Accounting and AutoCount pre-built templates for now. Add Master Accounting template in a future update once Masteritec provides technical import specifications.
- Q: Which pre-built templates should the Invoices export module offer? → A: SQL Accounting (AP_PI for purchase invoices, AR_IV for customer invoices), AutoCount invoice format, and a Generic invoice CSV. This keeps target system coverage consistent across both Invoices and Accounting Records modules.
- Q: How should AP and AR invoices be handled in the Invoices export module? → A: Add an invoice type filter (AP / AR / All). SQL Accounting template auto-selects the correct document format (AP_PI for AP, AR_IV for AR) based on the filter selection.
- Q: How to handle existing expense claims export which is not well validated/tested? → A: Rebuild all 4 export modules (Expense Claims, Invoices, Leave Records, Accounting Records) from scratch with a unified, properly validated architecture. Replace existing export code rather than extending it. Existing custom templates need a migration path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export Accounting Records Using SQL Accounting Template (Priority: P1)

A business owner or finance admin navigates to the Reporting & Exports page, selects "Accounting Records" as the export module, and chooses the "SQL Accounting" pre-built template. They apply date range and status filters, preview the formatted output, and download a semicolon-delimited file that can be directly imported into SQL Accounting's Text Import tool as GL Journal Voucher entries.

**Why this priority**: SQL Accounting (by eStream Software) is the most widely used accounting software among Malaysian SMEs. Enabling direct export to SQL Accounting addresses the largest segment of FinanSEAL's target market and provides immediate value — businesses can stop manually re-keying expense claims and invoice data into their accounting system. As the most complex template (MASTER/DETAIL hierarchical format), building this first validates the core export engine.

**Independent Test**: Can be fully tested by creating accounting entries (from expense claims and invoices), selecting the SQL Accounting template, previewing and exporting, then importing the generated file into SQL Accounting's Text Import tool and verifying the journal entries appear correctly.

**Acceptance Scenarios**:

1. **Given** an owner has approved expense claims and posted invoices in accounting records, **When** they select "Accounting Records" module and the "SQL Accounting" template, **Then** the system shows a preview of the data formatted as MASTER/DETAIL rows with semicolon delimiters matching SQL Accounting's GL_JE import specification.
2. **Given** the user applies a date range filter (e.g., last 30 days), **When** they click "Export", **Then** the system generates a `.txt` file with MASTER rows (DOCNO, DOCDATE, POSTDATE, DESCRIPTION, CANCELLED) followed by DETAIL rows (CODE, DR, LOCALDR, CR, LOCALCR, TAX fields) for each line item, using DD/MM/YYYY date format and no thousand separators in numbers.
3. **Given** the exported file is opened in SQL Accounting's Text Import tool, **When** the user selects document type "GL_JE" and imports, **Then** all journal entries are created without errors, with debits equalling credits per entry.

---

### User Story 2 - Export Accounting Records Using AutoCount Template (Priority: P2)

A finance admin selects "Accounting Records" module and chooses the "AutoCount" pre-built template. They filter, preview, and download a CSV file formatted for AutoCount's Excel/CSV import — with each accounting entry producing header-repeated detail rows containing account number, description, DR/CR amounts, and tax information.

**Why this priority**: AutoCount is another major Malaysian accounting software. Supporting it covers the second-largest market segment. The flat-row CSV format validates the export engine's ability to handle both hierarchical and flat output formats.

**Independent Test**: Can be tested by exporting accounting records with the AutoCount template, then pasting the CSV data into AutoCount's "Import from Excel" feature and verifying journal entries are created correctly.

**Acceptance Scenarios**:

1. **Given** an owner has accounting records from expense claims and invoices, **When** they select the "AutoCount" template, **Then** the preview displays one row per debit/credit line with columns: DocNo, DocDate, Description, CurrencyCode, AccNo, LineDescription, DR, CR, TaxCode.
2. **Given** the user exports the file, **When** they open it in AutoCount's import tool, **Then** the column headers are recognized (case-sensitive match), amounts have no negative values, and the MYR currency code is populated correctly.
3. **Given** an accounting entry has multiple line items (e.g., one debit to expense account, one credit to bank account), **When** exported, **Then** each line item appears as a separate row with the same DocNo, and the DR column is 0 when CR has a value (and vice versa).

---

### User Story 3 - Export Invoices with AP/AR Filtering (Priority: P2)

A finance admin selects "Invoices" as the export module. They filter by invoice type (AP, AR, or All), date range, and status. They can export AP invoices at any stage (OCR processing, draft, approved) and AR sales invoices at any stage (draft, sent, not yet posted as AR). They choose a pre-built template (SQL Accounting, AutoCount, or Generic) or a custom template, preview and download.

**Why this priority**: Invoices at pre-posting stages are valuable for internal tracking, auditing, and reconciliation. Businesses need to export invoice data to external systems before it reaches the accounting records stage. The AP/AR filter ensures the correct SQL Accounting document format (AP_PI vs AR_IV) is auto-selected.

**Independent Test**: Can be tested by creating invoices at various stages, selecting the Invoices module, applying AP/AR filter, and verifying the export contains the correct records formatted for the target accounting system.

**Acceptance Scenarios**:

1. **Given** a business has AP invoices in OCR/draft/approved stages and AR sales invoices in draft/sent stages, **When** a finance admin selects the "Invoices" module, **Then** all invoices regardless of posting status are available for export.
2. **Given** the user filters by invoice type "AP" and status "draft", **When** they preview, **Then** only AP invoices in draft status appear.
3. **Given** the user selects the SQL Accounting template with invoice type filter set to "AP", **When** they export, **Then** the file uses the AP_PI (Purchase Invoice) format with the correct MASTER/DETAIL structure.
4. **Given** the user selects invoice type "All" with the SQL Accounting template, **When** they export, **Then** the file contains separate document type sections — AP_PI entries for AP invoices and AR_IV entries for AR invoices.

---

### User Story 4 - Rebuilt Expense Claims Export (Priority: P2)

The existing expense claims export is rebuilt from scratch as part of the unified export system. A user selects "Expense Claims" as the export module and sees all pre-built templates (SQL Payroll, Xero, QuickBooks, BrioHR, Kakitangan, Generic Export) rebuilt with validated field mappings. The export workflow (filter, preview, download) uses the same unified engine as the new Accounting Records and Invoices modules.

**Why this priority**: The existing expense claims export is not well validated. Rebuilding it alongside the new modules ensures all 4 modules share one reliable architecture. Expense claims exports cover all statuses (draft, submitted, approved, rejected, reimbursed) — distinct from Accounting Records which only contains finalized posted entries.

**Independent Test**: Can be tested by exporting expense claims using each pre-built template and verifying the output matches the target system's expected format. Compare output quality against the old export system to confirm improvement.

**Acceptance Scenarios**:

1. **Given** a business has expense claims at various statuses, **When** a user selects "Expense Claims" module, **Then** all claims are available for export regardless of status, using the unified export engine.
2. **Given** a user selects the "SQL Payroll" template, **When** they export, **Then** the output matches SQL Payroll's expected import format with correct column headers (EMP_NAME, EMP_ID, CLAIM_DATE, AMOUNT, etc.) and formatting.
3. **Given** a user had custom templates created in the old system, **When** they access the rebuilt export system, **Then** their custom templates have been migrated and produce identical output to before.

---

### User Story 5 - Rebuilt Leave Records Export (Priority: P3)

The existing leave records export is rebuilt as part of the unified export system. A user selects "Leave Records" as the export module and sees all pre-built templates (SQL Payroll, BrioHR, Kakitangan, Generic Export) rebuilt with validated field mappings. The export workflow uses the same unified engine.

**Why this priority**: Consistency — all 4 modules must use the same architecture. Leave records export is simpler than the others and benefits from the unified engine's validated formatting logic.

**Independent Test**: Can be tested by exporting leave records using each pre-built template and verifying format correctness.

**Acceptance Scenarios**:

1. **Given** a business has leave requests at various statuses, **When** a user selects "Leave Records" module, **Then** all leave requests are available for export using the unified export engine.
2. **Given** a user selects the "BrioHR" template, **When** they export, **Then** the output matches BrioHR's expected format with correct column headers and date formatting.

---

### User Story 6 - Custom Templates and Template Builder (Priority: P3)

A finance admin navigates to the Templates tab and creates a custom export template for any of the 4 modules (Expense Claims, Invoices, Leave Records, Accounting Records). They select from module-specific available fields, configure column names, date format, decimal places, and thousand separator, then save. The template appears in the Export tab when the corresponding module is selected.

**Why this priority**: Custom templates let businesses export to any system that accepts CSV imports — not just the pre-built ones. The Template Builder is rebuilt as part of the unified architecture to support all 4 modules and the new field types (line-item-level fields for Accounting Records and Invoices).

**Independent Test**: Can be tested by creating a custom template for each module, exporting data, and verifying the CSV output matches the configured column names and formatting.

**Acceptance Scenarios**:

1. **Given** a finance admin opens the Template Builder, **When** they select "Accounting Records" as the module, **Then** the available fields list shows all accounting record fields (transaction date, document type, GL account code, description, debit amount, credit amount, original currency, home currency amount, exchange rate, vendor name, reference number, category, tax code, tax amount, source document type, status).
2. **Given** the admin selects "Invoices" as the module, **When** they view available fields, **Then** invoice-specific fields are shown (invoice number, invoice date, due date, vendor/customer name, line items, amounts, status, invoice type AP/AR).
3. **Given** the admin saves a custom template, **When** they go to the Export tab, **Then** the template appears under the correct module and produces correctly formatted output.

---

### User Story 7 - Scheduling and History for All Modules (Priority: P3)

A finance admin sets up recurring scheduled exports for any of the 4 modules. Export history tracks all exports across all modules with download capability. The scheduling and history systems are rebuilt as part of the unified architecture.

**Why this priority**: Automated scheduling and audit history are essential for businesses that regularly sync data to external systems. Rebuilding these ensures they work reliably across all 4 modules.

**Independent Test**: Can be tested by creating schedules for different modules and verifying scheduled exports produce correctly formatted files stored in history.

**Acceptance Scenarios**:

1. **Given** a finance admin creates a weekly export schedule for accounting records with the SQL Accounting template, **When** the scheduled time arrives, **Then** the system generates the export file for the previous week's records and stores it in export history.
2. **Given** scheduled and manual exports have been performed across multiple modules, **When** the admin visits the History tab, **Then** all exports appear with correct module type, template name, record count, file size, and download option.

---

### Edge Cases

- What happens when an accounting entry has no line items (header only, no debit/credit breakdown)? The system should skip entries without line items and show a warning in the preview indicating how many entries were skipped.
- What happens when line items' total debits do not equal total credits? The system should flag these unbalanced entries in the preview with a warning icon but still include them in the export (the target accounting system will reject them at import time, which is the expected behavior).
- What happens when an accounting entry uses a foreign currency but has no exchange rate set? The system should use 1.0 as the default exchange rate and populate both foreign and local currency columns with the same amount.
- What happens when the user exports 10,000+ accounting records with multiple line items each (potentially 30,000+ rows)? The system should handle the export within the existing 10,000-entry limit per export, counting entries (not rows), and generate the multi-row output accordingly.
- What happens when a pre-built template references a GL account code but the accounting entry has no account code? The system should output an empty string for the account code field, allowing the user to fill it in the target system before importing.
- How does the SQL Accounting MASTER/DETAIL format appear in the preview table? The preview should display MASTER rows in a distinct style (e.g., bold or highlighted) to differentiate them from DETAIL rows, making the hierarchical structure clear.
- What happens to existing custom templates during migration? Custom templates created in the old system should be migrated automatically to the new system with identical field mappings and formatting. Users should see no functional change in their custom template output.
- What happens when a user exports invoices with type "All" using the SQL Accounting template? The system should produce one file with AP_PI sections for AP invoices followed by AR_IV sections for AR invoices, clearly separated by document type.

## Requirements *(mandatory)*

### Functional Requirements

**Module Structure**

- **FR-001**: System MUST provide 4 selectable export modules: Expense Claims (all statuses), Invoices (all stages including OCR/draft/sent, with AP/AR filter), Leave Records, and Accounting Records (only finalized posted entries from expense claims and invoices).
- **FR-002**: All 4 modules MUST be rebuilt from scratch using a unified export engine, replacing the existing expense claims and leave records export implementation entirely.

**Pre-built Templates — Accounting Records Module**

- **FR-010**: System MUST provide a pre-built "SQL Accounting" template for Accounting Records that generates GL Journal Voucher (GL_JE) formatted output with semicolon delimiter, MASTER/DETAIL row structure, DD/MM/YYYY date format, and all mandatory fields (DOCNO, DOCDATE, POSTDATE, DESCRIPTION, CANCELLED for MASTER; CODE, DESCRIPTION, REF, DR, LOCALDR, CR, LOCALCR, TAX, TAXAMT, TAXINCLUSIVE, TAXRATE for DETAIL).
- **FR-011**: System MUST provide a pre-built "AutoCount" template for Accounting Records that generates CSV output with comma delimiter, one row per debit/credit line, columns including DocNo, DocDate, Description, CurrencyCode, AccNo, LineDescription, DR, CR, TaxCode, with DR and CR as mutually exclusive values per row.
- **FR-012**: Master Accounting (by Masteritec) template is DEFERRED — will be added in a future update once Masteritec provides CSV import specifications.

**Pre-built Templates — Invoices Module**

- **FR-013**: System MUST provide pre-built templates for the Invoices module: SQL Accounting AP_PI (for AP/purchase invoices) and AR_IV (for AR/sales invoices), AutoCount invoice format, and a Generic invoice CSV.

**Pre-built Templates — Expense Claims Module**

- **FR-014**: System MUST provide rebuilt pre-built templates for Expense Claims: SQL Payroll, Xero, QuickBooks, BrioHR, Kakitangan, and Generic Export — matching the same target column formats as the original templates but using the unified export engine.

**Pre-built Templates — Leave Records Module**

- **FR-015**: System MUST provide rebuilt pre-built templates for Leave Records: SQL Payroll, BrioHR, Kakitangan, and Generic Export — matching the same target column formats as the original templates but using the unified export engine.

**Data Sources**

- **FR-020**: System MUST source Accounting Records from the accounting entries data store, including only finalized posted entries originating from both expense claims and invoices.
- **FR-021**: System MUST source Invoices module data from the invoices data store, including AP invoices at all stages (OCR, draft, approved) and AR sales invoices at all stages (draft, sent, not yet posted), independent of posting status.
- **FR-022**: System MUST source Expense Claims from the expense claims data store, including claims at all statuses (draft, submitted, approved, rejected, reimbursed).
- **FR-023**: System MUST source Leave Records from the leave requests data store, including requests at all statuses.

**Filtering**

- **FR-030**: System MUST support filtering by date range (with quick presets and custom dates) and status for all 4 modules.
- **FR-031**: System MUST provide an invoice type filter (AP / AR / All) in the Invoices module. When using the SQL Accounting template, the system MUST auto-select the correct document format — AP_PI for AP invoices and AR_IV for AR invoices. Exporting "All" MUST produce separate document type sections in the output file.
- **FR-032**: System MUST support filtering Accounting Records by transaction type (expense claim, invoice, or all).

**Export Engine**

- **FR-040**: System MUST support both flat output format (one row per line item with repeated header fields) and hierarchical output format (MASTER row followed by DETAIL rows per entry).
- **FR-041**: System MUST ensure exported number values contain no thousand separators and no currency symbols, using plain decimal notation (e.g., "1234.56").
- **FR-042**: System MUST ensure total debits equal total credits within each exported journal entry document for accounting records templates.
- **FR-043**: For SQL Accounting templates, exported files MUST use `.txt` extension and semicolon (`;`) delimiter. For AutoCount and other templates, files MUST use `.csv` extension and comma (`,`) delimiter.
- **FR-044**: System MUST display a preview of the formatted export output before download, showing the first 10 records with the target system's formatting applied (including MASTER/DETAIL structure for SQL Accounting).

**Template Builder & Custom Templates**

- **FR-050**: System MUST make module-specific fields available in the Template Builder for all 4 modules, including transaction-level and line-item-level fields for Accounting Records and Invoices.
- **FR-051**: System MUST allow users to clone pre-built templates into custom templates for further customization, for all 4 modules.
- **FR-052**: System MUST migrate existing custom templates from the old export system to the new unified system, preserving field mappings, formatting, and producing identical output.

**Access Control, History & Scheduling**

- **FR-060**: System MUST apply role-based access control — owners and finance admins can export all records, managers can export their team's records, and employees can export only their own records — consistently across all 4 modules.
- **FR-061**: System MUST log all exports to export history, including module type, template used, record count, file size, and filters applied.
- **FR-062**: System MUST support scheduling automated exports for all 4 modules using the existing frequency options (daily, weekly, monthly).

### Key Entities

- **Accounting Record (Export Source)**: A posted financial entry representing a journal voucher, with header-level data (document number, date, description, currency, exchange rate, status, source document type) and line-item-level data (GL account code, description, debit amount, credit amount, tax code, tax amount). Sourced from entries created via expense claims and invoices.
- **Invoice (Export Source)**: An AP or AR invoice at any lifecycle stage, with header data (invoice number, date, due date, vendor/customer, currency, status, type) and line-item data (description, quantity, unit price, amount, tax). AP invoices originate from OCR/manual entry; AR invoices from sales invoice generation.
- **Export Template**: Defines how data maps to output columns. Supports `module` types: "expense", "invoice", "leave", "accounting". Pre-built templates include format-specific metadata (delimiter type, row structure type — flat or hierarchical). Custom templates are user-created and stored per business.
- **Export Format**: Defines output structure — "flat" (one row per line item with repeated header fields) or "hierarchical" (MASTER row followed by DETAIL rows per entry). SQL Accounting uses hierarchical; AutoCount, payroll/HR systems, and custom templates default to flat.

## Assumptions

- Accounting entries already have line items with debit/credit amounts and GL account codes populated (from expense claim posting and invoice posting workflows).
- The accounting entries data store contains entries from both expense claims and invoices, identifiable by their source document type.
- SQL Accounting's Text Import tool (semicolon-delimited, MASTER/DETAIL format) is the primary import method for Malaysian SMEs — the pre-built template targets this for maximum compatibility.
- AutoCount users primarily import via Excel/CSV clipboard paste, so a standard CSV with correct column headers is sufficient.
- All monetary amounts are stored with sufficient precision (at least 2 decimal places) for accounting export purposes.
- Users understand their target accounting system's chart of accounts codes and will map or fill GL account codes as needed before exporting.
- The rebuild replaces all existing export code. No old export code paths remain after the rebuild is complete.
- Existing custom templates can be migrated by mapping old field definitions to the new unified field system. No custom template data should be lost.
- The rebuild does not change the Reporting & Exports page tab structure (Reports, Export, Templates, Schedules, History) — only the underlying implementation and the module options within the Export tab.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can select any of the 4 export modules and complete a full export workflow (select module, choose template, filter, preview, download) in under 2 minutes.
- **SC-002**: Files exported using the SQL Accounting GL_JE template can be imported into SQL Accounting's Text Import tool without format-related errors on first attempt.
- **SC-003**: Files exported using the AutoCount template can be imported into AutoCount's Excel/CSV import feature without column-mismatch or format errors on first attempt.
- **SC-004**: Rebuilt Expense Claims and Leave Records exports produce output that matches or exceeds the quality of the original exports — validated against each pre-built template's target system format.
- **SC-005**: Users can create custom templates for all 4 modules using the Template Builder and successfully export data using those templates.
- **SC-006**: 100% of export features (filtering, preview, history, scheduling, role-based access, template cloning) work consistently across all 4 modules.
- **SC-007**: Export of 1,000 accounting entries (with an average of 3 line items each, producing ~4,000 rows for hierarchical format) completes and downloads within 10 seconds.
- **SC-008**: Each exported journal entry has balanced debits and credits (total DR = total CR within each document).
- **SC-009**: All existing custom templates are migrated to the new system and produce identical output to the old system.
- **SC-010**: Invoice exports correctly separate AP and AR invoices when using the SQL Accounting template, producing the correct document type format for each.
