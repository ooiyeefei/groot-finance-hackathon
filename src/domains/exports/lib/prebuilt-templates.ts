/**
 * Pre-built Export Templates
 *
 * These templates are defined in code and available to all businesses.
 * Users can use them directly or clone them to customize.
 */

import type { PrebuiltTemplate } from "../types";

// ============================================
// EXPENSE EXPORT TEMPLATES
// ============================================

/**
 * SQL Payroll (Malaysia)
 * Format for importing expense reimbursements into SQL Payroll system
 */
const SQL_PAYROLL_EXPENSE: PrebuiltTemplate = {
  id: "sql-payroll-expense",
  name: "SQL Payroll",
  description: "Export expense claims for SQL Payroll import (Malaysia)",
  module: "expense",
  version: "1.0.0",
  targetSystem: "sql-payroll",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "employee.name", targetColumn: "EMP_NAME", order: 1 },
    { sourceField: "employee.employeeId", targetColumn: "EMP_ID", order: 2 },
    {
      sourceField: "transactionDate",
      targetColumn: "CLAIM_DATE",
      order: 3,
      dateFormat: "DD/MM/YYYY",
    },
    {
      sourceField: "totalAmount",
      targetColumn: "AMOUNT",
      order: 4,
      decimalPlaces: 2,
    },
    { sourceField: "currency", targetColumn: "CURRENCY", order: 5 },
    { sourceField: "expenseCategory", targetColumn: "CATEGORY", order: 6 },
    { sourceField: "description", targetColumn: "DESCRIPTION", order: 7 },
    { sourceField: "status", targetColumn: "STATUS", order: 8 },
    {
      sourceField: "approvedAt",
      targetColumn: "APPROVED_DATE",
      order: 9,
      dateFormat: "DD/MM/YYYY",
    },
  ],
};

/**
 * Xero (Universal)
 * Format for importing expense bills into Xero accounting
 */
const XERO_EXPENSE: PrebuiltTemplate = {
  id: "xero-expense",
  name: "Xero",
  description: "Export expense claims for Xero bill import",
  module: "expense",
  version: "1.0.0",
  targetSystem: "xero",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "vendorName", targetColumn: "*ContactName", order: 1 },
    {
      sourceField: "transactionDate",
      targetColumn: "*Date",
      order: 2,
      dateFormat: "YYYY-MM-DD",
    },
    {
      sourceField: "totalAmount",
      targetColumn: "*Total",
      order: 3,
      decimalPlaces: 2,
    },
    { sourceField: "description", targetColumn: "Description", order: 4 },
    {
      sourceField: "referenceNumber",
      targetColumn: "InvoiceNumber",
      order: 5,
    },
    { sourceField: "expenseCategory", targetColumn: "*AccountCode", order: 6 },
  ],
};

/**
 * QuickBooks (Universal)
 * Format for importing expenses into QuickBooks
 */
const QUICKBOOKS_EXPENSE: PrebuiltTemplate = {
  id: "quickbooks-expense",
  name: "QuickBooks",
  description: "Export expense claims for QuickBooks import",
  module: "expense",
  version: "1.0.0",
  targetSystem: "quickbooks",
  defaultDateFormat: "MM/DD/YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "vendorName", targetColumn: "Vendor", order: 1 },
    {
      sourceField: "transactionDate",
      targetColumn: "Date",
      order: 2,
      dateFormat: "MM/DD/YYYY",
    },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 3,
      decimalPlaces: 2,
    },
    { sourceField: "description", targetColumn: "Memo", order: 4 },
    { sourceField: "expenseCategory", targetColumn: "Account", order: 5 },
  ],
};

/**
 * BrioHR (Malaysia/Singapore)
 * Format for importing expense claims into BrioHR HRMS
 */
const BRIOHR_EXPENSE: PrebuiltTemplate = {
  id: "briohr-expense",
  name: "BrioHR",
  description: "Export expense claims for BrioHR import (MY/SG)",
  module: "expense",
  version: "1.0.0",
  targetSystem: "briohr",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "employee.email", targetColumn: "Email", order: 1 },
    {
      sourceField: "transactionDate",
      targetColumn: "ClaimDate",
      order: 2,
      dateFormat: "YYYY-MM-DD",
    },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 3,
      decimalPlaces: 2,
    },
    { sourceField: "currency", targetColumn: "Currency", order: 4 },
    { sourceField: "expenseCategory", targetColumn: "Category", order: 5 },
    { sourceField: "description", targetColumn: "Description", order: 6 },
  ],
};

/**
 * Kakitangan (Malaysia)
 * Format for importing expenses into Kakitangan payroll
 */
const KAKITANGAN_EXPENSE: PrebuiltTemplate = {
  id: "kakitangan-expense",
  name: "Kakitangan",
  description: "Export expense claims for Kakitangan import (Malaysia)",
  module: "expense",
  version: "1.0.0",
  targetSystem: "kakitangan",
  defaultDateFormat: "DD-MM-YYYY",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "employee.employeeId", targetColumn: "StaffID", order: 1 },
    {
      sourceField: "transactionDate",
      targetColumn: "Date",
      order: 2,
      dateFormat: "DD-MM-YYYY",
    },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 3,
      decimalPlaces: 2,
    },
    { sourceField: "expenseCategory", targetColumn: "Type", order: 4 },
    { sourceField: "description", targetColumn: "Remarks", order: 5 },
  ],
};

// ============================================
// LEAVE EXPORT TEMPLATES
// ============================================

/**
 * SQL Payroll Leave (Malaysia)
 * Format for importing leave records into SQL Payroll
 */
const SQL_PAYROLL_LEAVE: PrebuiltTemplate = {
  id: "sql-payroll-leave",
  name: "SQL Payroll",
  description: "Export leave records for SQL Payroll import (Malaysia)",
  module: "leave",
  version: "1.0.0",
  targetSystem: "sql-payroll",
  defaultDateFormat: "DD/MM/YYYY",
  defaultDecimalPlaces: 1,
  fieldMappings: [
    { sourceField: "employee.name", targetColumn: "EMP_NAME", order: 1 },
    { sourceField: "employee.employeeId", targetColumn: "EMP_ID", order: 2 },
    { sourceField: "leaveType.code", targetColumn: "LEAVE_TYPE", order: 3 },
    {
      sourceField: "startDate",
      targetColumn: "START_DATE",
      order: 4,
      dateFormat: "DD/MM/YYYY",
    },
    {
      sourceField: "endDate",
      targetColumn: "END_DATE",
      order: 5,
      dateFormat: "DD/MM/YYYY",
    },
    {
      sourceField: "totalDays",
      targetColumn: "DAYS",
      order: 6,
      decimalPlaces: 1,
    },
    { sourceField: "status", targetColumn: "STATUS", order: 7 },
    {
      sourceField: "approvedAt",
      targetColumn: "APPROVED_DATE",
      order: 8,
      dateFormat: "DD/MM/YYYY",
    },
  ],
};

/**
 * BrioHR Leave (Malaysia/Singapore)
 * Format for importing leave records into BrioHR
 */
const BRIOHR_LEAVE: PrebuiltTemplate = {
  id: "briohr-leave",
  name: "BrioHR",
  description: "Export leave records for BrioHR import (MY/SG)",
  module: "leave",
  version: "1.0.0",
  targetSystem: "briohr",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 1,
  fieldMappings: [
    { sourceField: "employee.email", targetColumn: "Email", order: 1 },
    { sourceField: "leaveType.name", targetColumn: "LeaveType", order: 2 },
    {
      sourceField: "startDate",
      targetColumn: "StartDate",
      order: 3,
      dateFormat: "YYYY-MM-DD",
    },
    {
      sourceField: "endDate",
      targetColumn: "EndDate",
      order: 4,
      dateFormat: "YYYY-MM-DD",
    },
    {
      sourceField: "totalDays",
      targetColumn: "Days",
      order: 5,
      decimalPlaces: 1,
    },
    { sourceField: "notes", targetColumn: "Reason", order: 6 },
    { sourceField: "status", targetColumn: "Status", order: 7 },
  ],
};

/**
 * Kakitangan Leave (Malaysia)
 * Format for importing leave records into Kakitangan
 */
const KAKITANGAN_LEAVE: PrebuiltTemplate = {
  id: "kakitangan-leave",
  name: "Kakitangan",
  description: "Export leave records for Kakitangan import (Malaysia)",
  module: "leave",
  version: "1.0.0",
  targetSystem: "kakitangan",
  defaultDateFormat: "DD-MM-YYYY",
  defaultDecimalPlaces: 1,
  fieldMappings: [
    { sourceField: "employee.employeeId", targetColumn: "StaffID", order: 1 },
    { sourceField: "leaveType.code", targetColumn: "LeaveCode", order: 2 },
    {
      sourceField: "startDate",
      targetColumn: "FromDate",
      order: 3,
      dateFormat: "DD-MM-YYYY",
    },
    {
      sourceField: "endDate",
      targetColumn: "ToDate",
      order: 4,
      dateFormat: "DD-MM-YYYY",
    },
    {
      sourceField: "totalDays",
      targetColumn: "Days",
      order: 5,
      decimalPlaces: 1,
    },
    { sourceField: "notes", targetColumn: "Remarks", order: 6 },
  ],
};

/**
 * Generic Leave Export
 * Universal format for any system
 */
const GENERIC_LEAVE: PrebuiltTemplate = {
  id: "generic-leave",
  name: "Generic Export",
  description: "Standard leave export format for any system",
  module: "leave",
  version: "1.0.0",
  targetSystem: "generic",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 1,
  fieldMappings: [
    { sourceField: "employee.name", targetColumn: "Employee Name", order: 1 },
    {
      sourceField: "employee.employeeId",
      targetColumn: "Employee ID",
      order: 2,
    },
    { sourceField: "employee.email", targetColumn: "Email", order: 3 },
    {
      sourceField: "employee.department",
      targetColumn: "Department",
      order: 4,
    },
    { sourceField: "leaveType.name", targetColumn: "Leave Type", order: 5 },
    { sourceField: "leaveType.code", targetColumn: "Leave Code", order: 6 },
    {
      sourceField: "startDate",
      targetColumn: "Start Date",
      order: 7,
      dateFormat: "YYYY-MM-DD",
    },
    {
      sourceField: "endDate",
      targetColumn: "End Date",
      order: 8,
      dateFormat: "YYYY-MM-DD",
    },
    {
      sourceField: "totalDays",
      targetColumn: "Days",
      order: 9,
      decimalPlaces: 1,
    },
    { sourceField: "notes", targetColumn: "Reason", order: 10 },
    { sourceField: "status", targetColumn: "Status", order: 11 },
    { sourceField: "approver.name", targetColumn: "Approved By", order: 12 },
    {
      sourceField: "approvedAt",
      targetColumn: "Approved Date",
      order: 13,
      dateFormat: "YYYY-MM-DD",
    },
  ],
};

/**
 * Generic Expense Export
 * Universal format for any system
 */
const GENERIC_EXPENSE: PrebuiltTemplate = {
  id: "generic-expense",
  name: "Generic Export",
  description: "Standard expense export format for any system",
  module: "expense",
  version: "1.0.0",
  targetSystem: "generic",
  defaultDateFormat: "YYYY-MM-DD",
  defaultDecimalPlaces: 2,
  fieldMappings: [
    { sourceField: "employee.name", targetColumn: "Employee Name", order: 1 },
    {
      sourceField: "employee.employeeId",
      targetColumn: "Employee ID",
      order: 2,
    },
    { sourceField: "employee.email", targetColumn: "Email", order: 3 },
    {
      sourceField: "employee.department",
      targetColumn: "Department",
      order: 4,
    },
    {
      sourceField: "transactionDate",
      targetColumn: "Transaction Date",
      order: 5,
      dateFormat: "YYYY-MM-DD",
    },
    { sourceField: "vendorName", targetColumn: "Vendor", order: 6 },
    {
      sourceField: "totalAmount",
      targetColumn: "Amount",
      order: 7,
      decimalPlaces: 2,
    },
    { sourceField: "currency", targetColumn: "Currency", order: 8 },
    { sourceField: "expenseCategory", targetColumn: "Category", order: 9 },
    {
      sourceField: "businessPurpose",
      targetColumn: "Business Purpose",
      order: 10,
    },
    { sourceField: "description", targetColumn: "Description", order: 11 },
    {
      sourceField: "referenceNumber",
      targetColumn: "Reference Number",
      order: 12,
    },
    { sourceField: "status", targetColumn: "Status", order: 13 },
    { sourceField: "approver.name", targetColumn: "Approved By", order: 14 },
    {
      sourceField: "approvedAt",
      targetColumn: "Approved Date",
      order: 15,
      dateFormat: "YYYY-MM-DD",
    },
  ],
};

// ============================================
// EXPORTS
// ============================================

/**
 * All pre-built expense templates
 */
export const EXPENSE_TEMPLATES: PrebuiltTemplate[] = [
  SQL_PAYROLL_EXPENSE,
  XERO_EXPENSE,
  QUICKBOOKS_EXPENSE,
  BRIOHR_EXPENSE,
  KAKITANGAN_EXPENSE,
  GENERIC_EXPENSE,
];

/**
 * All pre-built leave templates
 */
export const LEAVE_TEMPLATES: PrebuiltTemplate[] = [
  SQL_PAYROLL_LEAVE,
  BRIOHR_LEAVE,
  KAKITANGAN_LEAVE,
  GENERIC_LEAVE,
];

/**
 * All pre-built templates combined
 */
export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  ...EXPENSE_TEMPLATES,
  ...LEAVE_TEMPLATES,
];

/**
 * Get pre-built templates by module
 */
export function getPrebuiltTemplatesByModule(
  module: "expense" | "leave"
): PrebuiltTemplate[] {
  return module === "expense" ? EXPENSE_TEMPLATES : LEAVE_TEMPLATES;
}

/**
 * Get a pre-built template by ID
 */
export function getPrebuiltTemplateById(
  id: string
): PrebuiltTemplate | undefined {
  return PREBUILT_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get pre-built templates by target system
 */
export function getPrebuiltTemplatesBySystem(
  targetSystem: string
): PrebuiltTemplate[] {
  return PREBUILT_TEMPLATES.filter((t) => t.targetSystem === targetSystem);
}
