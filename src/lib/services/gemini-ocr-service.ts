/**
 * Gemini OCR Service
 * Core service for processing receipt/invoice images using Google's Gemini API
 * Based on expert recommendations for multimodal image understanding
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { 
  GeminiOCRRequest, 
  GeminiOCRResponse, 
  GeminiOCRError, 
  GeminiProcessingResult,
  GeminiOCRConfig,
  ExpensePromptConfig
} from '@/types/gemini-ocr'
import { ExpenseCategory } from '@/types/expense-claims'

export class GeminiOCRService {
  private genAI: GoogleGenerativeAI
  private config: GeminiOCRConfig

  constructor(apiKey: string, config: Partial<GeminiOCRConfig> = {}) {
    if (!apiKey) {
      throw new Error('Gemini API key is required')
    }

    this.genAI = new GoogleGenerativeAI(apiKey)
    this.config = {
      model: 'gemini-2.5-flash',
      timeoutMs: 30000,
      retryAttempts: 3,
      confidenceThreshold: 0.7,
      temperature: 0.1, // Low temperature for consistent extraction
      ...config
    }
  }

  /**
   * Process receipt/invoice image and extract structured expense data
   */
  async processReceipt(request: GeminiOCRRequest): Promise<GeminiProcessingResult> {
    const startTime = Date.now()

    try {
      console.log(`[Gemini OCR] Processing ${request.documentType} with model ${this.config.model}`)

      const result = await this.retryWithBackoff(async () => {
        return await this.callGeminiAPI(request)
      })

      const processingTime = Date.now() - startTime
      
      // Add processing metadata
      if (result.success && result.data) {
        result.data.processing_metadata = {
          model_used: this.config.model,
          processing_time_ms: processingTime
        }
      }

      result.processing_time_ms = processingTime
      console.log(`[Gemini OCR] Processing completed in ${processingTime}ms, success: ${result.success}`)

      return result

    } catch (error) {
      const processingTime = Date.now() - startTime
      console.error('[Gemini OCR] Processing failed:', error)

      return {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          error_type: 'api_error'
        },
        processing_time_ms: processingTime
      }
    }
  }

  /**
   * Call Gemini API with structured prompt for expense extraction
   */
  private async callGeminiAPI(request: GeminiOCRRequest): Promise<GeminiProcessingResult> {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: this.config.model,
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxTokens || 2048
        }
      })

      const prompt = this.buildExpenseExtractionPrompt()
      
      // Convert base64 to Gemini format
      const imagePart = {
        inlineData: {
          data: request.imageBase64,
          mimeType: request.mimeType
        }
      }

      // Generate content with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('API timeout')), this.config.timeoutMs)
      })

      const apiCall = model.generateContent([prompt, imagePart])
      const result = await Promise.race([apiCall, timeoutPromise])
      
      const response = await result.response
      const responseText = response.text()

      console.log('[Gemini OCR] Raw API response length:', responseText.length)
      
      // Parse and validate the JSON response
      const parsedData = this.parseGeminiResponse(responseText)
      
      if (!parsedData) {
        return {
          success: false,
          error: {
            error: 'Failed to parse Gemini response as valid JSON',
            error_type: 'parsing_error',
            raw_response: responseText.slice(0, 500) // Truncate for logging
          },
          processing_time_ms: 0
        }
      }

      // Validate the response structure
      const validationResult = this.validateGeminiResponse(parsedData)
      if (!validationResult.isValid) {
        return {
          success: false,
          error: {
            error: `Invalid response structure: ${validationResult.errors.join(', ')}`,
            error_type: 'validation_error',
            raw_response: responseText.slice(0, 500)
          },
          processing_time_ms: 0
        }
      }

      return {
        success: true,
        data: parsedData,
        processing_time_ms: 0 // Will be set by caller
      }

    } catch (error) {
      console.error('[Gemini OCR] API call failed:', error)
      
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('quota') || error.message.includes('rate limit')) {
          return {
            success: false,
            error: {
              error: 'API rate limit exceeded',
              error_type: 'rate_limit_error',
              retry_after: 60 // Suggest 60 second retry
            },
            processing_time_ms: 0
          }
        }
      }

      throw error // Re-throw for retry logic
    }
  }

  /**
   * Build the expense extraction prompt based on expert recommendations
   */
  private buildExpenseExtractionPrompt(): string {
    const promptConfig: ExpensePromptConfig = {
      categories: ['travel_accommodation', 'petrol', 'toll', 'entertainment', 'other'],
      currencies: ['SGD', 'USD', 'EUR', 'MYR', 'THB', 'IDR', 'CNY', 'VND', 'PHP'],
      dateFormat: 'YYYY-MM-DD',
      confidenceThreshold: this.config.confidenceThreshold,
      requiresValidationThreshold: 0.8
    }

    return `You are an expert financial analyst specializing in expense receipt processing for Southeast Asian businesses.

TASK: Extract structured data from this receipt/invoice image for expense claim processing.

REQUIRED OUTPUT: Return ONLY a valid JSON object with this exact structure:
{
  "vendor_name": "Business name from receipt",
  "total_amount": 123.45,
  "currency": "${promptConfig.currencies.join('|')}",
  "transaction_date": "${promptConfig.dateFormat}",
  "description": "Brief expense description based on items/services",
  "line_items": [
    {
      "description": "Item name",
      "amount": 12.34,
      "quantity": 1,
      "tax_rate": 0.07
    }
  ],
  "suggested_category": "${promptConfig.categories.join('|')}",
  "category_confidence": 0.85,
  "confidence_score": 0.90,
  "requires_validation": false,
  "reasoning": "Brief explanation of extraction and categorization decisions"
}

CATEGORIZATION RULES:
- travel_accommodation: Hotels, flights, transport, accommodation, travel booking
- petrol: Fuel, gas stations, vehicle fuel, automotive services
- toll: Highway tolls, road charges, parking fees  
- entertainment: Client meals, business dining, events, team building, restaurant expenses
- other: Other legitimate business expenses

EXTRACTION RULES:
1. Extract exact amounts and dates visible on receipt
2. Use final total amount including all taxes and service charges
3. Normalize currency to standard ISO codes (default SGD if unclear)
4. If year missing from date, use current year (${new Date().getFullYear()})
5. Provide confidence scores as decimal (0.0-1.0)
6. Set requires_validation=true if confidence_score < ${promptConfig.requiresValidationThreshold}
7. Include reasoning for categorization and any ambiguities
8. Extract line items when clearly visible and itemized

CRITICAL: Return only the JSON object, no markdown formatting or additional text.`
  }

  /**
   * Parse Gemini API response and clean up common formatting issues
   */
  private parseGeminiResponse(responseText: string): GeminiOCRResponse | null {
    try {
      // Remove common markdown formatting that LLMs sometimes add
      let cleanText = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()

      // Find JSON object if wrapped in other text
      const jsonStart = cleanText.indexOf('{')
      const jsonEnd = cleanText.lastIndexOf('}')
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanText = cleanText.slice(jsonStart, jsonEnd + 1)
      }

      const parsed = JSON.parse(cleanText)
      return parsed as GeminiOCRResponse

    } catch (error) {
      console.error('[Gemini OCR] JSON parsing failed:', error)
      console.error('[Gemini OCR] Raw response:', responseText.slice(0, 200) + '...')
      return null
    }
  }

  /**
   * Validate Gemini response structure
   */
  private validateGeminiResponse(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    const requiredFields = [
      'vendor_name', 'total_amount', 'currency', 'transaction_date', 
      'suggested_category', 'confidence_score'
    ]

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    // Validate data types and ranges
    if (typeof data.total_amount !== 'number' || data.total_amount <= 0) {
      errors.push('total_amount must be a positive number')
    }

    if (typeof data.confidence_score !== 'number' || data.confidence_score < 0 || data.confidence_score > 1) {
      errors.push('confidence_score must be between 0 and 1')
    }

    const validCategories: ExpenseCategory[] = [
      'travel_accommodation', 
      'petrol', 
      'toll', 
      'entertainment', 
      'other'
    ]
    if (!validCategories.includes(data.suggested_category)) {
      errors.push(`Invalid category: ${data.suggested_category}`)
    }

    // Validate date format
    if (data.transaction_date && !this.isValidDate(data.transaction_date)) {
      errors.push('Invalid transaction_date format, expected YYYY-MM-DD')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Simple date validation for YYYY-MM-DD format
   */
  private isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/
    if (!regex.test(dateString)) return false
    
    const date = new Date(dateString)
    return date instanceof Date && !isNaN(date.getTime())
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= this.config.retryAttempts) {
        throw error
      }

      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // Max 10s delay
      console.log(`[Gemini OCR] Attempt ${attempt} failed, retrying in ${delay}ms...`)
      
      await new Promise(resolve => setTimeout(resolve, delay))
      return this.retryWithBackoff(operation, attempt + 1)
    }
  }
}

/**
 * Factory function to create GeminiOCRService instance
 */
export function createGeminiOCRService(config?: Partial<GeminiOCRConfig>): GeminiOCRService {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required')
  }

  return new GeminiOCRService(apiKey, config)
}