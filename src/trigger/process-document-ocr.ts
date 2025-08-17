/**
 * Trigger.dev Job Definition: Complete OCR Processing
 * 
 * This is the "Instruction Manual" for Trigger.dev workers.
 * Contains the complete OCR processing logic migrated from Supabase Edge Functions.
 */

import { task } from "@trigger.dev/sdk/v3";
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for background processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Error Class for Detailed Diagnostics ---
class OCRProcessingError extends Error {
  service?: string;
  retryable?: boolean;
  errorDetails?: string;
  statusCode?: number;

  constructor(message: string, options: { service?: string; retryable?: boolean; errorDetails?: string; statusCode?: number; } = {}) {
    super(message);
    this.name = 'OCRProcessingError';
    this.service = options.service;
    this.retryable = options.retryable;
    this.errorDetails = options.errorDetails;
    this.statusCode = options.statusCode;
  }
}

// --- OCR Processing and Parsing Logic ---

/**
 * Provides the detailed system prompt for the AI model.
 */
function getSystemPrompt(): string {
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
    "document_type": { "value": "Invoice | Receipt | Credit Note | Other", "confidence": 0.95, "bbox": [x1, y1, x2, y2] },
    "vendor_name": { "value": "Vendor's Business Name", "confidence": 0.9, "bbox": [x1, y1, x2, y2] },
    "total_amount": { "value": "123.45", "confidence": 0.99, "bbox": [x1, y1, x2, y2] },
    "transaction_date": { "value": "YYYY-MM-DD", "confidence": 0.9, "bbox": [x1, y1, x2, y2] }
  },
  "financial_entities": [
    { "label": "A semantic label, e.g., 'Subtotal', 'Tax (8%)', 'Invoice Number'", "value": "The extracted text or normalized value", "category": "amount | date | id | text", "confidence": 0.85, "bbox": [x1, y1, x2, y2] }
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
- If a field is not present, omit it from the JSON instead of using null or empty values.`;
}

/**
 * Handles the actual API call to the OCR service.
 */
async function processDocumentWithOCR(imageUrl: string, endpoint: string, modelName: string) {
  try {
    const requestBody = {
      model: modelName,
      messages: [
        { role: "system", content: getSystemPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: "Please process the attached image according to the system instructions." },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ]
    };

    console.log(`[OCR] Processing image from URL. Making request to: ${endpoint}/chat/completions`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 720000); // 12-minute timeout

    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new OCRProcessingError(`OCR API request failed: ${response.status} ${response.statusText}`, {
        service: 'OCR', statusCode: response.status, retryable: response.status >= 500, errorDetails: errorText
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || result.choices?.[0]?.text || result.content || '';
    
    if (!content.trim()) {
      throw new OCRProcessingError('OCR service returned an empty response', {
        service: 'OCR', retryable: true, errorDetails: `Finish Reason: ${result.choices?.[0]?.finish_reason}`
      });
    }

    return parseOCRResponse(content);

  } catch (error) {
    if (error instanceof OCRProcessingError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OCRProcessingError('OCR request timed out after 12 minutes', { service: 'OCR', retryable: true });
    }
    throw new OCRProcessingError(`OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { service: 'OCR' });
  }
}

/**
 * Parses the string response from the AI into a structured object.
 */
function parseOCRResponse(content: string) {
  try {
    const parsedJson = extractJSONFromResponse(content);
    if (!parsedJson) {
      console.warn('[Parser] Failed to find JSON, creating fallback result.');
      return createFallbackResult(content);
    }
    
    const entities: any[] = [];
    const boundingBoxes: any[] = [];

    // Process high-level summary data
    if (parsedJson.document_summary) {
      Object.entries(parsedJson.document_summary).forEach(([key, item]: [string, any]) => {
        if (item && item.value) {
          entities.push({ type: key, value: String(item.value), confidence: item.confidence || 0.9 });
          if (item.bbox) boundingBoxes.push({ category: key, text: String(item.value), ...mapBbox(item.bbox) });
        }
      });
    }
    // Process detailed financial entities
    if (Array.isArray(parsedJson.financial_entities)) {
      parsedJson.financial_entities.forEach((item: any) => {
        if (item && item.value) {
          entities.push({ type: item.label || 'unknown', value: String(item.value), confidence: item.confidence || 0.8 });
          if (item.bbox) boundingBoxes.push({ category: item.label || 'unknown', text: String(item.value), ...mapBbox(item.bbox) });
        }
      });
    }

    const text = parsedJson.full_text || entities.map((e) => e.value).join('\n');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    
    return {
      text: text.trim(),
      entities: entities,
      metadata: {
        pageCount: 1,
        wordCount,
        language: 'en',
        processingMethod: 'ocr',
        layoutElements: parsedJson,
        boundingBoxes,
      }
    };
  } catch (parseError) {
    console.error('[Parser] Error during JSON parsing:', parseError);
    return createFallbackResult(content);
  }
}

// --- Helper Functions ---

function extractJSONFromResponse(content: string): any | null {
  const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try { return JSON.parse(codeBlockMatch[1]); } catch (e) { /* ignore */}
  }
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch && jsonMatch[0]) {
    try { return JSON.parse(jsonMatch[0]); } catch (e) { /* ignore */ }
  }
  return null;
}

function createFallbackResult(content: string) {
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  return {
    text: content.trim(),
    entities: [],
    metadata: {
      pageCount: 1,
      wordCount,
      language: 'en',
      processingMethod: 'text_extraction',
    }
  };
}

function mapBbox(bbox: number[]): { x1: number; y1: number; x2: number; y2: number } {
  if (!Array.isArray(bbox) || bbox.length !== 4) return { x1: 0, y1: 0, x2: 0, y2: 0 };
  return { x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3] };
}

// --- Main Trigger.dev v3 Task Definition ---

export const processDocumentOCR = task({
  id: "process-document-ocr",
  run: async (payload: { documentId: string; imageStoragePath: string }) => {
    console.log(`✅ Starting OCR process for document: ${payload.documentId}`);

    try {
      // Step 1: Create a signed URL for the image
      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(payload.imageStoragePath, 600); // 10 minutes validity

      if (urlError || !urlData) {
        throw new OCRProcessingError(`Failed to create signed URL: ${urlError?.message}`, {
          service: 'Storage', retryable: true, errorDetails: urlError?.message
        });
      }
      const signedImageUrl = urlData.signedUrl;
      console.log("🔗 Signed URL created successfully.");

      // Step 2: Get OCR service configuration
      const ocrEndpointUrl = process.env.OCR_ENDPOINT_URL;
      const ocrModelName = process.env.OCR_MODEL_NAME;
      if (!ocrEndpointUrl || !ocrModelName) {
        throw new Error('Missing OCR service environment variables');
      }

      // Step 3: Call the external OCR service with complete processing logic
      const ocrResult = await processDocumentWithOCR(signedImageUrl, ocrEndpointUrl, ocrModelName);
      
      console.log("🤖 OCR service responded successfully.");
      
      // Step 4: Calculate average confidence score
      const avgConfidence = ocrResult.entities.length > 0
        ? ocrResult.entities.reduce((sum: number, entity: any) => sum + (entity.confidence || 0), 0) / ocrResult.entities.length
        : 0.5;

      // Step 5: Update the document record with OCR results
      const { error: updateError } = await supabase.from('documents').update({
        processing_status: 'completed',
        extracted_data: ocrResult,
        confidence_score: avgConfidence,
        processed_at: new Date().toISOString(),
        error_message: null
      }).eq('id', payload.documentId);
      
      if (updateError) {
        throw new Error(`Failed to update document in database: ${updateError.message}`);
      }

      console.log(`✅ Successfully processed and updated document: ${payload.documentId}`);
      return { success: true, documentId: payload.documentId, avgConfidence };

    } catch (error) {
      console.error("❌ OCR process failed.", { error: error instanceof Error ? error.message : 'Unknown error' });
      
      // Update document status to failed
      await supabase.from('documents').update({
        processing_status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed',
        processed_at: new Date().toISOString()
      }).eq('id', payload.documentId);
      
      throw error;
    }
  },
});