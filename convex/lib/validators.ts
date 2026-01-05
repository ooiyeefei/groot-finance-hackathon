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
  INVOICE_STATUS_VALUES,
  ACCOUNTING_ENTRY_STATUS_VALUES,
  TRANSACTION_TYPE_VALUES,
  MEMBERSHIP_ROLE_VALUES,
  MEMBERSHIP_STATUS_VALUES,
  MESSAGE_ROLE_VALUES,
  SOURCE_DOCUMENT_TYPE_VALUES,
  CREATED_BY_METHOD_VALUES,
  EMAIL_TEMPLATE_TYPE_VALUES,
  EMAIL_STATUS_VALUES,
  EMAIL_SUPPRESSION_REASON_VALUES,
  WORKFLOW_TYPE_VALUES,
  WORKFLOW_STATUS_VALUES,
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

// ============================================
// EMAIL SYSTEM VALIDATORS
// ============================================

/**
 * Email template type validator
 * Used in email_logs table
 */
export const emailTemplateTypeValidator = literalUnion(EMAIL_TEMPLATE_TYPE_VALUES);

/**
 * Email delivery status validator
 * Used in email_logs table for tracking delivery state
 */
export const emailStatusValidator = literalUnion(EMAIL_STATUS_VALUES);

/**
 * Email suppression reason validator
 * Used in email_suppressions table
 */
export const emailSuppressionReasonValidator = literalUnion(EMAIL_SUPPRESSION_REASON_VALUES);

/**
 * Workflow type validator
 * Used in workflow_executions table
 */
export const workflowTypeValidator = literalUnion(WORKFLOW_TYPE_VALUES);

/**
 * Workflow status validator
 * Used in workflow_executions table
 */
export const workflowStatusValidator = literalUnion(WORKFLOW_STATUS_VALUES);
