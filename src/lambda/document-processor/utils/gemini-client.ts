/**
 * Gemini AI Client for Document Extraction
 *
 * Comprehensive AI-powered extraction with DSPy-equivalent prompts.
 * Ported from Trigger.dev Python/DSPy implementation for consistency.
 *
 * Key Features:
 * - Structured JSON output with Pydantic-like schemas
 * - Chain-of-thought reasoning for improved accuracy
 * - User-friendly messages and actionable suggestions
 * - Business category auto-matching (vendor patterns + AI keywords)
 * - IFRS accounting category fallback
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import type {
  InvoiceExtractionResult,
  ReceiptExtractionResult,
  ExtractedLineItem,
  BusinessCategory,
} from '../types';

// Gemini configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20';

// Singleton client (reused across warm invocations)
let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

/**
 * Error thrown when Gemini operations fail
 */
export class GeminiOperationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'GeminiOperationError';
  }
}

/**
 * Initialize the Gemini client (lazy initialization)
 */
function getModel(): GenerativeModel {
  if (!GEMINI_API_KEY) {
    throw new GeminiOperationError(
      'GEMINI_API_KEY environment variable is not configured',
      'AI_SERVICE_ERROR',
      false
    );
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }

  if (!model) {
    model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.0, // Match DSPy's temperature for consistent extraction
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    });
  }

  return model;
}

// ============================================================================
// IFRS Accounting Categories (ported from extract-invoice-data.ts)
// ============================================================================

/**
 * IFRS category patterns for auto-categorization fallback
 * Based on Otto's IFRS recommendations for SME accounting
 */
const IFRS_CATEGORY_PATTERNS = [
  {
    category_code: 'travel_entertainment',
    category_name: 'Travel & Entertainment',
    patterns: ['flight', 'airline', 'hotel', 'accommodation', 'airbnb', 'taxi', 'uber', 'grab', 'travel', 'booking', 'restaurant', 'food', 'meal', 'dining', 'cafe', 'coffee', 'lunch', 'dinner'],
    confidence_base: 0.8
  },
  {
    category_code: 'utilities_communications',
    category_name: 'Utilities & Communications',
    patterns: ['electricity', 'water', 'internet', 'phone', 'telecommunications', 'utility', 'power', 'gas'],
    confidence_base: 0.85
  },
  {
    category_code: 'marketing_advertising',
    category_name: 'Marketing & Advertising',
    patterns: ['advertising', 'promotion', 'facebook', 'google ads', 'social media', 'banner', 'marketing services', 'marketing agency'],
    confidence_base: 0.8
  },
  {
    category_code: 'software_subscriptions',
    category_name: 'Software & Subscriptions',
    patterns: ['software', 'subscription', 'saas', 'cloud', 'license', 'app', 'digital'],
    confidence_base: 0.85
  },
  {
    category_code: 'professional_services',
    category_name: 'Professional Services',
    patterns: ['consulting', 'legal', 'accounting', 'audit', 'lawyer', 'consultant', 'professional'],
    confidence_base: 0.85
  },
  {
    category_code: 'rent_facilities',
    category_name: 'Rent & Facilities',
    patterns: ['rent', 'lease', 'facility', 'office space', 'warehouse'],
    confidence_base: 0.9
  },
  {
    category_code: 'insurance',
    category_name: 'Insurance',
    patterns: ['insurance', 'policy', 'coverage', 'premium'],
    confidence_base: 0.9
  },
  {
    category_code: 'taxes_licenses',
    category_name: 'Taxes & Licenses',
    patterns: ['tax', 'license', 'permit', 'registration', 'government fee'],
    confidence_base: 0.9
  }
];

/**
 * IFRS accounting category auto-categorization using pattern matching (fallback only)
 * Ported from extract-invoice-data.ts lines 139-237
 */
export function categorizeWithIFRSAccountingCategories(
  vendorName: string,
  documentType: string,
  industryContext: string,
  description: string
): { category_code: string; category_name: string; confidence: number; reasoning: string } {
  // Combine text for pattern matching
  const text = `${vendorName} ${documentType} ${industryContext} ${description}`.toLowerCase();

  let bestMatch = {
    category_code: 'other_operating',
    category_name: 'Other Operating Expenses',
    confidence: 0.1,
    reasoning: 'No clear pattern match - defaulted to other operating expenses'
  };

  // Check each IFRS pattern
  for (const pattern of IFRS_CATEGORY_PATTERNS) {
    let matchScore = 0;
    const matchedTerms: string[] = [];

    for (const term of pattern.patterns) {
      if (text.includes(term)) {
        matchScore += 0.3;
        matchedTerms.push(term);
      }
    }

    if (matchScore > 0) {
      const confidence = Math.min(matchScore * pattern.confidence_base, 0.95);
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          category_code: pattern.category_code,
          category_name: pattern.category_name,
          confidence,
          reasoning: `Matched IFRS patterns: ${matchedTerms.join(', ')}`
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Categorize expense using dynamic business categories
 * Ported from extract-invoice-data.ts lines 65-137
 */
export function categorizeExpenseWithDynamicCategories(
  vendorName: string,
  documentType: string,
  industryContext: string,
  categories: BusinessCategory[]
): { category: string; confidence: number; reasoning: string } {
  if (!categories.length) {
    return {
      category: '',
      confidence: 0.1,
      reasoning: 'No categories available for categorization'
    };
  }

  const text = `${vendorName} ${documentType} ${industryContext}`.toLowerCase();

  let bestMatch = {
    category: categories[0].name,
    confidence: 0.1,
    reasoning: 'No pattern matches found'
  };

  // Check each category's vendor patterns and AI keywords
  for (const category of categories) {
    let matchScore = 0;
    const matchReasons: string[] = [];

    // Check vendor patterns
    if (category.vendorPatterns && category.vendorPatterns.length > 0) {
      for (const pattern of category.vendorPatterns) {
        if (text.includes(pattern.toLowerCase())) {
          matchScore += 0.4;
          matchReasons.push(`vendor pattern: "${pattern}"`);
        }
      }
    }

    // Check AI keywords
    if (category.keywords && category.keywords.length > 0) {
      for (const keyword of category.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          matchScore += 0.3;
          matchReasons.push(`keyword: "${keyword}"`);
        }
      }
    }

    if (matchScore > bestMatch.confidence) {
      bestMatch = {
        category: category.name,
        confidence: Math.min(matchScore, 0.95),
        reasoning: matchReasons.length > 0
          ? `Matched ${matchReasons.join(', ')}`
          : 'Pattern match detected'
      };
    }
  }

  // Return best match with fallback
  if (bestMatch.confidence < 0.2) {
    return {
      category: categories[0].name,
      confidence: 0.15,
      reasoning: `Defaulted to "${categories[0].name}" - no clear pattern match`
    };
  }

  return bestMatch;
}

// ============================================================================
// DSPy-Equivalent Invoice Extraction Prompt
// ============================================================================

/**
 * Comprehensive invoice extraction prompt matching DSPy InvoiceExtraction signature
 * Includes chain-of-thought reasoning, structured output, and user messaging
 */
function buildInvoiceExtractionPrompt(categories?: BusinessCategory[]): string {
  let categoryContext = '';
  if (categories && categories.length > 0) {
    const categoryList = categories.map(c => {
      const keywords = c.keywords?.join(', ') || '';
      const patterns = c.vendorPatterns?.join(', ') || '';
      return `  - "${c.name}" (code: ${c.code || c.name}): keywords=[${keywords}], vendor_patterns=[${patterns}]`;
    }).join('\n');
    categoryContext = `

BUSINESS CATEGORIES FOR AUTO-CATEGORIZATION:
${categoryList}

When suggesting a category, match against vendor name, line item descriptions, and document context.
If a clear match is found, set "suggested_category" to the category name.`;
  }

  return `You are a financial document extraction expert specializing in invoices and bills.
Your task is to extract structured data from this invoice image with high accuracy.

IMPORTANT RULES:
1. Extract ALL visible financial data accurately
2. Use chain-of-thought reasoning to verify amounts
3. All monetary amounts MUST be numbers, not strings
4. Dates MUST be in YYYY-MM-DD format
5. Currency MUST be a 3-letter ISO code (USD, EUR, SGD, MYR, THB, IDR, VND, PHP, CNY)
6. If a field cannot be determined, use null
7. Provide confidence score reflecting extraction quality
8. Generate user-friendly message and suggestions if extraction quality is low
${categoryContext}

OUTPUT SCHEMA (return ONLY this JSON object, no markdown or additional text):
{
  "document_type": "invoice",
  "vendor_name": "string - company/vendor name issuing the invoice",
  "invoice_number": "string or null - invoice/bill reference number",
  "total_amount": number - total amount due (REQUIRED),
  "currency": "string - 3-letter ISO currency code (REQUIRED)",
  "transaction_date": "string - invoice date in YYYY-MM-DD format (REQUIRED)",
  "due_date": "string or null - payment due date in YYYY-MM-DD format",
  "payment_terms": "string or null - e.g., 'Net 30', 'Due on Receipt'",
  "subtotal_amount": number or null - subtotal before tax,
  "tax_amount": number or null - total tax amount,
  "tax_rate": number or null - tax rate as decimal (0.07 for 7%),
  "reference_number": "string or null - PO number or external reference",
  "billing_address": "string or null - billing address",
  "shipping_address": "string or null - shipping address if different",
  "line_items": [
    {
      "description": "string - item/service description (REQUIRED)",
      "quantity": number - quantity (default 1),
      "unit_price": number - price per unit,
      "total_amount": number - line total (REQUIRED),
      "tax_amount": number or null - tax for this line,
      "tax_rate": number or null - tax rate as decimal,
      "category": "string or null - matched business category"
    }
  ],
  "suggested_category": "string or null - best matching business category for the whole invoice",
  "confidence_score": number - 0.0 to 1.0 extraction confidence (REQUIRED),
  "extraction_quality": "high" | "medium" | "low" - overall quality assessment,
  "user_message": "string or null - user-friendly message if extraction quality is low",
  "suggestions": ["array of strings"] - actionable suggestions for user if quality is low,
  "context_metadata": {
    "country": "string or null - detected country of origin",
    "currency_format": "string or null - detected currency format hint"
  },
  "reasoning": "string - brief chain-of-thought explanation of extraction process"
}

EXTRACTION QUALITY GUIDELINES:
- HIGH (0.85-1.0): All key fields extracted, amounts verified, clear document
- MEDIUM (0.6-0.84): Most fields extracted, some uncertainty, may need review
- LOW (<0.6): Critical fields missing or uncertain, generate user_message and suggestions

If extraction_quality is "low", provide:
- user_message: Friendly explanation of the issue
- suggestions: 2-3 actionable steps (e.g., "Ensure the invoice shows the total amount clearly")`;
}

// ============================================================================
// DSPy-Equivalent Receipt Extraction Prompt
// ============================================================================

/**
 * Comprehensive receipt extraction prompt matching DSPy ExtractedReceiptData model
 * Ported from src/python/extract_receipt_data.py
 */
function buildReceiptExtractionPrompt(categories?: BusinessCategory[]): string {
  let categoryContext = '';
  if (categories && categories.length > 0) {
    const categoryList = categories.map(c => {
      const keywords = c.keywords?.join(', ') || '';
      const patterns = c.vendorPatterns?.join(', ') || '';
      return `  - "${c.name}" (code: ${c.code || c.name}): keywords=[${keywords}], vendor_patterns=[${patterns}]`;
    }).join('\n');
    categoryContext = `

BUSINESS EXPENSE CATEGORIES FOR AUTO-CATEGORIZATION:
${categoryList}

Match vendor name and receipt items against these categories.
Set "suggested_category" to the best matching category name.`;
  }

  return `You are a financial document extraction expert specializing in receipts and expense documents.
Your task is to extract structured data from this receipt image with high accuracy.

IMPORTANT RULES:
1. Extract ALL visible financial data accurately
2. Use chain-of-thought reasoning to verify totals
3. All monetary amounts MUST be numbers, not strings
4. Dates MUST be in YYYY-MM-DD format
5. Currency MUST be a 3-letter ISO code (USD, EUR, SGD, MYR, THB, IDR, VND, PHP, CNY)
6. If a field cannot be determined, use null
7. Provide confidence score reflecting extraction quality
8. Generate user-friendly message and suggestions if extraction quality is low
${categoryContext}

OUTPUT SCHEMA (return ONLY this JSON object, no markdown or additional text):
{
  "document_type": "receipt",
  "vendor_name": "string - store/merchant name (REQUIRED)",
  "total_amount": number - total amount paid (REQUIRED),
  "currency": "string - 3-letter ISO currency code (REQUIRED)",
  "transaction_date": "string - receipt date in YYYY-MM-DD format (REQUIRED)",
  "receipt_number": "string or null - receipt/transaction reference number",
  "store_location": "string or null - store address or branch location",
  "payment_method": "string or null - e.g., 'VISA', 'Cash', 'Mastercard', 'GrabPay'",
  "card_last_four": "string or null - last 4 digits of card if visible",
  "subtotal_amount": number or null - subtotal before tax,
  "tax_amount": number or null - tax amount,
  "tax_rate": number or null - tax rate as decimal (0.07 for 7%),
  "service_charge": number or null - service charge if present,
  "discount_amount": number or null - any discount applied,
  "line_items": [
    {
      "description": "string - item description (REQUIRED)",
      "quantity": number - quantity (default 1),
      "unit_price": number - price per unit,
      "total_amount": number - line total (REQUIRED)",
      "tax_amount": number or null - tax for this line,
      "tax_rate": number or null - tax rate as decimal,
      "category": "string or null - matched expense category"
    }
  ],
  "suggested_category": "string or null - best matching expense category for the receipt",
  "business_purpose": "string or null - inferred business purpose (e.g., 'Client meeting', 'Office supplies')",
  "confidence_score": number - 0.0 to 1.0 extraction confidence (REQUIRED),
  "extraction_quality": "high" | "medium" | "low" - overall quality assessment,
  "user_message": "string or null - user-friendly message about extraction result",
  "suggestions": ["array of strings"] - actionable suggestions for user if quality is low,
  "context_metadata": {
    "country": "string or null - detected country of origin",
    "currency_format": "string or null - detected currency format hint",
    "receipt_type": "string or null - e.g., 'restaurant', 'retail', 'transportation'"
  },
  "reasoning": "string - brief chain-of-thought explanation of extraction process"
}

EXTRACTION QUALITY GUIDELINES:
- HIGH (0.85-1.0): All key fields extracted, amounts verified, clear receipt
- MEDIUM (0.6-0.84): Most fields extracted, some uncertainty, readable but imperfect
- LOW (<0.6): Critical fields missing, blurry/damaged receipt, uncertain amounts

If extraction_quality is "medium" or "low", provide:
- user_message: Friendly explanation (e.g., "Receipt image is partially unclear. Please verify the extracted total.")
- suggestions: 2-3 actionable steps (e.g., "Take a clearer photo with better lighting", "Ensure the entire receipt is visible")

COMMON RECEIPT PATTERNS TO RECOGNIZE:
- Restaurant receipts: Look for items, service charge, tip line
- Retail receipts: Look for item codes, prices, tax breakdown
- Transportation: Look for route, fare, transaction ID
- Online payments: Look for order ID, digital receipt format`;
}

// ============================================================================
// Invoice Extraction
// ============================================================================

/**
 * Extract invoice data from image using Gemini with DSPy-equivalent prompts.
 *
 * @param imageUrls - Presigned URLs for document images
 * @param categories - Optional business categories for line item matching
 * @returns Invoice extraction result with user messaging
 */
export async function extractInvoiceData(
  imageUrls: string[],
  categories?: BusinessCategory[]
): Promise<InvoiceExtractionResult> {
  const gemini = getModel();

  try {
    const prompt = buildInvoiceExtractionPrompt(categories);

    // Fetch images and prepare content parts
    const imageParts = await Promise.all(
      imageUrls.map(async (url) => {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        // Detect MIME type from URL or default to PNG
        let mimeType = 'image/png';
        if (url.includes('.jpg') || url.includes('.jpeg')) {
          mimeType = 'image/jpeg';
        } else if (url.includes('.webp')) {
          mimeType = 'image/webp';
        }

        return {
          inlineData: {
            mimeType,
            data: base64,
          },
        };
      })
    );

    const result = await gemini.generateContent([
      prompt,
      ...imageParts,
    ]);

    const responseText = result.response.text();
    const extracted = parseJsonResponse<any>(responseText);

    // Map snake_case response to camelCase result
    const invoiceResult: InvoiceExtractionResult = {
      documentType: 'invoice',
      vendorName: extracted.vendor_name || '',
      invoiceNumber: extracted.invoice_number || null,
      totalAmount: extracted.total_amount,
      currency: extracted.currency,
      transactionDate: extracted.transaction_date,
      dueDate: extracted.due_date || null,
      paymentTerms: extracted.payment_terms || null,
      subtotalAmount: extracted.subtotal_amount || null,
      taxAmount: extracted.tax_amount || null,
      taxRate: extracted.tax_rate || null,
      referenceNumber: extracted.reference_number || null,
      billingAddress: extracted.billing_address || null,
      shippingAddress: extracted.shipping_address || null,
      lineItems: (extracted.line_items || []).map((item: any) => ({
        description: item.description || '',
        quantity: item.quantity || 1,
        unitPrice: item.unit_price || 0,
        totalAmount: item.total_amount || 0,
        taxAmount: item.tax_amount || null,
        taxRate: item.tax_rate || null,
        category: item.category || null,
      })),
      suggestedCategory: extracted.suggested_category || null,
      confidence: extracted.confidence_score || 0.5,
      extractionQuality: extracted.extraction_quality || 'medium',
      userMessage: extracted.user_message || null,
      suggestions: extracted.suggestions || null,
      contextMetadata: extracted.context_metadata || null,
      reasoning: extracted.reasoning || null,
      processingMethod: 'auto',
      extractedAt: new Date().toISOString(),
    };

    // If no AI category suggested, try IFRS fallback
    if (!invoiceResult.suggestedCategory && invoiceResult.vendorName) {
      const ifrsMatch = categorizeWithIFRSAccountingCategories(
        invoiceResult.vendorName,
        'invoice',
        '',
        invoiceResult.lineItems?.map(i => i.description).join(' ') || ''
      );
      if (ifrsMatch.confidence > 0.3) {
        invoiceResult.suggestedCategory = ifrsMatch.category_name;
      }
    }

    return invoiceResult;
  } catch (error) {
    if (error instanceof GeminiOperationError) throw error;

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for rate limiting
    if (message.includes('429') || message.includes('quota')) {
      throw new GeminiOperationError(
        'Gemini API rate limit exceeded',
        'AI_RATE_LIMITED',
        true
      );
    }

    throw new GeminiOperationError(
      `Invoice extraction failed: ${message}`,
      'EXTRACTION_FAILED',
      false
    );
  }
}

// ============================================================================
// Receipt Extraction
// ============================================================================

/**
 * Extract receipt data from image using Gemini with DSPy-equivalent prompts.
 *
 * @param imageUrls - Presigned URLs for document images
 * @param categories - Optional business categories for expense categorization
 * @returns Receipt extraction result with user messaging
 */
export async function extractReceiptData(
  imageUrls: string[],
  categories?: BusinessCategory[]
): Promise<ReceiptExtractionResult> {
  const gemini = getModel();

  try {
    const prompt = buildReceiptExtractionPrompt(categories);

    // Fetch images and prepare content parts
    const imageParts = await Promise.all(
      imageUrls.map(async (url) => {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        // Detect MIME type
        let mimeType = 'image/png';
        if (url.includes('.jpg') || url.includes('.jpeg')) {
          mimeType = 'image/jpeg';
        } else if (url.includes('.webp')) {
          mimeType = 'image/webp';
        }

        return {
          inlineData: {
            mimeType,
            data: base64,
          },
        };
      })
    );

    const result = await gemini.generateContent([
      prompt,
      ...imageParts,
    ]);

    const responseText = result.response.text();
    const extracted = parseJsonResponse<any>(responseText);

    // Map snake_case response to camelCase result
    const receiptResult: ReceiptExtractionResult = {
      documentType: 'receipt',
      vendorName: extracted.vendor_name || '',
      totalAmount: extracted.total_amount,
      currency: extracted.currency,
      transactionDate: extracted.transaction_date,
      receiptNumber: extracted.receipt_number || null,
      storeLocation: extracted.store_location || null,
      paymentMethod: extracted.payment_method || null,
      cardLastFour: extracted.card_last_four || null,
      subtotalAmount: extracted.subtotal_amount || null,
      taxAmount: extracted.tax_amount || null,
      taxRate: extracted.tax_rate || null,
      serviceCharge: extracted.service_charge || null,
      discountAmount: extracted.discount_amount || null,
      lineItems: (extracted.line_items || []).map((item: any) => ({
        description: item.description || '',
        quantity: item.quantity || 1,
        unitPrice: item.unit_price || 0,
        totalAmount: item.total_amount || 0,
        taxAmount: item.tax_amount || null,
        taxRate: item.tax_rate || null,
        category: item.category || null,
      })),
      suggestedCategory: extracted.suggested_category || null,
      businessPurpose: extracted.business_purpose || null,
      confidence: extracted.confidence_score || 0.5,
      extractionQuality: extracted.extraction_quality || 'medium',
      userMessage: extracted.user_message || null,
      suggestions: extracted.suggestions || null,
      contextMetadata: extracted.context_metadata || null,
      reasoning: extracted.reasoning || null,
      processingMethod: 'auto',
      extractedAt: new Date().toISOString(),
    };

    // If no AI category suggested but categories provided, try pattern matching
    if (!receiptResult.suggestedCategory && categories && categories.length > 0) {
      const categoryMatch = categorizeExpenseWithDynamicCategories(
        receiptResult.vendorName,
        'receipt',
        '',
        categories
      );
      if (categoryMatch.confidence > 0.2) {
        receiptResult.suggestedCategory = categoryMatch.category;
      }
    }

    // Fallback to IFRS categories if still no match
    if (!receiptResult.suggestedCategory && receiptResult.vendorName) {
      const ifrsMatch = categorizeWithIFRSAccountingCategories(
        receiptResult.vendorName,
        'receipt',
        '',
        receiptResult.lineItems?.map(i => i.description).join(' ') || ''
      );
      if (ifrsMatch.confidence > 0.3) {
        receiptResult.suggestedCategory = ifrsMatch.category_name;
      }
    }

    return receiptResult;
  } catch (error) {
    if (error instanceof GeminiOperationError) throw error;

    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('429') || message.includes('quota')) {
      throw new GeminiOperationError(
        'Gemini API rate limit exceeded',
        'AI_RATE_LIMITED',
        true
      );
    }

    throw new GeminiOperationError(
      `Receipt extraction failed: ${message}`,
      'EXTRACTION_FAILED',
      false
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse JSON response from Gemini, handling markdown code blocks.
 */
function parseJsonResponse<T>(text: string): T {
  // Remove markdown code blocks if present
  let jsonText = text.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3);
  }

  try {
    return JSON.parse(jsonText.trim()) as T;
  } catch {
    throw new GeminiOperationError(
      'Failed to parse Gemini response as JSON',
      'EXTRACTION_FAILED',
      false
    );
  }
}

/**
 * Match line items to business categories based on keywords.
 * Ported from Trigger.dev implementation
 */
export function matchLineItemCategories(
  lineItems: ExtractedLineItem[],
  categories: BusinessCategory[]
): ExtractedLineItem[] {
  return lineItems.map(item => {
    if (item.category) return item; // Already has category

    const description = item.description.toLowerCase();

    for (const category of categories) {
      // Check vendor patterns first
      if (category.vendorPatterns) {
        const vendorMatch = category.vendorPatterns.some(pattern =>
          description.includes(pattern.toLowerCase())
        );
        if (vendorMatch) {
          return { ...item, category: category.name };
        }
      }

      // Check keywords
      if (category.keywords) {
        const keywordMatch = category.keywords.some(keyword =>
          description.includes(keyword.toLowerCase())
        );
        if (keywordMatch) {
          return { ...item, category: category.name };
        }
      }
    }

    return item;
  });
}

/**
 * Check if confidence is below threshold for manual review.
 *
 * @param confidence - Extraction confidence score
 * @param threshold - Minimum confidence (default 0.6)
 * @returns true if confidence is below threshold
 */
export function needsManualReview(
  confidence: number,
  threshold: number = 0.6
): boolean {
  return confidence < threshold;
}
