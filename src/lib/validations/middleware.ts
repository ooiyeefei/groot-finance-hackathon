/**
 * Zod Validation Middleware for Next.js API Routes
 *
 * Provides helper functions for validating request data with Zod schemas.
 * Handles validation errors with proper HTTP status codes and error messages.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError } from 'zod'

/**
 * Validation error response structure
 */
interface ValidationErrorResponse {
  success: false
  error: string
  details: Array<{
    field: string
    message: string
  }>
}

/**
 * Format Zod validation errors into user-friendly structure
 */
function formatZodErrors(error: ZodError): ValidationErrorResponse['details'] {
  return error.errors.map((err) => ({
    field: err.path.join('.') || 'root',
    message: err.message
  }))
}

/**
 * Validate request body against Zod schema
 *
 * @param request - Next.js request object
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated data, or null if validation fails
 *
 * @example
 * const validated = await validateBody(request, createExpenseSchema)
 * if (!validated.success) {
 *   return validated.error // Returns NextResponse with 400 error
 * }
 * const data = validated.data // Type-safe validated data
 */
export async function validateBody<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; error: NextResponse }
> {
  try {
    const body = await request.json()
    const validated = schema.parse(body)

    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            success: false,
            error: 'Validation failed',
            details: formatZodErrors(error)
          } as ValidationErrorResponse,
          { status: 400 }
        )
      }
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            success: false,
            error: 'Invalid JSON in request body'
          },
          { status: 400 }
        )
      }
    }

    // Unexpected error
    console.error('[Validation] Unexpected error during body validation:', error)
    return {
      success: false,
      error: NextResponse.json(
        {
          success: false,
          error: 'Internal server error during validation'
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Validate query parameters against Zod schema
 *
 * @param request - Next.js request object
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated query params, or null if validation fails
 *
 * @example
 * const validated = validateQuery(request, listExpensesQuerySchema)
 * if (!validated.success) {
 *   return validated.error // Returns NextResponse with 400 error
 * }
 * const params = validated.data // Type-safe validated params
 */
export function validateQuery<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
):
  | { success: true; data: z.infer<T> }
  | { success: false; error: NextResponse }
{
  try {
    const { searchParams } = new URL(request.url)

    // Convert URLSearchParams to plain object
    const params: Record<string, string | string[]> = {}
    searchParams.forEach((value, key) => {
      // Handle multiple values for same key (arrays)
      if (params[key]) {
        if (Array.isArray(params[key])) {
          (params[key] as string[]).push(value)
        } else {
          params[key] = [params[key] as string, value]
        }
      } else {
        params[key] = value
      }
    })

    const validated = schema.parse(params)

    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            success: false,
            error: 'Invalid query parameters',
            details: formatZodErrors(error)
          } as ValidationErrorResponse,
          { status: 400 }
        )
      }
    }

    // Unexpected error
    console.error('[Validation] Unexpected error during query validation:', error)
    return {
      success: false,
      error: NextResponse.json(
        {
          success: false,
          error: 'Internal server error during validation'
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Validate route parameters (path params) against Zod schema
 *
 * @param params - Route params object
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated params, or null if validation fails
 *
 * @example
 * const validated = await validateParams(params, idParamSchema)
 * if (!validated.success) {
 *   return validated.error // Returns NextResponse with 400 error
 * }
 * const { id } = validated.data // Type-safe validated ID
 */
export async function validateParams<T extends z.ZodTypeAny>(
  params: Promise<any> | any,
  schema: T
):Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; error: NextResponse }
> {
  try {
    // Handle both Promise and plain object params
    const resolvedParams = params instanceof Promise ? await params : params
    const validated = schema.parse(resolvedParams)

    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: NextResponse.json(
          {
            success: false,
            error: 'Invalid route parameters',
            details: formatZodErrors(error)
          } as ValidationErrorResponse,
          { status: 400 }
        )
      }
    }

    // Unexpected error
    console.error('[Validation] Unexpected error during params validation:', error)
    return {
      success: false,
      error: NextResponse.json(
        {
          success: false,
          error: 'Internal server error during validation'
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Validate FormData against Zod schema
 *
 * @param request - Next.js request object
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated form data, or null if validation fails
 *
 * @example
 * const validated = await validateFormData(request, uploadFileSchema)
 * if (!validated.success) {
 *   return validated.error // Returns NextResponse with 400 error
 * }
 * const formData = validated.data // Type-safe validated form data
 */
export async function validateFormData<T extends z.ZodTypeAny>(
  request: NextRequest,
  schema: T
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; error: NextResponse }
> {
  // Declare data outside try block so it's accessible in catch block
  let data: Record<string, any> = {}

  try {
    const formData = await request.formData()

    // Convert FormData to plain object
    data = {}
    formData.forEach((value, key) => {
      // Keep File objects as-is for file uploads
      if (value instanceof File) {
        data[key] = value
      } else {
        // Handle multiple values for same key
        if (data[key]) {
          if (Array.isArray(data[key])) {
            data[key].push(value)
          } else {
            data[key] = [data[key], value]
          }
        } else {
          data[key] = value
        }
      }
    })

    const validated = schema.parse(data)

    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof ZodError) {
      const formattedErrors = formatZodErrors(error)

      return {
        success: false,
        error: NextResponse.json(
          {
            success: false,
            error: 'Invalid form data',
            details: formattedErrors
          } as ValidationErrorResponse,
          { status: 400 }
        )
      }
    }

    // Unexpected error
    console.error('[Validation] Unexpected error during form data validation:', error)
    console.error('[Validation] Error stack:', error instanceof Error ? error.stack : 'N/A')
    return {
      success: false,
      error: NextResponse.json(
        {
          success: false,
          error: 'Internal server error during validation'
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Safe parse utility - returns parsed data or undefined
 * Useful for optional validation where you want to handle errors manually
 *
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns Parsed data or undefined if validation fails
 *
 * @example
 * const validated = safeParse(body, schema)
 * if (validated) {
 *   // Use validated data
 * } else {
 *   // Handle validation failure
 * }
 */
export function safeParse<T extends z.ZodTypeAny>(
  data: unknown,
  schema: T
): z.infer<T> | undefined {
  try {
    return schema.parse(data)
  } catch {
    return undefined
  }
}

/**
 * Validate and coerce types (useful for query params that come as strings)
 *
 * @example
 * const validated = coerceAndValidate({ page: "1", limit: "20" }, paginationSchema)
 * // Returns: { page: 1, limit: 20 } with proper types
 */
export function coerceAndValidate<T extends z.ZodTypeAny>(
  data: unknown,
  schema: T
): z.infer<T> {
  return schema.parse(data)
}

/**
 * Type guard to check if validation result is successful
 */
export function isValidationSuccess<T>(
  result: { success: boolean; data?: T; error?: NextResponse }
): result is { success: true; data: T } {
  return result.success === true
}
