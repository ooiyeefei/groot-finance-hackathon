/**
 * OCR Service Implementation
 * Handles visual document processing using custom OCR endpoint
 */

import { IOCRService } from './interfaces'
import { OCRResult, DocumentContext, ProcessingError, ServiceHealth } from './types'
import { aiConfig } from '../config/ai-config'

export class OCRService implements IOCRService {
  private readonly endpoint: string
  private readonly modelName: string
  
  constructor() {
    this.endpoint = aiConfig.ocr.endpointUrl
    this.modelName = aiConfig.ocr.modelName
    
    // Validate configuration at construction time
    if (!this.endpoint || !this.modelName) {
      throw new ProcessingError(
        'OCR service configuration invalid. Please check OCR_ENDPOINT_URL and OCR_MODEL_NAME environment variables.',
        {
          service: 'OCR',
          retryable: false,
          errorDetails: `endpoint: ${this.endpoint}, model: ${this.modelName}`
        }
      )
    }
  }

  async processDocument(context: DocumentContext): Promise<OCRResult> {
    try {
      let imageContent: { type: string; image_url: { url: string } }
      
      // Check if we have a Supabase image URL (for converted PDFs)
      if (context.imageUrl) {
        console.log(`[OCR] Using Supabase storage image URL: ${context.imageUrl}`)
        imageContent = {
          type: "image_url",
          image_url: {
            url: context.imageUrl
          }
        }
      } else {
        // Fallback to base64 encoding for direct image uploads
        console.log(`[OCR] Using base64 encoding for direct image`)
        const base64Data = context.buffer.toString('base64')
        const mimeType = context.fileType
        imageContent = {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64Data}`
          }
        }
      }
      
      // Create OpenAI Chat Completions compatible request
      const requestBody = {
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: this.getSystemPrompt()
          },
          {
            role: "user", 
            content: [
              {
                type: "text",
                text: "Please process the attached image according to the system instructions."
              },
              imageContent
            ]
          }
        ]
        // Removed temperature and max_tokens to match working curl payload
      }

      console.log(`[OCR] Processing document ${context.id} (${context.fileName})`)
      console.log(`[OCR] Making request to: ${this.endpoint}/chat/completions`)
      console.log(`[OCR] Model: ${this.modelName}`)
      console.log(`[OCR] Image data size: ${context.buffer.length} bytes`)
      console.log(`[OCR] Request body:`, JSON.stringify(requestBody, null, 2))
      
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        console.log('[OCR] Request timeout - aborting after 12 minutes')
        controller.abort()
      }, 720000) // 12 minute timeout for BCCard model (5-8min + buffer)
      
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[OCR] API Error Response:`, {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          endpoint: this.endpoint,
          modelName: this.modelName,
          contentType: context.fileType
        })
        
        // Provide specific error messages for common issues
        let errorMessage = `OCR API request failed: ${response.status} ${response.statusText}`
        if (response.status === 500) {
          errorMessage += ' - OCR service is experiencing internal errors. Consider switching to OpenAI Vision API as an alternative.'
        } else if (response.status === 401) {
          errorMessage += ' - Authentication failed. Check your OCR API credentials.'
        } else if (response.status === 404) {
          errorMessage += ' - OCR endpoint not found. Verify OCR_ENDPOINT_URL configuration.'
        }
        
        throw new ProcessingError(errorMessage, {
          service: 'OCR',
          endpoint: this.endpoint,
          statusCode: response.status,
          retryable: response.status >= 500 || response.status === 429,
          errorDetails: errorText
        })
      }

      const result = await response.json()
      console.log('[OCR] API Response:', JSON.stringify(result, null, 2))
      
      // Extract content from OpenAI format response
      const content = result.choices?.[0]?.message?.content || result.content || ''
      console.log('[OCR] Extracted content:', content)
      
      if (!content || content.trim() === '') {
        console.error('[OCR] Empty response - result structure:', result)
        console.error('[OCR] This indicates the OCR model is not generating output. Possible causes:')
        console.error('[OCR] 1. OCR service internal error (model not responding)')
        console.error('[OCR] 2. Image format not supported by the model')
        console.error('[OCR] 3. Model configuration issue')
        console.error('[OCR] 4. System prompt causing model to return empty response')
        console.error(`[OCR] Model finish_reason: ${result.choices?.[0]?.finish_reason}`)
        console.error(`[OCR] Token usage - prompt: ${result.usage?.prompt_tokens}, completion: ${result.usage?.completion_tokens}`)
        
        throw new ProcessingError(
          'OCR service returned empty response. The OCR model is not generating output. ' +
          'This typically indicates an internal issue with the OCR service. ' +
          'Consider switching to OpenAI Vision API as an alternative.',
          {
            service: 'OCR',
            retryable: true,
            errorDetails: `finishReason: ${result.choices?.[0]?.finish_reason}, tokens: ${result.usage?.completion_tokens}/${result.usage?.total_tokens}`
          }
        )
      }

      // Parse and validate OCR results
      return this.parseOCRResponse(content, context)
      
    } catch (error) {
      console.error(`[OCR] Processing failed for document ${context.id}:`, error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      // Handle timeout/abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProcessingError(
          'OCR request timed out. The OCR service may be overloaded or unavailable.',
          {
            service: 'OCR',
            retryable: true,
            errorDetails: 'Request timeout after 2 minutes'
          }
        )
      }
      
      // Handle network errors
      if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) {
        throw new ProcessingError(
          'OCR service network error. Check if the OCR endpoint is accessible.',
          {
            service: 'OCR',
            retryable: true,
            errorDetails: error.message
          }
        )
      }
      
      throw new ProcessingError(
        `OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'OCR',
          retryable: false
        }
      )
    }
  }

  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now()
    
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      
      const latency = Date.now() - startTime
      
      return {
        healthy: response.ok,
        latency,
        lastCheck: new Date(),
        error: response.ok ? undefined : `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private getSystemPrompt(): string {
    return `You are an expert financial analyst AI specializing in document intelligence. Your task is to analyze the provided image of a financial document (e.g., invoice, receipt) and extract all financially relevant information in a structured JSON format.

**CORE OBJECTIVES:**
1. **Identify Document Type:** Determine if the document is an invoice, receipt, credit note, etc.
2. **Extract Key-Value Pairs:** Identify all relevant financial entities. Use clear, semantic labels for each entity. You are not limited to a fixed list; identify any data point that is financially significant.
3. **Extract Line Items:** If a table of items is present, extract each line item with its description, quantity, unit price, and total price.
4. **Provide Bounding Boxes:** For every single piece of extracted data (including individual fields within line items), you MUST provide accurate pixel-based bounding box coordinates [x1, y1, x2, y2].

**MANDATORY JSON OUTPUT STRUCTURE:**
You MUST return ONLY a single, valid JSON object matching this schema. Do not include any other text, explanations, or markdown.

{
  "document_summary": {
    "document_type": {
      "value": "Invoice | Receipt | Credit Note | Other",
      "confidence": 0.95,
      "bbox": [x1, y1, x2, y2]
    },
    "vendor_name": {
      "value": "Vendor's Business Name",
      "confidence": 0.9,
      "bbox": [x1, y1, x2, y2]
    },
    "total_amount": {
      "value": "123.45",
      "confidence": 0.99,
      "bbox": [x1, y1, x2, y2]
    },
    "transaction_date": {
      "value": "YYYY-MM-DD",
      "confidence": 0.9,
      "bbox": [x1, y1, x2, y2]
    }
  },
  "financial_entities": [
    {
      "label": "A semantic label, e.g., 'Subtotal', 'Tax (8%)', 'Invoice Number', 'Payment Method'",
      "value": "The extracted text or normalized value",
      "category": "amount | date | id | address | text",
      "confidence": 0.85,
      "bbox": [x1, y1, x2, y2]
    }
  ],
  "line_items": [
    {
      "description": { "value": "Item Description", "bbox": [x1, y1, x2, y2], "confidence": 0.9 },
      "quantity": { "value": "1", "bbox": [x1, y1, x2, y2], "confidence": 0.9 },
      "unit_price": { "value": "50.00", "bbox": [x1, y1, x2, y2], "confidence": 0.9 },
      "line_total": { "value": "50.00", "bbox": [x1, y1, x2, y2], "confidence": 0.9 }
    }
  ],
  "full_text": "A full transcription of all text on the document."
}

**CRITICAL RULES:**
- Return ONLY the JSON object. Your response must start with { and end with }.
- Every value must have a corresponding bounding box.
- Normalize data where appropriate (e.g., dates to YYYY-MM-DD, amounts to numeric strings).
- If a field is not present in the document, omit it from the JSON instead of using null or empty values.
- The 'financial_entities' array should be a comprehensive list of all key-value data found on the document. Be descriptive with your labels.`
  }

  private parseOCRResponse(content: string, context: DocumentContext): OCRResult {
    try {
      console.log(`[OCR] Raw response for ${context.fileName}:`, content.substring(0, 500) + (content.length > 500 ? '...' : ''))
      console.log(`[OCR] Full response length: ${content.length} characters`)
      
      // Try to find JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.error(`[OCR] No JSON found in response for ${context.fileName}`)
        console.error('[OCR] This indicates the model is not following the JSON format instruction')
        console.error('[OCR] Response should start with { and end with }')
        throw new Error("No valid JSON object found in the AI response. Model is not following JSON format instructions.")
      }

      console.log(`[OCR] Found JSON match of length: ${jsonMatch[0].length}`)
      const parsedJson = JSON.parse(jsonMatch[0])
      console.log('[OCR] Successfully parsed JSON response')
      console.log('[OCR] Document summary keys:', Object.keys(parsedJson.document_summary || {}))
      console.log('[OCR] Financial entities count:', (parsedJson.financial_entities || []).length)
      console.log('[OCR] Line items count:', (parsedJson.line_items || []).length)

      const entities: Array<{ type: string; value: string; confidence: number }> = []
      const boundingBoxes: Array<{
        x1: number; y1: number; x2: number; y2: number;
        category: string; text: string;
      }> = []

      // Extract from document_summary with enhanced categorization
      if (parsedJson.document_summary) {
        for (const key in parsedJson.document_summary) {
          const item = parsedJson.document_summary[key]
          if (item && item.value) {
            const normalizedType = this.normalizeEntityType(key)
            entities.push({ 
              type: normalizedType, 
              value: String(item.value), 
              confidence: item.confidence || 0.9 
            })
            if (item.bbox) {
              boundingBoxes.push({ 
                category: normalizedType, 
                text: String(item.value), 
                ...this.mapBbox(item.bbox) 
              })
            }
          }
        }
      }

      // Extract from financial_entities with enhanced categorization
      if (parsedJson.financial_entities && Array.isArray(parsedJson.financial_entities)) {
        parsedJson.financial_entities.forEach((item: {
          label?: string;
          value?: string | number;
          category?: string;
          confidence?: number;
          bbox?: number[];
        }) => {
          if (item && item.value) {
            const normalizedType = this.normalizeEntityType(item.label || item.category || 'unknown')
            entities.push({ 
              type: normalizedType, 
              value: String(item.value), 
              confidence: item.confidence || 0.8 
            })
            if (item.bbox) {
              boundingBoxes.push({ 
                category: normalizedType, 
                text: String(item.value), 
                ...this.mapBbox(item.bbox) 
              })
            }
          }
        })
      }

      // Extract from line_items with enhanced handling
      if (parsedJson.line_items && Array.isArray(parsedJson.line_items)) {
        parsedJson.line_items.forEach((lineItem: Record<string, {
          value?: string | number;
          confidence?: number;
          bbox?: number[];
        }>, itemIndex: number) => {
          for (const field in lineItem) {
            const fieldData = lineItem[field]
            if (fieldData && fieldData.value) {
              const normalizedType = this.normalizeEntityType(`line_item_${field}`)
              entities.push({
                type: normalizedType,
                value: `Item ${itemIndex + 1}: ${String(fieldData.value)}`,
                confidence: fieldData.confidence || 0.8
              })
              if (fieldData.bbox) {
                boundingBoxes.push({
                  category: normalizedType,
                  text: String(fieldData.value),
                  ...this.mapBbox(fieldData.bbox)
                })
              }
            }
          }
        })
      }

      const text = parsedJson.full_text || entities.map(e => e.value).join('\n')
      const wordCount = text.split(/\s+/).filter(Boolean).length

      return {
        text: text.trim(),
        entities: entities,
        metadata: {
          pageCount: 1,
          wordCount,
          language: 'en',
          processingMethod: 'ocr' as const,
          layoutElements: parsedJson,
          boundingBoxes: boundingBoxes
        }
      }

    } catch (parseError) {
      console.error('[OCR] Failed to parse intelligent response:', parseError)
      console.error('[OCR] Raw content that failed to parse:', content.substring(0, 1000))
      console.error('[OCR] This indicates the OCR model is not returning JSON as instructed')
      console.error('[OCR] The model should return ONLY a JSON object starting with { and ending with }')
      
      // Fallback to treating the whole content as text
      const wordCount = content.split(/\s+/).filter(Boolean).length
      console.log(`[OCR] Fallback: Extracted ${content.length} characters with ${wordCount} words but 0 entities`)
      
      return {
        text: content,
        entities: [],
        metadata: {
          pageCount: 1,
          wordCount,
          language: 'en',
          processingMethod: 'ocr'
        }
      }
    }
  }

  private mapBbox(bbox: number[]) {
    if (!bbox || bbox.length !== 4) return { x1: 0, y1: 0, x2: 0, y2: 0 }
    return { x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3] }
  }

  /**
   * Normalize entity types to consistent naming for UI display
   */
  private normalizeEntityType(rawType: string): string {
    const type = rawType.toLowerCase().trim()
    
    // Map common variations to standardized types
    const typeMapping: Record<string, string> = {
      // Amount/Currency mappings
      'total_amount': 'amount',
      'total': 'amount',
      'grand_total': 'amount',
      'subtotal': 'amount',
      'sub_total': 'amount',
      'amount': 'amount',
      'price': 'amount',
      'cost': 'amount',
      'value': 'amount',
      'sum': 'amount',
      'tax': 'tax_amount',
      'tax_amount': 'tax_amount',
      'gst': 'tax_amount',
      'vat': 'tax_amount',
      'discount': 'discount_amount',
      'discount_amount': 'discount_amount',
      
      // Date mappings
      'transaction_date': 'date',
      'invoice_date': 'date',
      'date': 'date',
      'created_date': 'date',
      'issued_date': 'date',
      'due_date': 'due_date',
      'payment_due': 'due_date',
      
      // Vendor/Company mappings
      'vendor_name': 'vendor',
      'company': 'vendor',
      'business': 'vendor',
      'supplier': 'vendor',
      'merchant': 'vendor',
      'from': 'vendor',
      'seller': 'vendor',
      
      // Reference/ID mappings
      'invoice_number': 'invoice_id',
      'receipt_number': 'receipt_id',
      'transaction_id': 'transaction_id',
      'reference': 'reference_id',
      'ref': 'reference_id',
      'id': 'reference_id',
      'number': 'reference_id',
      
      // Address mappings
      'address': 'address',
      'billing_address': 'address',
      'vendor_address': 'address',
      'location': 'address',
      
      // Line item mappings
      'line_item_description': 'item_description',
      'line_item_quantity': 'item_quantity',
      'line_item_unit_price': 'item_unit_price',
      'line_item_line_total': 'item_total',
      'description': 'item_description',
      'quantity': 'item_quantity',
      'qty': 'item_quantity',
      'unit_price': 'item_unit_price',
      'line_total': 'item_total',
      
      // Payment mappings
      'payment_method': 'payment_method',
      'payment_type': 'payment_method',
      'paid_by': 'payment_method',
      
      // Document type mappings
      'document_type': 'document_type',
      'type': 'document_type'
    }
    
    // Return mapped type or original if no mapping found
    return typeMapping[type] || type.replace(/_/g, ' ')
  }

}

