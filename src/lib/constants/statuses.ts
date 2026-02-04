/**
 * Status Constants - Single Source of Truth
 *
 * Platform-agnostic status definitions used across the application.
 * These constants are pure TypeScript with no external dependencies.
 *
 * Convex schema validators import FROM this file, making it easy to
 * migrate to a different database in the future.
 */

// ============================================
// EXPENSE CLAIMS STATUSES
// ============================================

export const EXPENSE_CLAIM_STATUSES = {
  // Workflow states
  DRAFT: "draft",
  PENDING: "pending",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  REIMBURSED: "reimbursed",
  // Processing states (used by Trigger.dev pipeline)
  UPLOADING: "uploading",
  CLASSIFYING: "classifying",
  ANALYZING: "analyzing",
  EXTRACTING: "extracting",
  PROCESSING: "processing",
  COMPLETED: "completed",
  // Error states
  FAILED: "failed",
  CLASSIFICATION_FAILED: "classification_failed",
  CANCELLED: "cancelled",
} as const;

export type ExpenseClaimStatus = typeof EXPENSE_CLAIM_STATUSES[keyof typeof EXPENSE_CLAIM_STATUSES];
export const EXPENSE_CLAIM_STATUS_VALUES = Object.values(EXPENSE_CLAIM_STATUSES);

// ============================================
// INVOICE STATUSES
// ============================================

export const INVOICE_STATUSES = {
  // Processing states
  PENDING: "pending",
  UPLOADING: "uploading",
  ANALYZING: "analyzing",
  CLASSIFYING: "classifying",
  EXTRACTING: "extracting",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  // Payment states
  PAID: "paid",
  OVERDUE: "overdue",
  DISPUTED: "disputed",
  // Classification error
  CLASSIFICATION_FAILED: "classification_failed",
} as const;

export type InvoiceStatus = typeof INVOICE_STATUSES[keyof typeof INVOICE_STATUSES];
export const INVOICE_STATUS_VALUES = Object.values(INVOICE_STATUSES);

// ============================================
// ACCOUNTING ENTRY STATUSES
// ============================================

export const ACCOUNTING_ENTRY_STATUSES = {
  PENDING: "pending",
  PAID: "paid",
  CANCELLED: "cancelled",
  OVERDUE: "overdue",
  DISPUTED: "disputed",
} as const;

export type AccountingEntryStatus = typeof ACCOUNTING_ENTRY_STATUSES[keyof typeof ACCOUNTING_ENTRY_STATUSES];
export const ACCOUNTING_ENTRY_STATUS_VALUES = Object.values(ACCOUNTING_ENTRY_STATUSES);

// ============================================
// ACCOUNTING ENTRY TYPES
// ============================================

export const TRANSACTION_TYPES = {
  INCOME: "Income",
  COGS: "Cost of Goods Sold",
  EXPENSE: "Expense",
} as const;

export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];
export const TRANSACTION_TYPE_VALUES = Object.values(TRANSACTION_TYPES);

// ============================================
// BUSINESS MEMBERSHIP ROLES
// ============================================

export const MEMBERSHIP_ROLES = {
  OWNER: "owner",
  FINANCE_ADMIN: "finance_admin",
  MANAGER: "manager",
  EMPLOYEE: "employee",
} as const;

export type MembershipRole = typeof MEMBERSHIP_ROLES[keyof typeof MEMBERSHIP_ROLES];
export const MEMBERSHIP_ROLE_VALUES = Object.values(MEMBERSHIP_ROLES);

// ============================================
// BUSINESS MEMBERSHIP STATUSES
// ============================================

export const MEMBERSHIP_STATUSES = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  PENDING: "pending",
} as const;

export type MembershipStatus = typeof MEMBERSHIP_STATUSES[keyof typeof MEMBERSHIP_STATUSES];
export const MEMBERSHIP_STATUS_VALUES = Object.values(MEMBERSHIP_STATUSES);

// ============================================
// MESSAGE ROLES (Chat)
// ============================================

export const MESSAGE_ROLES = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;

export type MessageRole = typeof MESSAGE_ROLES[keyof typeof MESSAGE_ROLES];
export const MESSAGE_ROLE_VALUES = Object.values(MESSAGE_ROLES);

// ============================================
// SOURCE DOCUMENT TYPES
// ============================================

export const SOURCE_DOCUMENT_TYPES = {
  EXPENSE_CLAIM: "expense_claim",
  INVOICE: "invoice",
  MANUAL: "manual",
} as const;

export type SourceDocumentType = typeof SOURCE_DOCUMENT_TYPES[keyof typeof SOURCE_DOCUMENT_TYPES];
export const SOURCE_DOCUMENT_TYPE_VALUES = Object.values(SOURCE_DOCUMENT_TYPES);

// ============================================
// CREATED BY METHODS
// ============================================

export const CREATED_BY_METHODS = {
  MANUAL: "manual",
  OCR: "ocr",
  IMPORT: "import",
  API: "api",
  DOCUMENT_EXTRACT: "document_extract",
} as const;

export type CreatedByMethod = typeof CREATED_BY_METHODS[keyof typeof CREATED_BY_METHODS];
export const CREATED_BY_METHOD_VALUES = Object.values(CREATED_BY_METHODS);

// ============================================
// FEEDBACK TYPES
// ============================================

export const FEEDBACK_TYPES = {
  BUG: "bug",
  FEATURE: "feature",
  GENERAL: "general",
} as const;

export type FeedbackType = typeof FEEDBACK_TYPES[keyof typeof FEEDBACK_TYPES];
export const FEEDBACK_TYPE_VALUES = Object.values(FEEDBACK_TYPES);

// ============================================
// FEEDBACK STATUSES
// ============================================

export const FEEDBACK_STATUSES = {
  NEW: "new",
  REVIEWED: "reviewed",
  RESOLVED: "resolved",
} as const;

export type FeedbackStatus = typeof FEEDBACK_STATUSES[keyof typeof FEEDBACK_STATUSES];
export const FEEDBACK_STATUS_VALUES = Object.values(FEEDBACK_STATUSES);

// ============================================
// VENDOR STATUSES
// ============================================

export const VENDOR_STATUSES = {
  PROSPECTIVE: "prospective",  // Created from OCR/extraction, no confirmed transactions yet
  ACTIVE: "active",            // Has at least one confirmed accounting entry
  INACTIVE: "inactive",        // Manually deactivated by user
} as const;

export type VendorStatus = typeof VENDOR_STATUSES[keyof typeof VENDOR_STATUSES];
export const VENDOR_STATUS_VALUES = Object.values(VENDOR_STATUSES);

// ============================================
// LEAVE REQUEST STATUSES
// ============================================

export const LEAVE_REQUEST_STATUSES = {
  DRAFT: "draft",           // Employee editing, not submitted
  SUBMITTED: "submitted",   // Pending manager approval
  APPROVED: "approved",     // Manager approved, balance deducted
  REJECTED: "rejected",     // Manager rejected
  CANCELLED: "cancelled",   // Employee cancelled
} as const;

export type LeaveRequestStatus = typeof LEAVE_REQUEST_STATUSES[keyof typeof LEAVE_REQUEST_STATUSES];
export const LEAVE_REQUEST_STATUS_VALUES = Object.values(LEAVE_REQUEST_STATUSES);
