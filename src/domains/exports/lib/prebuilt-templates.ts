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
// TEMPLATE COLLECTIONS
// ============================================

export const EXPENSE_TEMPLATES: PrebuiltTemplate[] = [
  SQL_PAYROLL_EXPENSE,
  XERO_EXPENSE,
  QUICKBOOKS_EXPENSE,
  BRIOHR_EXPENSE,
  KAKITANGAN_EXPENSE,
  GENERIC_EXPENSE,
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
];

export const INVOICE_TEMPLATES: PrebuiltTemplate[] = [
  SQL_ACCOUNTING_AP_PI,
  SQL_ACCOUNTING_AR_IV,
  AUTOCOUNT_INVOICE,
  GENERIC_INVOICE,
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
