/**
 * Field Definitions for CSV Export Templates
 *
 * Defines all available fields for expense and leave exports.
 * These are the source fields that users can map to CSV columns.
 */

import type { FieldDefinition } from "../types";

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
// HELPER FUNCTIONS
// ============================================

/**
 * Get field definitions by module
 */
export function getFieldsByModule(
  module: "expense" | "leave"
): FieldDefinition[] {
  return module === "expense" ? EXPENSE_FIELDS : LEAVE_FIELDS;
}

/**
 * Get a field definition by ID
 */
export function getFieldById(
  module: "expense" | "leave",
  fieldId: string
): FieldDefinition | undefined {
  const fields = getFieldsByModule(module);
  return fields.find((f) => f.id === fieldId);
}

/**
 * Validate that all field IDs exist
 */
export function validateFieldIds(
  module: "expense" | "leave",
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
