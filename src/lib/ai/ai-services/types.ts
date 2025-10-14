/**
 * AI Services Type Definitions
 * Common types and interfaces for all AI processing services
 */

// OCR Result Structure (matches existing extracted_data schema)
export interface OCRResult {
  text: string
  entities: Array<{
    type: string
    value: string
    confidence: number
  }>
  metadata: {
    pageCount?: number
    wordCount: number
    language?: string
    processingMethod: 'ocr' | 'text_extraction'
    layoutElements?: Array<{
      bbox?: number[]
      category?: string
      text?: string
    }>
    boundingBoxes?: Array<{
      x1: number
      y1: number
      x2: number
      y2: number
      category: string
      text: string
    }>
    coordinateReference?: {
      width?: number
      height?: number
    }
  }
}

// Financial Entity Types
export type FinancialEntityType = 
  | 'currency'
  | 'amount' 
  | 'date'
  | 'vendor'
  | 'company'
  | 'reference_number'
  | 'invoice'
  | 'line_item'
  | 'tax'
  | 'total'

// Text Analysis Result
export interface AnalysisResult {
  text: string
  entities: Array<{
    type: FinancialEntityType
    value: string
    confidence: number
  }>
  summary: string
  confidence: number
}

// Document Processing Context
export interface DocumentContext {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  buffer: Buffer
  userId?: string
  imageUrl?: string  // For converted PDFs stored in Supabase
}

// Processing Error with context
export class ProcessingError extends Error {
  constructor(
    message: string,
    public context: {
      service: string
      endpoint?: string
      statusCode?: number
      retryable: boolean
      errorDetails?: string
    }
  ) {
    super(message)
    this.name = 'ProcessingError'
  }

  get service(): string { return this.context.service }
  get endpoint(): string | undefined { return this.context.endpoint }
  get statusCode(): number | undefined { return this.context.statusCode }
  get retryable(): boolean { return this.context.retryable }
}

// Service Health Status
export interface ServiceHealth {
  healthy: boolean
  latency?: number
  lastCheck: Date
  error?: string
}