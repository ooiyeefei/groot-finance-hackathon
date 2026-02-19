/**
 * Convex Validators - Adapters for Status Constants
 *
 * This file creates Convex validators from the platform-agnostic
 * status constants defined in src/lib/constants/statuses.ts.
 *
 * If migrating away from Convex, only this file needs to be deleted
 * (along with the rest of the convex/ folder).
 */

import { v, Validator } from "convex/values";
import {
  EXPENSE_CLAIM_STATUS_VALUES,
  EXPENSE_SUBMISSION_STATUS_VALUES,
  INVOICE_STATUS_VALUES,
  ACCOUNTING_ENTRY_STATUS_VALUES,
  TRANSACTION_TYPE_VALUES,
  MEMBERSHIP_ROLE_VALUES,
  MEMBERSHIP_STATUS_VALUES,
  MESSAGE_ROLE_VALUES,
  SOURCE_DOCUMENT_TYPE_VALUES,
  CREATED_BY_METHOD_VALUES,
  FEEDBACK_TYPE_VALUES,
  FEEDBACK_STATUS_VALUES,
  VENDOR_STATUS_VALUES,
  LEAVE_REQUEST_STATUS_VALUES,
  EXPORT_MODULE_VALUES,
  EXPORT_TEMPLATE_TYPE_VALUES,
  EXPORT_FREQUENCY_VALUES,
  EXPORT_HISTORY_STATUS_VALUES,
  EXPORT_TRIGGER_VALUES,
  DATE_RANGE_TYPE_VALUES,
  THOUSAND_SEPARATOR_VALUES,
  SALES_INVOICE_STATUS_VALUES,
  PAYMENT_TERMS_VALUES,
  CUSTOMER_STATUS_VALUES,
  CATALOG_ITEM_STATUS_VALUES,
  RECURRING_FREQUENCY_VALUES,
  PAYMENT_TYPE_VALUES,
  PAYMENT_METHOD_VALUES,
  LHDN_STATUS_VALUES,
  PEPPOL_STATUS_VALUES,
  EINVOICE_TYPE_VALUES,
} from "../../src/lib/constants/statuses";

// ============================================
// HELPER FUNCTION
// ============================================

/**
 * Creates a Convex union validator from an array of string values.
 * v.union() requires at least 2 arguments, so we handle that explicitly.
 */
function literalUnion<T extends readonly string[]>(
  values: T
): Validator<T[number]> {
  if (values.length < 2) {
    throw new Error("literalUnion requires at least 2 values");
  }

  const literals = values.map((val) => v.literal(val));
  // TypeScript needs help here - cast through 'unknown' to bypass strict type checking
  // This is safe because we're creating a union of literals from a string array
  return v.union(
    literals[0] as Validator<T[number]>,
    literals[1] as Validator<T[number]>,
    ...(literals.slice(2) as Validator<T[number]>[])
  ) as unknown as Validator<T[number]>;
}

// ============================================
// EXPORTED VALIDATORS
// ============================================

/**
 * Expense claim status validator
 * Includes workflow states + processing states + error states
 */
export const expenseClaimStatusValidator = literalUnion(EXPENSE_CLAIM_STATUS_VALUES);

/**
 * Expense submission status validator
 * Lifecycle: draft → submitted → approved/rejected → reimbursed
 */
export const expenseSubmissionStatusValidator = literalUnion(EXPENSE_SUBMISSION_STATUS_VALUES);

/**
 * Invoice status validator
 * Includes processing states + payment states
 */
export const invoiceStatusValidator = literalUnion(INVOICE_STATUS_VALUES);

/**
 * Accounting entry status validator
 * Payment lifecycle states
 */
export const accountingEntryStatusValidator = literalUnion(ACCOUNTING_ENTRY_STATUS_VALUES);

/**
 * Transaction type validator
 * P&L categories: Income, Cost of Goods Sold, Expense
 */
export const transactionTypeValidator = literalUnion(TRANSACTION_TYPE_VALUES);

/**
 * Business membership role validator
 */
export const membershipRoleValidator = literalUnion(MEMBERSHIP_ROLE_VALUES);

/**
 * Business membership status validator
 */
export const membershipStatusValidator = literalUnion(MEMBERSHIP_STATUS_VALUES);

/**
 * Chat message role validator
 */
export const messageRoleValidator = literalUnion(MESSAGE_ROLE_VALUES);

/**
 * Source document type validator
 */
export const sourceDocumentTypeValidator = literalUnion(SOURCE_DOCUMENT_TYPE_VALUES);

/**
 * Created by method validator
 */
export const createdByMethodValidator = literalUnion(CREATED_BY_METHOD_VALUES);

/**
 * Feedback type validator
 */
export const feedbackTypeValidator = literalUnion(FEEDBACK_TYPE_VALUES);

/**
 * Feedback status validator
 */
export const feedbackStatusValidator = literalUnion(FEEDBACK_STATUS_VALUES);

/**
 * Vendor status validator
 * Lifecycle: prospective (from OCR) → active (has transactions) → inactive (user deactivated)
 */
export const vendorStatusValidator = literalUnion(VENDOR_STATUS_VALUES);

/**
 * Leave request status validator
 * Workflow: draft → submitted → approved/rejected
 * Can be cancelled from submitted or approved (future dates only)
 */
export const leaveRequestStatusValidator = literalUnion(LEAVE_REQUEST_STATUS_VALUES);

// ============================================
// EXPORT VALIDATORS
// ============================================

/**
 * Export module validator
 * Which data to export: expense claims or leave records
 */
export const exportModuleValidator = literalUnion(EXPORT_MODULE_VALUES);

/**
 * Export template type validator
 * custom (user-created) or cloned (from pre-built)
 */
export const exportTemplateTypeValidator = literalUnion(EXPORT_TEMPLATE_TYPE_VALUES);

/**
 * Export frequency validator
 * For scheduled exports: daily, weekly, or monthly
 */
export const exportFrequencyValidator = literalUnion(EXPORT_FREQUENCY_VALUES);

/**
 * Export history status validator
 * Lifecycle: processing → completed/failed, then archived after 90 days
 */
export const exportHistoryStatusValidator = literalUnion(EXPORT_HISTORY_STATUS_VALUES);

/**
 * Export trigger validator
 * manual (user-initiated) or schedule (cron-triggered)
 */
export const exportTriggerValidator = literalUnion(EXPORT_TRIGGER_VALUES);

/**
 * Date range type validator
 * Relative date ranges for scheduled exports
 */
export const dateRangeTypeValidator = literalUnion(DATE_RANGE_TYPE_VALUES);

/**
 * Thousand separator validator
 * Number formatting: comma or none
 */
export const thousandSeparatorValidator = literalUnion(THOUSAND_SEPARATOR_VALUES);

// ============================================
// SALES INVOICE VALIDATORS
// ============================================

/**
 * Sales invoice status validator
 * Lifecycle: draft → sent → paid/overdue/partially_paid → void
 */
export const salesInvoiceStatusValidator = literalUnion(SALES_INVOICE_STATUS_VALUES);

/**
 * Payment terms validator
 */
export const paymentTermsValidator = literalUnion(PAYMENT_TERMS_VALUES);

/**
 * Customer status validator
 */
export const customerStatusValidator = literalUnion(CUSTOMER_STATUS_VALUES);

/**
 * Catalog item status validator
 */
export const catalogItemStatusValidator = literalUnion(CATALOG_ITEM_STATUS_VALUES);

/**
 * Recurring invoice frequency validator
 */
export const recurringFrequencyValidator = literalUnion(RECURRING_FREQUENCY_VALUES);

// ============================================
// PAYMENT VALIDATORS (010-ar-debtor-management)
// ============================================

/**
 * Payment type validator
 * payment (normal) or reversal (correction)
 */
export const paymentTypeValidator = literalUnion(PAYMENT_TYPE_VALUES);

/**
 * Payment method validator
 * bank_transfer, cash, cheque, card, other
 */
export const paymentMethodValidator = literalUnion(PAYMENT_METHOD_VALUES);

// ============================================
// E-INVOICE VALIDATORS (016-e-invoice-schema-change)
// ============================================

/**
 * LHDN e-invoice status validator
 * Lifecycle: pending → submitted → valid/invalid → cancelled
 */
export const lhdnStatusValidator = literalUnion(LHDN_STATUS_VALUES);

/**
 * Peppol e-invoice status validator
 * Lifecycle: pending → transmitted → delivered/failed
 */
export const peppolStatusValidator = literalUnion(PEPPOL_STATUS_VALUES);

/**
 * E-invoice document type validator
 * Classification: invoice, credit_note, debit_note, refund_note
 */
export const einvoiceTypeValidator = literalUnion(EINVOICE_TYPE_VALUES);
