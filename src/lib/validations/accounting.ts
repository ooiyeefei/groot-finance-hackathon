/**
 * Accounting Entries Validation Schemas
 *
 * Zod schemas for accounting entry (transaction) creation, updates, and queries.
 * IFRS-compliant validation with proper financial categorization.
 */

import { z } from 'zod'
import {
  currencySchema,
  dateStringSchema,
  uuidSchema,
  documentIdSchema,
  positiveAmountSchema,
  nonNegativeAmountSchema,
  paginationSchema,
  sortOrderSchema,
  dateRangeSchema,
  searchQuerySchema,
  transactionTypeSchema,
  paymentStatusSchema
} from './common'
import { lineItemSchema } from './expense-claims'

/**
 * Accounting entry status schema
 */
export const accountingEntryStatusSchema = z.enum([
  'draft',
  'pending',
  'paid',
  'overdue',
  'cancelled',
  'refunded',
  'void'
], {
  errorMap: () => ({
    message: 'Status must be one of: draft, pending, paid, overdue, cancelled, refunded, void'
  })
})

/**
 * Document type schema
 */
export const documentTypeSchema = z.enum([
  'invoice',
  'receipt',
  'bill',
  'contract',
  'statement',
  'other'
], {
  errorMap: () => ({
    message: 'Document type must be one of: invoice, receipt, bill, contract, statement, other'
  })
})

/**
 * Create accounting entry schema
 */
export const createAccountingEntrySchema = z.object({
  // Required fields
  transaction_type: transactionTypeSchema,

  description: z.string()
    .min(1, 'Description is required')
    .max(500, 'Description too long'),

  original_amount: positiveAmountSchema,

  original_currency: currencySchema,

  home_currency: currencySchema,

  transaction_date: dateStringSchema,

  category: z.string()
    .min(1, 'Category is required')
    .max(100, 'Category too long'),

  // Optional fields
  vendor_name: z.string()
    .max(200, 'Vendor name too long')
    .optional(),

  reference_number: z.string()
    .max(100, 'Reference number too long')
    .optional(),

  document_type: documentTypeSchema.optional(),

  status: accountingEntryStatusSchema.default('pending'),

  payment_date: dateStringSchema.optional(),

  payment_method: z.string()
    .max(50, 'Payment method too long')
    .optional(),

  notes: z.string()
    .max(2000, 'Notes too long')
    .optional(),

  // Line items
  line_items: z.array(lineItemSchema).default([]),

  // Source document linking (accepts UUID or Convex ID for migration compatibility)
  source_record_id: documentIdSchema.optional(),
  source_document_type: documentTypeSchema.optional(),

  // Exchange rate information
  exchange_rate: z.number().positive().optional(),

  home_currency_amount: positiveAmountSchema.optional(),

  // Tax information
  subtotal_amount: nonNegativeAmountSchema.optional(),

  tax_amount: nonNegativeAmountSchema.optional(),

  tax_rate: z.number().min(0).max(1).optional(),

  // Metadata
  metadata: z.record(z.any()).optional()
})

/**
 * Update accounting entry schema
 */
export const updateAccountingEntrySchema = createAccountingEntrySchema.partial()

/**
 * Update accounting entry status schema
 */
export const updateAccountingEntryStatusSchema = z.object({
  status: accountingEntryStatusSchema,

  payment_date: dateStringSchema.optional(),

  payment_method: z.string()
    .max(50, 'Payment method too long')
    .optional(),

  notes: z.string()
    .max(1000, 'Notes too long')
    .optional()
})

/**
 * Recategorize accounting entry schema
 */
export const recategorizeAccountingEntrySchema = z.object({
  category: z.string()
    .min(1, 'Category is required')
    .max(100, 'Category too long'),

  reason: z.string()
    .max(500, 'Reason too long')
    .optional()
})

/**
 * List accounting entries query parameters schema
 */
export const listAccountingEntriesQuerySchema = paginationSchema.extend({
  // Business context
  business_id: z.string().optional(),  // Convex document ID or legacy UUID

  // Multi-business: When true, returns entries from ALL user's businesses (ignores business_id injection)
  all_businesses: z.coerce.boolean().default(false),

  // Filtering
  transaction_type: transactionTypeSchema.optional(),

  category: z.string().optional(),

  status: accountingEntryStatusSchema.optional(),

  vendor_name: z.string().optional(),

  // Date range
  date_from: dateStringSchema.optional(),
  date_to: dateStringSchema.optional(),

  // Sorting
  sort_by: z.enum([
    'transaction_date',
    'amount',
    'created_at',
    'vendor_name',
    'category'
  ]).default('transaction_date'),

  sort_order: sortOrderSchema,

  // Search
  search: searchQuerySchema,

  // Pagination cursor for Convex
  cursor: z.string().optional()
}).refine((data) => {
  if (!data.date_from || !data.date_to) return true
  return new Date(data.date_from) <= new Date(data.date_to)
}, {
  message: 'date_from must be before or equal to date_to'
})

/**
 * Accounting entry ID parameter schema
 */
export const accountingEntryIdParamSchema = z.object({
  entryId: documentIdSchema
})

/**
 * Bulk operation schema
 */
export const bulkOperationSchema = z.object({
  entry_ids: z.array(uuidSchema).min(1, 'At least one entry ID is required'),

  operation: z.enum(['delete', 'update_status', 'export']),

  // For update_status operation
  status: accountingEntryStatusSchema.optional(),

  // For export operation
  format: z.enum(['csv', 'xlsx', 'pdf']).optional()
})

/**
 * Financial summary query schema
 */
export const financialSummaryQuerySchema = z.object({
  group_by: z.enum(['category', 'transaction_type', 'vendor', 'month']).default('category'),

  currency: currencySchema.optional(),

  // Date range
  date_from: dateStringSchema.optional(),
  date_to: dateStringSchema.optional()
}).refine((data) => {
  if (!data.date_from || !data.date_to) return true
  return new Date(data.date_from) <= new Date(data.date_to)
}, {
  message: 'date_from must be before or equal to date_to'
})

/**
 * Type exports
 */
export type AccountingEntryStatus = z.infer<typeof accountingEntryStatusSchema>
export type DocumentType = z.infer<typeof documentTypeSchema>
export type CreateAccountingEntryRequest = z.infer<typeof createAccountingEntrySchema>
export type UpdateAccountingEntryRequest = z.infer<typeof updateAccountingEntrySchema>
export type UpdateAccountingEntryStatusRequest = z.infer<typeof updateAccountingEntryStatusSchema>
export type RecategorizeAccountingEntryRequest = z.infer<typeof recategorizeAccountingEntrySchema>
export type ListAccountingEntriesQuery = z.infer<typeof listAccountingEntriesQuerySchema>
export type BulkOperationRequest = z.infer<typeof bulkOperationSchema>
export type FinancialSummaryQuery = z.infer<typeof financialSummaryQuerySchema>
