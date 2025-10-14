/**
 * Application Domain Zod Validation Schemas
 * Input validation for API requests and data transformation
 */

import { z } from 'zod'

// ============================================================================
// Application Creation Schema
// ============================================================================

export const CreateApplicationSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be 100 characters or less')
    .trim(),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .optional()
    .transform(val => val?.trim() || ''),
  application_type: z
    .string()
    .default('personal_loan')
    .transform(val => val || 'personal_loan')
})

export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>

// ============================================================================
// Application Update Schema
// ============================================================================

export const UpdateApplicationSchema = z.object({
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(100, 'Title must be 100 characters or less')
    .trim()
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .trim()
    .optional()
})

export type UpdateApplicationInput = z.infer<typeof UpdateApplicationSchema>

// ============================================================================
// List Applications Query Parameters Schema
// ============================================================================

export const ListApplicationsParamsSchema = z.object({
  page: z
    .string()
    .optional()
    .transform(val => parseInt(val || '1'))
    .pipe(z.number().min(1).default(1)),
  limit: z
    .string()
    .optional()
    .transform(val => Math.min(parseInt(val || '20'), 100))
    .pipe(z.number().min(1).max(100).default(20)),
  status: z
    .enum(['draft', 'processing', 'completed', 'failed', 'needs_review'])
    .optional(),
  application_type: z
    .string()
    .optional()
    .transform(val => val === '' ? undefined : val)
})

export type ListApplicationsParams = z.infer<typeof ListApplicationsParamsSchema>

// ============================================================================
// Document Upload Schema
// ============================================================================

export const UploadDocumentSchema = z.object({
  slot: z.enum([
    'identity_card',
    'payslip_recent',
    'payslip_month1',
    'payslip_month2',
    'application_form'
  ], {
    errorMap: () => ({ message: 'Invalid document slot' })
  })
})

export type UploadDocumentInput = z.infer<typeof UploadDocumentSchema>

// ============================================================================
// Application ID Validation
// ============================================================================

export const ApplicationIdSchema = z.string().uuid('Invalid application ID format')

export const DocumentIdSchema = z.string().uuid('Invalid document ID format')

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates and transforms create application input
 */
export function validateCreateApplication(data: unknown) {
  return CreateApplicationSchema.parse(data)
}

/**
 * Validates and transforms update application input
 */
export function validateUpdateApplication(data: unknown) {
  return UpdateApplicationSchema.parse(data)
}

/**
 * Validates and transforms list query parameters
 */
export function validateListParams(params: URLSearchParams) {
  const rawParams = {
    page: params.get('page') || undefined,
    limit: params.get('limit') || undefined,
    status: params.get('status') || undefined,
    application_type: params.get('application_type') || undefined
  }
  return ListApplicationsParamsSchema.parse(rawParams)
}

/**
 * Validates application ID
 */
export function validateApplicationId(id: string) {
  return ApplicationIdSchema.parse(id)
}

/**
 * Validates document ID
 */
export function validateDocumentId(id: string) {
  return DocumentIdSchema.parse(id)
}
