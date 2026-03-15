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
// FIELD LOOKUP BY MODULE
// ============================================

const FIELDS_BY_MODULE: Record<ExportModule, FieldDefinition[]> = {
  expense: EXPENSE_FIELDS,
  invoice: INVOICE_FIELDS,
  leave: LEAVE_FIELDS,
  accounting: ACCOUNTING_FIELDS,
  "master-data": [],  // No field definitions yet for master-data exports
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
