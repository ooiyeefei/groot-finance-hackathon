/**
 * Document Validation Step
 *
 * Performs LLM visual validation to ensure uploaded document matches expected type.
 * If user uploads a non-invoice to invoice page (or non-receipt to receipt page),
 * the validation will reject with a clear error message.
 *
 * Uses Gemini 2.5 Flash for visual document type detection.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ValidationResult, ConvertedImageInfo } from '../types';
import { readDocument, getPresignedReadUrl } from '../utils/s3-client';

/**
 * Error thrown when validation fails
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Validate document type matches expected type using LLM visual processing.
 *
 * This step uses Gemini to visually analyze the document and determine
 * if it's an invoice or receipt, then validates against the expected type.
 *
 * @param documentId - Document ID for logging
 * @param convertedImages - Images to validate (from PDF conversion or original)
 * @param storagePath - Original storage path (for images that weren't converted)
 * @param expectedType - Expected document type based on upload context
 * @returns ValidationResult with detected type and validation status
 * @throws ValidationError if document type doesn't match expected
 */
export async function validateDocument(
  documentId: string,
  convertedImages: ConvertedImageInfo[] | null | undefined,
  storagePath: string,
  expectedType: 'invoice' | 'receipt'
): Promise<ValidationResult> {
  console.log(`[${documentId}] Starting document validation, expected type: ${expectedType}`);

  try {
    // Get image data for LLM analysis
    const imageData = await getImageForValidation(convertedImages, storagePath);

    // Use Gemini to detect document type
    const detectionResult = await detectDocumentType(imageData);

    console.log(`[${documentId}] Detected type: ${detectionResult.type}, confidence: ${detectionResult.confidence}`);

    // Check if detected type matches expected type
    const isValid = detectionResult.type === expectedType;

    if (!isValid) {
      const reason = generateRejectionReason(expectedType, detectionResult.type);
      console.log(`[${documentId}] Validation failed: ${reason}`);

      throw new ValidationError(
        reason,
        'DOCUMENT_TYPE_MISMATCH'
      );
    }

    console.log(`[${documentId}] Validation passed`);

    return {
      isValid: true,
      detectedType: detectionResult.type,
      expectedType,
      confidence: detectionResult.confidence,
      metadata: detectionResult.metadata,
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    // Log and wrap unexpected errors
    console.error(`[${documentId}] Validation error:`, error);
    throw new ValidationError(
      `Document validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'VALIDATION_FAILED'
    );
  }
}

/**
 * Get image data for LLM validation
 */
async function getImageForValidation(
  convertedImages: ConvertedImageInfo[] | null | undefined,
  storagePath: string
): Promise<{ base64: string; mimeType: string }> {
  if (convertedImages && convertedImages.length > 0) {
    // Use first converted image (first page of PDF)
    const firstImage = convertedImages[0];
    const imageBuffer = await readDocument(firstImage.s3Key);
    return {
      base64: imageBuffer.toString('base64'),
      mimeType: 'image/png',
    };
  }

  // Use original image file
  const imageBuffer = await readDocument(storagePath);
  const mimeType = getMimeType(storagePath);
  return {
    base64: imageBuffer.toString('base64'),
    mimeType,
  };
}

/**
 * Detect document type using Gemini visual analysis
 */
async function detectDocumentType(imageData: { base64: string; mimeType: string }): Promise<{
  type: 'invoice' | 'receipt' | 'unknown';
  confidence: number;
  metadata: {
    detectedLanguage?: string;
    detectedCurrency?: string;
    hasLineItems: boolean;
  };
}> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Analyze this document image and determine if it is an INVOICE or a RECEIPT.

INVOICE characteristics:
- Typically B2B (business-to-business)
- Has invoice number, payment terms, due date
- Often has billing/shipping addresses
- Larger format, more detailed line items
- Often includes tax registration numbers (VAT/GST)

RECEIPT characteristics:
- Typically B2C (business-to-consumer)
- Point of sale transaction record
- Usually has store name, register number
- Shows payment method (cash, card, etc.)
- Typically smaller format, thermal paper style
- Transaction complete (payment already made)

Respond in JSON format:
{
  "documentType": "invoice" | "receipt" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "detectedLanguage": "language code or null",
  "detectedCurrency": "currency code or null",
  "hasLineItems": true/false
}`;

  try {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64,
        },
      },
      prompt,
    ]);

    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.warn('Failed to parse LLM response, defaulting to unknown');
      return {
        type: 'unknown',
        confidence: 0.5,
        metadata: { hasLineItems: true },
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      type: parsed.documentType as 'invoice' | 'receipt' | 'unknown',
      confidence: parsed.confidence || 0.8,
      metadata: {
        detectedLanguage: parsed.detectedLanguage || undefined,
        detectedCurrency: parsed.detectedCurrency || undefined,
        hasLineItems: parsed.hasLineItems ?? true,
      },
    };
  } catch (error) {
    console.error('LLM document detection failed:', error);
    // On LLM failure, return unknown with low confidence
    return {
      type: 'unknown',
      confidence: 0.3,
      metadata: { hasLineItems: true },
    };
  }
}

/**
 * Generate user-friendly rejection reason
 */
function generateRejectionReason(expected: string, detected: string): string {
  if (detected === 'unknown') {
    return `Unable to verify document type. Please ensure you're uploading a clear ${expected} image.`;
  }

  if (expected === 'invoice' && detected === 'receipt') {
    return 'This appears to be a receipt, not an invoice. Please use the Expense Claims section for receipts, or upload an invoice document here.';
  }

  if (expected === 'receipt' && detected === 'invoice') {
    return 'This appears to be an invoice, not a receipt. Please use the Invoices section for invoices, or upload a receipt document here.';
  }

  return `Document type mismatch: expected ${expected}, detected ${detected}.`;
}

/**
 * Get MIME type from file path
 */
function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    tiff: 'image/tiff',
  };
  return mimeTypes[ext || ''] || 'image/jpeg';
}
