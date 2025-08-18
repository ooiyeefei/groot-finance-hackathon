/**
 * Trigger.dev Job Definition: Complete OCR Processing
 * 
 * This is the "Instruction Manual" for Trigger.dev workers.
 * Contains the complete OCR processing logic migrated from Supabase Edge Functions.
 */

import { task, retry } from "@trigger.dev/sdk/v3";
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
  return `IMPORTANT: You have extremely tight timeline to think, so quickly deduce your result. You are an expert financial analyst AI specializing in document intelligence. Your task is to analyze the provided image of a financial document (e.g., invoice, receipt) and extract all financially relevant information in a structured JSON format.

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
- The ''financial_entities'' array should be a comprehensive list of all key-value data found on the document. Be descriptive with your labels.`;
}

/**
 * Handles the actual API call to the OCR service.
 */
async function processDocumentWithOCR(imageUrl: string, endpoint: string, modelName: string, sourceDimensions?: { width: number; height: number }) {
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
      ],
      temperature: 0.6,
      top_p: 0.95,
      repetition_penalty: 1.05
    };

    console.log(`[OCR] Processing image from URL. Making request to: ${endpoint}/chat/completions`);
    console.log(`[OCR] Model parameters: temperature=${requestBody.temperature}, top_p=${requestBody.top_p}, repetition_penalty=${requestBody.repetition_penalty}`);
    console.log(`[OCR] Request payload:`, JSON.stringify(requestBody, null, 2));
    console.log(`[OCR] Timeout settings: 15 minutes main, 1-15 minute retry range with 3 attempts`);
    
    // Use Trigger.dev's retry.fetch with proper timeout handling
    const response = await retry.fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Connection': 'keep-alive'
      },
      body: JSON.stringify(requestBody),
      timeoutInMs: 15 * 60 * 1000, // 15 minutes timeout for large documents
      retry: {
        timeout: {
          maxAttempts: 3,
          factor: 1.5,
          minTimeoutInMs: 60_000, // Increased to 1 minute for large models
          maxTimeoutInMs: 15 * 60 * 1000, // 15 minutes max
          randomize: false,
        },
        byStatus: {
          "500-599": {
            strategy: "backoff",
            maxAttempts: 3,
            factor: 2,
            minTimeoutInMs: 5_000,
            maxTimeoutInMs: 30_000,
            randomize: false,
          }
        }
      }
    });
    
    console.log(`[OCR] Fetch completed. Status: ${response.status}, StatusText: ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new OCRProcessingError(`OCR API request failed: ${response.status} ${response.statusText}`, {
        service: 'OCR', statusCode: response.status, retryable: response.status >= 500, errorDetails: errorText
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || result.choices?.[0]?.text || result.content || '';
    
    console.log(`[OCR] Raw response structure:`, {
      hasChoices: !!result.choices,
      choicesLength: result.choices?.length || 0,
      hasContent: !!content,
      contentLength: content?.length || 0,
      contentPreview: content?.substring(0, 200) || 'NO CONTENT'
    });
    
    if (!content.trim()) {
      throw new OCRProcessingError('OCR service returned an empty response', {
        service: 'OCR', retryable: true, errorDetails: `Finish Reason: ${result.choices?.[0]?.finish_reason}, Result: ${JSON.stringify(result)}`
      });
    }

    return parseOCRResponse(content, sourceDimensions);

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
 * Filters out AI reasoning and thought process to show only clean structured data.
 */
function parseOCRResponse(content: string, sourceDimensions?: { width: number; height: number }) {
  try {
    // First, extract clean JSON from the response
    const parsedJson = extractJSONFromResponse(content);
    if (!parsedJson) {
      console.warn('[Parser] Failed to find JSON, creating fallback result.');
      return createFallbackResult(content);
    }
    
    console.log('[Parser] Successfully parsed OCR JSON response');
    console.log('[Parser] Document summary:', JSON.stringify(parsedJson.document_summary, null, 2));
    console.log('[Parser] Financial entities count:', parsedJson.financial_entities?.length || 0);
    console.log('[Parser] Line items count:', parsedJson.line_items?.length || 0);
    
    // Filter out AI reasoning from the full_text field
    let cleanFullText = parsedJson.full_text || '';
    if (cleanFullText) {
      // Remove AI reasoning patterns like "Okay, let's tackle this...", "Looking at this...", etc.
      cleanFullText = cleanFullText
        .replace(/^(Okay,?\s*let's?\s*(tackle|analyze|examine|process|look at)\s*this.*?\.?\s*)/i, '')
        .replace(/^(Looking at this.*?\.?\s*)/i, '')
        .replace(/^(I can see.*?\.?\s*)/i, '')
        .replace(/^(This appears to be.*?\.?\s*)/i, '')
        .replace(/^(Let me.*?\.?\s*)/i, '')
        .replace(/^(I'll.*?\.?\s*)/i, '')
        .replace(/^(First,?\s*I.*?\.?\s*)/i, '')
        .replace(/^(From what I can see.*?\.?\s*)/i, '')
        .replace(/^(Based on.*?analysis.*?\.?\s*)/i, '')
        .replace(/^(After examining.*?\.?\s*)/i, '')
        .trim();
      
      // If the cleaned text is too short or still contains reasoning, extract from entities instead
      if (cleanFullText.length < 50 || /^(I |Let |Looking |Okay |This |From |Based )/i.test(cleanFullText)) {
        console.log('[Parser] Full text contains AI reasoning, extracting clean text from entities');
        cleanFullText = '';
      }
    }
    
    const entities: any[] = [];
    const boundingBoxes: any[] = [];

    // Process high-level summary data
    if (parsedJson.document_summary) {
      Object.entries(parsedJson.document_summary).forEach(([key, item]: [string, any]) => {
        if (item && item.value) {
          entities.push({ type: key, value: String(item.value), confidence: item.confidence || 0.9 });
          if (item.bbox) {
            console.log(`[BBox] Found bbox for ${key}:`, item.bbox);
            boundingBoxes.push({ category: key, text: String(item.value), ...mapBbox(item.bbox, sourceDimensions) });
          } else {
            console.log(`[BBox] No bbox for ${key}`);
          }
        }
      });
    }
    // Process detailed financial entities
    if (Array.isArray(parsedJson.financial_entities)) {
      parsedJson.financial_entities.forEach((item: any) => {
        if (item && item.value) {
          entities.push({ type: item.label || 'unknown', value: String(item.value), confidence: item.confidence || 0.8 });
          if (item.bbox) boundingBoxes.push({ category: item.label || 'unknown', text: String(item.value), ...mapBbox(item.bbox, sourceDimensions) });
        }
      });
    }

    // Process line items with individual field bounding boxes
    if (Array.isArray(parsedJson.line_items)) {
      parsedJson.line_items.forEach((item: any, index: number) => {
        if (item) {
          // Add row-level bounding box if available
          if (item.row_bbox) {
            boundingBoxes.push({ 
              category: `line_item_row_${index + 1}`, 
              text: `Line Item ${index + 1}`, 
              ...mapBbox(item.row_bbox, sourceDimensions) 
            });
          }

          // Process individual fields with their own bounding boxes
          const fields = ['item_number', 'item_code', 'description', 'quantity', 'unit_of_measure', 'unit_price', 'line_total'];
          fields.forEach(field => {
            if (item[field] && item[field].value) {
              entities.push({ 
                type: `line_item_${field}`, 
                value: String(item[field].value), 
                confidence: item[field].confidence || 0.8 
              });
              
              if (item[field].bbox) {
                boundingBoxes.push({ 
                  category: `line_item_${field}`, 
                  text: String(item[field].value), 
                  ...mapBbox(item[field].bbox, sourceDimensions) 
                });
              }
            }
          });
        }
      });
    }

    // Use cleaned full text or construct clean text from entities
    let finalText = cleanFullText;
    if (!finalText || finalText.length < 50) {
      // Construct clean text from structured data
      const textParts: string[] = [];
      
      // Add document summary info
      if (parsedJson.document_summary) {
        const summary = parsedJson.document_summary;
        if (summary.vendor_name?.value) textParts.push(`Vendor: ${summary.vendor_name.value}`);
        if (summary.document_type?.value) textParts.push(`Document Type: ${summary.document_type.value}`);
        if (summary.transaction_date?.value) textParts.push(`Date: ${summary.transaction_date.value}`);
        if (summary.total_amount?.value) textParts.push(`Total: ${summary.total_amount.value}`);
      }
      
      // Add line items
      if (Array.isArray(parsedJson.line_items) && parsedJson.line_items.length > 0) {
        textParts.push('\nLine Items:');
        parsedJson.line_items.forEach((item: any, index: number) => {
          const itemParts = [`${index + 1}.`];
          if (item.description?.value) itemParts.push(item.description.value);
          if (item.quantity?.value) itemParts.push(`Qty: ${item.quantity.value}`);
          if (item.unit_price?.value) itemParts.push(`Price: ${item.unit_price.value}`);
          if (item.line_total?.value) itemParts.push(`Total: ${item.line_total.value}`);
          textParts.push(itemParts.join(' '));
        });
      }
      
      // Add financial entities
      if (Array.isArray(parsedJson.financial_entities)) {
        parsedJson.financial_entities.forEach((entity: any) => {
          if (entity.value && entity.label) {
            textParts.push(`${entity.label}: ${entity.value}`);
          }
        });
      }
      
      finalText = textParts.join('\n');
    }
    
    // Fallback to entities if still no clean text
    if (!finalText) {
      finalText = entities.map((e) => e.value).join('\n');
    }
    
    const wordCount = finalText.split(/\s+/).filter(Boolean).length;
    
    return {
      text: finalText.trim(),
      entities: entities,
      // Add structured data directly to match frontend expectations
      document_summary: parsedJson.document_summary || undefined,
      financial_entities: parsedJson.financial_entities || undefined,
      line_items: parsedJson.line_items || undefined,
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
  console.log('[Parser] Raw response length:', content.length);
  console.log('[Parser] Raw response preview:', content.substring(0, 200));
  
  // First, try to find JSON in code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try { 
      console.log('[Parser] Found JSON in code block');
      // Remove JavaScript-style comments before parsing
      const cleanedJson = removeJavaScriptComments(codeBlockMatch[1]);
      return JSON.parse(cleanedJson); 
    } catch (e) { 
      console.warn('[Parser] Failed to parse JSON from code block:', e);
      console.log('[Parser] Code block content that failed:', codeBlockMatch[1].substring(0, 1000));
    }
  }
  
  // More aggressive cleaning - remove everything that's not JSON
  let cleanedContent = content.trim();
  
  // Remove all text before first opening brace
  const firstBraceIndex = cleanedContent.indexOf('{');
  if (firstBraceIndex > 0) {
    cleanedContent = cleanedContent.substring(firstBraceIndex);
    console.log('[Parser] Removed text before first brace');
  }
  
  // Remove all text after last closing brace
  const lastBraceIndex = cleanedContent.lastIndexOf('}');
  if (lastBraceIndex >= 0 && lastBraceIndex < cleanedContent.length - 1) {
    cleanedContent = cleanedContent.substring(0, lastBraceIndex + 1);
    console.log('[Parser] Removed text after last brace');
  }
  
  // Remove JavaScript-style comments from cleaned content
  cleanedContent = removeJavaScriptComments(cleanedContent);
  
  // Try to parse the cleaned content
  if (cleanedContent.startsWith('{') && cleanedContent.endsWith('}')) {
    try {
      console.log('[Parser] Attempting to parse cleaned JSON');
      return JSON.parse(cleanedContent);
    } catch (e) {
      console.warn('[Parser] Failed to parse cleaned JSON:', e);
      console.log('[Parser] Cleaned content preview:', cleanedContent.substring(0, 500));
      console.log('[Parser] Full cleaned content length:', cleanedContent.length);
    }
  }
  
  // Try to extract JSON using regex as fallback
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch && jsonMatch[0]) {
    try { 
      console.log('[Parser] Attempting regex-extracted JSON');
      // Remove JavaScript-style comments before parsing
      const cleanedRegexJson = removeJavaScriptComments(jsonMatch[0]);
      return JSON.parse(cleanedRegexJson); 
    } catch (e) { 
      console.warn('[Parser] Failed to parse regex-extracted JSON:', e);
    }
  }
  
  console.warn('[Parser] No valid JSON found in response');
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

/**
 * Removes JavaScript-style comments from a JSON string to make it parseable.
 * Handles both single-line (//) and multi-line block comments while preserving strings.
 */
function removeJavaScriptComments(jsonString: string): string {
  console.log('[Parser] Removing JavaScript comments from JSON');
  
  // Split by lines and process each line to remove single-line comments
  const lines = jsonString.split('\n');
  const processedLines = lines.map(line => {
    // Find the position of // that's not inside a string
    let inString = false;
    let escapeNext = false;
    let commentIndex = -1;
    
    for (let i = 0; i < line.length - 1; i++) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (line[i] === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (line[i] === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString && line[i] === '/' && line[i + 1] === '/') {
        commentIndex = i;
        break;
      }
    }
    
    if (commentIndex >= 0) {
      // Remove the comment and any trailing whitespace
      const cleaned = line.substring(0, commentIndex).trim();
      console.log(`[Parser] Removed comment from line: "${line.trim()}" -> "${cleaned}"`);
      return cleaned;
    }
    
    return line;
  });
  
  let result = processedLines.join('\n');
  
  // Remove multi-line comments /* ... */
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  
  return result;
}

function mapBbox(bbox: number[], sourceDimensions?: { width: number; height: number }): { x1: number; y1: number; x2: number; y2: number } {
  if (!Array.isArray(bbox) || bbox.length !== 4) return { x1: 0, y1: 0, x2: 0, y2: 0 };
  
  // If source dimensions are provided, normalize to percentages
  if (sourceDimensions && sourceDimensions.width > 0 && sourceDimensions.height > 0) {
    const x1Percent = (bbox[0] / sourceDimensions.width) * 100;
    const y1Percent = (bbox[1] / sourceDimensions.height) * 100;
    const x2Percent = (bbox[2] / sourceDimensions.width) * 100;
    const y2Percent = (bbox[3] / sourceDimensions.height) * 100;
    
    console.log(`[BBox] Normalized [${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}] → [${x1Percent.toFixed(2)}%,${y1Percent.toFixed(2)}%,${x2Percent.toFixed(2)}%,${y2Percent.toFixed(2)}%] using ${sourceDimensions.width}x${sourceDimensions.height}`);
    
    return { 
      x1: parseFloat(x1Percent.toFixed(2)), 
      y1: parseFloat(y1Percent.toFixed(2)), 
      x2: parseFloat(x2Percent.toFixed(2)), 
      y2: parseFloat(y2Percent.toFixed(2)) 
    };
  }
  
  // Fallback: return raw pixel coordinates
  return { x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3] };
}

// --- Main Trigger.dev v3 Task Definition ---

export const processDocumentOCR = task({
  id: "process-document-ocr",
  run: async (payload: { documentId: string; imageStoragePath: string }) => {
    console.log(`✅ Starting OCR process for document: ${payload.documentId}`);

    try {
      // Step 0: Fetch document record to get source image dimensions
      const { data: documentRecord, error: fetchError } = await supabase
        .from('documents')
        .select('converted_image_width, converted_image_height')
        .eq('id', payload.documentId)
        .single();

      let sourceDimensions: { width: number; height: number } | undefined;
      if (documentRecord?.converted_image_width && documentRecord?.converted_image_height) {
        sourceDimensions = {
          width: documentRecord.converted_image_width,
          height: documentRecord.converted_image_height
        };
        console.log(`📐 Retrieved source image dimensions: ${sourceDimensions.width}x${sourceDimensions.height}`);
      } else {
        console.warn(`⚠️ No source image dimensions found for document ${payload.documentId} - will use raw pixel coordinates`);
      }
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
      console.log(`[OCR] Image storage path: ${payload.imageStoragePath}`);
      console.log(`[OCR] Signed URL: ${signedImageUrl.substring(0, 100)}...`);
      
      // Test if the signed URL is accessible
      try {
        const testResponse = await fetch(signedImageUrl, { method: 'HEAD' });
        console.log(`[OCR] URL accessibility test - Status: ${testResponse.status}, Content-Type: ${testResponse.headers.get('content-type')}, Content-Length: ${testResponse.headers.get('content-length')}`);
        if (!testResponse.ok) {
          console.warn(`[OCR] Warning: Signed URL returned ${testResponse.status} ${testResponse.statusText}`);
        }
      } catch (testError) {
        console.error(`[OCR] Error testing signed URL accessibility:`, testError);
      }

      // Step 2: Get OCR service configuration
      const ocrEndpointUrl = process.env.OCR_ENDPOINT_URL;
      const ocrModelName = process.env.OCR_MODEL_NAME;
      console.log(`[OCR] Environment variables - Endpoint: ${ocrEndpointUrl ? 'SET' : 'MISSING'}, Model: ${ocrModelName ? 'SET' : 'MISSING'}`);
      if (!ocrEndpointUrl || !ocrModelName) {
        throw new Error(`Missing OCR service environment variables. Endpoint: ${ocrEndpointUrl ? 'SET' : 'MISSING'}, Model: ${ocrModelName ? 'SET' : 'MISSING'}`);
      }

      // Step 3: Call the external OCR service with complete processing logic
      const ocrResult = await processDocumentWithOCR(signedImageUrl, ocrEndpointUrl, ocrModelName, sourceDimensions);
      
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

      // Step 6: Log bounding box availability for frontend annotation rendering
      const boundingBoxes = (ocrResult.metadata as any)?.boundingBoxes || [];
      console.log(`[Frontend Annotation] Bounding boxes available for frontend rendering: ${boundingBoxes.length}`);
      
      if (boundingBoxes.length > 0) {
        console.log(`[Frontend Annotation] Sample bounding boxes for hover rendering:`, boundingBoxes.slice(0, 3).map((bb: any) => ({
          category: bb.category,
          text: bb.text?.substring(0, 20) + '...',
          coords: `(${bb.x1},${bb.y1})-(${bb.x2},${bb.y2})`
        })));
        console.log(`✅ Frontend annotation system will handle ${boundingBoxes.length} bounding boxes on hover/click`);
      } else {
        console.log(`📝 No bounding boxes found - frontend annotation system will have no data to render`);
      }

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