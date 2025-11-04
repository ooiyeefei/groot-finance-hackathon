/**
 * Common Zod Validation Schemas
 *
 * Reusable validation schemas for common patterns across all API endpoints.
 * These schemas ensure consistent validation and provide helpful error messages.
 */

import { z } from 'zod'

/**
 * Supported currencies (Southeast Asia + common global currencies)
 */
export const SUPPORTED_CURRENCIES = [
  'THB', 'IDR', 'MYR', 'SGD', 'USD',
  'EUR', 'CNY', 'VND', 'PHP', 'INR'
] as const

/**
 * Currency code validation
 */
export const currencySchema = z.enum(SUPPORTED_CURRENCIES, {
  errorMap: () => ({
    message: `Currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`
  })
})

/**
 * ISO 8601 date string validation
 * Accepts: YYYY-MM-DD format
 */
export const dateStringSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((date) => {
    const parsed = new Date(date)
    return !isNaN(parsed.getTime())
  }, 'Invalid date')

/**
 * Email validation with common patterns
 */
export const emailSchema = z.string()
  .email('Invalid email address')
  .toLowerCase()
  .trim()

/**
 * UUID validation
 */
export const uuidSchema = z.string()
  .uuid('Invalid UUID format')

/**
 * Positive amount validation (for financial values)
 */
export const positiveAmountSchema = z.number()
  .positive('Amount must be positive')
  .finite('Amount must be a finite number')

/**
 * Non-negative amount validation (allows zero)
 */
export const nonNegativeAmountSchema = z.number()
  .nonnegative('Amount cannot be negative')
  .finite('Amount must be a finite number')

/**
 * Pagination parameters validation
 */
export const paginationSchema = z.object({
  page: z.coerce.number()
    .int('Page must be an integer')
    .positive('Page must be positive')
    .default(1),
  limit: z.coerce.number()
    .int('Limit must be an integer')
    .positive('Limit must be positive')
    .max(100, 'Limit cannot exceed 100')
    .default(20)
})

/**
 * Sort order validation
 */
export const sortOrderSchema = z.enum(['asc', 'desc'], {
  errorMap: () => ({ message: 'Sort order must be either "asc" or "desc"' })
}).default('desc')

/**
 * Date range validation
 */
export const dateRangeSchema = z.object({
  date_from: dateStringSchema.optional(),
  date_to: dateStringSchema.optional()
}).refine((data) => {
  if (!data.date_from || !data.date_to) return true
  return new Date(data.date_from) <= new Date(data.date_to)
}, {
  message: 'date_from must be before or equal to date_to'
})

/**
 * Search query validation
 */
export const searchQuerySchema = z.string()
  .min(1, 'Search query cannot be empty')
  .max(200, 'Search query too long')
  .trim()
  .optional()

/**
 * Status filter validation (generic)
 */
export const statusFilterSchema = z.string()
  .min(1, 'Status cannot be empty')
  .optional()

/**
 * Business context validation
 */
export const businessIdSchema = z.object({
  business_id: uuidSchema
})

/**
 * User ID validation
 */
export const userIdSchema = z.object({
  user_id: uuidSchema
})

/**
 * File upload validation
 */
export const fileUploadSchema = z.object({
  file: z.instanceof(File, { message: 'Invalid file upload' }),
  filename: z.string().min(1).optional(),
  mimetype: z.string().optional()
})

/**
 * Webhook signature validation
 */
export const webhookSignatureSchema = z.object({
  signature: z.string().min(1, 'Signature is required'),
  timestamp: z.string().min(1, 'Timestamp is required')
})

/**
 * Language code validation
 */
export const languageSchema = z.enum(['en', 'th', 'id', 'zh'], {
  errorMap: () => ({ message: 'Language must be one of: en, th, id, zh' })
}).default('en')

/**
 * Phone number validation (international format)
 */
export const phoneNumberSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
  .optional()

/**
 * URL validation
 */
export const urlSchema = z.string()
  .url('Invalid URL format')
  .optional()

/**
 * Tax ID / VAT number validation (flexible for different countries)
 */
export const taxIdSchema = z.string()
  .min(5, 'Tax ID too short')
  .max(50, 'Tax ID too long')
  .optional()

/**
 * Transaction type validation (IFRS-compliant)
 */
export const transactionTypeSchema = z.enum([
  'Income',
  'Cost of Goods Sold',
  'Operating Expense',
  'Capital Expenditure',
  'Asset',
  'Liability'
], {
  errorMap: () => ({
    message: 'Invalid transaction type. Must be one of: Income, Cost of Goods Sold, Operating Expense, Capital Expenditure, Asset, Liability'
  })
})

/**
 * Payment status validation
 */
export const paymentStatusSchema = z.enum([
  'pending',
  'paid',
  'overdue',
  'cancelled',
  'refunded'
], {
  errorMap: () => ({
    message: 'Invalid payment status. Must be one of: pending, paid, overdue, cancelled, refunded'
  })
})

/**
 * Generic ID parameter validation (for route params)
 */
export const idParamSchema = z.object({
  id: uuidSchema
})

/**
 * Base response schema (for API responses)
 */
export const baseResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional()
})

/**
 * Generic list response with pagination
 */
export function createListResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return baseResponseSchema.extend({
    data: z.object({
      items: z.array(itemSchema),
      pagination: z.object({
        page: z.number().int().positive(),
        limit: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        total_pages: z.number().int().nonnegative()
      })
    })
  })
}

/**
 * Helper: Transform string to number (for query params)
 */
export const stringToNumber = z.string().transform((val) => {
  const num = Number(val)
  if (isNaN(num)) throw new Error('Invalid number')
  return num
})

/**
 * Helper: Transform string to boolean (for query params)
 */
export const stringToBoolean = z.string()
  .transform((val) => val === 'true')
  .or(z.boolean())

/**
 * Type exports for easy access
 */
export type Currency = z.infer<typeof currencySchema>
export type TransactionType = z.infer<typeof transactionTypeSchema>
export type PaymentStatus = z.infer<typeof paymentStatusSchema>
export type Language = z.infer<typeof languageSchema>
export type PaginationParams = z.infer<typeof paginationSchema>
export type DateRange = z.infer<typeof dateRangeSchema>
