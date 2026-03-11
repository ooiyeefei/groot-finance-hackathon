# Feature Specification: CSV Auto-Parser with Intelligent Column Mapping

**Feature Branch**: `001-csv-parser`
**Created**: 2026-03-11
**Status**: Draft
**Input**: GitHub Issue #272 — Build an intelligent CSV parser that auto-detects column mappings when users upload CSV/Excel files from any source (sales platforms, bank statements, accounting systems). Uses AI for first-upload detection, then saves confirmed mappings as reusable templates.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time CSV Upload with AI Mapping (Priority: P1)

A business user uploads a CSV file from a new source (e.g., a Shopee monthly statement) for the first time. The system detects the file format (delimiter, encoding, header row), analyzes column headers and sample data using AI, and suggests mappings to standard fields. The user reviews the suggested mappings, adjusts any incorrect ones, and confirms. The mapped data is previewed before final import.

**Why this priority**: This is the core value proposition — without AI auto-detection, users must manually map every column on every upload, which is tedious and error-prone. This story delivers the "upload any CSV, it just works" experience.

**Independent Test**: Can be fully tested by uploading any CSV file and verifying the system suggests reasonable column mappings. Delivers immediate value even without template saving.

**Acceptance Scenarios**:

1. **Given** a user has a CSV file from Shopee with columns like "Order ID", "Order Total (MYR)", "Seller SKU", **When** they upload the file, **Then** the system detects it as comma-delimited and displays a mapping interface showing suggested mappings (e.g., "Order ID" → Order Reference, "Order Total (MYR)" → Gross Amount) with confidence indicators per mapping.
2. **Given** the AI has suggested column mappings, **When** the user adjusts a mapping (e.g., changes "Product Name" from unmapped to Product Description), **Then** the updated mapping is reflected in the preview and the system remembers the adjustment.
3. **Given** the user has confirmed all mappings, **When** they view the data preview, **Then** they see the first 5 rows of data with values organized under the mapped standard field names, along with any validation warnings (e.g., missing required fields, data type mismatches).

---

### User Story 2 - Save and Reuse Mapping Templates (Priority: P1)

After confirming a mapping for the first time, the user saves it as a named template (e.g., "Shopee Monthly Statement"). On subsequent uploads of files with the same column structure, the system automatically recognizes the format and applies the saved template — requiring zero manual configuration.

**Why this priority**: Template reuse is what transforms this from a one-time convenience to a permanent time-saver. Without it, users must re-map columns on every upload. This is equally critical to the AI detection story.

**Independent Test**: Can be tested by saving a template after a first upload, then uploading another file with identical column headers and verifying the template is auto-applied.

**Acceptance Scenarios**:

1. **Given** a user has confirmed column mappings for a new file format, **When** they choose to save the mapping as a template and provide a name (e.g., "Shopee Monthly Statement"), **Then** the template is stored and appears in their template library.
2. **Given** a saved template exists for a specific column header pattern, **When** the user uploads a new file with matching column headers, **Then** the system auto-detects the matching template, applies the mapping instantly, and shows a notification indicating which template was applied.
3. **Given** a saved template is auto-applied but the user wants to make changes, **When** the user chooses to edit the applied mapping, **Then** they can adjust individual column mappings and optionally update the saved template with their changes.

---

### User Story 3 - Template Management (Priority: P2)

Business users can view, edit, rename, and delete their saved mapping templates. This allows them to maintain a clean library of templates as their import sources evolve.

**Why this priority**: Important for long-term usability but not needed for the core import flow. Users can work effectively with just creation and auto-application of templates.

**Independent Test**: Can be tested by navigating to the template management interface and performing CRUD operations on existing templates.

**Acceptance Scenarios**:

1. **Given** a user has multiple saved templates, **When** they navigate to the template management interface, **Then** they see a list of all templates with name, associated standard field type (sales statement or bank statement), number of mapped columns, and date last used.
2. **Given** a user wants to update a template, **When** they edit the template's name or column mappings, **Then** the changes are saved and reflected on the next upload that matches the template.
3. **Given** a user wants to remove an obsolete template, **When** they delete it and confirm, **Then** the template is removed and future uploads with matching headers will trigger AI auto-detection instead.

---

### User Story 4 - Excel (.xlsx) File Support (Priority: P2)

In addition to CSV files, users can upload Excel (.xlsx) files. The system parses the spreadsheet, detects the header row, and applies the same AI mapping and template logic as CSV files.

**Why this priority**: Many platforms and banks export in Excel format. Supporting both file types makes the feature truly universal, but CSV alone covers the majority of use cases.

**Independent Test**: Can be tested by uploading an .xlsx file and verifying the system correctly identifies headers and applies AI mapping or saved templates.

**Acceptance Scenarios**:

1. **Given** a user uploads an .xlsx file with a single sheet, **When** the system parses it, **Then** it identifies the header row and presents column mappings the same way as for CSV files.
2. **Given** a user uploads an .xlsx file with multiple sheets, **When** the system parses it, **Then** the user is prompted to select which sheet to import from.

---

### User Story 5 - Data Validation and Error Handling (Priority: P2)

After mapping is confirmed, the system validates all rows against the expected data types and required fields. Validation errors are surfaced clearly so users can fix source data or adjust mappings before completing the import.

**Why this priority**: Validation prevents bad data from entering the system. Important for data integrity but the core import flow can work with basic type checking initially.

**Independent Test**: Can be tested by uploading a CSV with known data quality issues (missing required fields, wrong date formats) and verifying the system reports them clearly.

**Acceptance Scenarios**:

1. **Given** a mapped file contains rows with missing required fields (e.g., no order reference), **When** the user views the validation results, **Then** each problematic row is highlighted with a clear description of the issue.
2. **Given** a mapped file contains values that don't match expected types (e.g., text in a numeric amount column), **When** the user views the validation results, **Then** the system identifies the mismatched rows and suggests corrective action (e.g., "Column 'Total' contains non-numeric value 'N/A' in row 15").
3. **Given** a file has validation errors, **When** the user chooses to proceed anyway, **Then** only valid rows are imported and a summary shows how many rows were skipped with the option to download the error report.

---

### Edge Cases

- What happens when the uploaded file is empty or contains only headers with no data rows? System displays a clear message: "File contains no data rows" and does not proceed to mapping.
- How does the system handle CSV files with inconsistent column counts across rows (ragged CSVs)? Rows with fewer columns than the header are padded with empty values; rows with more columns are truncated with a warning.
- What happens when column headers are in a language other than English? The AI attempts to map non-English headers using multilingual understanding. If confidence is low, all columns are presented as unmapped for manual assignment.
- How does the system handle extremely large files (e.g., 100,000+ rows)? The system parses only the header and first 100 rows for mapping and preview. Full validation and import occur after mapping confirmation.
- What happens when two saved templates have overlapping column header fingerprints? The system presents the user with a choice between matching templates rather than auto-applying one.
- How does the system handle files with no header row (just raw data)? The system prompts the user to indicate which row contains headers or to specify that there is no header row, in which case columns are labeled generically (Column A, Column B, etc.).
- What happens when the AI cannot confidently map any columns (all low confidence)? All columns are presented as unmapped with the AI's best guesses shown as suggestions. The user must manually assign at least the required fields before proceeding.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept file uploads in CSV (.csv) and Excel (.xlsx) formats.
- **FR-002**: System MUST auto-detect CSV delimiters (comma, semicolon, tab, pipe) and file encoding.
- **FR-003**: System MUST identify the header row in uploaded files and extract column names.
- **FR-004**: System MUST use AI to analyze column headers and sample data rows, then auto-detect the applicable schema type (Sales Statement or Bank Statement) and suggest column-to-field mappings with a confidence score per mapping.
- **FR-005**: System MUST support two standard field schemas: Sales Statement fields (order reference, date, product, amounts, fees) and Bank Statement fields (transaction date, description, debit/credit amounts, balance). The AI auto-detects which schema applies; the user can confirm or override the detected schema type.
- **FR-006**: System MUST provide a mapping confirmation interface where users can review, accept, or change each suggested column mapping via dropdown selection.
- **FR-007**: System MUST display a preview of the first 5 mapped rows before the user finalizes the import.
- **FR-008**: System MUST allow users to save confirmed mappings as named templates.
- **FR-009**: System MUST generate a fingerprint from column headers to identify matching templates on future uploads.
- **FR-010**: System MUST auto-detect and apply a matching saved template when a user uploads a file with recognized column headers, showing which template was applied.
- **FR-011**: System MUST allow users to override an auto-applied template and re-map columns manually.
- **FR-012**: System MUST provide a template management interface (accessible from within the import flow or app settings) to list, view, edit, rename, and delete saved templates. No standalone navigation entry — the parser is an embedded component invoked by consuming features.
- **FR-013**: System MUST validate mapped data against expected types (numeric, date, text) and required field constraints, surfacing row-level errors.
- **FR-014**: System MUST allow users to proceed with import despite validation errors, importing only valid rows and providing an error summary.
- **FR-015**: System MUST handle .xlsx files with multiple sheets by prompting the user to select the target sheet.
- **FR-016**: System MUST reject files that exceed 25 MB in size or 100,000 rows and display a user-friendly message indicating the limit.
- **FR-019**: System MUST sanitize cell values by stripping formula prefixes (`=`, `+`, `-`, `@`) to prevent formula injection attacks.
- **FR-020**: System MUST reject macro-enabled Excel files (.xlsm) and display a message asking the user to re-save as .xlsx without macros.
- **FR-017**: System MUST scope templates per business — templates created by one business are not visible to other businesses.
- **FR-018**: System MUST output parsed and mapped data as structured records that consuming features can read. The parser does not write to domain-specific tables (e.g., invoices, transactions) — downstream features handle their own persistence.

### Key Entities

- **Import File**: An uploaded CSV or Excel file with metadata (filename, size, detected format, upload date, associated business).
- **Column Mapping**: A pairing between a source column header and a standard target field, with a confidence score and a status (suggested, confirmed, unmapped).
- **Mapping Template**: A saved, named collection of column mappings with a header fingerprint for auto-detection. Belongs to a business. Tracks standard field type (sales statement or bank statement), creation date, and last-used date.
- **Import Session**: A transient, in-memory record of an in-progress import, linking the file, applied mappings, validation results, and preview data. Not persisted — if the user abandons the session (e.g., closes the browser tab), they must re-upload.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can upload a CSV file and see AI-suggested column mappings within 10 seconds of upload.
- **SC-002**: AI column mapping suggestions achieve at least 80% accuracy (4 out of 5 columns correctly mapped) for common sales platform and bank statement formats.
- **SC-003**: Repeat uploads with a saved template are mapped and ready for preview in under 3 seconds with zero manual configuration.
- **SC-004**: Users can complete a first-time file import (upload → map → confirm → preview) in under 2 minutes.
- **SC-005**: 90% of users successfully complete their first CSV import without needing external help or documentation.
- **SC-006**: The system correctly auto-detects saved templates for repeat uploads at least 95% of the time.
- **SC-007**: Validation catches 100% of data type mismatches (e.g., text in numeric fields) and missing required fields before import completes.

## Clarifications

### Session 2026-03-11

- Q: Does this feature write parsed data into domain tables, or just output structured data? → A: Parser + mapper only. Outputs structured data. Consuming features (AR Reconciliation, future invoice creation, bank import) handle their own persistence.
- Q: How is the standard field schema (Sales Statement vs Bank Statement) selected? → A: AI auto-detects schema type from column headers and sample data. User confirms or overrides. Falls back to manual choice if AI confidence is low.
- Q: Can users resume an abandoned import session? → A: No. One-shot flow — if the user abandons, they re-upload and start fresh. No session persistence needed.
- Q: Where does this feature live in the app? → A: Embedded component (modal/drawer) invoked by consuming features. No standalone page. Template management accessible from within the import flow or app settings.
- Q: How should the system handle potentially malicious content in uploaded files? → A: Strip formula prefixes from cell values (`=`, `+`, `-`, `@`) and reject macro-enabled Excel files (.xlsm).

## Assumptions

- Users are authenticated business users with an active Groot Finance account.
- Each business manages its own library of templates independently (no cross-business sharing).
- The standard field schemas (Sales Statement, Bank Statement) cover the majority of import use cases. Additional schemas may be added in the future but are out of scope for this feature.
- Files are uploaded from the user's local device (no direct integration with third-party platform APIs).
- AI mapping uses the existing Groot Finance AI infrastructure (no new AI model or service required).
- Column header fingerprinting uses an exact match strategy (same set of headers = same template). Fuzzy matching is out of scope for the initial release.

## Out of Scope

- Direct API integrations with sales platforms (Shopee, Lazada, etc.) — this feature handles their exported files instead.
- Automated scheduled imports (e.g., polling a folder or email inbox for new files).
- Cross-business template sharing or a public template marketplace.
- Fuzzy template matching (handling slight variations in column headers across different file versions).
- Data transformation rules (e.g., currency conversion, date format normalization beyond parsing).

## Dependencies

- AR Reconciliation (#269) will consume the parsed/mapped data from this feature for sales statement matching.
- Existing export template infrastructure in `src/domains/exports/` may share patterns but is a separate system (export vs. import).
