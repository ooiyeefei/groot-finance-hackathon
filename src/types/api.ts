/**
 * Generic API Response Types
 * Shared across all domains
 */

/**
 * Standard API success response wrapper
 */
export interface TApiSuccessResponse<T = any> {
  success: true
  data?: T
  message?: string
}

/**
 * Standard API error response wrapper
 */
export interface TApiErrorResponse {
  success: false
  error: string
  details?: string
  code?: string
}

export type TApiResponse<T = any> = TApiSuccessResponse<T> | TApiErrorResponse