/**
 * OCR Service Implementation
 * Handles visual document processing using custom OCR endpoint
 */

import { IOCRService } from './interfaces'
import { OCRResult, DocumentContext, ProcessingError, ServiceHealth } from './types'
import { aiConfig } from '../config/ai-config'
import { fromBuffer } from 'pdf2pic'
import { createWriteStream, mkdirSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'

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
      } else if (context.fileType === 'application/pdf') {
        // Convert PDF to image first
        console.log(`[OCR] Converting PDF to image for processing`)
        const imageBuffer = await this.convertPdfToImage(context.buffer)
        
        // Validate that PDF conversion was successful
        if (!imageBuffer || imageBuffer.length === 0) {
          throw new ProcessingError(
            'PDF to image conversion failed or returned empty result. This typically indicates missing system dependencies (GraphicsMagick or ImageMagick). Install with: brew install graphicsmagick',
            {
              service: 'OCR',
              retryable: false,
              errorDetails: `Converted buffer size: ${imageBuffer ? imageBuffer.length : 'null'} bytes`
            }
          )
        }
        
        console.log(`[OCR] PDF converted successfully to image buffer: ${imageBuffer.length} bytes`)
        const base64Data = imageBuffer.toString('base64')
        imageContent = {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${base64Data}`
          }
        }
      } else {
        // Direct image processing
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
      
      // Create chat completions API compatible request with image (matching your working curl)
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
              {
                type: "image_url",
                image_url: {
                  url: imageContent.image_url.url
                }
              }
            ]
          }
        ]
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
      
      // Extract content from chat completions API response
      const content = result.choices?.[0]?.message?.content || result.choices?.[0]?.text || result.content || ''
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
      
      // Enhanced JSON extraction with multiple strategies
      let parsedJson = this.extractJSONFromResponse(content);
      
      if (!parsedJson) {
        console.warn(`[OCR] No valid JSON found using standard extraction for ${context.fileName}`);
        console.warn('[OCR] Attempting fallback parsing strategies...');
        
        // Fallback strategy 1: Try to extract partial JSON structures
        parsedJson = this.attemptPartialJSONReconstruction(content);
        
        if (!parsedJson) {
          console.warn(`[OCR] Partial JSON reconstruction failed for ${context.fileName}`);
          console.warn('[OCR] Falling back to raw text extraction with entity detection');
          
          // Fallback strategy 2: Raw text with intelligent entity detection
          return this.createFallbackResult(content, context);
        }
      }

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
          boundingBoxes: boundingBoxes,
          // Add coordinate reference dimensions for frontend scaling
          coordinateReference: {
            width: context.imageUrl ? undefined : context.buffer.length > 0 ? 1024 : 800, // Default OCR processing dimensions
            height: context.imageUrl ? undefined : context.buffer.length > 0 ? 768 : 600  // These should ideally come from the OCR model
          }
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

  /**
   * Enhanced JSON extraction with multiple strategies
   */
  private extractJSONFromResponse(content: string): any | null {
    // Strategy 1: Look for complete JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (error) {
        console.warn('[OCR] Failed to parse JSON match:', error);
      }
    }

    // Strategy 2: Look for JSON between code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch (error) {
        console.warn('[OCR] Failed to parse code block JSON:', error);
      }
    }

    // Strategy 3: Look for JSON after common prefixes
    const prefixPatterns = [
      /(?:result|output|response|json):\s*(\{[\s\S]*\})/i,
      /(?:here|below)\s+is\s+the\s+(?:result|json|output):\s*(\{[\s\S]*\})/i
    ];

    for (const pattern of prefixPatterns) {
      const match = content.match(pattern);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (error) {
          console.warn(`[OCR] Failed to parse prefixed JSON (${pattern}):`, error);
        }
      }
    }

    return null;
  }

  /**
   * Attempt to reconstruct partial JSON from malformed responses
   */
  private attemptPartialJSONReconstruction(content: string): any | null {
    try {
      // Find potential JSON start and try to fix common issues
      let jsonContent = content.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      if (!jsonContent.startsWith('{') || !jsonContent.endsWith('}')) {
        return null;
      }

      // Fix common JSON issues
      jsonContent = jsonContent
        .replace(/,\s*}/g, '}')  // Remove trailing commas
        .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Quote unquoted keys
        .replace(/:\s*'([^']*)'/g, ': "$1"')  // Convert single quotes to double quotes
        .replace(/\n/g, ' ')  // Remove newlines that might break parsing
        .replace(/\t/g, ' ')  // Replace tabs with spaces
        .replace(/\s+/g, ' '); // Normalize whitespace

      return JSON.parse(jsonContent);
    } catch (error) {
      console.warn('[OCR] Partial JSON reconstruction failed:', error);
      return null;
    }
  }

  /**
   * Create a fallback result from raw text when JSON parsing fails
   */
  private createFallbackResult(content: string, context: DocumentContext): OCRResult {
    console.log(`[OCR] Creating fallback result for ${context.fileName}`);
    
    const entities: Array<{ type: string; value: string; confidence: number }> = [];
    
    // Extract potential amounts using regex patterns
    const amountPattern = /\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?/g;
    const amounts = content.match(amountPattern) || [];
    amounts.forEach((amount, index) => {
      entities.push({
        type: 'amount',
        value: amount.replace(/\$/, ''),
        confidence: 0.7
      });
    });

    // Extract potential dates
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{4}/g,
      /\d{4}-\d{2}-\d{2}/g,
      /\d{1,2}-\d{1,2}-\d{4}/g
    ];
    
    datePatterns.forEach(pattern => {
      const dates = content.match(pattern) || [];
      dates.forEach(date => {
        entities.push({
          type: 'date',
          value: date,
          confidence: 0.6
        });
      });
    });

    // Extract potential invoice/receipt numbers
    const refPattern = /(?:invoice|receipt|ref|no)\.?\s*#?(\w+)/gi;
    const refs = content.match(refPattern) || [];
    refs.forEach(ref => {
      entities.push({
        type: 'reference_id',
        value: ref,
        confidence: 0.5
      });
    });

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    
    console.log(`[OCR] Fallback extraction: ${entities.length} entities from ${wordCount} words`);
    
    return {
      text: content.trim(),
      entities: entities,
      metadata: {
        pageCount: 1,
        wordCount,
        language: 'en',
        processingMethod: 'text_extraction' as const
      }
    };
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

  /**
   * Convert PDF buffer to image buffer using pdf2pic
   */
  private async convertPdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      console.log(`[OCR] Starting PDF to image conversion`)
      
      // Create pdf2pic converter with options
      const convert = fromBuffer(pdfBuffer, {
        density: 200,           // DPI for output image
        saveFilename: "page",   // Base filename
        savePath: "./temp",     // Temporary directory
        format: "png",          // Output format
        width: 1024,           // Max width
        height: 1400,          // Max height
        quality: 95            // Quality (for JPEG)
      })

      // Ensure temp directory exists
      const tempDir = './temp'
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true })
      }

      // Convert first page only
      console.log(`[OCR] Converting PDF page 1 to PNG`)
      const result = await convert(1, { responseType: "buffer" })
      
      if (!result.buffer) {
        throw new ProcessingError(
          'PDF conversion failed: No image buffer returned',
          {
            service: 'OCR',
            retryable: false,
            errorDetails: 'pdf2pic returned no buffer'
          }
        )
      }

      console.log(`[OCR] PDF converted successfully, image size: ${result.buffer.length} bytes`)
      return result.buffer
      
    } catch (error) {
      console.error('[OCR] PDF conversion failed:', error)
      
      throw new ProcessingError(
        `PDF to image conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'OCR',
          retryable: false,
          errorDetails: error instanceof Error ? error.message : 'Unknown conversion error'
        }
      )
    }
  }

}

