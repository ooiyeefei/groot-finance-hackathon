/**
 * Pre-built Export Templates
 *
 * Templates for all 4 export modules using the unified export engine.
 * Supports both flat CSV and hierarchical MASTER/DETAIL formats.
 */

import type { PrebuiltTemplate, ExportModule } from "../types";

// ============================================
// EXPENSE EXPORT TEMPLATES
// ============================================

const SQL_PAYROLL_EXPENSE: PrebuiltTemplate = {
  id: "sql-payroll-expense",
  name: "SQL Payroll",
  description: "Export expense claims for SQL Payroll import (Malaysia)",
  module: "expense",
  version: "1.0.0",
  targetSystem: "sql-payroll",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "employee.name", targetColumn: "EMP_NAME", order: 1 },
    { sourceField: "employee.employeeId", targetColumn: "EMP_ID", order: 2 },
    { sourceField: "transactionDate", targetColumn: "CLAIM_DATE", order: 3, dateFormat: "DD/MM/YYYY" },
    { sourceField: "totalAmount", targetColumn: "AMOUNT", order: 4, decimalPlaces: 2 },
    { sourceField: "currency", targetColumn: "CURRENCY", order: 5 },
    { sourceField: "expenseCategory", targetColumn: "CATEGORY", order: 6 },
    { sourceField: "description", targetColumn: "DESCRIPTION", order: 7 },
    { sourceField: "status", targetColumn: "STATUS", order: 8 },
    { sourceField: "approvedAt", targetColumn: "APPROVED_DATE", order: 9, dateFormat: "DD/MM/YYYY" },
  ],
};

const XERO_EXPENSE: PrebuiltTemplate = {
  id: "xero-expense",
  name: "Xero",
  description: "Export expense claims for Xero bill import",
  module: "expense",
  version: "1.0.0",
  targetSystem: "xero",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "vendorName", targetColumn: "*ContactName", order: 1 },
    { sourceField: "transactionDate", targetColumn: "*Date", order: 2, dateFormat: "YYYY-MM-DD" },
    { sourceField: "totalAmount", targetColumn: "*Total", order: 3, decimalPlaces: 2 },
    { sourceField: "description", targetColumn: "Description", order: 4 },
    { sourceField: "referenceNumber", targetColumn: "InvoiceNumber", order: 5 },
    { sourceField: "expenseCategory", targetColumn: "*AccountCode", order: 6 },
  ],
};

const QUICKBOOKS_EXPENSE: PrebuiltTemplate = {
  id: "quickbooks-expense",
  name: "QuickBooks",
  description: "Export expense claims for QuickBooks import",
  module: "expense",
  version: "1.0.0",
  targetSystem: "quickbooks",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "MM/DD/YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "vendorName", targetColumn: "Vendor", order: 1 },
    { sourceField: "transactionDate", targetColumn: "Date", order: 2, dateFormat: "MM/DD/YYYY" },
    { sourceField: "totalAmount", targetColumn: "Amount", order: 3, decimalPlaces: 2 },
    { sourceField: "description", targetColumn: "Memo", order: 4 },
    { sourceField: "expenseCategory", targetColumn: "Account", order: 5 },
  ],
};

const BRIOHR_EXPENSE: PrebuiltTemplate = {
  id: "briohr-expense",
  name: "BrioHR",
  description: "Export expense claims for BrioHR import (MY/SG)",
  module: "expense",
  version: "1.0.0",
  targetSystem: "briohr",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "employee.email", targetColumn: "Email", order: 1 },
    { sourceField: "transactionDate", targetColumn: "ClaimDate", order: 2, dateFormat: "YYYY-MM-DD" },
    { sourceField: "totalAmount", targetColumn: "Amount", order: 3, decimalPlaces: 2 },
    { sourceField: "currency", targetColumn: "Currency", order: 4 },
    { sourceField: "expenseCategory", targetColumn: "Category", order: 5 },
    { sourceField: "description", targetColumn: "Description", order: 6 },
  ],
};

const KAKITANGAN_EXPENSE: PrebuiltTemplate = {
  id: "kakitangan-expense",
  name: "Kakitangan",
  description: "Export expense claims for Kakitangan import (Malaysia)",
  module: "expense",
  version: "1.0.0",
  targetSystem: "kakitangan",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "DD-MM-YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "employee.employeeId", targetColumn: "StaffID", order: 1 },
    { sourceField: "transactionDate", targetColumn: "Date", order: 2, dateFormat: "DD-MM-YYYY" },
    { sourceField: "totalAmount", targetColumn: "Amount", order: 3, decimalPlaces: 2 },
    { sourceField: "expenseCategory", targetColumn: "Type", order: 4 },
    { sourceField: "description", targetColumn: "Remarks", order: 5 },
  ],
};

const GENERIC_EXPENSE: PrebuiltTemplate = {
  id: "generic-expense",
  name: "Generic Export",
  description: "Standard expense export format for any system",
  module: "expense",
  version: "1.0.0",
  targetSystem: "generic",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "employee.name", targetColumn: "Employee Name", order: 1 },
    { sourceField: "employee.employeeId", targetColumn: "Employee ID", order: 2 },
    { sourceField: "employee.email", targetColumn: "Email", order: 3 },
    { sourceField: "employee.department", targetColumn: "Department", order: 4 },
    { sourceField: "transactionDate", targetColumn: "Transaction Date", order: 5, dateFormat: "YYYY-MM-DD" },
    { sourceField: "vendorName", targetColumn: "Vendor", order: 6 },
    { sourceField: "totalAmount", targetColumn: "Amount", order: 7, decimalPlaces: 2 },
    { sourceField: "currency", targetColumn: "Currency", order: 8 },
    { sourceField: "expenseCategory", targetColumn: "Category", order: 9 },
    { sourceField: "businessPurpose", targetColumn: "Business Purpose", order: 10 },
    { sourceField: "description", targetColumn: "Description", order: 11 },
    { sourceField: "referenceNumber", targetColumn: "Reference Number", order: 12 },
    { sourceField: "status", targetColumn: "Status", order: 13 },
    { sourceField: "approver.name", targetColumn: "Approved By", order: 14 },
    { sourceField: "approvedAt", targetColumn: "Approved Date", order: 15, dateFormat: "YYYY-MM-DD" },
  ],
};

// ============================================
// LEAVE EXPORT TEMPLATES
// ============================================

const SQL_PAYROLL_LEAVE: PrebuiltTemplate = {
  id: "sql-payroll-leave",
  name: "SQL Payroll",
  description: "Export leave records for SQL Payroll import (Malaysia)",
  module: "leave",
  version: "1.0.0",
  targetSystem: "sql-payroll",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 1,
  fieldMappings: [
    { sourceField: "employee.name", targetColumn: "EMP_NAME", order: 1 },
    { sourceField: "employee.employeeId", targetColumn: "EMP_ID", order: 2 },
    { sourceField: "leaveType.code", targetColumn: "LEAVE_TYPE", order: 3 },
    { sourceField: "startDate", targetColumn: "START_DATE", order: 4, dateFormat: "DD/MM/YYYY" },
    { sourceField: "endDate", targetColumn: "END_DATE", order: 5, dateFormat: "DD/MM/YYYY" },
    { sourceField: "totalDays", targetColumn: "DAYS", order: 6, decimalPlaces: 1 },
    { sourceField: "status", targetColumn: "STATUS", order: 7 },
    { sourceField: "approvedAt", targetColumn: "APPROVED_DATE", order: 8, dateFormat: "DD/MM/YYYY" },
  ],
};

const BRIOHR_LEAVE: PrebuiltTemplate = {
  id: "briohr-leave",
  name: "BrioHR",
  description: "Export leave records for BrioHR import (MY/SG)",
  module: "leave",
  version: "1.0.0",
  targetSystem: "briohr",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 1,
  fieldMappings: [
    { sourceField: "employee.email", targetColumn: "Email", order: 1 },
    { sourceField: "leaveType.name", targetColumn: "LeaveType", order: 2 },
    { sourceField: "startDate", targetColumn: "StartDate", order: 3, dateFormat: "YYYY-MM-DD" },
    { sourceField: "endDate", targetColumn: "EndDate", order: 4, dateFormat: "YYYY-MM-DD" },
    { sourceField: "totalDays", targetColumn: "Days", order: 5, decimalPlaces: 1 },
    { sourceField: "notes", targetColumn: "Reason", order: 6 },
    { sourceField: "status", targetColumn: "Status", order: 7 },
  ],
};

const KAKITANGAN_LEAVE: PrebuiltTemplate = {
  id: "kakitangan-leave",
  name: "Kakitangan",
  description: "Export leave records for Kakitangan import (Malaysia)",
  module: "leave",
  version: "1.0.0",
  targetSystem: "kakitangan",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "DD-MM-YYYY",
  defaultDecimalPlaces: 1,
  fieldMappings: [
    { sourceField: "employee.employeeId", targetColumn: "StaffID", order: 1 },
    { sourceField: "leaveType.code", targetColumn: "LeaveCode", order: 2 },
    { sourceField: "startDate", targetColumn: "FromDate", order: 3, dateFormat: "DD-MM-YYYY" },
    { sourceField: "endDate", targetColumn: "ToDate", order: 4, dateFormat: "DD-MM-YYYY" },
    { sourceField: "totalDays", targetColumn: "Days", order: 5, decimalPlaces: 1 },
    { sourceField: "notes", targetColumn: "Remarks", order: 6 },
  ],
};

const GENERIC_LEAVE: PrebuiltTemplate = {
  id: "generic-leave",
  name: "Generic Export",
  description: "Standard leave export format for any system",
  module: "leave",
  version: "1.0.0",
  targetSystem: "generic",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 1,
  fieldMappings: [
    { sourceField: "employee.name", targetColumn: "Employee Name", order: 1 },
    { sourceField: "employee.employeeId", targetColumn: "Employee ID", order: 2 },
    { sourceField: "employee.email", targetColumn: "Email", order: 3 },
    { sourceField: "employee.department", targetColumn: "Department", order: 4 },
    { sourceField: "leaveType.name", targetColumn: "Leave Type", order: 5 },
    { sourceField: "leaveType.code", targetColumn: "Leave Code", order: 6 },
    { sourceField: "startDate", targetColumn: "Start Date", order: 7, dateFormat: "YYYY-MM-DD" },
    { sourceField: "endDate", targetColumn: "End Date", order: 8, dateFormat: "YYYY-MM-DD" },
    { sourceField: "totalDays", targetColumn: "Days", order: 9, decimalPlaces: 1 },
    { sourceField: "notes", targetColumn: "Reason", order: 10 },
    { sourceField: "status", targetColumn: "Status", order: 11 },
    { sourceField: "approver.name", targetColumn: "Approved By", order: 12 },
    { sourceField: "approvedAt", targetColumn: "Approved Date", order: 13, dateFormat: "YYYY-MM-DD" },
  ],
};

// ============================================
// ACCOUNTING EXPORT TEMPLATES
// ============================================

/**
 * SQL Accounting GL_JE (Malaysia)
 * Hierarchical MASTER/DETAIL format, semicolon-delimited, .txt extension
 */
const SQL_ACCOUNTING_GL_JE: PrebuiltTemplate = {
  id: "sql-accounting-gl-je",
  name: "SQL Accounting (GL Journal)",
  description: "Export journal entries for SQL Accounting Text Import (GL_JE)",
  module: "accounting",
  version: "1.0.0",
  targetSystem: "sql-accounting",
  formatType: "hierarchical",
  delimiter: ";",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  // fieldMappings not used for hierarchical — masterFields + detailFields instead
  fieldMappings: [],
  masterFields: [
    { sourceField: '"MASTER"', targetColumn: "MASTER", order: 1 },
    { sourceField: "documentNumber", targetColumn: "DOCNO", order: 2 },
    { sourceField: "transactionDate", targetColumn: "DOCDATE", order: 3, dateFormat: "DD/MM/YYYY" },
    { sourceField: "transactionDate", targetColumn: "POSTDATE", order: 4, dateFormat: "DD/MM/YYYY" },
    { sourceField: "description", targetColumn: "DESCRIPTION", order: 5 },
    { sourceField: "cancelled", targetColumn: "CANCELLED", order: 6 },
  ],
  detailFields: [
    { sourceField: '"DETAIL"', targetColumn: "DETAIL", order: 1 },
    { sourceField: "documentNumber", targetColumn: "DOCNO", order: 2 },
    { sourceField: "lineItem.itemCode", targetColumn: "CODE", order: 3 },
    { sourceField: "lineItem.description", targetColumn: "DESCRIPTION", order: 4 },
    { sourceField: "lineItem.reference", targetColumn: "REF", order: 5 },
    { sourceField: "lineItem.project", targetColumn: "PROJECT", order: 6 },
    { sourceField: "lineItem.debitAmount", targetColumn: "DR", order: 7, decimalPlaces: 2 },
    { sourceField: "lineItem.debitLocal", targetColumn: "LOCALDR", order: 8, decimalPlaces: 2 },
    { sourceField: "lineItem.creditAmount", targetColumn: "CR", order: 9, decimalPlaces: 2 },
    { sourceField: "lineItem.creditLocal", targetColumn: "LOCALCR", order: 10, decimalPlaces: 2 },
    { sourceField: "lineItem.taxCode", targetColumn: "TAX", order: 11 },
    { sourceField: "lineItem.taxAmount", targetColumn: "TAXAMT", order: 12, decimalPlaces: 2 },
    { sourceField: "lineItem.taxInclusive", targetColumn: "TAXINCLUSIVE", order: 13 },
    { sourceField: "lineItem.taxRate", targetColumn: "TAXRATE", order: 14 },
  ],
};

/**
 * AutoCount Journal Entry
 * Flat CSV, comma-delimited, case-sensitive headers
 */
const AUTOCOUNT_JOURNAL: PrebuiltTemplate = {
  id: "autocount-journal",
  name: "AutoCount (Journal Entry)",
  description: "Export journal entries for AutoCount import",
  module: "accounting",
  version: "1.0.0",
  targetSystem: "autocount",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "documentNumber", targetColumn: "DocNo", order: 1 },
    { sourceField: "transactionDate", targetColumn: "DocDate", order: 2, dateFormat: "DD/MM/YYYY" },
    { sourceField: "description", targetColumn: "Description", order: 3 },
    { sourceField: "originalCurrency", targetColumn: "CurrencyCode", order: 4 },
    { sourceField: "exchangeRate", targetColumn: "CurrencyRate", order: 5, decimalPlaces: 6 },
    { sourceField: "lineItem.itemCode", targetColumn: "AccNo", order: 6 },
    { sourceField: "lineItem.description", targetColumn: "LineDescription", order: 7 },
    { sourceField: "lineItem.debitAmount", targetColumn: "DR", order: 8, decimalPlaces: 2 },
    { sourceField: "lineItem.creditAmount", targetColumn: "CR", order: 9, decimalPlaces: 2 },
    { sourceField: "lineItem.taxCode", targetColumn: "TaxCode", order: 10 },
  ],
};

/**
 * Generic Accounting Export
 */
const GENERIC_ACCOUNTING: PrebuiltTemplate = {
  id: "generic-accounting",
  name: "Generic Accounting",
  description: "Standard accounting export format for any system",
  module: "accounting",
  version: "1.0.0",
  targetSystem: "generic",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "documentNumber", targetColumn: "Document Number", order: 1 },
    { sourceField: "transactionDate", targetColumn: "Date", order: 2, dateFormat: "YYYY-MM-DD" },
    { sourceField: "description", targetColumn: "Description", order: 3 },
    { sourceField: "transactionType", targetColumn: "Transaction Type", order: 4 },
    { sourceField: "lineItem.itemCode", targetColumn: "Account Code", order: 5 },
    { sourceField: "lineItem.description", targetColumn: "Line Description", order: 6 },
    { sourceField: "lineItem.debitAmount", targetColumn: "Debit", order: 7, decimalPlaces: 2 },
    { sourceField: "lineItem.creditAmount", targetColumn: "Credit", order: 8, decimalPlaces: 2 },
    { sourceField: "originalCurrency", targetColumn: "Currency", order: 9 },
    { sourceField: "exchangeRate", targetColumn: "Exchange Rate", order: 10, decimalPlaces: 6 },
    { sourceField: "lineItem.taxAmount", targetColumn: "Tax Amount", order: 11, decimalPlaces: 2 },
    { sourceField: "vendorName", targetColumn: "Vendor", order: 12 },
  ],
};

// ============================================
// INVOICE EXPORT TEMPLATES
// ============================================

/**
 * SQL Accounting AP_PI (Purchase Invoice)
 * Hierarchical MASTER/DETAIL format for AP invoices
 */
const SQL_ACCOUNTING_AP_PI: PrebuiltTemplate = {
  id: "sql-accounting-ap-pi",
  name: "SQL Accounting (AP Invoice)",
  description: "Export AP invoices for SQL Accounting Text Import (AP_PI)",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "sql-accounting",
  formatType: "hierarchical",
  delimiter: ";",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [],
  masterFields: [
    { sourceField: '"MASTER"', targetColumn: "MASTER", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "DOCNO", order: 2 },
    { sourceField: "invoiceDate", targetColumn: "DOCDATE", order: 3, dateFormat: "DD/MM/YYYY" },
    { sourceField: "invoiceDate", targetColumn: "POSTDATE", order: 4, dateFormat: "DD/MM/YYYY" },
    { sourceField: "entityCode", targetColumn: "CODE", order: 5 },
    { sourceField: "entityName", targetColumn: "COMPANYNAME", order: 6 },
    { sourceField: "description", targetColumn: "DESCRIPTION", order: 7 },
    { sourceField: '"F"', targetColumn: "CANCELLED", order: 8 },
    { sourceField: "totalAmount", targetColumn: "DOCAMT", order: 9, decimalPlaces: 2 },
  ],
  detailFields: [
    { sourceField: '"DETAIL"', targetColumn: "DETAIL", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "DOCNO", order: 2 },
    { sourceField: "lineItem.itemCode", targetColumn: "ITEMCODE", order: 3 },
    { sourceField: "lineItem.description", targetColumn: "DESCRIPTION", order: 4 },
    { sourceField: "lineItem.quantity", targetColumn: "QTY", order: 5, decimalPlaces: 2 },
    { sourceField: "lineItem.unitMeasurement", targetColumn: "UOM", order: 6 },
    { sourceField: "lineItem.unitPrice", targetColumn: "UNITPRICE", order: 7, decimalPlaces: 2 },
    { sourceField: "lineItem.totalAmount", targetColumn: "AMOUNT", order: 8, decimalPlaces: 2 },
    { sourceField: "lineItem.itemCode", targetColumn: "ACCOUNT", order: 9 },
    { sourceField: "lineItem.taxCode", targetColumn: "TAX", order: 10 },
    { sourceField: "lineItem.taxAmount", targetColumn: "TAXAMT", order: 11, decimalPlaces: 2 },
    { sourceField: "lineItem.taxInclusive", targetColumn: "TAXINCLUSIVE", order: 12 },
    { sourceField: "lineItem.taxRate", targetColumn: "TAXRATE", order: 13 },
  ],
};

/**
 * SQL Accounting AR_IV (Sales Invoice)
 * Hierarchical MASTER/DETAIL format for AR invoices
 */
const SQL_ACCOUNTING_AR_IV: PrebuiltTemplate = {
  id: "sql-accounting-ar-iv",
  name: "SQL Accounting (AR Invoice)",
  description: "Export AR invoices for SQL Accounting Text Import (AR_IV)",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "sql-accounting",
  formatType: "hierarchical",
  delimiter: ";",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [],
  masterFields: [
    { sourceField: '"MASTER"', targetColumn: "MASTER", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "DOCNO", order: 2 },
    { sourceField: "invoiceDate", targetColumn: "DOCDATE", order: 3, dateFormat: "DD/MM/YYYY" },
    { sourceField: "invoiceDate", targetColumn: "POSTDATE", order: 4, dateFormat: "DD/MM/YYYY" },
    { sourceField: "entityCode", targetColumn: "CODE", order: 5 },
    { sourceField: "entityName", targetColumn: "COMPANYNAME", order: 6 },
    { sourceField: "description", targetColumn: "DESCRIPTION", order: 7 },
    { sourceField: '"F"', targetColumn: "CANCELLED", order: 8 },
    { sourceField: "totalAmount", targetColumn: "DOCAMT", order: 9, decimalPlaces: 2 },
  ],
  detailFields: [
    { sourceField: '"DETAIL"', targetColumn: "DETAIL", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "DOCNO", order: 2 },
    { sourceField: "lineItem.itemCode", targetColumn: "ITEMCODE", order: 3 },
    { sourceField: "lineItem.description", targetColumn: "DESCRIPTION", order: 4 },
    { sourceField: "lineItem.quantity", targetColumn: "QTY", order: 5, decimalPlaces: 2 },
    { sourceField: "lineItem.unitMeasurement", targetColumn: "UOM", order: 6 },
    { sourceField: "lineItem.unitPrice", targetColumn: "UNITPRICE", order: 7, decimalPlaces: 2 },
    { sourceField: "lineItem.totalAmount", targetColumn: "AMOUNT", order: 8, decimalPlaces: 2 },
    { sourceField: "lineItem.itemCode", targetColumn: "ACCOUNT", order: 9 },
    { sourceField: "lineItem.taxCode", targetColumn: "TAX", order: 10 },
    { sourceField: "lineItem.taxAmount", targetColumn: "TAXAMT", order: 11, decimalPlaces: 2 },
    { sourceField: "lineItem.taxInclusive", targetColumn: "TAXINCLUSIVE", order: 12 },
    { sourceField: "lineItem.taxRate", targetColumn: "TAXRATE", order: 13 },
  ],
};

/**
 * AutoCount Invoice (flat CSV)
 */
const AUTOCOUNT_INVOICE: PrebuiltTemplate = {
  id: "autocount-invoice",
  name: "AutoCount (Invoice)",
  description: "Export invoices for AutoCount import",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "autocount",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "invoiceNumber", targetColumn: "InvoiceNo", order: 1 },
    { sourceField: "invoiceDate", targetColumn: "InvoiceDate", order: 2, dateFormat: "DD/MM/YYYY" },
    { sourceField: "dueDate", targetColumn: "DueDate", order: 3, dateFormat: "DD/MM/YYYY" },
    { sourceField: "entityName", targetColumn: "EntityName", order: 4 },
    { sourceField: "entityCode", targetColumn: "EntityCode", order: 5 },
    { sourceField: "lineItem.description", targetColumn: "Description", order: 6 },
    { sourceField: "lineItem.quantity", targetColumn: "Qty", order: 7, decimalPlaces: 2 },
    { sourceField: "lineItem.unitPrice", targetColumn: "UnitPrice", order: 8, decimalPlaces: 2 },
    { sourceField: "lineItem.totalAmount", targetColumn: "Amount", order: 9, decimalPlaces: 2 },
    { sourceField: "lineItem.taxCode", targetColumn: "TaxCode", order: 10 },
    { sourceField: "lineItem.taxAmount", targetColumn: "TaxAmount", order: 11, decimalPlaces: 2 },
    { sourceField: "currency", targetColumn: "Currency", order: 12 },
  ],
};

/**
 * Generic Invoice Export
 */
const GENERIC_INVOICE: PrebuiltTemplate = {
  id: "generic-invoice",
  name: "Generic Invoice",
  description: "Standard invoice export format for any system",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "generic",
  formatType: "flat",
  delimiter: ",",
  fileExtension: ".csv",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "invoiceType", targetColumn: "Type", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "Invoice Number", order: 2 },
    { sourceField: "invoiceDate", targetColumn: "Invoice Date", order: 3, dateFormat: "YYYY-MM-DD" },
    { sourceField: "dueDate", targetColumn: "Due Date", order: 4, dateFormat: "YYYY-MM-DD" },
    { sourceField: "entityName", targetColumn: "Vendor/Customer", order: 5 },
    { sourceField: "description", targetColumn: "Description", order: 6 },
    { sourceField: "lineItem.description", targetColumn: "Line Description", order: 7 },
    { sourceField: "lineItem.quantity", targetColumn: "Qty", order: 8, decimalPlaces: 2 },
    { sourceField: "lineItem.unitPrice", targetColumn: "Unit Price", order: 9, decimalPlaces: 2 },
    { sourceField: "lineItem.totalAmount", targetColumn: "Line Amount", order: 10, decimalPlaces: 2 },
    { sourceField: "lineItem.taxAmount", targetColumn: "Tax", order: 11, decimalPlaces: 2 },
    { sourceField: "totalAmount", targetColumn: "Total", order: 12, decimalPlaces: 2 },
    { sourceField: "currency", targetColumn: "Currency", order: 13 },
    { sourceField: "status", targetColumn: "Status", order: 14 },
  ],
};

// ============================================
// MASTER ACCOUNTING EXPORT TEMPLATES (001-master-accounting-export)
// ============================================

/**
 * Master Accounting - Purchases Book-Bill (Expense Claims → Creditor Bills)
 * Hierarchical M/D-Item format, pipe-delimited, .txt
 */
const MASTER_ACCOUNTING_PURCHASES_BILL: PrebuiltTemplate = {
  id: "master-accounting-purchases-bill",
  name: "Master Accounting (Purchases Book-Bill)",
  description:
    "Export expense claims as Purchases Book-Bill for Master Accounting import",
  module: "expense",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "hierarchical",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Purchases Book-Bill",
  requiresCodeMapping: true,
  codeMappingTypes: ["account_code", "creditor_code"],
  fieldMappings: [],
  masterFields: [
    { sourceField: '"M"', targetColumn: "RecordType", order: 1 },
    { sourceField: "referenceNumber", targetColumn: "InvoiceCode", order: 2 },
    {
      sourceField: "transactionDate",
      targetColumn: "InvoiceDate",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    { sourceField: "vendorName", targetColumn: "CreditorCode", order: 4 },
    { sourceField: "description", targetColumn: "Description", order: 5 },
    { sourceField: "referenceNumber", targetColumn: "ReferenceNo", order: 6 },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 7,
      decimalPlaces: 2,
    },
    {
      sourceField: "exchangeRate",
      targetColumn: "CurrencyRate",
      order: 8,
      decimalPlaces: 8,
    },
    { sourceField: '""', targetColumn: "TermCode", order: 9 },
    { sourceField: '""', targetColumn: "StaffCode", order: 10 },
    { sourceField: '""', targetColumn: "AreaCode", order: 11 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 12 },
    { sourceField: '""', targetColumn: "JobCode", order: 13 },
    { sourceField: '"N"', targetColumn: "Cancelled", order: 14 },
    { sourceField: '""', targetColumn: "CancelledRemark", order: 15 },
  ],
  detailFields: [
    { sourceField: '"D-Item"', targetColumn: "RecordType", order: 1 },
    {
      sourceField: "lineItem.itemCode",
      targetColumn: "AccountCode",
      order: 2,
    },
    {
      sourceField: "lineItem.description",
      targetColumn: "Description",
      order: 3,
    },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 4 },
    { sourceField: '""', targetColumn: "JobCode", order: 5 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "AmountBeforeGST",
      order: 6,
      decimalPlaces: 2,
    },
    { sourceField: "lineItem.taxCode", targetColumn: "GSTTypeCode", order: 7 },
    {
      sourceField: "lineItem.taxRate",
      targetColumn: "GSTPercent",
      order: 8,
      decimalPlaces: 2,
    },
    { sourceField: '"N"', targetColumn: "GSTInclusive", order: 9 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "TaxableAmount",
      order: 10,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxAmount",
      targetColumn: "GSTAmount",
      order: 11,
      decimalPlaces: 2,
    },
  ],
};

/**
 * Master Accounting - Cash Book-Payment (Paid Expenses → Employee Reimbursements)
 * Hierarchical M/D-Item format, pipe-delimited, .txt
 * Pay To = Employee name (the person being reimbursed, not the vendor)
 * Bank/Cash A/C Code = Company's Master Accounting bank code (from bank_code mapping)
 */
const MASTER_ACCOUNTING_CASHBOOK_PAYMENT: PrebuiltTemplate = {
  id: "master-accounting-cashbook-payment",
  name: "Master Accounting (Cash Book-Payment)",
  description:
    "Export paid expense reimbursements as Cash Book-Payment for Master Accounting import",
  module: "expense",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "hierarchical",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Cash Book-Payment",
  requiresCodeMapping: true,
  codeMappingTypes: ["account_code", "bank_code"],
  fieldMappings: [],
  masterFields: [
    { sourceField: '"M"', targetColumn: "RecordType", order: 1 },
    { sourceField: "referenceNumber", targetColumn: "PaymentCode", order: 2 },
    {
      sourceField: "transactionDate",
      targetColumn: "PaymentDate",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    { sourceField: '""', targetColumn: "PaymentType", order: 4 },
    { sourceField: '""', targetColumn: "BankCashACCode", order: 5 },
    { sourceField: "employee.name", targetColumn: "PayTo", order: 6 },
    { sourceField: "description", targetColumn: "Description", order: 7 },
    { sourceField: '""', targetColumn: "ChequeNo", order: 8 },
    {
      sourceField: "totalAmount",
      targetColumn: "BankCashAmount",
      order: 9,
      decimalPlaces: 2,
    },
    { sourceField: '"1"', targetColumn: "BankCurrencyRate", order: 10 },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 11,
      decimalPlaces: 2,
    },
    { sourceField: '""', targetColumn: "StaffCode", order: 12 },
    { sourceField: '""', targetColumn: "AreaCode", order: 13 },
    { sourceField: '""', targetColumn: "Remark1", order: 14 },
    { sourceField: '""', targetColumn: "Remark2", order: 15 },
    { sourceField: '""', targetColumn: "Remark3", order: 16 },
    { sourceField: '""', targetColumn: "Remark4", order: 17 },
    { sourceField: '""', targetColumn: "Remark5", order: 18 },
    { sourceField: '""', targetColumn: "Remark6", order: 19 },
    { sourceField: '""', targetColumn: "Remark7", order: 20 },
    { sourceField: '""', targetColumn: "Remark8", order: 21 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 22 },
    { sourceField: '""', targetColumn: "JobCode", order: 23 },
    { sourceField: '"N"', targetColumn: "Cancelled", order: 24 },
    { sourceField: '""', targetColumn: "CancelledRemark", order: 25 },
  ],
  detailFields: [
    { sourceField: '"D-Item"', targetColumn: "RecordType", order: 1 },
    {
      sourceField: "lineItem.itemCode",
      targetColumn: "AccountCode",
      order: 2,
    },
    {
      sourceField: "lineItem.description",
      targetColumn: "Description1",
      order: 3,
    },
    { sourceField: '""', targetColumn: "Description2", order: 4 },
    { sourceField: '""', targetColumn: "RefNo1", order: 5 },
    { sourceField: '""', targetColumn: "RefNo2", order: 6 },
    { sourceField: '""', targetColumn: "StaffCode", order: 7 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 8 },
    { sourceField: '""', targetColumn: "JobCode", order: 9 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "AmountBeforeGST",
      order: 10,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxCode",
      targetColumn: "GSTTypeCode",
      order: 11,
    },
    {
      sourceField: "lineItem.taxRate",
      targetColumn: "GSTPercent",
      order: 12,
      decimalPlaces: 2,
    },
    { sourceField: '"N"', targetColumn: "GSTInclusive", order: 13 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "TaxableAmount",
      order: 14,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxAmount",
      targetColumn: "GSTAmount",
      order: 15,
      decimalPlaces: 2,
    },
  ],
};

/**
 * Master Accounting - Sales Book-Invoice (AR Invoices → Debtor Invoices)
 * Hierarchical M/D-Item format, pipe-delimited, .txt
 */
const MASTER_ACCOUNTING_SALES_INVOICE: PrebuiltTemplate = {
  id: "master-accounting-sales-invoice",
  name: "Master Accounting (Sales Book-Invoice)",
  description:
    "Export sales invoices as Sales Book-Invoice for Master Accounting import",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "hierarchical",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Sales Book-Invoice",
  requiresCodeMapping: true,
  codeMappingTypes: ["account_code", "debtor_code"],
  fieldMappings: [],
  masterFields: [
    { sourceField: '"M"', targetColumn: "RecordType", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "InvoiceCode", order: 2 },
    {
      sourceField: "invoiceDate",
      targetColumn: "InvoiceDate",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    { sourceField: "entityCode", targetColumn: "DebtorCode", order: 4 },
    { sourceField: "description", targetColumn: "Description", order: 5 },
    { sourceField: '""', targetColumn: "ReferenceNo", order: 6 },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 7,
      decimalPlaces: 2,
    },
    {
      sourceField: "exchangeRate",
      targetColumn: "CurrencyRate",
      order: 8,
      decimalPlaces: 8,
    },
    { sourceField: '""', targetColumn: "TermCode", order: 9 },
    { sourceField: '""', targetColumn: "StaffCode", order: 10 },
    { sourceField: '""', targetColumn: "AreaCode", order: 11 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 12 },
    { sourceField: '""', targetColumn: "JobCode", order: 13 },
    { sourceField: '"N"', targetColumn: "Cancelled", order: 14 },
    { sourceField: '""', targetColumn: "CancelledRemark", order: 15 },
  ],
  detailFields: [
    { sourceField: '"D-Item"', targetColumn: "RecordType", order: 1 },
    {
      sourceField: "lineItem.itemCode",
      targetColumn: "AccountCode",
      order: 2,
    },
    {
      sourceField: "lineItem.description",
      targetColumn: "Description",
      order: 3,
    },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 4 },
    { sourceField: '""', targetColumn: "JobCode", order: 5 },
    { sourceField: '"N"', targetColumn: "NonSalesItem", order: 6 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "AmountBeforeGST",
      order: 7,
      decimalPlaces: 2,
    },
    { sourceField: "lineItem.taxCode", targetColumn: "GSTTypeCode", order: 8 },
    {
      sourceField: "lineItem.taxRate",
      targetColumn: "GSTPercent",
      order: 9,
      decimalPlaces: 2,
    },
    { sourceField: '"N"', targetColumn: "GSTInclusive", order: 10 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "TaxableAmount",
      order: 11,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxAmount",
      targetColumn: "GSTAmount",
      order: 12,
      decimalPlaces: 2,
    },
  ],
};

/**
 * Master Accounting - Journal Book (Accounting Entries → Journal Vouchers)
 * Hierarchical M/D-Item format, pipe-delimited, .txt
 */
const MASTER_ACCOUNTING_JOURNAL: PrebuiltTemplate = {
  id: "master-accounting-journal",
  name: "Master Accounting (Journal Book)",
  description:
    "Export journal entries as Journal Book for Master Accounting import",
  module: "accounting",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "hierarchical",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Journal Book",
  requiresCodeMapping: true,
  codeMappingTypes: ["account_code"],
  fieldMappings: [],
  masterFields: [
    { sourceField: '"M"', targetColumn: "RecordType", order: 1 },
    { sourceField: "documentNumber", targetColumn: "JournalCode", order: 2 },
    {
      sourceField: "transactionDate",
      targetColumn: "JournalDate",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    { sourceField: '""', targetColumn: "JournalBookType", order: 4 },
    { sourceField: "description", targetColumn: "Description", order: 5 },
    { sourceField: '""', targetColumn: "ReferenceNo", order: 6 },
    { sourceField: '"N"', targetColumn: "Cancelled", order: 7 },
    { sourceField: '""', targetColumn: "CancelledRemark", order: 8 },
  ],
  detailFields: [
    { sourceField: '"D-Item"', targetColumn: "RecordType", order: 1 },
    {
      sourceField: "lineItem.itemCode",
      targetColumn: "AccountCode",
      order: 2,
    },
    {
      sourceField: "lineItem.description",
      targetColumn: "Description1",
      order: 3,
    },
    { sourceField: '""', targetColumn: "Description2", order: 4 },
    { sourceField: '""', targetColumn: "RefNo1", order: 5 },
    { sourceField: '""', targetColumn: "RefNo2", order: 6 },
    {
      sourceField: "lineItem.debitAmount",
      targetColumn: "Debit",
      order: 7,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.creditAmount",
      targetColumn: "Credit",
      order: 8,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.debitLocal",
      targetColumn: "LocalDebit",
      order: 9,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.creditLocal",
      targetColumn: "LocalCredit",
      order: 10,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxCode",
      targetColumn: "GSTTypeCode",
      order: 11,
    },
    {
      sourceField: "lineItem.taxRate",
      targetColumn: "GSTPercent",
      order: 12,
      decimalPlaces: 2,
    },
    { sourceField: '"N"', targetColumn: "GSTInclusive", order: 13 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "TaxableAmount",
      order: 14,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxAmount",
      targetColumn: "GSTAmount",
      order: 15,
      decimalPlaces: 2,
    },
    { sourceField: '""', targetColumn: "StaffAgentCode", order: 16 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 17 },
    { sourceField: '""', targetColumn: "JobCode", order: 18 },
    { sourceField: '"1"', targetColumn: "CurrencyRate", order: 19 },
    { sourceField: '""', targetColumn: "Remark1", order: 20 },
    { sourceField: '""', targetColumn: "Remark2", order: 21 },
  ],
};

/**
 * Master Accounting - Chart of Account (from category glCodes)
 * Flat format, pipe-delimited, no column headers, .txt
 * Exports expense categories as EXP and COGS categories as COS account types
 */
const MASTER_ACCOUNTING_CHART_OF_ACCOUNT: PrebuiltTemplate = {
  id: "master-accounting-chart-of-account",
  name: "Master Accounting (Chart of Account)",
  description:
    "Export expense/COGS categories as Chart of Account for Master Accounting import",
  module: "accounting",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "flat",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Chart of Account",
  includeColumnHeaders: false,
  requiresCodeMapping: false,
  fieldMappings: [
    { sourceField: "glCode", targetColumn: "AccountCode", order: 1 },
    { sourceField: "categoryName", targetColumn: "Description", order: 2 },
    { sourceField: "accountType", targetColumn: "AccountType", order: 3 },
    { sourceField: '"NONE"', targetColumn: "SpecialType", order: 4 },
    { sourceField: "drCr", targetColumn: "DRCR", order: 5 },
    { sourceField: '""', targetColumn: "CostCentreCode", order: 6 },
    { sourceField: '""', targetColumn: "DefaultGSTTypeSupply", order: 7 },
    { sourceField: '""', targetColumn: "DefaultGSTTypePurchase", order: 8 },
    { sourceField: '""', targetColumn: "MSICCode", order: 9 },
    { sourceField: '"MYR"', targetColumn: "CurrencyCode", order: 10 },
    { sourceField: '""', targetColumn: "CustomsTariffServiceType", order: 11 },
  ],
};

/**
 * Master Accounting - Creditor/Supplier (Master Data)
 * Flat format, pipe-delimited, no column headers, .txt
 */
const MASTER_ACCOUNTING_CREDITOR: PrebuiltTemplate = {
  id: "master-accounting-creditor",
  name: "Master Accounting (Creditor/Supplier)",
  description:
    "Export vendors/suppliers for Master Accounting master file import",
  module: "expense",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "flat",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Creditor/Supplier",
  includeColumnHeaders: false,
  requiresCodeMapping: false,
  fieldMappings: [
    { sourceField: "vendorName", targetColumn: "CreditorCode", order: 1 },
    { sourceField: "vendorFullName", targetColumn: "Name", order: 2 },
    { sourceField: "vendorName2", targetColumn: "Name2", order: 3 },
    { sourceField: "registerNo", targetColumn: "RegisterNo", order: 4 },
    { sourceField: "address1", targetColumn: "Address1", order: 5 },
    { sourceField: "address2", targetColumn: "Address2", order: 6 },
    { sourceField: "address3", targetColumn: "Address3", order: 7 },
    { sourceField: "address4", targetColumn: "Address4", order: 8 },
    { sourceField: "city", targetColumn: "City", order: 9 },
    { sourceField: "postalCode", targetColumn: "PostalCode", order: 10 },
    { sourceField: "state", targetColumn: "State", order: 11 },
    { sourceField: "countryCode", targetColumn: "CountryCode", order: 12 },
    { sourceField: "contactPerson", targetColumn: "ContactPerson", order: 13 },
    { sourceField: "phone1", targetColumn: "Phone1", order: 14 },
    { sourceField: "phone2", targetColumn: "Phone2", order: 15 },
    { sourceField: "fax1", targetColumn: "Fax1", order: 16 },
    { sourceField: "fax2", targetColumn: "Fax2", order: 17 },
    { sourceField: "email1", targetColumn: "Email1", order: 18 },
    { sourceField: "email2", targetColumn: "Email2", order: 19 },
    { sourceField: "homePage", targetColumn: "HomePage", order: 20 },
    { sourceField: "businessNature", targetColumn: "BusinessNature", order: 21 },
    { sourceField: '"N"', targetColumn: "Suspended", order: 22 },
    { sourceField: "controlAccountCode", targetColumn: "ControlAccountCode", order: 23 },
    { sourceField: "areaCode", targetColumn: "AreaCode", order: 24 },
    { sourceField: "categoryCode", targetColumn: "CategoryCode", order: 25 },
    { sourceField: "groupCode", targetColumn: "GroupCode", order: 26 },
    { sourceField: "termCode", targetColumn: "TermCode", order: 27 },
    { sourceField: "staffCode", targetColumn: "StaffCode", order: 28 },
    { sourceField: "currencyCode", targetColumn: "CurrencyCode", order: 29 },
    { sourceField: '""', targetColumn: "GSTExemptionNo", order: 30 },
    { sourceField: '""', targetColumn: "GSTExemptionExpiredDate", order: 31 },
    { sourceField: '""', targetColumn: "GSTRegisterNo", order: 32 },
    { sourceField: '""', targetColumn: "LastGSTVerifiedDate", order: 33 },
    { sourceField: '""', targetColumn: "GSTTypeCode", order: 34 },
    { sourceField: '""', targetColumn: "GSTRegisterDate", order: 35 },
    { sourceField: '""', targetColumn: "SelfBillInvoiceApprovalNo", order: 36 },
    { sourceField: '""', targetColumn: "SelfBillInvoiceApprovalDate", order: 37 },
    { sourceField: '""', targetColumn: "SSTCJRegisterNo", order: 38 },
    { sourceField: '""', targetColumn: "SSTCPRegisterNo", order: 39 },
    { sourceField: '""', targetColumn: "TIN", order: 40 },
    {
      sourceField: '"Business Reg. No"',
      targetColumn: "IDType",
      order: 41,
    },
    { sourceField: '""', targetColumn: "MSICCode", order: 42 },
    { sourceField: '""', targetColumn: "TourismTaxRegNo", order: 43 },
  ],
};

/**
 * Master Accounting - Debtor/Customer (Master Data)
 * Flat format, pipe-delimited, no column headers, .txt
 */
const MASTER_ACCOUNTING_DEBTOR: PrebuiltTemplate = {
  id: "master-accounting-debtor",
  name: "Master Accounting (Debtor/Customer)",
  description:
    "Export customers for Master Accounting master file import",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "flat",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Debtor/Customer",
  includeColumnHeaders: false,
  requiresCodeMapping: false,
  fieldMappings: [
    { sourceField: "entityCode", targetColumn: "DebtorCode", order: 1 },
    { sourceField: "entityName", targetColumn: "Name", order: 2 },
    { sourceField: "entityName2", targetColumn: "Name2", order: 3 },
    { sourceField: "registerNo", targetColumn: "RegisterNo", order: 4 },
    { sourceField: "address1", targetColumn: "Address1", order: 5 },
    { sourceField: "address2", targetColumn: "Address2", order: 6 },
    { sourceField: "address3", targetColumn: "Address3", order: 7 },
    { sourceField: "address4", targetColumn: "Address4", order: 8 },
    { sourceField: "city", targetColumn: "City", order: 9 },
    { sourceField: "postalCode", targetColumn: "PostalCode", order: 10 },
    { sourceField: "state", targetColumn: "State", order: 11 },
    { sourceField: "countryCode", targetColumn: "CountryCode", order: 12 },
    { sourceField: "contactPerson", targetColumn: "ContactPerson", order: 13 },
    { sourceField: "contactPersonPosition", targetColumn: "ContactPersonPosition", order: 14 },
    { sourceField: "phone1", targetColumn: "Phone1", order: 15 },
    { sourceField: "phone2", targetColumn: "Phone2", order: 16 },
    { sourceField: "fax1", targetColumn: "Fax1", order: 17 },
    { sourceField: "fax2", targetColumn: "Fax2", order: 18 },
    { sourceField: "email1", targetColumn: "Email1", order: 19 },
    { sourceField: "email2", targetColumn: "Email2", order: 20 },
    { sourceField: "homePage", targetColumn: "HomePage", order: 21 },
    { sourceField: "businessNature", targetColumn: "BusinessNature", order: 22 },
    { sourceField: '"N"', targetColumn: "Suspended", order: 23 },
    { sourceField: "controlAccountCode", targetColumn: "ControlAccountCode", order: 24 },
    { sourceField: "areaCode", targetColumn: "AreaCode", order: 25 },
    { sourceField: "categoryCode", targetColumn: "CategoryCode", order: 26 },
    { sourceField: "groupCode", targetColumn: "GroupCode", order: 27 },
    { sourceField: "termCode", targetColumn: "TermCode", order: 28 },
    { sourceField: '""', targetColumn: "StaffCode1", order: 29 },
    { sourceField: '""', targetColumn: "StaffCode2", order: 30 },
    { sourceField: '"N"', targetColumn: "POS", order: 31 },
    { sourceField: "currencyCode", targetColumn: "CurrencyCode", order: 32 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 33 },
    { sourceField: '"N"', targetColumn: "CashDebtor", order: 34 },
    { sourceField: '""', targetColumn: "GSTExemptionNo", order: 35 },
    { sourceField: '""', targetColumn: "GSTExemptionExpiredDate", order: 36 },
    { sourceField: '""', targetColumn: "GSTRegisterNo", order: 37 },
    { sourceField: '""', targetColumn: "LastGSTVerifiedDate", order: 38 },
    { sourceField: '""', targetColumn: "GSTTypeCode", order: 39 },
    { sourceField: '""', targetColumn: "GSTRegisterDate", order: 40 },
    { sourceField: '""', targetColumn: "SSTCJRegisterNo", order: 41 },
    { sourceField: '""', targetColumn: "SSTCPRegisterNo", order: 42 },
    { sourceField: "tin", targetColumn: "TIN", order: 43 },
    {
      sourceField: '"Business Reg. No"',
      targetColumn: "IDType",
      order: 44,
    },
  ],
};

// ============================================
// NEW MASTER ACCOUNTING TEMPLATES (GAP FILL)
// ============================================

/**
 * Master Accounting - Purchases Book-Bill (AP Invoices → Creditor Bills)
 * Hierarchical M/D-Item format, pipe-delimited, .txt
 * Sources from incoming supplier invoices (invoices table, AP type)
 */
const MASTER_ACCOUNTING_PURCHASES_BILL_AP: PrebuiltTemplate = {
  id: "master-accounting-purchases-bill-ap",
  name: "Master Accounting (Purchases Book-Bill AP)",
  description:
    "Export incoming supplier invoices as Purchases Book-Bill for Master Accounting import",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "hierarchical",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Purchases Book-Bill",
  requiresCodeMapping: true,
  codeMappingTypes: ["account_code", "creditor_code"],
  fieldMappings: [],
  masterFields: [
    { sourceField: '"M"', targetColumn: "RecordType", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "InvoiceCode", order: 2 },
    {
      sourceField: "invoiceDate",
      targetColumn: "InvoiceDate",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    { sourceField: "entityCode", targetColumn: "CreditorCode", order: 4 },
    { sourceField: "description", targetColumn: "Description", order: 5 },
    { sourceField: "invoiceNumber", targetColumn: "ReferenceNo", order: 6 },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 7,
      decimalPlaces: 2,
    },
    {
      sourceField: "exchangeRate",
      targetColumn: "CurrencyRate",
      order: 8,
      decimalPlaces: 8,
    },
    { sourceField: '""', targetColumn: "TermCode", order: 9 },
    { sourceField: '""', targetColumn: "StaffCode", order: 10 },
    { sourceField: '""', targetColumn: "AreaCode", order: 11 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 12 },
    { sourceField: '""', targetColumn: "JobCode", order: 13 },
    { sourceField: '"N"', targetColumn: "Cancelled", order: 14 },
    { sourceField: '""', targetColumn: "CancelledRemark", order: 15 },
  ],
  detailFields: [
    { sourceField: '"D-Item"', targetColumn: "RecordType", order: 1 },
    {
      sourceField: "lineItem.itemCode",
      targetColumn: "AccountCode",
      order: 2,
    },
    {
      sourceField: "lineItem.description",
      targetColumn: "Description",
      order: 3,
    },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 4 },
    { sourceField: '""', targetColumn: "JobCode", order: 5 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "AmountBeforeGST",
      order: 6,
      decimalPlaces: 2,
    },
    { sourceField: "lineItem.taxCode", targetColumn: "GSTTypeCode", order: 7 },
    {
      sourceField: "lineItem.taxRate",
      targetColumn: "GSTPercent",
      order: 8,
      decimalPlaces: 2,
    },
    { sourceField: '"N"', targetColumn: "GSTInclusive", order: 9 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "TaxableAmount",
      order: 10,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxAmount",
      targetColumn: "GSTAmount",
      order: 11,
      decimalPlaces: 2,
    },
  ],
};

/**
 * Master Accounting - Cash Book-Receipt (Customer Payments Received)
 * Hierarchical M/D-Item format, pipe-delimited, .txt
 * Sources from paid sales invoices
 */
const MASTER_ACCOUNTING_CASHBOOK_RECEIPT: PrebuiltTemplate = {
  id: "master-accounting-cashbook-receipt",
  name: "Master Accounting (Cash Book-Receipt)",
  description:
    "Export customer payment receipts as Cash Book-Receipt for Master Accounting import",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "hierarchical",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Cash Book-Receipt",
  requiresCodeMapping: true,
  codeMappingTypes: ["account_code", "bank_code"],
  fieldMappings: [],
  masterFields: [
    { sourceField: '"M"', targetColumn: "RecordType", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "ReceiptCode", order: 2 },
    {
      sourceField: "invoiceDate",
      targetColumn: "ReceiptDate",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    { sourceField: '""', targetColumn: "ReceiptType", order: 4 },
    { sourceField: '""', targetColumn: "BankCashACCode", order: 5 },
    { sourceField: "entityName", targetColumn: "ReceivedFrom", order: 6 },
    { sourceField: "description", targetColumn: "Description", order: 7 },
    { sourceField: '""', targetColumn: "ChequeNo", order: 8 },
    {
      sourceField: "totalAmount",
      targetColumn: "BankCashAmount",
      order: 9,
      decimalPlaces: 2,
    },
    { sourceField: '"1"', targetColumn: "BankCurrencyRate", order: 10 },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 11,
      decimalPlaces: 2,
    },
    { sourceField: '""', targetColumn: "StaffCode", order: 12 },
    { sourceField: '""', targetColumn: "AreaCode", order: 13 },
    { sourceField: '""', targetColumn: "Remark1", order: 14 },
    { sourceField: '""', targetColumn: "Remark2", order: 15 },
    { sourceField: '""', targetColumn: "Remark3", order: 16 },
    { sourceField: '""', targetColumn: "Remark4", order: 17 },
    { sourceField: '""', targetColumn: "Remark5", order: 18 },
    { sourceField: '""', targetColumn: "Remark6", order: 19 },
    { sourceField: '""', targetColumn: "Remark7", order: 20 },
    { sourceField: '""', targetColumn: "Remark8", order: 21 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 22 },
    { sourceField: '""', targetColumn: "JobCode", order: 23 },
    { sourceField: '"N"', targetColumn: "Cancelled", order: 24 },
    { sourceField: '""', targetColumn: "CancelledRemark", order: 25 },
  ],
  detailFields: [
    { sourceField: '"D-Item"', targetColumn: "RecordType", order: 1 },
    {
      sourceField: "lineItem.itemCode",
      targetColumn: "AccountCode",
      order: 2,
    },
    {
      sourceField: "lineItem.description",
      targetColumn: "Description1",
      order: 3,
    },
    { sourceField: '""', targetColumn: "Description2", order: 4 },
    { sourceField: '""', targetColumn: "RefNo1", order: 5 },
    { sourceField: '""', targetColumn: "RefNo2", order: 6 },
    { sourceField: '""', targetColumn: "StaffCode", order: 7 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 8 },
    { sourceField: '""', targetColumn: "JobCode", order: 9 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "AmountBeforeGST",
      order: 10,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxCode",
      targetColumn: "GSTTypeCode",
      order: 11,
    },
    {
      sourceField: "lineItem.taxRate",
      targetColumn: "GSTPercent",
      order: 12,
      decimalPlaces: 2,
    },
    { sourceField: '"N"', targetColumn: "GSTInclusive", order: 13 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "TaxableAmount",
      order: 14,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxAmount",
      targetColumn: "GSTAmount",
      order: 15,
      decimalPlaces: 2,
    },
  ],
};

/**
 * Master Accounting - Sales Book-Credit Note (Voided AR Invoices)
 * Hierarchical M/D-Item format, pipe-delimited, .txt
 * Sources from sales_invoices with status=void
 */
const MASTER_ACCOUNTING_SALES_CREDIT_NOTE: PrebuiltTemplate = {
  id: "master-accounting-sales-credit-note",
  name: "Master Accounting (Sales Book-Credit Note)",
  description:
    "Export voided sales invoices as Sales Book-Credit Note for Master Accounting import",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "hierarchical",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Sales Book-Credit Note",
  requiresCodeMapping: true,
  codeMappingTypes: ["account_code", "debtor_code"],
  fieldMappings: [],
  masterFields: [
    { sourceField: '"M"', targetColumn: "RecordType", order: 1 },
    { sourceField: "invoiceNumber", targetColumn: "DebtorCNCode", order: 2 },
    {
      sourceField: "invoiceDate",
      targetColumn: "DebtorCNDate",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    { sourceField: "entityCode", targetColumn: "DebtorCode", order: 4 },
    { sourceField: "description", targetColumn: "Description", order: 5 },
    { sourceField: '""', targetColumn: "ReferenceNo", order: 6 },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 7,
      decimalPlaces: 2,
    },
    {
      sourceField: "exchangeRate",
      targetColumn: "CurrencyRate",
      order: 8,
      decimalPlaces: 8,
    },
    { sourceField: '""', targetColumn: "StaffCode", order: 9 },
    { sourceField: '""', targetColumn: "AreaCode", order: 10 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 11 },
    { sourceField: '""', targetColumn: "JobCode", order: 12 },
    { sourceField: '"N"', targetColumn: "Cancelled", order: 13 },
    { sourceField: '""', targetColumn: "CancelledRemark", order: 14 },
  ],
  detailFields: [
    { sourceField: '"D-Item"', targetColumn: "RecordType", order: 1 },
    {
      sourceField: "lineItem.itemCode",
      targetColumn: "AccountCode",
      order: 2,
    },
    {
      sourceField: "lineItem.description",
      targetColumn: "Description",
      order: 3,
    },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 4 },
    { sourceField: '""', targetColumn: "JobCode", order: 5 },
    { sourceField: '"N"', targetColumn: "NonSalesItem", order: 6 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "AmountBeforeGST",
      order: 7,
      decimalPlaces: 2,
    },
    { sourceField: "lineItem.taxCode", targetColumn: "GSTTypeCode", order: 8 },
    {
      sourceField: "lineItem.taxRate",
      targetColumn: "GSTPercent",
      order: 9,
      decimalPlaces: 2,
    },
    { sourceField: '"N"', targetColumn: "GSTInclusive", order: 10 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "TaxableAmount",
      order: 11,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxAmount",
      targetColumn: "GSTAmount",
      order: 12,
      decimalPlaces: 2,
    },
    { sourceField: '"Credit Note"', targetColumn: "Reason", order: 13 },
  ],
};

/**
 * Master Accounting - Purchases Book-Debit Note (Expense Claim Reversals)
 * Hierarchical M/D-Item format, pipe-delimited, .txt
 * Sources from rejected/reversed expense claims
 */
const MASTER_ACCOUNTING_PURCHASES_DEBIT_NOTE: PrebuiltTemplate = {
  id: "master-accounting-purchases-debit-note",
  name: "Master Accounting (Purchases Book-Debit Note)",
  description:
    "Export expense claim reversals as Purchases Book-Debit Note for Master Accounting import",
  module: "expense",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "hierarchical",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Purchases Book-Debit Note",
  requiresCodeMapping: true,
  codeMappingTypes: ["account_code", "creditor_code"],
  fieldMappings: [],
  masterFields: [
    { sourceField: '"M"', targetColumn: "RecordType", order: 1 },
    { sourceField: "referenceNumber", targetColumn: "CreditorDNCode", order: 2 },
    {
      sourceField: "transactionDate",
      targetColumn: "CreditorDNDate",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    { sourceField: "vendorName", targetColumn: "CreditorCode", order: 4 },
    { sourceField: "description", targetColumn: "Description", order: 5 },
    { sourceField: "referenceNumber", targetColumn: "ReferenceNo", order: 6 },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 7,
      decimalPlaces: 2,
    },
    {
      sourceField: "exchangeRate",
      targetColumn: "CurrencyRate",
      order: 8,
      decimalPlaces: 8,
    },
    { sourceField: '""', targetColumn: "TermCode", order: 9 },
    { sourceField: '""', targetColumn: "StaffCode", order: 10 },
    { sourceField: '""', targetColumn: "AreaCode", order: 11 },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 12 },
    { sourceField: '""', targetColumn: "JobCode", order: 13 },
    { sourceField: '"N"', targetColumn: "Cancelled", order: 14 },
    { sourceField: '""', targetColumn: "CancelledRemark", order: 15 },
  ],
  detailFields: [
    { sourceField: '"D-Item"', targetColumn: "RecordType", order: 1 },
    {
      sourceField: "lineItem.itemCode",
      targetColumn: "AccountCode",
      order: 2,
    },
    {
      sourceField: "lineItem.description",
      targetColumn: "Description",
      order: 3,
    },
    { sourceField: '""', targetColumn: "DepartmentCode", order: 4 },
    { sourceField: '""', targetColumn: "JobCode", order: 5 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "AmountBeforeGST",
      order: 6,
      decimalPlaces: 2,
    },
    { sourceField: "lineItem.taxCode", targetColumn: "GSTTypeCode", order: 7 },
    {
      sourceField: "lineItem.taxRate",
      targetColumn: "GSTPercent",
      order: 8,
      decimalPlaces: 2,
    },
    { sourceField: '"N"', targetColumn: "GSTInclusive", order: 9 },
    {
      sourceField: "lineItem.totalAmount",
      targetColumn: "TaxableAmount",
      order: 10,
      decimalPlaces: 2,
    },
    {
      sourceField: "lineItem.taxAmount",
      targetColumn: "GSTAmount",
      order: 11,
      decimalPlaces: 2,
    },
    { sourceField: '"Reversal"', targetColumn: "Reason", order: 12 },
  ],
};

/**
 * Master Accounting - Stock Item (Product Catalog → Master Data)
 * Flat format, pipe-delimited, no column headers, .txt
 * Item Code|Description|Item Type|Item Group|UoM|Tax Code|Purchase Tax Code|
 * Base UOM Rate|Ref Cost|Ref Price|Reorder Qty|Reorder Level|Lead Time|Is Active|Stock Control
 */
const MASTER_ACCOUNTING_STOCK_ITEM: PrebuiltTemplate = {
  id: "master-accounting-stock-item",
  name: "Master Accounting (Stock Item)",
  description:
    "Export product catalog as Stock Item master data for Master Accounting import",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "flat",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Stock Item",
  includeColumnHeaders: false,
  requiresCodeMapping: false,
  fieldMappings: [
    { sourceField: "itemCode", targetColumn: "ItemCode", order: 1 },
    { sourceField: "description", targetColumn: "Description", order: 2 },
    { sourceField: '"STOCKITEM"', targetColumn: "ItemType", order: 3 },
    { sourceField: '""', targetColumn: "ItemGroup", order: 4 },
    { sourceField: "unitMeasurement", targetColumn: "UoM", order: 5 },
    { sourceField: "taxCode", targetColumn: "TaxCode", order: 6 },
    { sourceField: '""', targetColumn: "PurchaseTaxCode", order: 7 },
    { sourceField: '"1"', targetColumn: "BaseUOMRate", order: 8 },
    {
      sourceField: "refCost",
      targetColumn: "RefCost",
      order: 9,
      decimalPlaces: 2,
    },
    {
      sourceField: "refPrice",
      targetColumn: "RefPrice",
      order: 10,
      decimalPlaces: 2,
    },
    { sourceField: '"0"', targetColumn: "ReorderQuantity", order: 11 },
    { sourceField: '"0"', targetColumn: "ReorderLevel", order: 12 },
    { sourceField: '"0"', targetColumn: "LeadTime", order: 13 },
    { sourceField: '"Y"', targetColumn: "IsActive", order: 14 },
    { sourceField: '"N"', targetColumn: "StockControl", order: 15 },
  ],
};

/**
 * Master Accounting - Category (Product/Stock Item Categories → Master Data)
 * Flat format, pipe-delimited, no column headers, .txt
 * Category Code|Description
 * Maps to Master Accounting's Category screen (product groupings like CPU, SOFTWARE, SVC)
 */
const MASTER_ACCOUNTING_CATEGORY: PrebuiltTemplate = {
  id: "master-accounting-category",
  name: "Master Accounting (Category)",
  description:
    "Export product categories from catalog items as Category master data for Master Accounting import",
  module: "invoice",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "flat",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Category",
  includeColumnHeaders: false,
  requiresCodeMapping: false,
  fieldMappings: [
    { sourceField: "categoryCode", targetColumn: "CategoryCode", order: 1 },
    { sourceField: "description", targetColumn: "Description", order: 2 },
  ],
};

/**
 * Master Accounting - Cost Centre (Business Departments → Master Data)
 * Flat format, pipe-delimited, no column headers, .txt
 * Cost Centre Code|Description
 */
const MASTER_ACCOUNTING_COST_CENTRE: PrebuiltTemplate = {
  id: "master-accounting-cost-centre",
  name: "Master Accounting (Cost Centre)",
  description:
    "Export business departments as Cost Centre master data for Master Accounting import",
  module: "accounting",
  version: "1.0.0",
  targetSystem: "master-accounting",
  formatType: "flat",
  delimiter: "|",
  fileExtension: ".txt",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  sectionHeader: "Cost Centre",
  includeColumnHeaders: false,
  requiresCodeMapping: false,
  fieldMappings: [
    { sourceField: "costCentreCode", targetColumn: "CostCentreCode", order: 1 },
    { sourceField: "description", targetColumn: "Description", order: 2 },
  ],
};

// ============================================
// TEMPLATE COLLECTIONS
// ============================================

export const EXPENSE_TEMPLATES: PrebuiltTemplate[] = [
  SQL_PAYROLL_EXPENSE,
  XERO_EXPENSE,
  QUICKBOOKS_EXPENSE,
  BRIOHR_EXPENSE,
  KAKITANGAN_EXPENSE,
  GENERIC_EXPENSE,
  MASTER_ACCOUNTING_PURCHASES_BILL,
  MASTER_ACCOUNTING_CASHBOOK_PAYMENT,
  MASTER_ACCOUNTING_CREDITOR,
  MASTER_ACCOUNTING_PURCHASES_DEBIT_NOTE,
];

export const LEAVE_TEMPLATES: PrebuiltTemplate[] = [
  SQL_PAYROLL_LEAVE,
  BRIOHR_LEAVE,
  KAKITANGAN_LEAVE,
  GENERIC_LEAVE,
];

export const ACCOUNTING_TEMPLATES: PrebuiltTemplate[] = [
  SQL_ACCOUNTING_GL_JE,
  AUTOCOUNT_JOURNAL,
  GENERIC_ACCOUNTING,
  MASTER_ACCOUNTING_JOURNAL,
  MASTER_ACCOUNTING_CHART_OF_ACCOUNT,
  MASTER_ACCOUNTING_COST_CENTRE,
];

export const INVOICE_TEMPLATES: PrebuiltTemplate[] = [
  SQL_ACCOUNTING_AP_PI,
  SQL_ACCOUNTING_AR_IV,
  AUTOCOUNT_INVOICE,
  GENERIC_INVOICE,
  MASTER_ACCOUNTING_SALES_INVOICE,
  MASTER_ACCOUNTING_DEBTOR,
  MASTER_ACCOUNTING_PURCHASES_BILL_AP,
  MASTER_ACCOUNTING_CASHBOOK_RECEIPT,
  MASTER_ACCOUNTING_SALES_CREDIT_NOTE,
  MASTER_ACCOUNTING_STOCK_ITEM,
  MASTER_ACCOUNTING_CATEGORY,
];

export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  ...EXPENSE_TEMPLATES,
  ...LEAVE_TEMPLATES,
  ...ACCOUNTING_TEMPLATES,
  ...INVOICE_TEMPLATES,
];

// ============================================
// LOOKUP FUNCTIONS
// ============================================

const TEMPLATES_BY_MODULE: Record<ExportModule, PrebuiltTemplate[]> = {
  expense: EXPENSE_TEMPLATES,
  invoice: INVOICE_TEMPLATES,
  leave: LEAVE_TEMPLATES,
  accounting: ACCOUNTING_TEMPLATES,
};

export function getPrebuiltTemplatesByModule(
  module: ExportModule
): PrebuiltTemplate[] {
  return TEMPLATES_BY_MODULE[module] ?? [];
}

export function getPrebuiltTemplateById(
  id: string
): PrebuiltTemplate | undefined {
  return PREBUILT_TEMPLATES.find((t) => t.id === id);
}

export function getPrebuiltTemplatesBySystem(
  targetSystem: string
): PrebuiltTemplate[] {
  return PREBUILT_TEMPLATES.filter((t) => t.targetSystem === targetSystem);
}
