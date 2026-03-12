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
// EXPENSE SUBMISSION STATUSES
// ============================================

export const EXPENSE_SUBMISSION_STATUSES = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  REIMBURSED: "reimbursed",
} as const;

export type ExpenseSubmissionStatus = typeof EXPENSE_SUBMISSION_STATUSES[keyof typeof EXPENSE_SUBMISSION_STATUSES];
export const EXPENSE_SUBMISSION_STATUS_VALUES = Object.values(EXPENSE_SUBMISSION_STATUSES);

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
  SALES_INVOICE: "sales_invoice",
  MANUAL: "manual",
} as const;

export type SourceDocumentType = typeof SOURCE_DOCUMENT_TYPES[keyof typeof SOURCE_DOCUMENT_TYPES];
export const SOURCE_DOCUMENT_TYPE_VALUES = Object.values(SOURCE_DOCUMENT_TYPES);

// ============================================
// SALES INVOICE STATUSES
// ============================================

export const SALES_INVOICE_STATUSES = {
  DRAFT: "draft",
  SENT: "sent",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  OVERDUE: "overdue",
  VOID: "void",
} as const;

export type SalesInvoiceStatus = typeof SALES_INVOICE_STATUSES[keyof typeof SALES_INVOICE_STATUSES];
export const SALES_INVOICE_STATUS_VALUES = Object.values(SALES_INVOICE_STATUSES);

// ============================================
// PAYMENT TERMS
// ============================================

export const PAYMENT_TERMS_OPTIONS = {
  DUE_ON_RECEIPT: "due_on_receipt",
  NET_15: "net_15",
  NET_30: "net_30",
  NET_60: "net_60",
  CUSTOM: "custom",
} as const;

export type PaymentTermsOption = typeof PAYMENT_TERMS_OPTIONS[keyof typeof PAYMENT_TERMS_OPTIONS];
export const PAYMENT_TERMS_VALUES = Object.values(PAYMENT_TERMS_OPTIONS);

// ============================================
// CUSTOMER STATUSES
// ============================================

export const CUSTOMER_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type CustomerStatusType = typeof CUSTOMER_STATUSES[keyof typeof CUSTOMER_STATUSES];
export const CUSTOMER_STATUS_VALUES = Object.values(CUSTOMER_STATUSES);

// ============================================
// CATALOG ITEM STATUSES
// ============================================

export const CATALOG_ITEM_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type CatalogItemStatusType = typeof CATALOG_ITEM_STATUSES[keyof typeof CATALOG_ITEM_STATUSES];
export const CATALOG_ITEM_STATUS_VALUES = Object.values(CATALOG_ITEM_STATUSES);

// ============================================
// RECURRING FREQUENCIES
// ============================================

export const RECURRING_FREQUENCIES = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
} as const;

export type RecurringFrequencyType = typeof RECURRING_FREQUENCIES[keyof typeof RECURRING_FREQUENCIES];
export const RECURRING_FREQUENCY_VALUES = Object.values(RECURRING_FREQUENCIES);

// ============================================
// PAYMENT TYPES (010-ar-debtor-management)
// ============================================

export const PAYMENT_TYPES = {
  PAYMENT: "payment",
  REVERSAL: "reversal",
} as const;

export type PaymentType = typeof PAYMENT_TYPES[keyof typeof PAYMENT_TYPES];
export const PAYMENT_TYPE_VALUES = Object.values(PAYMENT_TYPES);

// ============================================
// PAYMENT METHODS (010-ar-debtor-management)
// ============================================

export const PAYMENT_METHODS_ENUM = {
  BANK_TRANSFER: "bank_transfer",
  CASH: "cash",
  CHEQUE: "cheque",
  CARD: "card",
  OTHER: "other",
} as const;

export type PaymentMethodType = typeof PAYMENT_METHODS_ENUM[keyof typeof PAYMENT_METHODS_ENUM];
export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHODS_ENUM);

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

// ============================================
// EXPORT MODULES
// ============================================

export const EXPORT_MODULES = {
  EXPENSE: "expense",
  INVOICE: "invoice",
  LEAVE: "leave",
  ACCOUNTING: "accounting",
  MASTER_DATA: "master-data",
} as const;

export type ExportModule = typeof EXPORT_MODULES[keyof typeof EXPORT_MODULES];
export const EXPORT_MODULE_VALUES = Object.values(EXPORT_MODULES);

// ============================================
// EXPORT TEMPLATE TYPES
// ============================================

export const EXPORT_TEMPLATE_TYPES = {
  CUSTOM: "custom",
  CLONED: "cloned",
} as const;

export type ExportTemplateType = typeof EXPORT_TEMPLATE_TYPES[keyof typeof EXPORT_TEMPLATE_TYPES];
export const EXPORT_TEMPLATE_TYPE_VALUES = Object.values(EXPORT_TEMPLATE_TYPES);

// ============================================
// EXPORT FREQUENCIES
// ============================================

export const EXPORT_FREQUENCIES = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;

export type ExportFrequency = typeof EXPORT_FREQUENCIES[keyof typeof EXPORT_FREQUENCIES];
export const EXPORT_FREQUENCY_VALUES = Object.values(EXPORT_FREQUENCIES);

// ============================================
// EXPORT HISTORY STATUSES
// ============================================

export const EXPORT_HISTORY_STATUSES = {
  PROCESSING: "processing",   // Export in progress
  COMPLETED: "completed",     // Successfully generated
  FAILED: "failed",           // Generation failed
  ARCHIVED: "archived",       // File deleted after 90 days
} as const;

export type ExportHistoryStatus = typeof EXPORT_HISTORY_STATUSES[keyof typeof EXPORT_HISTORY_STATUSES];
export const EXPORT_HISTORY_STATUS_VALUES = Object.values(EXPORT_HISTORY_STATUSES);

// ============================================
// EXPORT TRIGGERS
// ============================================

export const EXPORT_TRIGGERS = {
  MANUAL: "manual",
  SCHEDULE: "schedule",
} as const;

export type ExportTrigger = typeof EXPORT_TRIGGERS[keyof typeof EXPORT_TRIGGERS];
export const EXPORT_TRIGGER_VALUES = Object.values(EXPORT_TRIGGERS);

// ============================================
// DATE RANGE TYPES (for scheduled exports)
// ============================================

export const DATE_RANGE_TYPES = {
  PREVIOUS_DAY: "previous_day",
  PREVIOUS_WEEK: "previous_week",
  PREVIOUS_MONTH: "previous_month",
  MONTH_TO_DATE: "month_to_date",
  YEAR_TO_DATE: "year_to_date",
} as const;

export type DateRangeType = typeof DATE_RANGE_TYPES[keyof typeof DATE_RANGE_TYPES];
export const DATE_RANGE_TYPE_VALUES = Object.values(DATE_RANGE_TYPES);

// ============================================
// THOUSAND SEPARATORS
// ============================================

export const THOUSAND_SEPARATORS = {
  COMMA: "comma",
  NONE: "none",
} as const;

export type ThousandSeparator = typeof THOUSAND_SEPARATORS[keyof typeof THOUSAND_SEPARATORS];
export const THOUSAND_SEPARATOR_VALUES = Object.values(THOUSAND_SEPARATORS);

// ============================================
// LHDN e-INVOICE STATUSES (016-e-invoice-schema-change)
// ============================================

export const LHDN_STATUSES = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  VALID: "valid",
  INVALID: "invalid",
  CANCELLED: "cancelled",
} as const;

export type LhdnStatus = typeof LHDN_STATUSES[keyof typeof LHDN_STATUSES];
export const LHDN_STATUS_VALUES = Object.values(LHDN_STATUSES);

// ============================================
// PEPPOL e-INVOICE STATUSES (016-e-invoice-schema-change)
// ============================================

export const PEPPOL_STATUSES = {
  PENDING: "pending",
  TRANSMITTED: "transmitted",
  DELIVERED: "delivered",
  FAILED: "failed",
} as const;

export type PeppolStatus = typeof PEPPOL_STATUSES[keyof typeof PEPPOL_STATUSES];
export const PEPPOL_STATUS_VALUES = Object.values(PEPPOL_STATUSES);

// ============================================
// E-INVOICE DOCUMENT TYPES (016-e-invoice-schema-change)
// ============================================

export const EINVOICE_TYPES = {
  INVOICE: "invoice",
  CREDIT_NOTE: "credit_note",
  DEBIT_NOTE: "debit_note",
  REFUND_NOTE: "refund_note",
} as const;

export type EinvoiceType = typeof EINVOICE_TYPES[keyof typeof EINVOICE_TYPES];
export const EINVOICE_TYPE_VALUES = Object.values(EINVOICE_TYPES);

// ============================================
// ATTENDANCE RECORD STATUSES (018-timesheet-attendance)
// ============================================

export const ATTENDANCE_RECORD_STATUSES = {
  COMPLETE: "complete",
  INCOMPLETE: "incomplete",
  FLAGGED: "flagged",
  AUTO_CLOSED: "auto_closed",
} as const;

export type AttendanceRecordStatus = typeof ATTENDANCE_RECORD_STATUSES[keyof typeof ATTENDANCE_RECORD_STATUSES];
export const ATTENDANCE_RECORD_STATUS_VALUES = Object.values(ATTENDANCE_RECORD_STATUSES);

// ============================================
// ATTENDANCE STATUSES (018-timesheet-attendance)
// ============================================

export const ATTENDANCE_STATUSES = {
  PRESENT: "present",
  LATE: "late",
  EARLY_DEPARTURE: "early_departure",
  ABSENT: "absent",
} as const;

export type AttendanceStatus = typeof ATTENDANCE_STATUSES[keyof typeof ATTENDANCE_STATUSES];
export const ATTENDANCE_STATUS_VALUES = Object.values(ATTENDANCE_STATUSES);

// ============================================
// ATTENDANCE SOURCE (018-timesheet-attendance)
// ============================================

export const ATTENDANCE_SOURCES = {
  AUTO: "auto",
  MANUAL: "manual",
  SYSTEM: "system",
} as const;

export type AttendanceSource = typeof ATTENDANCE_SOURCES[keyof typeof ATTENDANCE_SOURCES];
export const ATTENDANCE_SOURCE_VALUES = Object.values(ATTENDANCE_SOURCES);

// ============================================
// TIMESHEET STATUSES (018-timesheet-attendance)
// ============================================

export const TIMESHEET_STATUSES = {
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  APPROVED: "approved",
  FINALIZED: "finalized",
  LOCKED: "locked",
} as const;

export type TimesheetStatus = typeof TIMESHEET_STATUSES[keyof typeof TIMESHEET_STATUSES];
export const TIMESHEET_STATUS_VALUES = Object.values(TIMESHEET_STATUSES);

// ============================================
// TIMESHEET CONFIRMED BY (018-timesheet-attendance)
// ============================================

export const TIMESHEET_CONFIRMED_BY = {
  EMPLOYEE: "employee",
  SYSTEM: "system",
} as const;

export type TimesheetConfirmedBy = typeof TIMESHEET_CONFIRMED_BY[keyof typeof TIMESHEET_CONFIRMED_BY];
export const TIMESHEET_CONFIRMED_BY_VALUES = Object.values(TIMESHEET_CONFIRMED_BY);

// ============================================
// PAY PERIOD FREQUENCY (018-timesheet-attendance)
// ============================================

export const PAY_PERIOD_FREQUENCIES = {
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  MONTHLY: "monthly",
} as const;

export type PayPeriodFrequency = typeof PAY_PERIOD_FREQUENCIES[keyof typeof PAY_PERIOD_FREQUENCIES];
export const PAY_PERIOD_FREQUENCY_VALUES = Object.values(PAY_PERIOD_FREQUENCIES);

// ============================================
// PAYROLL ADJUSTMENT TYPES (018-timesheet-attendance)
// ============================================

export const PAYROLL_ADJUSTMENT_TYPES = {
  HOURS_ADD: "hours_add",
  HOURS_DEDUCT: "hours_deduct",
  OT_ADD: "ot_add",
  OT_DEDUCT: "ot_deduct",
} as const;

export type PayrollAdjustmentType = typeof PAYROLL_ADJUSTMENT_TYPES[keyof typeof PAYROLL_ADJUSTMENT_TYPES];
export const PAYROLL_ADJUSTMENT_TYPE_VALUES = Object.values(PAYROLL_ADJUSTMENT_TYPES);

// ============================================
// OVERTIME CALCULATION BASIS (018-timesheet-attendance)
// ============================================

export const OVERTIME_CALCULATION_BASIS = {
  DAILY: "daily",
  WEEKLY: "weekly",
  BOTH: "both",
} as const;

export type OvertimeCalculationBasis = typeof OVERTIME_CALCULATION_BASIS[keyof typeof OVERTIME_CALCULATION_BASIS];
export const OVERTIME_CALCULATION_BASIS_VALUES = Object.values(OVERTIME_CALCULATION_BASIS);

// ============================================
// SALES ORDER MATCH STATUS
// ============================================
export const SALES_ORDER_MATCH_STATUSES = {
  UNMATCHED: "unmatched",
  MATCHED: "matched",
  PARTIAL: "partial",
  VARIANCE: "variance",
  CONFLICT: "conflict",
} as const;

export const SALES_ORDER_MATCH_STATUS_VALUES = Object.values(SALES_ORDER_MATCH_STATUSES);

// ============================================
// SALES ORDER MATCH METHOD
// ============================================
export const SALES_ORDER_MATCH_METHODS = {
  EXACT_REFERENCE: "exact_reference",
  FUZZY: "fuzzy",
  LINE_ITEM: "line_item",
  MANUAL: "manual",
} as const;

export const SALES_ORDER_MATCH_METHOD_VALUES = Object.values(SALES_ORDER_MATCH_METHODS);

// ============================================
// SALES ORDER PERIOD STATUS
// ============================================
export const SALES_ORDER_PERIOD_STATUSES = {
  OPEN: "open",
  CLOSED: "closed",
  DISPUTED: "disputed",
} as const;

export type SalesOrderPeriodStatus = typeof SALES_ORDER_PERIOD_STATUSES[keyof typeof SALES_ORDER_PERIOD_STATUSES];
export const SALES_ORDER_PERIOD_STATUS_VALUES = Object.values(SALES_ORDER_PERIOD_STATUSES);

// ============================================
// FEE CATEGORY TYPES (Platform fee breakdown)
// ============================================
export const FEE_CATEGORIES = {
  COMMISSION: "commission",
  SHIPPING: "shipping",
  MARKETING: "marketing",
  REFUND: "refund",
  OTHER: "other",
} as const;

export type FeeCategory = typeof FEE_CATEGORIES[keyof typeof FEE_CATEGORIES];
