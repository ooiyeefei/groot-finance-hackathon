/**
 * SEA-LION Text Analysis Service Implementation
 * Handles financial data extraction and translation using SEA-LION endpoint
 */

import { ITextAnalysisService } from './interfaces'
import { AnalysisResult, ProcessingError, ServiceHealth, FinancialEntityType } from './types'
import { aiConfig } from '../config/ai-config'

export class TextAnalysisService implements ITextAnalysisService {
  private readonly endpoint: string
  private readonly modelId: string
  
  constructor() {
    this.endpoint = aiConfig.seaLion.endpointUrl
    this.modelId = aiConfig.seaLion.modelId
  }

  async extractFinancialData(text: string): Promise<AnalysisResult> {
    if (!text || text.trim().length === 0) {
      throw new ProcessingError('Empty text provided for financial analysis', {
        service: 'SEA-LION',
        retryable: false
      })
    }

    try {
      const requestBody = {
        model: this.modelId,
        messages: [
          {
            role: "system",
            content: this.getFinancialAnalysisPrompt()
          },
          {
            role: "user",
            content: `Extract structured financial data from this document text:\n\n${text}`
          }
        ],
        temperature: 0.1,
        max_tokens: 1500
      }

      console.log(`[SEA-LION] Analyzing financial data (${text.length} chars)`)

      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `SEA-LION API request failed: ${response.status} ${response.statusText}`,
          {
            service: 'SEA-LION',
            endpoint: this.endpoint,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      const content = result.choices?.[0]?.message?.content || ''

      if (!content) {
        throw new ProcessingError('SEA-LION service returned empty response', {
          service: 'SEA-LION',
          retryable: true
        })
      }

      return this.parseAnalysisResponse(content, text)

    } catch (error) {
      console.error('[SEA-LION] Financial analysis failed:', error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      // Fallback to basic regex-based extraction
      console.log('[SEA-LION] Falling back to basic entity extraction')
      return this.extractBasicFinancialData(text)
    }
  }

  async translateText(
    text: string, 
    sourceLanguage: string, 
    targetLanguage: string
  ): Promise<string> {
    if (!text || text.trim().length === 0) {
      throw new ProcessingError('Empty text provided for translation', {
        service: 'SEA-LION',
        retryable: false
      })
    }

    try {
      const requestBody = {
        model: this.modelId,
        messages: [
          {
            role: "system",
            content: this.getTranslationPrompt(sourceLanguage, targetLanguage)
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: Math.min(text.length * 2, 2000) // Reasonable token limit for translation
      }

      console.log(`[SEA-LION] Translating text from ${sourceLanguage} to ${targetLanguage}`)

      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new ProcessingError(
          `Translation API request failed: ${response.status} ${response.statusText}`,
          {
            service: 'SEA-LION',
            endpoint: this.endpoint,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429
          }
        )
      }

      const result = await response.json()
      const translatedText = result.choices?.[0]?.message?.content || ''

      if (!translatedText) {
        throw new ProcessingError('Translation service returned empty response', {
          service: 'SEA-LION',
          retryable: true
        })
      }

      return translatedText.trim()

    } catch (error) {
      console.error('[SEA-LION] Translation failed:', error)
      
      if (error instanceof ProcessingError) {
        throw error
      }
      
      throw new ProcessingError(
        `Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          service: 'SEA-LION',
          retryable: false
        }
      )
    }
  }

  async checkHealth(): Promise<ServiceHealth> {
    const startTime = Date.now()
    
    try {
      const testRequest = {
        model: this.modelId,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello, this is a health check." }
        ],
        max_tokens: 10
      }

      const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(testRequest),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })
      
      const latency = Date.now() - startTime
      
      if (response.ok) {
        const result = await response.json()
        const hasValidResponse = result.choices?.[0]?.message?.content
        
        return {
          healthy: !!hasValidResponse,
          latency,
          lastCheck: new Date(),
          error: hasValidResponse ? undefined : 'Invalid response format'
        }
      } else {
        return {
          healthy: false,
          latency,
          lastCheck: new Date(),
          error: `HTTP ${response.status}: ${response.statusText}`
        }
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

  private getFinancialAnalysisPrompt(): string {
    return `You are an expert financial document analyst specializing in Southeast Asian financial documents. Extract structured financial data and return it as JSON.

Extract these entity types:
- currency: Monetary amounts with currency symbols/codes (SGD, MYR, THB, IDR, USD)
- date: All dates (invoice date, due date, payment date)
- vendor: Business/company names that issued the document
- company: Customer/client names (bill to)
- reference_number: Invoice numbers, receipt numbers, reference codes
- line_item: Individual products/services with amounts
- tax: Tax amounts (GST, VAT, service tax)
- total: Final total amounts

Return ONLY a JSON object in this format:
{
  "entities": [
    {
      "type": "currency|date|vendor|company|reference_number|line_item|tax|total",
      "value": "extracted value",
      "confidence": 0.95
    }
  ],
  "summary": "Brief summary of the document type and key financial information",
  "confidence": 0.90
}

Focus on accuracy and provide confidence scores between 0.0 and 1.0. Extract ALL financial information from the text.`
  }

  private getTranslationPrompt(sourceLanguage: string, targetLanguage: string): string {
    return `You are an expert translator specializing in financial documents for Southeast Asian markets. 

Translate the following text from ${sourceLanguage} to ${targetLanguage}. 

Important guidelines:
- Maintain the original meaning and context
- Preserve financial terms and amounts exactly
- Keep proper nouns (company names, addresses) unchanged
- Maintain document structure and formatting
- Use appropriate business/financial terminology for the target language
- For currencies, keep the original currency codes and amounts

Provide only the translation without any additional comments or explanations.`
  }

  private parseAnalysisResponse(content: string, originalText: string): AnalysisResult {
    try {
      // Handle markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
      const jsonContent = jsonMatch ? jsonMatch[1] : content
      
      const parsed = JSON.parse(jsonContent)
      
      // Validate and normalize the response
      const entities = (parsed.entities || []).map((entity: { type?: string; value?: unknown; confidence?: number }) => ({
        type: entity.type as FinancialEntityType,
        value: String(entity.value || ''),
        confidence: Math.min(Math.max(Number(entity.confidence || 0.5), 0), 1)
      }))

      return {
        text: originalText,
        entities,
        summary: parsed.summary || 'Financial document processed',
        confidence: Math.min(Math.max(Number(parsed.confidence || 0.7), 0), 1)
      }

    } catch (parseError) {
      console.error('[SEA-LION] Failed to parse analysis response:', parseError)
      
      // Fallback to basic extraction
      return this.extractBasicFinancialData(originalText)
    }
  }

  private extractBasicFinancialData(text: string): AnalysisResult {
    const entities: Array<{ type: FinancialEntityType; value: string; confidence: number }> = []
    
    // Currency patterns for Southeast Asian currencies
    const currencyPatterns = [
      { regex: /SGD\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi, currency: 'SGD', type: 'currency' as const },
      { regex: /MYR\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi, currency: 'MYR', type: 'currency' as const },
      { regex: /THB\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi, currency: 'THB', type: 'currency' as const },
      { regex: /IDR\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/gi, currency: 'IDR', type: 'currency' as const },
      { regex: /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g, currency: 'USD', type: 'currency' as const }
    ]

    currencyPatterns.forEach(pattern => {
      let match
      while ((match = pattern.regex.exec(text)) !== null) {
        entities.push({
          type: pattern.type,
          value: `${pattern.currency} ${match[1]}`,
          confidence: 0.8
        })
      }
    })

    // Date patterns
    const dateRegex = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|\d{1,2}\s+\w+\s+\d{4})\b/g
    let dateMatch
    while ((dateMatch = dateRegex.exec(text)) !== null) {
      entities.push({
        type: 'date',
        value: dateMatch[1],
        confidence: 0.7
      })
    }

    // Invoice/Reference number patterns
    const invoiceRegex = /(?:invoice|receipt|ref|reference|inv)[\s#:]*([A-Z0-9\-]+)/gi
    let invoiceMatch
    while ((invoiceMatch = invoiceRegex.exec(text)) !== null) {
      entities.push({
        type: 'reference_number',
        value: invoiceMatch[1],
        confidence: 0.6
      })
    }

    return {
      text,
      entities,
      summary: 'Basic financial data extraction applied',
      confidence: 0.6
    }
  }
}