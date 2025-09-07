/**
 * Gemini OCR Integration Types
 * TypeScript interfaces for Gemini API OCR responses and expense processing
 */

import { ExpenseCategory } from './expense-claims'

export interface GeminiOCRRequest {
  imageBase64: string
  mimeType: string
  expenseCategory?: ExpenseCategory
  documentType: 'receipt' | 'invoice'
}

export interface GeminiLineItem {
  description: string
  amount: number
  quantity?: number
  tax_rate?: number
  item_category?: string
}

export interface GeminiOCRResponse {
  vendor_name: string
  total_amount: number
  currency: string
  transaction_date: string
  description: string
  line_items: GeminiLineItem[]
  suggested_category: ExpenseCategory
  category_confidence: number
  confidence_score: number
  requires_validation: boolean
  reasoning?: string
  processing_metadata?: {
    model_used: string
    processing_time_ms: number
    image_dimensions?: {
      width: number
      height: number
    }
  }
}

export interface GeminiOCRError {
  error: string
  error_type: 'api_error' | 'parsing_error' | 'validation_error' | 'rate_limit_error'
  retry_after?: number
  raw_response?: string
}

export interface GeminiProcessingResult {
  success: boolean
  data?: GeminiOCRResponse
  error?: GeminiOCRError
  processing_time_ms: number
}

// Configuration types
export interface GeminiOCRConfig {
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro'
  maxTokens?: number
  temperature?: number
  timeoutMs: number
  retryAttempts: number
  confidenceThreshold: number
}

// Prompt template configuration
export interface ExpensePromptConfig {
  categories: ExpenseCategory[]
  currencies: string[]
  dateFormat: string
  confidenceThreshold: number
  requiresValidationThreshold: number
}