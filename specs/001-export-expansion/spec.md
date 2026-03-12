# Feature Specification: ERP Export Expansion

**Feature Branch**: `001-export-expansion`
**Created**: 2026-03-11
**Status**: Draft
**Input**: GitHub Issue #275 — Expand export system with MYOB templates, additional HR systems, vendor/customer master data export, and chart of accounts export.
**GitHub Issue**: https://github.com/grootdev-ai/groot-finance/issues/275

## Clarifications

### Session 2026-03-11

- Q: Should Vendor and Customer be new standalone export modules or templates under existing modules? → A: New unified "Master Data" module. Consolidate vendor, customer, chart of accounts, and all existing master-accounting templates (creditor, debtor, chart of account, category, cost centre, stock item) under a single "Master Data" export module. Existing `master-accounting-*` templates move from the Accounting module to the Master Data module.
- Q: Which 2 HR systems to prioritize, and should existing HR templates be improved? → A: HReasily + Swingvy for new templates. Also review and improve existing BrioHR and Kakitangan templates (currently sparse — BrioHR Expense has 6 fields, Kakitangan Expense has 5 fields) to match the completeness of new templates.
- Q: Should SQL Payroll templates also be reviewed alongside BrioHR/Kakitangan? → A: Yes, include SQL Payroll in the review. Apply a consistent quality bar across all existing HR templates (SQL Payroll Expense has 9 fields but is still missing vendor, receipt number, tax; SQL Payroll Leave has 8 fields and is mostly complete).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export Master Data to ERP (Priority: P1)

A finance admin needs to export master data — vendors (creditors), customers (debtors), chart of accounts, categories, cost centres, and stock items — from Groot Finance into their ERP system. Today, vendor and customer master exports only exist for Master Accounting format. With this feature, a new "Master Data" export module consolidates all master data exports in one place, with ERP-specific templates for SQL Accounting, AutoCount, and MYOB alongside the existing Master Accounting templates.

**Why this priority**: Master data export is the highest-value net-new capability. Consolidating all reference data under one module creates a single destination for ERP setup and ongoing master data sync. Vendor/customer exports for non-Master Accounting ERPs have no workaround today.

**Independent Test**: Can be fully tested by selecting the "Master Data" module, choosing a template (e.g., SQL Accounting Creditor, MYOB Card/Supplier, Master Accounting Category), and verifying the generated CSV matches the target system's import format.

**Acceptance Scenarios**:

1. **Given** a business with 15 vendors, **When** a finance admin selects the "Master Data" module and chooses the SQL Accounting Creditor template, **Then** a CSV is generated with all 15 vendors in SQL Accounting's creditor import layout (code, name, TIN, address, payment terms, bank details).
2. **Given** a business with 20 customers, **When** the finance admin chooses the AutoCount Customer template from the Master Data module, **Then** a CSV is generated with all 20 customers in AutoCount's debtor import format.
3. **Given** a business with vendors that have incomplete data (e.g., missing bank details), **When** the user exports to any vendor/creditor template, **Then** missing fields are exported as empty values (not "N/A" or "null").
4. **Given** a user browsing the Master Data module templates, **When** they view the template list, **Then** they see all master data templates organized by type: Vendor/Creditor, Customer/Debtor, Chart of Accounts, Category, Cost Centre, Stock Item — including both existing Master Accounting templates and the new ERP-specific templates.
5. **Given** the existing `master-accounting-creditor`, `master-accounting-debtor`, `master-accounting-chart-of-account`, `master-accounting-category`, `master-accounting-cost-centre`, and `master-accounting-stock-item` templates, **When** the Master Data module is introduced, **Then** these templates are migrated from the Accounting module to the Master Data module without breaking existing schedules or history references.
6. **Given** a scheduled export configured for the Master Data module, **When** the schedule triggers, **Then** the master data is exported automatically with the same format and quality as a manual export.
7. **Given** existing code mappings for creditor/debtor codes, **When** exporting vendor or customer data, **Then** the mapped codes are used in the exported file (falling back to system-generated codes if no mapping exists).

---

### User Story 2 - Export Transactions in MYOB Format (Priority: P2)

An SME using MYOB as their accounting software needs to export expense claims, invoices, and accounting journal entries in MYOB-compatible CSV format. Today they can export to SQL Accounting, AutoCount, Xero, and QuickBooks — but MYOB users must manually reformat exports or enter data by hand.

**Why this priority**: MYOB is widely used across Southeast Asia (especially Singapore and Malaysia). Adding MYOB templates is a quick win that extends the existing template system with no architectural changes required — just new template definitions matching MYOB's import specifications.

**Independent Test**: Can be tested by selecting an existing module (expense, invoice, or accounting), choosing the new MYOB template, executing an export, and verifying the output matches MYOB's import format requirements (field names, date format DD/MM/YYYY, column order).

**Acceptance Scenarios**:

1. **Given** a business with accounting journal entries, **When** a finance admin selects the Accounting module and chooses the MYOB Journal template, **Then** a CSV is generated with MYOB-compatible columns: Journal Number, Date (DD/MM/YYYY), Account Number, Debit Amount, Credit Amount, Memo, Tax Code, and Job.
2. **Given** a business with expense claims, **When** exporting using the MYOB Expense template, **Then** the file includes MYOB-standard fields: Date, Account Number, Amount, Tax Code, Memo/Description, Card (Vendor Name).
3. **Given** a business with sales and purchase invoices, **When** exporting using the MYOB Invoice template, **Then** separate templates are available for sales (AR) and purchases (AP) matching MYOB's invoice import layout.
4. **Given** a user browsing prebuilt templates, **When** they filter by system, **Then** MYOB templates appear alongside existing ERP options with clear labeling indicating MYOB compatibility.
5. **Given** the new Master Data module, **When** a MYOB user wants to export vendor or customer master data, **Then** MYOB Card/Supplier and Card/Customer templates are available in the Master Data module.

---

### User Story 3 - Expand and Improve HR System Exports (Priority: P2)

HR managers at SEA-based SMEs use popular HR platforms like HReasily, Swingvy, BrioHR, Kakitangan, and SQL Payroll. They need to export leave records and expense claims from Groot Finance in formats compatible with these HR systems for payroll processing and attendance tracking. The existing templates vary in completeness: BrioHR Expense has 6 fields, Kakitangan Expense has 5 fields, SQL Payroll Expense has 9 fields (but still missing vendor, receipt #, tax). This story covers both adding new HR system templates (HReasily, Swingvy) and improving all existing ones (BrioHR, Kakitangan, SQL Payroll) to a consistent quality bar.

**Why this priority**: Extends the existing HR integration story to cover more of the SEA HR software market while fixing gaps in current templates that may cause import failures or require manual data entry to supplement.

**Independent Test**: Can be tested by selecting the Leave or Expense module, choosing any HR system template (new or improved), and verifying the exported CSV includes all fields expected by the target system's import function.

**Acceptance Scenarios**:

1. **Given** a business with leave records, **When** a HR manager exports using the HReasily Leave template, **Then** the CSV contains columns matching HReasily's leave import format (Employee ID, Employee Name, Leave Type, Start Date, End Date, Days, Status).
2. **Given** a business with expense claims, **When** exporting using the Swingvy Expense template, **Then** the file matches Swingvy's claims import layout including employee identifier, claim date, category, amount, currency, vendor, and approval status.
3. **Given** the existing BrioHR Expense template (currently 6 fields), **When** the improved template is used, **Then** it includes additional fields: employee name, employee ID, vendor name, receipt/claim number, approval status, tax amount, and payment method — matching BrioHR's full import specification.
4. **Given** the existing Kakitangan Expense template (currently 5 fields), **When** the improved template is used, **Then** it includes additional fields: employee name, email, currency, vendor, status, and tax amount.
5. **Given** the existing BrioHR and Kakitangan Leave templates, **When** the improved templates are used, **Then** they include employee name (both) and approval status (Kakitangan) in addition to existing fields.
6. **Given** a user creating a scheduled export, **When** they select any HR system template (new or improved), **Then** the schedule works identically to existing templates (daily/weekly/monthly frequency, filters, history tracking).
7. **Given** an existing scheduled export using the old BrioHR or Kakitangan template, **When** the templates are improved, **Then** future exports use the updated field mappings — existing export history remains unchanged.

---

### User Story 4 - Export Chart of Accounts for ERP Setup (Priority: P3)

When a new SME is setting up their ERP system, they need to import their chart of accounts. Finance admins who have already configured code mappings in Groot Finance want to export these mappings as an importable chart of accounts file. With the new Master Data module, chart of accounts export is available alongside other master data exports — with templates for SQL Accounting, AutoCount, and MYOB in addition to the existing Master Accounting format.

**Why this priority**: This is a setup-time convenience feature. It's valuable for new ERP setups but used infrequently (typically once during initial configuration). Lower priority than ongoing transactional exports.

**Independent Test**: Can be tested by configuring code mappings in the export system, then selecting the Master Data module, choosing a Chart of Accounts template, and verifying the format matches the target ERP's account import layout.

**Acceptance Scenarios**:

1. **Given** a business with 30 account code mappings configured, **When** the finance admin selects the Master Data module and chooses the SQL Accounting Chart of Accounts template, **Then** a CSV is generated with columns matching SQL Accounting's chart of accounts import format.
2. **Given** a business with code mappings spanning account codes, creditor codes, and debtor codes, **When** exporting a chart of accounts template, **Then** only GL account codes are included — creditor/debtor codes are exported via the vendor/customer templates respectively.
3. **Given** a business with no code mappings configured, **When** they attempt to export a chart of accounts, **Then** they see a helpful message directing them to configure code mappings first, with a link to the code mapping configuration.

---

### Edge Cases

- What happens when a vendor/customer has no TIN or BRN? → Empty fields in export; no validation errors.
- What happens when MYOB date format differs from user's configured default? → MYOB templates enforce DD/MM/YYYY regardless of user's global date format preference.
- What happens when a target HR system changes their import format? → Prebuilt templates are versioned by the system; users can clone and customize if the prebuilt no longer matches.
- What happens when a user exports from Master Data module but has zero vendor records? → Export completes with headers only (empty data file) and a notification: "No records found matching your filters."
- What happens when code mappings reference deleted/renamed categories? → Stale mappings are included as-is in the export; the target ERP's import validation will flag mismatches.
- What happens to existing scheduled exports that reference master-accounting templates under the Accounting module? → Schedules continue to work — the migration updates the module association but preserves template IDs and all existing references.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Master Data" export module as a new module type, consolidating all reference/master data exports: vendors (creditors), customers (debtors), chart of accounts, categories, cost centres, and stock items.
- **FR-002**: System MUST migrate existing `master-accounting-creditor`, `master-accounting-debtor`, `master-accounting-chart-of-account`, `master-accounting-category`, `master-accounting-cost-centre`, and `master-accounting-stock-item` prebuilt templates from the Accounting module to the Master Data module without breaking existing schedules, history, or custom template references.
- **FR-003**: System MUST include new vendor/creditor export templates for SQL Accounting (Creditor format), AutoCount (Supplier format), and MYOB (Card/Supplier format) in the Master Data module.
- **FR-004**: System MUST include new customer/debtor export templates for SQL Accounting (Debtor format), AutoCount (Customer format), and MYOB (Card/Customer format) in the Master Data module.
- **FR-005**: System MUST include new chart of accounts export templates for SQL Accounting, AutoCount, and MYOB in the Master Data module (in addition to the existing Master Accounting chart of accounts template).
- **FR-006**: System MUST include MYOB prebuilt templates for the Accounting module (Journal Entry format with DD/MM/YYYY dates).
- **FR-007**: System MUST include MYOB prebuilt templates for the Expense module (Purchase/Spend Money format).
- **FR-008**: System MUST include MYOB prebuilt templates for the Invoice module — separate templates for AR (Sales) and AP (Purchases).
- **FR-009**: System MUST include prebuilt leave and expense export templates for HReasily and Swingvy.
- **FR-010**: System MUST review and improve existing BrioHR templates (expense: add vendor, receipt number, approval status, tax, payment method, employee name/ID; leave: add employee name) to match the completeness of new HR templates.
- **FR-011-HR**: System MUST review and improve existing Kakitangan templates (expense: add employee name, email, currency, vendor, status, tax; leave: add employee name, status) to match the completeness of new HR templates.
- **FR-012-HR**: System MUST review and improve existing SQL Payroll templates (expense: add vendor name, receipt/claim number, tax amount; leave: already mostly complete — verify against SQL Payroll import spec) to match the consistent quality bar.
- **FR-011**: The Master Data module MUST support the same export workflow as existing modules: module selection → template selection → filters → preview → execute.
- **FR-012**: The Master Data module MUST be available in scheduled exports (daily/weekly/monthly).
- **FR-013**: Master Data exports MUST respect role-based access control: finance admins see all records; managers and employees see records scoped to their access level.
- **FR-014**: All new prebuilt templates MUST appear in the template browser alongside existing templates, grouped/filterable by target system.
- **FR-015**: MYOB templates MUST enforce DD/MM/YYYY date format as required by MYOB's import specification, regardless of the user's global date format setting.
- **FR-016**: Vendor and Customer exports MUST integrate with existing code mappings — if creditor/debtor codes are mapped, use mapped codes in export output.
- **FR-017**: Chart of accounts templates MUST only include GL account code mappings (not creditor/debtor codes) and display a clear message when no mappings exist.
- **FR-018**: All new export templates MUST be available for cloning into custom templates, allowing users to modify field mappings and formatting.
- **FR-019**: Export history MUST track all new module exports with the same metadata (file size, record count, timestamp, triggered-by) as existing modules.
- **FR-020**: The Master Data module MUST organize templates by sub-type (Vendor/Creditor, Customer/Debtor, Chart of Accounts, Category, Cost Centre, Stock Item) to help users find the right template.

### Key Entities

- **Master Data Module**: A new export module consolidating all reference/master data exports. Sub-types: Vendor/Creditor, Customer/Debtor, Chart of Accounts, Category, Cost Centre, Stock Item. Each sub-type has its own field definitions and templates.
- **Vendor (Creditor)**: A supplier or service provider the business transacts with. Key attributes: name, vendor code, TIN, address (line 1, line 2, city, state, postcode, country), payment terms, bank name, bank account number, contact person, phone, email.
- **Customer (Debtor)**: A buyer or client the business sells to. Key attributes: name, customer code, TIN, BRN (Business Registration Number), address (line 1, line 2, city, state, postcode, country), contact person, phone, email.
- **MYOB Template**: A prebuilt export template configured with MYOB-specific field names, column ordering, and date formatting (DD/MM/YYYY). Covers journal entries, expenses (Spend Money), sales invoices, purchase invoices, and master data (Card/Supplier, Card/Customer).
- **HR System Template**: A prebuilt export template configured for a specific HR platform's import format. Covers leave records and expense claims with system-specific field naming and column ordering.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can export vendor and customer master data to at least 3 ERP formats (SQL Accounting, AutoCount, MYOB) in under 2 minutes from the Master Data module.
- **SC-002**: MYOB users can export accounting journals, expenses, and invoices without manually reformatting — exported files are accepted by MYOB's import function without modification.
- **SC-003**: At least 2 additional SEA HR systems are supported for leave and expense exports beyond the existing BrioHR, Kakitangan, and SQL Payroll templates.
- **SC-004**: Chart of accounts can be exported from the Master Data module and imported into target ERP systems without manual column reordering or reformatting.
- **SC-005**: All new export modules and templates work with scheduled exports — users can automate master data and MYOB exports on daily, weekly, or monthly cadence.
- **SC-006**: Total number of supported export integrations increases from the current ~10 unique systems to 13+ unique systems.
- **SC-007**: Zero regressions in existing export functionality — all current templates, schedules, and history continue working as before, including migrated master-accounting templates.
- **SC-008**: Existing master-accounting templates (creditor, debtor, chart of account, category, cost centre, stock item) are accessible in the Master Data module and no longer appear under the Accounting module.

## Assumptions

- MYOB import format follows the standard MYOB AccountRight/Essentials CSV import specification (publicly documented).
- Vendor data is sourced from existing vendor/creditor records already stored in the system (e.g., from expense claims, AP invoices, or vendor management).
- Customer data is sourced from existing customer/debtor records already stored in the system (e.g., from AR invoices, sales orders, or customer management).
- HReasily and Swingvy are confirmed as the 2 additional HR systems. Existing BrioHR, Kakitangan, and SQL Payroll templates will be reviewed and improved to a consistent quality bar alongside the new additions.
- The existing export engine (flat CSV + hierarchical MASTER/DETAIL) is sufficient for all new templates — no new export format types are needed.
- Code mapping infrastructure already supports the chart of accounts export use case; no new mapping types are needed.
- Migration of existing master-accounting templates to the Master Data module is backward-compatible — template IDs remain unchanged, only the module association changes.
