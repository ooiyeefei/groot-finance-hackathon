# Data Model: Export System v2

**Branch**: `001-accounting-records-export` | **Date**: 2026-02-24

## Schema Changes

### 1. Expand `exportModuleValidator`

**Current**: `"expense" | "leave"`
**New**: `"expense" | "invoice" | "leave" | "accounting"`

Affects tables: `export_templates`, `export_schedules` (via template reference), `export_history`.

### 2. No Changes to Source Tables

The following tables are **read-only** from the export system's perspective — no schema changes needed:
- `accounting_entries` (+ embedded `lineItems`)
- `invoices` (AP)
- `sales_invoices` (AR)
- `expense_claims`
- `leave_requests`
- `vendors`
- `users`

## Entity Definitions

### ExportModule (Enum)

| Value | Description | Data Source Table(s) |
|-------|-------------|---------------------|
| `expense` | Expense claims at all statuses | `expense_claims` |
| `invoice` | AP + AR invoices at all stages | `invoices` (AP), `sales_invoices` (AR) |
| `leave` | Leave requests at all statuses | `leave_requests` |
| `accounting` | Posted journal entries only | `accounting_entries` |

### ExportFormatType (New Concept)

| Value | Description | Delimiter | File Extension |
|-------|-------------|-----------|----------------|
| `flat` | One row per record/line item with repeated header fields | `,` (comma) | `.csv` |
| `hierarchical` | MASTER row + DETAIL rows per entry | `;` (semicolon) | `.txt` |

### PrebuiltTemplate (Code-Defined)

Extended with new modules and format types.

```
PrebuiltTemplate {
  id: string                    // Unique identifier
  name: string                  // Display name
  description: string           // User-facing description
  module: ExportModule          // Which module this template serves
  version: string               // Semantic version
  targetSystem: string          // Target software identifier
  formatType: ExportFormatType  // NEW: "flat" or "hierarchical"
  delimiter: string             // NEW: "," or ";"
  fileExtension: string         // NEW: ".csv" or ".txt"
  defaultDateFormat: string
  defaultDecimalPlaces: number
  fieldMappings: FieldMapping[]
  // For hierarchical format only:
  masterFields?: FieldMapping[] // NEW: MASTER row field mappings
  detailFields?: FieldMapping[] // NEW: DETAIL row field mappings
}
```

### Pre-built Template Registry (New)

**Accounting Records Module:**

| Template ID | Name | Target System | Format | Fields |
|-------------|------|---------------|--------|--------|
| `sql-accounting-gl-je` | SQL Accounting (GL Journal) | sql-accounting | hierarchical | MASTER: 5, DETAIL: 15 |
| `autocount-journal` | AutoCount (Journal Entry) | autocount | flat | 10 |
| `generic-accounting` | Generic Accounting | generic | flat | ~12 |

**Invoices Module:**

| Template ID | Name | Target System | Format | Fields |
|-------------|------|---------------|--------|--------|
| `sql-accounting-ap-pi` | SQL Accounting (AP Invoice) | sql-accounting | hierarchical | MASTER: ~20, DETAIL: ~15 |
| `sql-accounting-ar-iv` | SQL Accounting (AR Invoice) | sql-accounting | hierarchical | MASTER: ~20, DETAIL: ~15 |
| `autocount-invoice` | AutoCount (Invoice) | autocount | flat | ~12 |
| `generic-invoice` | Generic Invoice | generic | flat | ~15 |

**Expense Claims Module (Rebuilt):**

| Template ID | Name | Target System | Format | Fields |
|-------------|------|---------------|--------|--------|
| `sql-payroll-expense` | SQL Payroll | sql-payroll | flat | 9 |
| `xero-expense` | Xero | xero | flat | 6 |
| `quickbooks-expense` | QuickBooks | quickbooks | flat | 5 |
| `briohr-expense` | BrioHR | briohr | flat | 6 |
| `kakitangan-expense` | Kakitangan | kakitangan | flat | 5 |
| `generic-expense` | Generic Export | generic | flat | 15 |

**Leave Records Module (Rebuilt):**

| Template ID | Name | Target System | Format | Fields |
|-------------|------|---------------|--------|--------|
| `sql-payroll-leave` | SQL Payroll | sql-payroll | flat | 8 |
| `briohr-leave` | BrioHR | briohr | flat | 6 |
| `kakitangan-leave` | Kakitangan | kakitangan | flat | 5 |
| `generic-leave` | Generic Export | generic | flat | 15 |

### Accounting Record Export Shape (Derived at Export Time)

For journal entry export, each `accounting_entry` is transformed into:

```
AccountingExportRecord {
  // Header fields (from accounting_entries)
  documentNumber: string          // referenceNumber or generated
  documentDate: string            // transactionDate (ISO)
  postDate: string                // transactionDate (ISO, same as docDate)
  description: string             // description
  cancelled: boolean              // status === "cancelled"
  currency: string                // originalCurrency
  exchangeRate: number            // exchangeRate || 1.0
  transactionType: string         // "Expense" | "Income" | "Cost of Goods Sold"
  sourceType: string              // sourceDocumentType
  vendorName: string              // vendorName
  status: string                  // status

  // Journal lines (derived from lineItems)
  journalLines: JournalLine[]
}

JournalLine {
  accountCode: string             // itemCode || "" (user fills in target system)
  description: string             // itemDescription
  reference: string               // parent referenceNumber
  project: string                 // "" (no project field currently)
  debitAmount: number             // Derived from transactionType + totalAmount
  debitLocal: number              // debitAmount * exchangeRate
  creditAmount: number            // Derived (0 if debit line, or balancing amount)
  creditLocal: number             // creditAmount * exchangeRate
  taxCode: string                 // "" (no tax code on line items currently)
  taxAmount: number               // taxAmount || 0
  taxInclusive: boolean           // false (default)
  taxRate: string                 // taxRate as string || ""
  currency: string                // currency
}
```

**Derivation logic for DR/CR:**
- For `Expense` / `Cost of Goods Sold` entries:
  - Each line item → DEBIT line (DR = totalAmount, CR = 0)
  - One generated balancing line → CREDIT line (DR = 0, CR = sum of all line totals)
- For `Income` entries:
  - Each line item → CREDIT line (DR = 0, CR = totalAmount)
  - One generated balancing line → DEBIT line (DR = sum of all line totals, CR = 0)

### Invoice Export Shape (Normalized from Two Tables)

```
InvoiceExportRecord {
  // Common fields (normalized from invoices + sales_invoices)
  invoiceType: "AP" | "AR"
  invoiceNumber: string
  invoiceDate: string              // ISO date
  dueDate: string                  // ISO date
  entityName: string               // vendorName (AP) or customerSnapshot.businessName (AR)
  entityCode: string               // vendor.supplierCode (AP) or customer.taxId (AR)
  description: string
  subtotal: number
  totalTax: number
  totalAmount: number
  currency: string
  exchangeRate: number
  status: string
  sentAt: number | null
  paidAt: string | null

  // Line items
  lineItems: InvoiceLineItem[]
}

InvoiceLineItem {
  lineOrder: number
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
  currency: string
  taxRate: number
  taxAmount: number
  itemCode: string
  unitMeasurement: string
}
```

### Field Definitions (New Modules)

**Accounting Records Fields:**

| Field ID | Label | Type | Source |
|----------|-------|------|--------|
| `documentNumber` | Document Number | text | referenceNumber |
| `transactionDate` | Transaction Date | date | transactionDate |
| `description` | Description | text | description |
| `transactionType` | Transaction Type | text | transactionType |
| `sourceType` | Source Document Type | text | sourceDocumentType |
| `vendorName` | Vendor Name | text | vendorName |
| `category` | Category | text | category |
| `subcategory` | Subcategory | text | subcategory |
| `originalAmount` | Amount | number | originalAmount |
| `originalCurrency` | Currency | text | originalCurrency |
| `homeCurrencyAmount` | Amount (Home Currency) | number | homeCurrencyAmount |
| `exchangeRate` | Exchange Rate | number | exchangeRate |
| `status` | Status | text | status |
| `dueDate` | Due Date | date | dueDate |
| `paymentDate` | Payment Date | date | paymentDate |
| `paymentMethod` | Payment Method | text | paymentMethod |
| `notes` | Notes | text | notes |
| `lineItem.description` | Line Item Description | text | lineItems[].itemDescription |
| `lineItem.quantity` | Line Item Quantity | number | lineItems[].quantity |
| `lineItem.unitPrice` | Line Item Unit Price | number | lineItems[].unitPrice |
| `lineItem.totalAmount` | Line Item Amount | number | lineItems[].totalAmount |
| `lineItem.taxAmount` | Line Item Tax | number | lineItems[].taxAmount |
| `lineItem.taxRate` | Line Item Tax Rate | number | lineItems[].taxRate |
| `lineItem.itemCode` | Line Item Code | text | lineItems[].itemCode |
| `lineItem.debitAmount` | Debit Amount | number | derived |
| `lineItem.creditAmount` | Credit Amount | number | derived |
| `lineItem.debitLocal` | Debit (Local Currency) | number | derived |
| `lineItem.creditLocal` | Credit (Local Currency) | number | derived |
| `employee.name` | Created By | text | enriched from users |

**Invoice Fields:**

| Field ID | Label | Type | Source |
|----------|-------|------|--------|
| `invoiceType` | Invoice Type (AP/AR) | text | derived |
| `invoiceNumber` | Invoice Number | text | normalized |
| `invoiceDate` | Invoice Date | date | normalized |
| `dueDate` | Due Date | date | normalized |
| `entityName` | Vendor/Customer Name | text | normalized |
| `entityCode` | Vendor/Customer Code | text | normalized |
| `description` | Description | text | normalized |
| `subtotal` | Subtotal | number | normalized |
| `totalTax` | Total Tax | number | normalized |
| `totalAmount` | Total Amount | number | normalized |
| `currency` | Currency | text | normalized |
| `exchangeRate` | Exchange Rate | number | normalized |
| `status` | Status | text | normalized |
| `lineItem.description` | Line Description | text | lineItems[] |
| `lineItem.quantity` | Quantity | number | lineItems[] |
| `lineItem.unitPrice` | Unit Price | number | lineItems[] |
| `lineItem.totalAmount` | Line Amount | number | lineItems[] |
| `lineItem.taxRate` | Tax Rate | number | lineItems[] |
| `lineItem.taxAmount` | Tax Amount | number | lineItems[] |
| `lineItem.itemCode` | Item Code | text | lineItems[] |

## SQL Accounting GL_JE Template Specification

### MASTER Row Fields

| Order | Target Column | Source Field | Format | Required |
|-------|--------------|-------------|--------|----------|
| 1 | `MASTER` | literal "MASTER" | text | Yes |
| 2 | `DOCNO` | documentNumber | text (max 20) | Yes |
| 3 | `DOCDATE` | transactionDate | DD/MM/YYYY | Yes |
| 4 | `POSTDATE` | transactionDate | DD/MM/YYYY | Yes |
| 5 | `DESCRIPTION` | description | text (max 150) | Yes |
| 6 | `CANCELLED` | cancelled ? "T" : "F" | text | Yes |

### DETAIL Row Fields

| Order | Target Column | Source Field | Format | Required |
|-------|--------------|-------------|--------|----------|
| 1 | `DETAIL` | literal "DETAIL" | text | Yes |
| 2 | `DOCNO` | documentNumber | text (max 20) | Yes |
| 3 | `CODE` | lineItem.itemCode or "" | text (max 10) | Yes |
| 4 | `DESCRIPTION` | lineItem.description | text (max 80) | Yes |
| 5 | `REF` | referenceNumber or "" | text (max 25) | No |
| 6 | `PROJECT` | "" | text (max 20) | Yes |
| 7 | `DR` | lineItem.debitAmount | decimal 2dp | Yes |
| 8 | `LOCALDR` | lineItem.debitLocal | decimal 2dp | Yes |
| 9 | `CR` | lineItem.creditAmount | decimal 2dp | Yes |
| 10 | `LOCALCR` | lineItem.creditLocal | decimal 2dp | Yes |
| 11 | `TAX` | "" | text (max 10) | No |
| 12 | `TAXAMT` | lineItem.taxAmount | decimal 2dp | Yes |
| 13 | `TAXINCLUSIVE` | 0 | integer | Yes |
| 14 | `TAXRATE` | lineItem.taxRate or "" | text | No |
| 15 | `TARIFF` | "" | text | Conditional |

**Delimiter**: `;` (semicolon)
**File extension**: `.txt`
**Encoding**: UTF-8

## AutoCount Journal Entry Template Specification

| Order | Target Column | Source Field | Format |
|-------|--------------|-------------|--------|
| 1 | `DocNo` | documentNumber | text |
| 2 | `DocDate` | transactionDate | DD/MM/YYYY |
| 3 | `Description` | description | text |
| 4 | `CurrencyCode` | originalCurrency | text |
| 5 | `CurrencyRate` | exchangeRate | decimal |
| 6 | `AccNo` | lineItem.itemCode or "" | text |
| 7 | `LineDescription` | lineItem.description | text |
| 8 | `DR` | lineItem.debitAmount | decimal 2dp |
| 9 | `CR` | lineItem.creditAmount | decimal 2dp |
| 10 | `TaxCode` | "" | text |

**Delimiter**: `,` (comma)
**File extension**: `.csv`
**Encoding**: UTF-8

## State Transitions

### Export History Lifecycle
```
Created (status: "processing")
  → Completed (storageId set, recordCount, fileSize)
  → Failed (errorMessage set)
  → Archived (after 90 days, storageId cleared)
```

No changes from current behavior.
