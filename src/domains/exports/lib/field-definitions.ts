/**
 * Field Definitions for Export Templates
 *
 * Defines all available fields for all 4 export modules.
 * These are the source fields that users can map to export columns.
 */

import type { FieldDefinition, ExportModule } from "../types";

// ============================================
// EXPENSE CLAIM FIELDS
// ============================================

export const EXPENSE_FIELDS: FieldDefinition[] = [
  // Employee info
  { id: "employee.name", label: "Employee Name", type: "text" },
  { id: "employee.email", label: "Employee Email", type: "text" },
  { id: "employee.employeeId", label: "Employee ID", type: "text" },
  { id: "employee.department", label: "Department", type: "text" },

  // Expense details
  { id: "transactionDate", label: "Transaction Date", type: "date" },
  { id: "vendorName", label: "Vendor Name", type: "text" },
  { id: "totalAmount", label: "Amount", type: "number" },
  { id: "currency", label: "Currency", type: "text" },
  { id: "homeCurrencyAmount", label: "Amount (Home Currency)", type: "number" },
  { id: "exchangeRate", label: "Exchange Rate", type: "number" },

  // Categorization
  { id: "expenseCategory", label: "Category", type: "text" },
  { id: "businessPurpose", label: "Business Purpose", type: "text" },
  { id: "description", label: "Description", type: "text" },
  { id: "referenceNumber", label: "Reference Number", type: "text" },

  // Workflow
  { id: "status", label: "Status", type: "text" },
  { id: "submittedAt", label: "Submitted Date", type: "date" },
  { id: "approvedAt", label: "Approved Date", type: "date" },
  { id: "paidAt", label: "Paid Date", type: "date" },
  { id: "approver.name", label: "Approved By", type: "text" },
  { id: "reviewerNotes", label: "Reviewer Notes", type: "text" },
];

// ============================================
// LEAVE REQUEST FIELDS
// ============================================

export const LEAVE_FIELDS: FieldDefinition[] = [
  // Employee info
  { id: "employee.name", label: "Employee Name", type: "text" },
  { id: "employee.email", label: "Employee Email", type: "text" },
  { id: "employee.employeeId", label: "Employee ID", type: "text" },
  { id: "employee.department", label: "Department", type: "text" },

  // Leave details
  { id: "leaveType.name", label: "Leave Type", type: "text" },
  { id: "leaveType.code", label: "Leave Code", type: "text" },
  { id: "startDate", label: "Start Date", type: "date" },
  { id: "endDate", label: "End Date", type: "date" },
  { id: "totalDays", label: "Days", type: "number" },

  // Request info
  { id: "notes", label: "Reason/Notes", type: "text" },

  // Workflow
  { id: "status", label: "Status", type: "text" },
  { id: "submittedAt", label: "Submitted Date", type: "date" },
  { id: "approvedAt", label: "Approved Date", type: "date" },
  { id: "approver.name", label: "Approved By", type: "text" },
  { id: "approverNotes", label: "Approver Notes", type: "text" },
];

// ============================================
// ACCOUNTING RECORD FIELDS
// ============================================

export const ACCOUNTING_FIELDS: FieldDefinition[] = [
  // Header fields
  { id: "documentNumber", label: "Document Number", type: "text" },
  { id: "transactionDate", label: "Transaction Date", type: "date" },
  { id: "description", label: "Description", type: "text" },
  { id: "transactionType", label: "Transaction Type", type: "text" },
  { id: "sourceType", label: "Source Document Type", type: "text" },
  { id: "vendorName", label: "Vendor Name", type: "text" },
  { id: "category", label: "Category", type: "text" },
  { id: "subcategory", label: "Subcategory", type: "text" },
  { id: "originalAmount", label: "Amount", type: "number" },
  { id: "originalCurrency", label: "Currency", type: "text" },
  { id: "homeCurrencyAmount", label: "Amount (Home Currency)", type: "number" },
  { id: "exchangeRate", label: "Exchange Rate", type: "number" },
  { id: "status", label: "Status", type: "text" },
  { id: "dueDate", label: "Due Date", type: "date" },
  { id: "paymentDate", label: "Payment Date", type: "date" },
  { id: "paymentMethod", label: "Payment Method", type: "text" },
  { id: "notes", label: "Notes", type: "text" },
  { id: "employee.name", label: "Created By", type: "text" },

  // Line item fields
  { id: "lineItem.description", label: "Line Item Description", type: "text" },
  { id: "lineItem.quantity", label: "Line Item Quantity", type: "number" },
  { id: "lineItem.unitPrice", label: "Line Item Unit Price", type: "number" },
  { id: "lineItem.totalAmount", label: "Line Item Amount", type: "number" },
  { id: "lineItem.taxAmount", label: "Line Item Tax", type: "number" },
  { id: "lineItem.taxRate", label: "Line Item Tax Rate", type: "number" },
  { id: "lineItem.itemCode", label: "Line Item Code", type: "text" },
  { id: "lineItem.debitAmount", label: "Debit Amount", type: "number" },
  { id: "lineItem.creditAmount", label: "Credit Amount", type: "number" },
  { id: "lineItem.debitLocal", label: "Debit (Local Currency)", type: "number" },
  { id: "lineItem.creditLocal", label: "Credit (Local Currency)", type: "number" },
];

// ============================================
// INVOICE FIELDS
// ============================================

export const INVOICE_FIELDS: FieldDefinition[] = [
  // Header fields
  { id: "invoiceType", label: "Invoice Type (AP/AR)", type: "text" },
  { id: "invoiceNumber", label: "Invoice Number", type: "text" },
  { id: "invoiceDate", label: "Invoice Date", type: "date" },
  { id: "dueDate", label: "Due Date", type: "date" },
  { id: "entityName", label: "Vendor/Customer Name", type: "text" },
  { id: "entityCode", label: "Vendor/Customer Code", type: "text" },
  { id: "description", label: "Description", type: "text" },
  { id: "subtotal", label: "Subtotal", type: "number" },
  { id: "totalTax", label: "Total Tax", type: "number" },
  { id: "totalAmount", label: "Total Amount", type: "number" },
  { id: "currency", label: "Currency", type: "text" },
  { id: "exchangeRate", label: "Exchange Rate", type: "number" },
  { id: "status", label: "Status", type: "text" },

  // Line item fields
  { id: "lineItem.description", label: "Line Description", type: "text" },
  { id: "lineItem.quantity", label: "Quantity", type: "number" },
  { id: "lineItem.unitPrice", label: "Unit Price", type: "number" },
  { id: "lineItem.totalAmount", label: "Line Amount", type: "number" },
  { id: "lineItem.taxRate", label: "Tax Rate", type: "number" },
  { id: "lineItem.taxAmount", label: "Tax Amount", type: "number" },
  { id: "lineItem.itemCode", label: "Item Code", type: "text" },
];

// ============================================
// MASTER DATA FIELDS (Vendor, Customer, CoA)
// ============================================

export const MASTER_DATA_FIELDS: FieldDefinition[] = [
  // Vendor/Customer shared fields
  { id: "entityCode", label: "Code", type: "text" },
  { id: "entityName", label: "Name", type: "text" },
  { id: "entityName2", label: "Name 2", type: "text" },
  { id: "registerNo", label: "Registration No / TIN", type: "text" },
  { id: "tin", label: "TIN", type: "text" },
  { id: "idType", label: "ID Type", type: "text" },

  // Address fields
  { id: "address1", label: "Address Line 1", type: "text" },
  { id: "address2", label: "Address Line 2", type: "text" },
  { id: "address3", label: "Address Line 3", type: "text" },
  { id: "address4", label: "Address Line 4", type: "text" },
  { id: "city", label: "City", type: "text" },
  { id: "postalCode", label: "Postal Code", type: "text" },
  { id: "state", label: "State", type: "text" },
  { id: "countryCode", label: "Country Code", type: "text" },

  // Contact fields
  { id: "contactPerson", label: "Contact Person", type: "text" },
  { id: "contactPersonPosition", label: "Contact Position", type: "text" },
  { id: "phone1", label: "Phone 1", type: "text" },
  { id: "phone2", label: "Phone 2", type: "text" },
  { id: "fax1", label: "Fax 1", type: "text" },
  { id: "fax2", label: "Fax 2", type: "text" },
  { id: "email1", label: "Email 1", type: "text" },
  { id: "email2", label: "Email 2", type: "text" },
  { id: "homePage", label: "Website", type: "text" },

  // Business details
  { id: "businessNature", label: "Business Nature", type: "text" },
  { id: "suspended", label: "Suspended", type: "text" },
  { id: "controlAccountCode", label: "Control Account", type: "text" },
  { id: "areaCode", label: "Area Code", type: "text" },
  { id: "categoryCode", label: "Category Code", type: "text" },
  { id: "groupCode", label: "Group Code", type: "text" },
  { id: "termCode", label: "Term Code", type: "text" },
  { id: "staffCode", label: "Staff Code", type: "text" },
  { id: "currencyCode", label: "Currency Code", type: "text" },

  // Vendor-specific fields (also used as vendorName for creditor code)
  { id: "vendorName", label: "Vendor Code", type: "text" },
  { id: "vendorFullName", label: "Vendor Full Name", type: "text" },
  { id: "vendorName2", label: "Vendor Name 2", type: "text" },

  // Chart of Accounts fields
  { id: "glCode", label: "GL Account Code", type: "text" },
  { id: "categoryName", label: "Account Name", type: "text" },
  { id: "accountType", label: "Account Type", type: "text" },
  { id: "drCr", label: "Dr/Cr", type: "text" },

  // Stock Item fields
  { id: "itemCode", label: "Item Code", type: "text" },
  { id: "description", label: "Description", type: "text" },
  { id: "unitMeasurement", label: "Unit of Measurement", type: "text" },
  { id: "taxCode", label: "Tax Code", type: "text" },
  { id: "refCost", label: "Reference Cost", type: "number" },
  { id: "refPrice", label: "Reference Price", type: "number" },

  // Cost Centre fields
  { id: "costCentreCode", label: "Cost Centre Code", type: "text" },
];

// ============================================
// FIELD LOOKUP BY MODULE
// ============================================

const FIELDS_BY_MODULE: Record<ExportModule, FieldDefinition[]> = {
  expense: EXPENSE_FIELDS,
  invoice: INVOICE_FIELDS,
  leave: LEAVE_FIELDS,
  accounting: ACCOUNTING_FIELDS,
  "master-data": MASTER_DATA_FIELDS,
};

export function getFieldsByModule(module: ExportModule): FieldDefinition[] {
  return FIELDS_BY_MODULE[module] ?? [];
}

export function getFieldById(
  module: ExportModule,
  fieldId: string
): FieldDefinition | undefined {
  const fields = getFieldsByModule(module);
  return fields.find((f) => f.id === fieldId);
}

export function validateFieldIds(
  module: ExportModule,
  fieldIds: string[]
): { valid: boolean; invalidFields: string[] } {
  const fields = getFieldsByModule(module);
  const validFieldIds = new Set(fields.map((f) => f.id));
  const invalidFields = fieldIds.filter((id) => !validFieldIds.has(id));

  return {
    valid: invalidFields.length === 0,
    invalidFields,
  };
}
