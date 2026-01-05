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
  ADMIN: "admin",
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
// EMAIL TEMPLATE TYPES
// ============================================

export const EMAIL_TEMPLATE_TYPES = {
  WELCOME_NEW_USER: "welcome_new_user",
  WELCOME_TEAM_MEMBER: "welcome_team_member",
  INVITATION: "invitation",
  ONBOARDING_DAY1: "onboarding_day1",
  ONBOARDING_DAY3: "onboarding_day3",
  ONBOARDING_DAY7: "onboarding_day7",
  PASSWORD_RESET: "password_reset",
  EMAIL_VERIFICATION: "email_verification",
} as const;

export type EmailTemplateType = typeof EMAIL_TEMPLATE_TYPES[keyof typeof EMAIL_TEMPLATE_TYPES];
export const EMAIL_TEMPLATE_TYPE_VALUES = Object.values(EMAIL_TEMPLATE_TYPES);

// ============================================
// EMAIL DELIVERY STATUSES
// ============================================

export const EMAIL_STATUSES = {
  SENT: "sent",
  DELIVERED: "delivered",
  BOUNCED: "bounced",
  COMPLAINED: "complained",
  REJECTED: "rejected",
  OPENED: "opened",
  CLICKED: "clicked",
} as const;

export type EmailStatus = typeof EMAIL_STATUSES[keyof typeof EMAIL_STATUSES];
export const EMAIL_STATUS_VALUES = Object.values(EMAIL_STATUSES);

// ============================================
// EMAIL SUPPRESSION REASONS
// ============================================

export const EMAIL_SUPPRESSION_REASONS = {
  BOUNCE: "bounce",
  COMPLAINT: "complaint",
  UNSUBSCRIBE: "unsubscribe",
} as const;

export type EmailSuppressionReason = typeof EMAIL_SUPPRESSION_REASONS[keyof typeof EMAIL_SUPPRESSION_REASONS];
export const EMAIL_SUPPRESSION_REASON_VALUES = Object.values(EMAIL_SUPPRESSION_REASONS);

// ============================================
// WORKFLOW TYPES
// ============================================

export const WORKFLOW_TYPES = {
  WELCOME_NEW_USER: "welcome_new_user",
  WELCOME_TEAM_MEMBER: "welcome_team_member",
} as const;

export type WorkflowType = typeof WORKFLOW_TYPES[keyof typeof WORKFLOW_TYPES];
export const WORKFLOW_TYPE_VALUES = Object.values(WORKFLOW_TYPES);

// ============================================
// WORKFLOW STATUSES
// ============================================

export const WORKFLOW_STATUSES = {
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type WorkflowStatus = typeof WORKFLOW_STATUSES[keyof typeof WORKFLOW_STATUSES];
export const WORKFLOW_STATUS_VALUES = Object.values(WORKFLOW_STATUSES);
