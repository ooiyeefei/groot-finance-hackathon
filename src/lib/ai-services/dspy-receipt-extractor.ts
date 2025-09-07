/**
 * DSPy-Inspired Receipt Extraction Service
 * Implements DSPy methodology for systematic receipt OCR processing
 * 
 * Core DSPy Principles Applied:
 * 1. Declarative Signatures (TypeScript interfaces as contracts)
 * 2. Chain-of-Thought reasoning (systematic step-by-step analysis) 
 * 3. Modular Components (single responsibility)
 * 4. Structured Output (JSON schema enforcement)
 */

import { GeminiService } from './gemini-service'
import { 
  ExtractedReceiptData, 
  DSPyExtractionResult, 
  ExtractionReasoning,
  DSPyPromptConfig,
  ExtractedLineItem 
} from '@/types/expense-extraction'

/**
 * DSPy-inspired receipt extraction service
 * This class simulates DSPy's modular approach to LLM programming
 */
export class DSPyReceiptExtractor {
  private geminiService: GeminiService
  private config: DSPyPromptConfig

  constructor(config?: Partial<DSPyPromptConfig>) {
    this.geminiService = new GeminiService()
    this.config = {
      modelName: 'gemini-2.5-flash',
      temperature: 0.1, // Low temperature for consistent extraction
      maxTokens: 4000,
      enableChainOfThought: true,
      enforceJsonSchema: true,
      enableFewShotExamples: false, // Start with zero-shot, can add examples later
      confidenceThreshold: 0.7,
      retryAttempts: 2,
      fallbackToManualEntry: true,
      ...config
    }
  }

  /**
   * DSPy Signature Implementation: receiptText -> extractedData
   * Main extraction method that follows DSPy's declarative approach
   */
  async extractExpenseData(
    receiptText: string,
    receiptImageUrl?: string
  ): Promise<DSPyExtractionResult> {
    console.log('[DSPy Receipt Extractor] Starting extraction process')
    console.log('[DSPy Receipt Extractor] Receipt text length:', receiptText.length)

    try {
      // Step 1: Create DSPy-inspired prompt following Chain-of-Thought methodology
      const prompt = this.createDSPyPrompt(receiptText)
      
      // Step 2: Execute LLM call with structured output enforcement
      const response = await this.geminiService.generateContent([
        { role: 'user', content: prompt }
      ])

      if (!response.success || !response.content) {
        throw new Error(`LLM generation failed: ${response.error}`)
      }

      // Step 3: Parse and validate the structured response
      const result = this.parseStructuredResponse(response.content)
      
      // Step 4: Validate extraction quality and confidence
      const validatedResult = this.validateAndEnhanceExtraction(result, receiptText)
      
      console.log('[DSPy Receipt Extractor] Extraction completed successfully')
      console.log('[DSPy Receipt Extractor] Confidence score:', validatedResult.extractedData.confidenceScore)
      
      return validatedResult

    } catch (error) {
      console.error('[DSPy Receipt Extractor] Extraction failed:', error)
      
      // Return fallback result with minimal data
      return this.createFallbackResult(receiptText, error instanceof Error ? error.message : 'Unknown error')
    }
  }

  /**
   * Creates DSPy-inspired prompt with Chain-of-Thought reasoning
   * This simulates DSPy's signature + module approach
   */
  private createDSPyPrompt(receiptText: string): string {
    const jsonSchema = this.generateJsonSchema()
    
    return `You are an advanced AI financial assistant specializing in receipt and invoice processing. Your task is to act as a highly accurate OCR and data extraction engine following a systematic Chain-of-Thought approach.

**TASK SIGNATURE**: receiptText -> thinking, extractedData

**REASONING STEPS (Chain of Thought):**
You must follow these exact steps in order and document your reasoning:

1. **Vendor Analysis**: Carefully examine the receipt header and identify the merchant/vendor name. Look for business names, store names, or service providers.

2. **Date Identification**: Locate the transaction date. Convert any date format to YYYY-MM-DD. Look for labels like "Date:", "Transaction Date:", or timestamps.

3. **Amount Parsing**: Systematically identify all monetary values:
   - Subtotal (pre-tax amount)
   - Tax amount and tax rate
   - Tips/gratuity (if applicable)  
   - Final total amount (this is usually the largest, final number)
   - Currency (identify from symbols like $, €, £, ¥)

4. **Tax Calculation**: If tax information is present, calculate and verify:
   - Tax rate percentage
   - Tax type (VAT, GST, Sales Tax, etc.)
   - Tax jurisdiction if mentioned

5. **Line Items Extraction**: Extract individual items purchased:
   - Item description/name
   - Quantity (if shown)
   - Unit price (if shown)
   - Line total for each item

6. **Validation Checks**: Verify that:
   - Line items sum approximately matches subtotal
   - Subtotal + tax ≈ total amount
   - All amounts are reasonable and consistent
   - Date format is valid

**OUTPUT FORMAT:**
Provide your response in exactly this structure:

<thinking>
[Your step-by-step reasoning following the 6 steps above]
</thinking>

<json>
{
  "thinking": {
    "step1_vendor_analysis": "[Your vendor identification reasoning]",
    "step2_date_identification": "[Your date finding reasoning]", 
    "step3_amount_parsing": "[Your amount extraction reasoning]",
    "step4_tax_calculation": "[Your tax analysis reasoning]",
    "step5_line_items_extraction": "[Your line items reasoning]",
    "step6_validation_checks": "[Your validation reasoning]",
    "final_confidence_assessment": "[Overall confidence and any concerns]"
  },
  "extractedData": ${jsonSchema}
}
</json>

**RECEIPT TEXT TO ANALYZE:**
\`\`\`
${receiptText}
\`\`\`

**CRITICAL INSTRUCTIONS:**
- Follow the Chain-of-Thought steps exactly
- Use null for any field that cannot be determined
- Ensure the JSON is valid and follows the schema exactly
- Be systematic and thorough in your analysis
- Provide high confidence only when data is clearly visible`
  }

  /**
   * Generates JSON schema for structured output
   * This enforces the DSPy "signature" contract
   */
  private generateJsonSchema(): string {
    return `{
  "vendorName": "string",
  "vendorAddress": "string or null",
  "transactionDate": "string (YYYY-MM-DD format)",
  "transactionTime": "string (HH:mm:ss format) or null",
  "receiptNumber": "string or null",
  "subtotalAmount": "number or null",
  "taxAmount": "number or null", 
  "tipAmount": "number or null",
  "totalAmount": "number",
  "currency": "string (ISO 4217 code like USD, EUR)",
  "taxRate": "number (decimal, e.g. 0.08 for 8%) or null",
  "taxType": "string (e.g. VAT, GST, Sales Tax) or null",
  "lineItems": [
    {
      "description": "string",
      "quantity": "number or null",
      "unitPrice": "number or null", 
      "lineTotal": "number"
    }
  ],
  "paymentMethod": "string (cash, card, check, digital, other) or null",
  "extractionQuality": "string (high, medium, low)",
  "confidenceScore": "number (0.0 to 1.0)",
  "missingFields": ["array of field names that couldn't be extracted"],
  "processingMethod": "gemini_ocr",
  "modelUsed": "gemini-2.5-flash",
  "processingTimestamp": "string (current ISO 8601 timestamp)"
}`
  }

  /**
   * Parses the structured LLM response following DSPy principles
   */
  private parseStructuredResponse(response: string): DSPyExtractionResult {
    console.log('[DSPy Receipt Extractor] Parsing structured response')

    // Extract thinking section
    const thinkingMatch = response.match(/<thinking>([\s\S]*?)<\/thinking>/)
    const thinkingContent = thinkingMatch ? thinkingMatch[1].trim() : 'No reasoning provided'

    // Extract JSON section
    const jsonMatch = response.match(/<json>([\s\S]*?)<\/json>/)
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('No JSON block found in LLM response')
    }

    try {
      const parsedJson = JSON.parse(jsonMatch[1].trim())
      
      // Validate the structure matches our expected format
      if (!parsedJson.thinking || !parsedJson.extractedData) {
        throw new Error('Invalid JSON structure: missing thinking or extractedData')
      }

      // Add processing timestamp
      parsedJson.extractedData.processingTimestamp = new Date().toISOString()

      return {
        thinking: parsedJson.thinking as ExtractionReasoning,
        extractedData: parsedJson.extractedData as ExtractedReceiptData,
        processingComplete: true,
        needsManualReview: parsedJson.extractedData.confidenceScore < this.config.confidenceThreshold,
        suggestedCorrections: this.generateSuggestedCorrections(parsedJson.extractedData)
      }

    } catch (error) {
      console.error('[DSPy Receipt Extractor] JSON parsing failed:', error)
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Validates and enhances extraction results
   * Implements DSPy's quality assurance principles
   */
  private validateAndEnhanceExtraction(
    result: DSPyExtractionResult, 
    originalText: string
  ): DSPyExtractionResult {
    console.log('[DSPy Receipt Extractor] Validating extraction results')

    const data = result.extractedData
    const issues: string[] = []

    // Validation 1: Check required fields
    if (!data.vendorName || data.vendorName.trim().length === 0) {
      issues.push('Vendor name is missing or empty')
    }

    if (!data.totalAmount || data.totalAmount <= 0) {
      issues.push('Total amount is missing or invalid')
    }

    if (!data.transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.transactionDate)) {
      issues.push('Transaction date is missing or not in YYYY-MM-DD format')
    }

    if (!data.currency || data.currency.length !== 3) {
      issues.push('Currency code is missing or not in ISO 4217 format')
      // Try to infer currency from original text
      data.currency = this.inferCurrency(originalText)
    }

    // Validation 2: Mathematical consistency
    if (data.subtotalAmount && data.taxAmount && data.totalAmount) {
      const calculatedTotal = data.subtotalAmount + data.taxAmount + (data.tipAmount || 0)
      const tolerance = 0.02 // Allow 2 cent tolerance for rounding
      
      if (Math.abs(calculatedTotal - data.totalAmount) > tolerance) {
        issues.push(`Math inconsistency: subtotal(${data.subtotalAmount}) + tax(${data.taxAmount}) + tip(${data.tipAmount || 0}) ≠ total(${data.totalAmount})`)
      }
    }

    // Validation 3: Line items consistency
    if (data.lineItems && data.lineItems.length > 0 && data.subtotalAmount) {
      const lineItemsTotal = data.lineItems.reduce((sum, item) => sum + item.lineTotal, 0)
      const tolerance = 0.05 // Allow 5 cent tolerance
      
      if (Math.abs(lineItemsTotal - data.subtotalAmount) > tolerance) {
        issues.push(`Line items total (${lineItemsTotal}) doesn't match subtotal (${data.subtotalAmount})`)
      }
    }

    // Update confidence score based on validation results
    if (issues.length > 0) {
      data.confidenceScore = Math.max(0.1, data.confidenceScore - (issues.length * 0.1))
      data.extractionQuality = data.confidenceScore > 0.7 ? 'medium' : 'low'
    }

    // Add validation issues to missing fields
    if (issues.length > 0) {
      result.suggestedCorrections = [...(result.suggestedCorrections || []), ...issues]
    }

    // Determine if manual review is needed
    result.needsManualReview = data.confidenceScore < this.config.confidenceThreshold || issues.length > 2

    console.log('[DSPy Receipt Extractor] Validation complete. Issues found:', issues.length)

    return result
  }

  /**
   * Generates suggested corrections based on extracted data quality
   */
  private generateSuggestedCorrections(data: ExtractedReceiptData): string[] {
    const suggestions: string[] = []

    if (data.confidenceScore < 0.5) {
      suggestions.push('Low confidence extraction - please review all fields carefully')
    }

    if (!data.lineItems || data.lineItems.length === 0) {
      suggestions.push('No line items detected - consider adding manual line items')
    }

    if (!data.taxAmount && data.totalAmount > 10) {
      suggestions.push('No tax amount detected - verify if tax is included in total')
    }

    if (data.missingFields && data.missingFields.length > 3) {
      suggestions.push('Many fields could not be extracted - receipt may be unclear or damaged')
    }

    return suggestions
  }

  /**
   * Creates fallback result when extraction fails completely
   */
  private createFallbackResult(receiptText: string, error: string): DSPyExtractionResult {
    console.log('[DSPy Receipt Extractor] Creating fallback result due to:', error)

    return {
      thinking: {
        step1_vendor_analysis: 'Extraction failed - unable to analyze vendor',
        step2_date_identification: 'Extraction failed - unable to identify date', 
        step3_amount_parsing: 'Extraction failed - unable to parse amounts',
        step4_tax_calculation: 'Extraction failed - unable to calculate tax',
        step5_line_items_extraction: 'Extraction failed - unable to extract line items',
        step6_validation_checks: 'Extraction failed - no validation performed',
        final_confidence_assessment: `Extraction completely failed: ${error}`
      },
      extractedData: {
        vendorName: 'Unknown Vendor',
        transactionDate: new Date().toISOString().split('T')[0], // Today's date as fallback
        totalAmount: 0,
        currency: 'USD', // Default currency
        lineItems: [],
        extractionQuality: 'low',
        confidenceScore: 0.0,
        missingFields: ['vendorName', 'transactionDate', 'totalAmount', 'currency'],
        processingMethod: 'gemini_ocr',
        modelUsed: this.config.modelName,
        processingTimestamp: new Date().toISOString()
      },
      processingComplete: false,
      needsManualReview: true,
      suggestedCorrections: [
        'Automatic extraction failed completely',
        'Manual data entry is required',
        `Error details: ${error}`
      ]
    }
  }

  /**
   * Infers currency from text when not explicitly extracted
   */
  private inferCurrency(text: string): string {
    const currencyMap = {
      '$': 'USD',
      '€': 'EUR', 
      '£': 'GBP',
      '¥': 'JPY',
      'USD': 'USD',
      'EUR': 'EUR',
      'GBP': 'GBP',
      'CAD': 'CAD',
      'AUD': 'AUD'
    }

    for (const [symbol, code] of Object.entries(currencyMap)) {
      if (text.includes(symbol)) {
        return code
      }
    }

    return 'USD' // Default fallback
  }
}

/**
 * Factory function to create DSPy receipt extractor with default config
 */
export function createDSPyReceiptExtractor(config?: Partial<DSPyPromptConfig>): DSPyReceiptExtractor {
  return new DSPyReceiptExtractor(config)
}

/**
 * Convenience function for quick receipt extraction
 */
export async function extractReceiptData(
  receiptText: string, 
  receiptImageUrl?: string,
  config?: Partial<DSPyPromptConfig>
): Promise<DSPyExtractionResult> {
  const extractor = createDSPyReceiptExtractor(config)
  return await extractor.extractExpenseData(receiptText, receiptImageUrl)
}