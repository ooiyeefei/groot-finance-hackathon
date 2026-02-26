# Feature Specification: Master Accounting Export Integration

**Feature Branch**: `001-master-accounting-export`
**Created**: 2026-02-26
**Status**: Draft
**Input**: User description: "Export expense claims, accounting records, and invoices from Groot Finance to Master Accounting (MasterITEC) software using their pipe-delimited text file import format"

## Context

Master Accounting by MasterITEC is a widely-used accounting and billing software in Malaysia. It supports importing both **Master Files** (reference data like chart of accounts, creditors, debtors) and **Transaction Files** (invoices, bills, journal entries, payments) via pipe-delimited (`|`) text files with specific section headers and record-type prefixes.

Groot Finance already has an export system supporting SQL Accounting, AutoCount, Xero, and QuickBooks. This feature adds Master Accounting as a new export target, enabling SME users to transfer their expense claims, accounting records, and invoices into Master Accounting for bookkeeping and tax compliance.

### Master Accounting Text File Format Key Rules

- **Delimiter**: Pipe character (`|`)
- **File extension**: `.txt`
- **Date format**: `DD/MM/YYYY`
- **Section header**: Each file starts with a section name line (e.g., `Purchases Book-Bill`), followed directly by data rows (no column header row)
- **Record types for transactions**: `M` for master/header rows, `D-Item` for line item detail rows, `D-Match` for payment matching rows
- **Empty fields**: Represented as empty between pipes (e.g., `||`)
- **Boolean fields**: `Y` or `N`
- **Decimal amounts**: Two decimal places for currency (e.g., `250.00`), up to 8 decimal places for exchange rates
- **Currency rate**: `1` for local currency (MYR)
- **ID Type default**: `Business Reg. No`
- **Encoding**: Plain text (no BOM)

## Clarifications

### Session 2026-02-26

- Q: How should users map Groot Finance categories to Master Accounting codes? → A: Inline mapping screen during export flow. Before exporting, the system shows all Groot Finance categories/fields that need Master Accounting codes, with input fields for users to type in their codes. Mappings are persisted per business so subsequent exports auto-fill, but users can edit them.
- Q: When a code field is left empty on the mapping screen, what should happen? → A: Default fallback. Allow a configurable default code per field type (e.g., default Account Code, default Creditor Code) that auto-fills any blanks. Records using the default are highlighted in the export summary.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Export Expense Claims as Purchase Bills (Priority: P1)

As a business owner or finance admin, I want to export my approved/paid expense claims from Groot Finance as Purchases Book-Bill text files that can be imported directly into Master Accounting, so that my bookkeeper can reconcile expenses without manual re-entry.

**Why this priority**: Expense claims are the most frequent transaction type in Groot Finance for Malaysian SMEs. This directly eliminates the double-entry pain point between Groot and their accounting software.

**Independent Test**: Can be fully tested by exporting 5 expense claims and importing the generated .txt file into Master Accounting's "Import Transaction from Text File" function under Creditor > Purchases Book-Bill.

**Acceptance Scenarios**:

1. **Given** the business has 10 approved expense claims with various categories and amounts, **When** the user selects the Master Accounting Purchases Book-Bill export template and clicks Export, **Then** a `.txt` file is generated with one `M` (header) row per expense claim and one `D-Item` row per line item, using pipe delimiters.

2. **Given** an expense claim has multiple line items (e.g., transport RM50, meals RM120), **When** the file is generated, **Then** each line item appears as a separate `D-Item` row beneath its parent `M` row, with the correct account code, description, and amount.

3. **Given** the expense claim includes SST/GST tax information, **When** the file is generated, **Then** the GST Type Code, GST %, Taxable Amount, and GST Amount fields are populated correctly in each `D-Item` row.

4. **Given** the expense claim has a vendor/supplier name, **When** the inline mapping screen appears before export, **Then** the vendor name is listed with an input field for the Master Accounting Creditor Code. If the vendor was previously mapped, the field auto-fills with the saved code.

5. **Given** the exported file is imported into Master Accounting, **When** the user opens Purchases Book-Bill, **Then** all records appear with correct dates (DD/MM/YYYY), amounts, and descriptions matching the original Groot Finance data.

---

### User Story 2 - Export Sales Invoices for Debtor Records (Priority: P2)

As a business owner, I want to export my sales invoices (AR) from Groot Finance as Sales Book-Invoice text files for Master Accounting, so that my revenue and debtor records stay synchronized with my accounting software.

**Why this priority**: Sales invoices drive revenue recognition and debtor tracking. Many SMEs issue invoices in Groot Finance but need them reflected in Master Accounting for financial reporting.

**Independent Test**: Can be fully tested by exporting 3 sales invoices and importing the generated .txt file into Master Accounting's "Import Transaction from Text File" under Debtor > Sales Book-Invoice.

**Acceptance Scenarios**:

1. **Given** the business has outstanding sales invoices, **When** the user selects the Master Accounting Sales Book-Invoice template and exports, **Then** a `.txt` file is generated with `M` rows containing invoice code, date, debtor code, amount, and currency rate, followed by `D-Item` rows for each line item.

2. **Given** a sales invoice has a debtor/customer with a registered business name and TIN, **When** the file is generated, **Then** the Debtor Code field maps to the configured debtor code in Master Accounting.

3. **Given** invoices span multiple currencies, **When** the file is generated, **Then** the Currency Rate field is populated with the correct exchange rate, and amounts reflect the debtor's currency.

---

### User Story 3 - Export Cash Book Payments (Priority: P2)

As a finance admin, I want to export paid expense claims and payment records as Cash Book-Payment text files for Master Accounting, so that cash outflows and bank reconciliation entries are reflected in the accounting software.

**Why this priority**: Many SME expenses are paid directly (petty cash, bank transfer) rather than through AP invoice matching. Cash Book-Payment captures these direct payment flows which are common in day-to-day operations.

**Independent Test**: Can be fully tested by exporting 3 payment records and importing into Master Accounting's GL > Cash Book-Payment.

**Acceptance Scenarios**:

1. **Given** the business has paid expense claims with bank/cash account details, **When** exported as Cash Book-Payment, **Then** each payment generates one `M` row with Payment Code, Date, Bank/Cash A/C Code, Pay To, and Amount, followed by `D-Item` rows for each expense line.

2. **Given** a payment is made in local currency (MYR), **When** the file is generated, **Then** the Bank Currency Rate is `1` and the Bank/Cash Amount equals the Amount.

---

### User Story 4 - Export Accounting Journal Entries (Priority: P3)

As a finance admin, I want to export general journal entries from Groot Finance as Journal Book text files for Master Accounting, so that adjustments, accruals, and reclassifications are properly recorded in the accounting system.

**Why this priority**: Journal entries capture accounting adjustments that don't fit neatly into sales/purchase categories. Important for period-end close and audit compliance, but less frequent than expense/invoice exports.

**Independent Test**: Can be fully tested by exporting 3 journal entries and importing the generated .txt file into Master Accounting's GL > Journal Book.

**Acceptance Scenarios**:

1. **Given** the business has accounting entries with debit and credit lines, **When** the user exports as Journal Book format, **Then** each accounting entry generates one `M` row and multiple `D-Item` rows with Debit/Credit amounts, Local Debit/Credit, and Currency Rate fields correctly populated.

2. **Given** a journal entry has GST implications, **When** the file is generated, **Then** the GST Type Code, GST %, Taxable Amount, and GST Amount fields are populated in the relevant `D-Item` rows.

3. **Given** the total debits equal total credits for each journal entry, **When** the file is imported into Master Accounting, **Then** the journal balances correctly without errors.

---

### User Story 5 - Export Master Data (Chart of Accounts, Creditors, Debtors) (Priority: P3)

As a finance admin setting up Master Accounting for the first time, I want to export reference data (chart of accounts, supplier/creditor list, customer/debtor list) from Groot Finance, so that I can bootstrap Master Accounting with the same master codes before importing transactions.

**Why this priority**: Master data must exist in Master Accounting before transactions can be imported. This is a one-time setup step but critical for successful transaction imports.

**Independent Test**: Can be tested by exporting Chart of Account, Creditor/Supplier, and Debtor/Customer master files and importing them into Master Accounting's "Import Master File from Text File" function.

**Acceptance Scenarios**:

1. **Given** the business has a chart of accounts configured, **When** the user exports as Master Accounting Chart of Account format, **Then** the file contains one row per account with Account Code, Description, Account Type, Special Type, DR/CR, and Currency Code fields.

2. **Given** the business has vendors/suppliers, **When** exported as Creditor/Supplier format, **Then** each vendor row includes Creditor Code, Name, Register No, Address fields, Control Account Code, Currency Code, TIN, and ID Type.

3. **Given** the business has customers, **When** exported as Debtor/Customer format, **Then** each customer row includes Debtor Code, Name, Register No, Address fields, Control Account Code, Currency Code, TIN, and ID Type.

---

### Edge Cases

- What happens when an expense claim has no vendor/supplier mapped to a Master Accounting creditor code? The system uses the configurable default Creditor Code. The export summary highlights which records used defaults so users can verify correctness in Master Accounting.
- What happens when a field value contains the pipe character (`|`)? The system must strip or replace pipe characters in field values to avoid breaking the delimiter structure.
- What happens when text fields exceed Master Accounting's maximum length (e.g., Description > 200 chars)? The system must truncate to the maximum allowed length.
- What happens when an expense claim has no line items? The system should skip records with no line items since Master Accounting requires at least one `D-Item` row per transaction.
- What happens when dates are in ISO format from Groot Finance? The system must convert all dates to DD/MM/YYYY format.
- What happens when the user exports records that have already been exported? The system should allow re-export (idempotent) with a warning that duplicates may be created in Master Accounting.
- What happens when mandatory Master Accounting fields (like Creditor Code or Account Code) are left unmapped and no default code is configured? The record should be excluded from the export with a clear error message listing which records were skipped and why.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate pipe-delimited (`|`) text files with `.txt` extension conforming to Master Accounting's import specifications.
- **FR-002**: System MUST include the correct section header as the first line of each generated file (e.g., `Purchases Book-Bill`, `Sales Book-Invoice`, `Journal Book`, `Cash Book-Payment`).
- **FR-003**: System MUST use `M` as the record type for header/master rows and `D-Item` for detail/line item rows in all transaction files.
- **FR-004**: System MUST format all dates as `DD/MM/YYYY` in the output.
- **FR-005**: System MUST format decimal amounts to 2 decimal places for currency amounts and up to 8 decimal places for exchange rates.
- **FR-006**: System MUST set Currency Rate to `1` for all MYR (local currency) transactions.
- **FR-007**: System MUST populate GST/SST fields (GST Type Code, GST %, GST Inclusive, Taxable Amount, GST Amount) when tax information is available on the source record.
- **FR-008**: System MUST strip or replace pipe characters (`|`) found in any data field values to prevent delimiter corruption.
- **FR-009**: System MUST truncate text fields that exceed Master Accounting's maximum field lengths (Varchar(20) for codes, Varchar(200) for descriptions, Varchar(50) for reference numbers, etc.).
- **FR-010**: System MUST provide export templates for the following Master Accounting import types:
  - **Transactions**: Purchases Book-Bill, Cash Book-Payment, Sales Book-Invoice, Journal Book
  - **Master Files**: Chart of Account, Creditor/Supplier, Debtor/Customer
- **FR-011**: System MUST default the Cancelled field to `N` for all exported records (only active/non-cancelled records should be exported).
- **FR-012**: System MUST default ID Type to `Business Reg. No` when no specific ID type is available on the source record.
- **FR-013**: System MUST default GST Inclusive to `N` unless the source record explicitly indicates GST-inclusive pricing.
- **FR-014**: System MUST present an inline mapping screen during the export flow (after template selection, before export execution) that lists all Groot Finance categories/vendors/customers found in the selected records, with input fields for users to enter the corresponding Master Accounting codes (Account Code, Creditor Code, Debtor Code). Mappings entered are persisted per business so subsequent exports auto-fill previously mapped codes, while still allowing edits.
- **FR-015**: System MUST allow users to configure a default fallback code per field type (default Account Code, default Creditor Code, default Debtor Code) on the inline mapping screen. Any unmapped items use the configured default. Records using defaults are highlighted in the export summary.
- **FR-016**: System MUST validate that mandatory fields (as defined by Master Accounting's spec) are populated — either via explicit mapping, or via default fallback code — before including a record in the export. Records where mandatory fields remain empty (no mapping and no default configured) are excluded with a summary of skipped records shown to the user.
- **FR-017**: System MUST be accessible through the existing Export tab in the application, following the same module selection > template selection > mapping > filter > preview > export workflow.
- **FR-018**: System MUST support date range and status filters consistent with existing export functionality.
- **FR-019**: System MUST generate a preview of the first 10 records before full export, showing the pipe-delimited format.

### Key Entities

- **Export Template (Master Accounting)**: A prebuilt template defining the field mapping from Groot Finance data fields to Master Accounting's pipe-delimited text format, including section header, record types, field order, and formatting rules.
- **Code Mapping (persisted per business)**: A saved mapping between Groot Finance categories/vendors/customers and their corresponding Master Accounting codes (Account Code, Creditor Code, Debtor Code). Populated via the inline mapping screen during export and persisted so subsequent exports auto-fill. Users can edit mappings on each export.

## Assumptions

- Users have an active Master Accounting license and understand their own Chart of Account structure (account codes, creditor codes, debtor codes) in Master Accounting.
- The business operates primarily in MYR (Malaysian Ringgit) as the local currency. Foreign currency transactions will include the appropriate exchange rate.
- Master Accounting's text file import does not validate uniqueness across multiple import sessions. Users are responsible for avoiding duplicate imports.
- The initial release focuses on 4 transaction types (Purchases Book-Bill, Cash Book-Payment, Sales Book-Invoice, Journal Book) and 2 master data types (Creditor/Supplier, Debtor/Customer). Chart of Account export is deferred until Groot Finance has structured chart of accounts management.
- Cash Book-Payment "Pay To" maps to the **employee name** (person being reimbursed), not the vendor. The Bank/Cash A/C Code is the company's Master Accounting bank account code, entered once in the code mapping screen.

## Future Scope (not part of this feature)

- **Payment Recording Feature**: Currently, marking expense claims as "paid" only changes the status. A future feature should track payment execution details (payment method, bank reference, transaction ID, paid-from account, paid-to employee bank account). See GitHub issue.
- **Chart of Accounts Management**: Groot Finance uses free-text categories. A structured chart of accounts with account codes, types, and hierarchy would enable the Chart of Account master data export and improve accounting accuracy across the system.
- **Company Bank Account Settings**: The company's bank account code for Master Accounting could be stored in business settings (alongside existing invoice payment settings) rather than requiring code mapping screen entry each time.
- Groot Finance's existing export infrastructure (export engine, prebuilt templates, field definitions, value extractor) will be extended rather than rebuilt.
- Default SST/Sales Tax rate for Malaysia is 8% (Service Tax) or 10% (Sales Tax) as configured per business.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can export expense claims as Master Accounting Purchases Book-Bill text files and successfully import them into Master Accounting without format errors in under 5 minutes for up to 500 records.
- **SC-002**: Users can export sales invoices as Master Accounting Sales Book-Invoice text files and successfully import them into Master Accounting with all amounts, dates, and references matching the source data.
- **SC-003**: Users can export journal entries as Master Accounting Journal Book text files where total debits equal total credits for every entry, passing Master Accounting's validation on import.
- **SC-004**: Users can export master data (Creditors, Debtors) and import into Master Accounting to set up vendor/customer reference codes in a single session.
- **SC-005**: 95% of exported records pass Master Accounting's import validation on the first attempt (remaining 5% attributed to user-side configuration mismatches like missing prerequisite master codes).
- **SC-006**: Export and download completes within 30 seconds for up to 1,000 transaction records.
- **SC-007**: Zero data corruption incidents - all amounts, dates, and text fields in the exported file match the source data in Groot Finance (verified through spot-check comparison).
