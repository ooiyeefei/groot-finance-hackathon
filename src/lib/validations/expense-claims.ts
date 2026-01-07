/**
 * Expense Claims Validation Schemas
 *
 * Zod schemas for expense claim creation, updates, and queries.
 * Ensures data integrity and provides helpful validation messages.
 */

import { z } from 'zod'
import {
  currencySchema,
  dateStringSchema,
  documentIdSchema,
  positiveAmountSchema,
  nonNegativeAmountSchema,
  paginationSchema,
  sortOrderSchema,
  dateRangeSchema,
  searchQuerySchema
} from './common'

/**
 * Expense claim status enum
 */
export const expenseClaimStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'reimbursed'
], {
  errorMap: () => ({
    message: 'Status must be one of: draft, submitted, approved, rejected, reimbursed'
  })
})

/**
 * Processing mode for expense claims
 */
export const processingModeSchema = z.enum(['ai', 'manual'], {
  errorMap: () => ({
    message: 'Processing mode must be either "ai" or "manual"'
  })
})

/**
 * Line item schema for expense claims
 */
export const lineItemSchema = z.object({
  item_description: z.string().min(1, 'Item description is required').max(500),
  quantity: z.number().positive('Quantity must be positive'),
  unit_price: nonNegativeAmountSchema,
  total_amount: nonNegativeAmountSchema,
  currency: currencySchema,
  tax_amount: nonNegativeAmountSchema.optional(),
  tax_rate: z.number().min(0).max(1).optional(),
  item_category: z.string().optional(),
  line_order: z.number().int().nonnegative().optional()
})

/**
 * Create expense claim request schema (JSON mode)
 */
export const createExpenseClaimSchema = z.object({
  // Required fields
  description: z.string()
    .min(1, 'Description is required')
    .max(500, 'Description too long'),

  business_purpose: z.string()
    .min(1, 'Business purpose is required')
    .max(1000, 'Business purpose too long'),

  original_amount: positiveAmountSchema,

  original_currency: currencySchema,

  transaction_date: dateStringSchema,

  // Optional fields
  expense_category: z.string().optional().nullable(),

  vendor_name: z.string()
    .max(200, 'Vendor name too long')
    .optional(),

  vendor_id: documentIdSchema.optional(),

  reference_number: z.string()
    .max(100, 'Reference number too long')
    .optional(),

  notes: z.string()
    .max(2000, 'Notes too long')
    .optional(),

  storage_path: z.string().optional(),

  line_items: z.array(lineItemSchema).default([]),

  processing_mode: processingModeSchema.default('manual'),

  // Business context (added by backend)
  business_home_currency: currencySchema.optional(),
  business_allowed_currencies: z.array(currencySchema).optional()
})

/**
 * Create expense claim from file upload schema
 */
export const createExpenseClaimFileSchema = z.object({
  file: z.instanceof(File, { message: 'File is required' }),

  processing_mode: processingModeSchema,

  // Optional form fields
  description: z.string().max(500).default('Receipt Upload'),

  business_purpose: z.string().max(1000).default('Business Expense'),

  expense_category: z.string().optional().nullable(),

  original_amount: z.coerce.number().nonnegative().default(0),

  original_currency: currencySchema.default('SGD'),

  transaction_date: dateStringSchema.default(() => new Date().toISOString().split('T')[0]),

  vendor_name: z.string().max(200).default(''),

  vendor_id: documentIdSchema.optional(),

  reference_number: z.string().max(100).optional(),

  notes: z.string().max(2000).optional(),

  storage_path: z.string().optional(),

  // Business context (provided by client but ignored - uses authenticated user's context instead)
  businessId: z.string().optional()
})

/**
 * Update expense claim status schema
 */
export const updateExpenseClaimStatusSchema = z.object({
  status: expenseClaimStatusSchema,

  comment: z.string()
    .max(1000, 'Comment too long')
    .optional(),

  approval_notes: z.string()
    .max(2000, 'Approval notes too long')
    .optional()
})

/**
 * List expense claims query parameters schema
 */
export const listExpenseClaimsQuerySchema = paginationSchema.extend({
  // Filtering
  status: expenseClaimStatusSchema.optional(),

  expense_category: z.string().optional(),

  user_id: documentIdSchema.optional(),

  approver: z.enum(['me']).optional(),

  check_duplicate: z.coerce.boolean().default(false),

  // Date range
  date_from: dateStringSchema.optional(),
  date_to: dateStringSchema.optional(),

  // Sorting
  sort_by: z.enum([
    'created_at',
    'transaction_date',
    'original_amount',
    'vendor_name',
    'status'
  ]).default('created_at'),

  sort_order: sortOrderSchema,

  // Search
  search: searchQuerySchema
}).refine((data) => {
  if (!data.date_from || !data.date_to) return true
  return new Date(data.date_from) <= new Date(data.date_to)
}, {
  message: 'date_from must be before or equal to date_to'
})

/**
 * Expense claim ID parameter schema
 */
export const expenseClaimIdParamSchema = z.object({
  id: documentIdSchema
})

/**
 * Reprocess expense claim schema
 */
export const reprocessExpenseClaimSchema = z.object({
  force: z.coerce.boolean().default(false),
  extraction_method: z.enum(['dspy', 'manual']).optional()
})

/**
 * Expense category schema
 */
export const expenseCategorySchema = z.object({
  category_name: z.string()
    .min(1, 'Category name is required')
    .max(100, 'Category name too long'),

  description: z.string()
    .max(500, 'Description too long')
    .optional(),

  is_reimbursable: z.boolean().default(true),

  requires_receipt: z.boolean().default(true),

  approval_required: z.boolean().default(true),

  ai_keywords: z.array(z.string()).default([]),

  vendor_patterns: z.array(z.string()).default([])
})

/**
 * Update expense category schema
 */
export const updateExpenseCategorySchema = expenseCategorySchema.partial()

/**
 * Export expense claims report query schema
 */
export const exportExpenseReportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx', 'pdf']).default('xlsx'),
  status: expenseClaimStatusSchema.optional(),
  date_from: dateStringSchema.optional(),
  date_to: dateStringSchema.optional()
})

/**
 * Type exports for TypeScript usage
 */
export type ExpenseClaimStatus = z.infer<typeof expenseClaimStatusSchema>
export type ProcessingMode = z.infer<typeof processingModeSchema>
export type LineItem = z.infer<typeof lineItemSchema>
export type CreateExpenseClaimRequest = z.infer<typeof createExpenseClaimSchema>
export type CreateExpenseClaimFileRequest = z.infer<typeof createExpenseClaimFileSchema>
export type UpdateExpenseClaimStatusRequest = z.infer<typeof updateExpenseClaimStatusSchema>
export type ListExpenseClaimsQuery = z.infer<typeof listExpenseClaimsQuerySchema>
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>
