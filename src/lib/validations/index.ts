/**
 * Validation Schemas - Barrel Export
 *
 * Central export point for all Zod validation schemas and middleware.
 * Import from this file to use validation throughout the application.
 *
 * @example
 * import { validateBody, createExpenseClaimSchema } from '@/lib/validations'
 */

// Middleware and helpers
export * from './middleware'

// Common schemas
export * from './common'

// Domain-specific schemas
export * from './expense-claims'
export * from './accounting'
export * from './chat'
export * from './business'

/**
 * Usage Examples:
 *
 * 1. Validate request body:
 *    const validated = await validateBody(request, createExpenseClaimSchema)
 *    if (!validated.success) return validated.error
 *    const data = validated.data
 *
 * 2. Validate query parameters:
 *    const validated = validateQuery(request, listExpenseClaimsQuerySchema)
 *    if (!validated.success) return validated.error
 *    const params = validated.data
 *
 * 3. Validate route parameters:
 *    const validated = await validateParams(params, expenseClaimIdParamSchema)
 *    if (!validated.success) return validated.error
 *    const { id } = validated.data
 *
 * 4. Validate form data:
 *    const validated = await validateFormData(request, createExpenseClaimFileSchema)
 *    if (!validated.success) return validated.error
 *    const formData = validated.data
 */
