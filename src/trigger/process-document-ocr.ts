/**
 * Clean DSPy Document OCR Processing Task
 * 
 * Simplified architecture using common services for standardized processing
 * Supports both Gemini (primary) and vLLM Skywork (fallback) backends
 */

import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { createClient } from '@supabase/supabase-js';
import { DynamicExpenseCategory } from '@/hooks/use-expense-categories';

// Import unified DSPy processing (consolidated from separate schema/signature/service files)
import { unifiedDspyScript } from './common/python/unified-dspy-processing.py';

// Initialize Supabase client with service role key for background processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper function to fetch enabled categories directly from database
async function fetchEnabledCategoriesFromDB(businessId: string): Promise<DynamicExpenseCategory[]> {
  try {
    const { data: businessData, error } = await supabase
      .from('businesses')
      .select('custom_expense_categories')
      .eq('id', businessId)
      .single();

    if (error) {
      console.error('Error fetching categories from DB:', error);
      return [];
    }

    const allCategories = businessData?.custom_expense_categories || [];
    const enabledCategories = allCategories
      .filter((category: any) => category.is_active !== false)
      .sort((a: any, b: any) => (a.sort_order || 99) - (b.sort_order || 99))
      .map((category: any) => ({
        id: category.id || category.category_code,
        category_name: category.category_name,
        category_code: category.category_code,
        description: category.description,
        vendor_patterns: category.vendor_patterns || [],
        ai_keywords: category.ai_keywords || []
      }));

    return enabledCategories;
  } catch (error) {
    console.error('Failed to fetch categories from database:', error);
    return [];
  }
}

// Enhanced categorization function using common business logic
function categorizeExpenseWithDynamicCategories(
  extractionData: any,
  categories: DynamicExpenseCategory[]
): { category: string; confidence: number; reasoning: string } {
  if (!categories.length) {
    return {
      category: '',
      confidence: 0.1,
      reasoning: 'No categories available for categorization'
    };
  }

  // Access both flat and structured vendor data for compatibility
  const vendorName = extractionData.vendor_name || extractionData.document_summary?.vendor_name || '';
  const documentType = extractionData.document_type || extractionData.document_summary?.document_type || '';
  const industryContext = extractionData.industry_context || extractionData.document_summary?.industry_context || '';
  
  const text = `${vendorName} ${documentType} ${industryContext}`.toLowerCase();
  
  let bestMatch = {
    category: categories[0].category_code,
    confidence: 0.1,
    reasoning: 'No pattern matches found'
  };

  // Check each category's vendor patterns and AI keywords
  for (const category of categories) {
    let matchScore = 0;
    const matchReasons: string[] = [];
    
    // Check vendor patterns
    if (category.vendor_patterns && category.vendor_patterns.length > 0) {
      for (const pattern of category.vendor_patterns) {
        if (text.includes(pattern.toLowerCase())) {
          matchScore += 0.4;
          matchReasons.push(`vendor pattern: "${pattern}"`);
        }
      }
    }
    
    // Check AI keywords
    if (category.ai_keywords && category.ai_keywords.length > 0) {
      for (const keyword of category.ai_keywords) {
        if (text.includes(keyword.toLowerCase())) {
          matchScore += 0.3;
          matchReasons.push(`keyword: "${keyword}"`);
        }
      }
    }
    
    if (matchScore > bestMatch.confidence) {
      bestMatch = {
        category: category.category_code,
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
      category: categories[0].category_code,
      confidence: 0.15,
      reasoning: `Defaulted to "${categories[0].category_name}" - no clear pattern match`
    };
  }

  return bestMatch;
}

// Transform DSPy result to existing document format for backward compatibility
function transformToDocumentFormat(dspyData: any, enhancedCategory: any, processingMethod: string) {
  // Get DSPy confidence score from signature output
  const dspyConfidence = dspyData.dspy_confidence;

  console.log(`🎯 DSPy confidence score: ${dspyConfidence || 'None'}`);

  // Build entities array WITHOUT confidence values (frontend will not display them)
  const entities = [
    {
      type: 'document_type',
      value: dspyData.document_summary?.document_type || dspyData.document_type || 'unknown'
    },
    {
      type: 'vendor_name',
      value: dspyData.document_summary?.vendor_name || dspyData.vendor_name || ''
    },
    {
      type: 'document_number',
      value: dspyData.document_number || ''
    },
    {
      type: 'total_amount',
      value: String(dspyData.document_summary?.total_amount || dspyData.total_amount || '0')
    },
    {
      type: 'transaction_date',
      value: dspyData.document_summary?.document_date || dspyData.transaction_date || ''
    },
    {
      type: 'currency',
      value: dspyData.document_summary?.currency || dspyData.currency || 'SGD'
    },
    {
      type: 'suggested_category',
      value: enhancedCategory.category
    },
    {
      type: 'processing_method',
      value: processingMethod
    }
  ];

  return {
    text: [
      `Vendor: ${dspyData.document_summary?.vendor_name || dspyData.vendor_name || 'Unknown'}`,
      `Amount: ${dspyData.document_summary?.total_amount || dspyData.total_amount || 0} ${dspyData.document_summary?.currency || dspyData.currency || 'SGD'}`,
      `Date: ${dspyData.document_summary?.document_date || dspyData.transaction_date || 'Unknown'}`,
      `Category: ${enhancedCategory.category}`,
      `Processing: ${processingMethod}`
    ].filter(Boolean).join('\n'),
    entities,
    document_summary: {
      // Core vendor information - no confidence values displayed
      vendor_name: { value: dspyData.document_summary?.vendor_name || dspyData.vendor_name },
      vendor_address: { value: dspyData.vendor_address || '' },
      vendor_contact: { value: dspyData.vendor_contact || '' },
      vendor_tax_id: { value: dspyData.vendor_tax_id || '' },

      // Customer information
      customer_name: { value: dspyData.customer_name || '' },
      customer_address: { value: dspyData.customer_address || '' },
      customer_contact: { value: dspyData.customer_contact || '' },

      // Document identifiers - standardized single field from DSPy
      document_number: { value: dspyData.document_number || '' },

      // Financial information
      total_amount: { value: String(dspyData.document_summary?.total_amount || dspyData.total_amount || '0') },
      currency: { value: dspyData.document_summary?.currency || dspyData.currency || 'SGD' },
      subtotal_amount: { value: String(dspyData.subtotal_amount || '') },
      tax_amount: { value: String(dspyData.tax_amount || '') },
      discount_amount: { value: String(dspyData.discount_amount || '') },

      // Dates
      transaction_date: { value: dspyData.document_summary?.document_date || dspyData.transaction_date },
      due_date: { value: dspyData.due_date || '' },
      delivery_date: { value: dspyData.delivery_date || '' },

      // Payment information
      payment_terms: { value: dspyData.payment_terms || '' },
      payment_method: { value: dspyData.payment_method || '' },
      bank_details: { value: dspyData.bank_details || '' },

      // Document classification
      document_type: { value: dspyData.document_summary?.document_type || dspyData.document_type || 'unknown' },
      industry_context: { value: dspyData.industry_context || 'general' },

      // Categorization (business logic only - no confidence display)
      suggested_category: { value: enhancedCategory.category }
    },
    // Transform line items to match frontend expected structure
    line_items: (() => {
      // Parse line items from JSON string if available
      let lineItemsArray = dspyData.line_items || [];
      
      // If we have line_items_json instead, parse it
      if (!lineItemsArray.length && dspyData.line_items_json) {
        try {
          lineItemsArray = JSON.parse(dspyData.line_items_json);
        } catch (e) {
          console.warn('Failed to parse line_items_json:', e);
          lineItemsArray = [];
        }
      }
      
      return lineItemsArray.map((item: any, index: number) => ({
        description: item.description ? {
          value: String(item.description),
          bbox: null
        } : null,
        item_code: item.item_code ? {
          value: String(item.item_code),
          bbox: null
        } : null,
        quantity: item.quantity !== undefined ? {
          value: String(item.quantity),
          bbox: null
        } : null,
        unit_measurement: item.unit_of_measure ? {
          value: String(item.unit_of_measure),
          bbox: null
        } : null,
        unit_price: item.unit_price !== undefined ? {
          value: String(item.unit_price),
          bbox: null
        } : null,
        line_total: item.line_total !== undefined ? {
          value: String(item.line_total),
          bbox: null
        } : null
      }));
    })(),
    metadata: {
      pageCount: 1,
      wordCount: (() => {
        // Calculate word count from extracted text
        const textContent = [
          dspyData.document_summary?.vendor_name || dspyData.vendor_name || '',
          dspyData.document_summary?.total_amount || dspyData.total_amount || '',
          dspyData.document_summary?.document_date || dspyData.transaction_date || '',
          enhancedCategory.category || ''
        ].join(' ').split(/\s+/).filter(word => word.length > 0);
        return textContent.length;
      })(),
      language: 'en',
      processingMethod: processingMethod,
      dspy_confidence: dspyConfidence, // DSPy confidence score for fallback logic
      requires_validation: dspyData.requires_validation,
      category_reasoning: enhancedCategory.reasoning
    }
  };
}

export const processDocumentOCR = task({
  id: "process-document-ocr",
  run: async (payload: { documentId: string; imageStoragePath: string; expenseCategory?: string }) => {
    console.log(`✅ Starting Clean DSPy OCR process for document: ${payload.documentId}`);

    // Declare variables at function scope for catch block access
    let processedImageBase64: string = '';
    let processedMimeType: string = '';
    let docRecord: any = null;

    try {
      // Step 1: Fetch document record and prepare image
      const { data: fetchedDocRecord, error: fetchError } = await supabase
        .from('documents')
        .select('file_name, file_type, file_size, user_id, business_id, storage_path, converted_image_path')
        .eq('id', payload.documentId)
        .single();

      if (fetchError || !fetchedDocRecord) {
        throw new Error(`Failed to fetch document record: ${fetchError?.message}`);
      }

      // Assign to function-scoped variable
      docRecord = fetchedDocRecord;

      console.log(`📄 Processing: ${docRecord.file_name} (${docRecord.file_type}, ${Math.round(docRecord.file_size / 1024)}KB)`);

      // Step 2: Create signed URL and download image
      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(payload.imageStoragePath, 600);

      if (urlError || !urlData) {
        throw new Error(`Failed to create signed URL: ${urlError?.message}`);
      }

      console.log("📥 Downloading image for processing...");
      const imageResponse = await fetch(urlData.signedUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      processedImageBase64 = Buffer.from(imageBuffer).toString('base64');
      processedMimeType = docRecord.file_type || 'image/jpeg';

      console.log(`🖼️ Image prepared: ${Math.round(imageBuffer.byteLength / 1024)}KB`);

      // Step 3: Process with DSPy Common Services
      const dspyResult = await python.runInline(`
# =============================================================================
# CLEAN DSPy PROCESSING USING COMMON SERVICES
# =============================================================================

import dspy
import os
import json
import sys
from datetime import datetime
from PIL import Image
import io
import base64
import traceback

# Inject unified DSPy processing (consolidated)
${unifiedDspyScript}

def main():
    print("🚀 Clean DSPy Processing with Common Services", file=sys.stderr)
    
    try:
        # Prepare image data
        document_image_data = ${JSON.stringify({
          base64: processedImageBase64,
          mimeType: processedMimeType,
          filename: docRecord.file_name
        })}
        
        # Convert to PIL Image
        image_bytes = base64.b64decode(document_image_data['base64'])
        document_image_pil = Image.open(io.BytesIO(image_bytes))
        
        print(f"🖼️ Image ready: {document_image_pil.size}", file=sys.stderr)
        
        # Run both Gemini and vLLM for comparison
        gemini_result = None
        vllm_result = None
        
        # Try Gemini first - capture all errors in return value
        gemini_error_details = None
        try:
            print("🔧 Running Gemini processing for comparison...", file=sys.stderr)

            gemini_api_key = os.getenv('GEMINI_API_KEY')
            if not gemini_api_key:
                raise ValueError("GEMINI_API_KEY not found")

            print(f"🔧 Configuring Gemini LM with API key: {gemini_api_key[:10]}...", file=sys.stderr)
            gemini_lm = dspy.LM(
                'gemini/gemini-2.5-flash',
                api_key=gemini_api_key,
                temperature=0.0,
                max_tokens=16384
            )
            print(f"✅ Gemini LM configured successfully", file=sys.stderr)

            print(f"🤖 Calling process_document_with_dspy for Gemini...", file=sys.stderr)
            gemini_result = process_document_with_dspy(
                document_image=document_image_pil,
                lm_client=gemini_lm,
                processing_strategy="auto",
                processing_options={'backend': 'gemini_primary'}
            )
            print(f"🔍 Gemini raw result type: {type(gemini_result)}", file=sys.stderr)
            print(f"🔍 Gemini raw result preview: {str(gemini_result)[:300]}...", file=sys.stderr)

            # Safely access result - handle both dict and string returns
            if isinstance(gemini_result, dict):
                print(f"✅ Gemini returned dict with keys: {list(gemini_result.keys())}", file=sys.stderr)

                # Check for success status
                if not gemini_result.get('success', False):
                    gemini_error_details = f"Gemini processing marked as failed: {gemini_result.get('error', 'No error message')}"
                    print(f"❌ {gemini_error_details}", file=sys.stderr)
                    gemini_result = None
                else:
                    document_summary = gemini_result.get('document_summary', {})
                    if isinstance(document_summary, dict):
                        vendor_name = document_summary.get('vendor_name', 'N/A')
                        doc_number = document_summary.get('document_number', 'N/A')
                        vendor_address = document_summary.get('vendor_address', 'N/A')
                    else:
                        # Fallback to flat structure
                        vendor_name = gemini_result.get('vendor_name', 'N/A')
                        doc_number = gemini_result.get('document_number', 'N/A')
                        vendor_address = gemini_result.get('vendor_address', 'N/A')
                    print(f"✅ Gemini extraction: vendor={vendor_name}, doc_num={doc_number}, address={vendor_address[:50]}{'...' if len(vendor_address) > 50 else ''}", file=sys.stderr)
                    gemini_result['backend_used'] = 'gemini_primary'
            else:
                gemini_error_details = f"Gemini returned unexpected type {type(gemini_result)}: {str(gemini_result)[:200]}..."
                print(f"❌ {gemini_error_details}", file=sys.stderr)
                gemini_result = None

        except Exception as gemini_error:
            # Capture full error details for return value
            import traceback
            error_traceback = traceback.format_exc()

            gemini_error_details = {
                "error_type": type(gemini_error).__name__,
                "error_message": str(gemini_error),
                "full_traceback": error_traceback
            }

            # Try to capture DSPy context
            try:
                if hasattr(dspy.settings, 'lm') and hasattr(dspy.settings.lm, '_history'):
                    if dspy.settings.lm._history:
                        last_call = dspy.settings.lm._history[-1]
                        gemini_error_details["dspy_last_call"] = str(last_call)[:1000]
            except:
                pass

            print(f"❌ Gemini processing failed: {gemini_error_details['error_type']}: {gemini_error_details['error_message']}", file=sys.stderr)
            print(f"❌ Full traceback in return value", file=sys.stderr)

            gemini_result = None
        
        # Try vLLM for comparison - capture all errors in return value
        vllm_error_details = None
        vllm_endpoint = os.getenv('OCR_ENDPOINT_URL')
        if vllm_endpoint:
            try:
                print("🔧 Running vLLM processing for comparison...", file=sys.stderr)

                vllm_model = os.getenv('OCR_MODEL_NAME', 'brandonbeiler/Skywork-R1V3-38B-FP8-Dynamic')
                print(f"🔧 Configuring vLLM with endpoint: {vllm_endpoint}, model: {vllm_model}", file=sys.stderr)
                skywork_lm = dspy.LM(
                    model=f"openai/{vllm_model}",
                    api_base=vllm_endpoint,
                    api_key="dummy",
                    model_type='chat',
                    temperature=0.1,
                    max_tokens=16384
                )
                print(f"✅ vLLM LM configured successfully", file=sys.stderr)

                print(f"🤖 Calling process_document_with_dspy for vLLM...", file=sys.stderr)
                vllm_result = process_document_with_dspy(
                    document_image=document_image_pil,
                    lm_client=skywork_lm,
                    processing_strategy="auto",
                    processing_options={'backend': 'vllm_comparison'}
                )
                print(f"🔍 vLLM raw result type: {type(vllm_result)}", file=sys.stderr)
                print(f"🔍 vLLM raw result preview: {str(vllm_result)[:300]}...", file=sys.stderr)

                # Safely access result - handle both dict and string returns
                if isinstance(vllm_result, dict):
                    print(f"✅ vLLM returned dict with keys: {list(vllm_result.keys())}", file=sys.stderr)

                    # Check for success status
                    if not vllm_result.get('success', False):
                        vllm_error_details = f"vLLM processing marked as failed: {vllm_result.get('error', 'No error message')}"
                        print(f"❌ {vllm_error_details}", file=sys.stderr)
                        vllm_result = None
                    else:
                        document_summary = vllm_result.get('document_summary', {})
                        if isinstance(document_summary, dict):
                            vendor_name = document_summary.get('vendor_name', 'N/A')
                            doc_number = document_summary.get('document_number', 'N/A')
                            vendor_address = document_summary.get('vendor_address', 'N/A')
                        else:
                            # Fallback to flat structure
                            vendor_name = vllm_result.get('vendor_name', 'N/A')
                            doc_number = vllm_result.get('document_number', 'N/A')
                            vendor_address = vllm_result.get('vendor_address', 'N/A')
                        print(f"✅ vLLM extraction: vendor={vendor_name}, doc_num={doc_number}, address={vendor_address[:50]}{'...' if len(vendor_address) > 50 else ''}", file=sys.stderr)
                        vllm_result['backend_used'] = 'vllm_comparison'
                else:
                    vllm_error_details = f"vLLM returned unexpected type {type(vllm_result)}: {str(vllm_result)[:200]}..."
                    print(f"❌ {vllm_error_details}", file=sys.stderr)
                    vllm_result = None

            except Exception as vllm_error:
                # Capture full error details for return value
                import traceback
                error_traceback = traceback.format_exc()

                vllm_error_details = {
                    "error_type": type(vllm_error).__name__,
                    "error_message": str(vllm_error),
                    "full_traceback": error_traceback
                }

                # Try to capture DSPy context
                try:
                    if hasattr(dspy.settings, 'lm') and hasattr(dspy.settings.lm, '_history'):
                        if dspy.settings.lm._history:
                            last_call = dspy.settings.lm._history[-1]
                            vllm_error_details["dspy_last_call"] = str(last_call)[:1000]
                except:
                    pass

                print(f"❌ vLLM processing failed: {vllm_error_details['error_type']}: {vllm_error_details['error_message']}", file=sys.stderr)
                print(f"❌ Full traceback in return value", file=sys.stderr)

                vllm_result = None
        else:
            vllm_error_details = "No vLLM endpoint configured (OCR_ENDPOINT_URL not set)"
            print("⚠️ No vLLM endpoint configured, skipping comparison", file=sys.stderr)
        
        # Compare results and choose the better one
        print("🔍 Comparing extraction results...", file=sys.stderr)

        def score_extraction_quality(extraction):
            if not extraction or not isinstance(extraction, dict) or not extraction.get('success'):
                return 0

            score = 0
            doc_summary = extraction.get('document_summary', {})

            # Check key field completeness
            if doc_summary.get('vendor_name', {}).get('value', '').strip():
                score += 2
            if doc_summary.get('document_number', {}).get('value', '').strip():
                score += 3  # Document number is critical
            if doc_summary.get('vendor_address', {}).get('value', '').strip():
                score += 2  # Address is important
            if doc_summary.get('vendor_contact', {}).get('value', '').strip():
                score += 2  # Contact info is important
            if doc_summary.get('total_amount', {}).get('value', '').strip():
                score += 1

            # Check line items quality
            line_items = extraction.get('line_items', [])
            if line_items and len(line_items) > 0:
                score += 1

            return score

        gemini_score = score_extraction_quality(gemini_result) if gemini_result else 0
        vllm_score = score_extraction_quality(vllm_result) if vllm_result else 0

        print(f"🏆 Extraction quality scores: Gemini={gemini_score}, vLLM={vllm_score}", file=sys.stderr)

        # Collect detailed error information for debugging
        error_details = {}
        if not gemini_result:
            error_details['gemini_error'] = gemini_error_details if gemini_error_details else "Gemini processing failed - check stderr for details"
        if not vllm_result:
            error_details['vllm_error'] = vllm_error_details if vllm_error_details else "vLLM processing failed - check stderr for details"

        # NEW: DSPy confidence-based fallback logic
        gemini_dspy_confidence = gemini_result.get('dspy_confidence') if gemini_result else None
        vllm_dspy_confidence = vllm_result.get('dspy_confidence') if vllm_result else None

        print(f"🎯 Gemini DSPy confidence: {gemini_dspy_confidence}", file=sys.stderr)
        print(f"🎯 vLLM DSPy confidence: {vllm_dspy_confidence or 'N/A'}", file=sys.stderr)

        # If Gemini DSPy confidence < 0.75, prefer vLLM even if quality scores are similar
        if gemini_dspy_confidence is not None and gemini_dspy_confidence < 0.75:
            print(f"⚠️ Gemini DSPy confidence {gemini_dspy_confidence:.3f} < 0.75 threshold - preferring vLLM", file=sys.stderr)
            if vllm_result and vllm_result.get('success'):
                print(f"✅ Using vLLM result (Gemini DSPy confidence too low)", file=sys.stderr)
                return vllm_result

        # Standard quality-based selection
        if gemini_score > vllm_score and gemini_result:
            print(f"✅ Using Gemini result (better quality score: {gemini_score})", file=sys.stderr)
            return gemini_result
        elif vllm_score > gemini_score and vllm_result:
            print(f"✅ Using vLLM result (better quality score: {vllm_score})", file=sys.stderr)
            return vllm_result
        elif gemini_result:
            print(f"✅ Using Gemini result (default choice)", file=sys.stderr)
            return gemini_result
        elif vllm_result:
            print(f"✅ Using vLLM result (fallback)", file=sys.stderr)
            return vllm_result
        else:
            print(f"❌ Both processing methods failed", file=sys.stderr)
            return {
                "success": False,
                "error": "Both Gemini and vLLM processing failed",
                "backend_used": "both_failed",
                "error_details": error_details
            }
        
    except Exception as e:
        print(f"❌ All processing failed: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return {
            "success": False,
            "error": str(e),
            "backend_used": "processing_failed"
        }

# Execute
result = main()
print(json.dumps(result))
`);

      console.log("🐍 DSPy processing completed");
      
      // Step 4: Parse and validate result
      let finalExtractionData;
      try {
        console.log(`🔍 Debug - dspyResult type: ${typeof dspyResult}`);
        console.log(`🔍 Debug - dspyResult preview:`, JSON.stringify(dspyResult).substring(0, 200));
        
        let jsonString: string;
        if (typeof dspyResult === 'string') {
          jsonString = dspyResult;
        } else if (dspyResult && typeof dspyResult === 'object' && 'stdout' in dspyResult) {
          jsonString = (dspyResult as any).stdout;
        } else {
          jsonString = JSON.stringify(dspyResult);
        }
        
        console.log(`🔍 Debug - jsonString preview:`, jsonString.substring(0, 200));
        
        const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
        if (jsonMatch && jsonMatch[0]) {
          finalExtractionData = JSON.parse(jsonMatch[0]);
          console.log(`🔍 Debug - finalExtractionData type after parse: ${typeof finalExtractionData}`);
          console.log(`🔍 Debug - finalExtractionData keys:`, finalExtractionData ? Object.keys(finalExtractionData) : 'null/undefined');
        } else {
          throw new Error("No valid JSON object found in processing output");
        }
      } catch (parseError) {
        console.error("❌ Failed to parse DSPy output:", parseError);
        console.error("❌ Raw dspyResult was:", dspyResult);
        throw new Error(`DSPy processing failed: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
      }
      
      // Add type safety check before accessing properties
      console.log(`🔍 Debug - About to check success. finalExtractionData type: ${typeof finalExtractionData}`);
      console.log(`🔍 Debug - finalExtractionData value:`, finalExtractionData);
      
      if (typeof finalExtractionData === 'string') {
        console.error("❌ finalExtractionData is still a string after parsing, trying to parse again");
        try {
          finalExtractionData = JSON.parse(finalExtractionData);
        } catch (secondParseError) {
          console.error("❌ Second parse attempt failed:", secondParseError);
          throw new Error(`DSPy returned unparseable result: ${finalExtractionData.substring(0, 200)}`);
        }
      }
      
      if (!finalExtractionData || typeof finalExtractionData !== 'object') {
        throw new Error(`DSPy processing failed: Invalid result type ${typeof finalExtractionData}`);
      }
      
      if (!finalExtractionData.success) {
        const errorMessage = finalExtractionData.error || 'Unknown processing error';
        throw new Error(`DSPy processing failed: ${errorMessage}`);
      }

      console.log(`✅ Processing successful with ${finalExtractionData.backend_used}`);
      console.log(`🏪 Vendor: ${finalExtractionData.document_summary?.vendor_name || finalExtractionData.vendor_name}`);
      console.log(`💰 Amount: ${finalExtractionData.document_summary?.total_amount || finalExtractionData.total_amount}`);

      // Step 5: Business categorization
      const businessId = docRecord.business_id;
      if (!businessId) {
        throw new Error('Unable to determine business ID for categorization');
      }
      
      const businessCategories = await fetchEnabledCategoriesFromDB(businessId);
      const enhancedCategory = categorizeExpenseWithDynamicCategories(finalExtractionData, businessCategories);
      
      console.log(`🏷️ Category: ${enhancedCategory.category} (${(enhancedCategory.confidence * 100).toFixed(1)}%)`);

      // Step 6: Store raw DSPy structure directly (simplified approach)
      console.log(`🔍 Storing raw DSPy structure directly, no transformation needed`);

      // Add enhanced category to the DSPy result for business logic
      const finalDspyResult = {
        ...finalExtractionData,
        // Add business categorization directly to DSPy structure
        suggested_category: enhancedCategory.category,
        category_confidence: enhancedCategory.confidence,
        category_reasoning: enhancedCategory.reasoning,
        // Keep processing metadata in the main structure
        processing_method: finalExtractionData.backend_used || 'dspy_processing'
      };

      // Step 7: Update database with raw DSPy structure
      const { error: updateError } = await supabase.from('documents').update({
        processing_status: 'completed',
        extracted_data: finalDspyResult, // Store raw DSPy structure directly
        confidence_score: finalExtractionData.confidence_score,
        processed_at: new Date().toISOString(),
        error_message: null,
        processing_metadata: {
          backend_used: finalExtractionData.backend_used,
          requires_validation: finalExtractionData.requires_validation,
          category_suggestion: {
            enhanced: enhancedCategory.category,
            confidence: enhancedCategory.confidence
          }
        }
      }).eq('id', payload.documentId);

      if (updateError) {
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      console.log(`✅ Document ${payload.documentId} processed successfully`);
      
      return { 
        success: true, 
        documentId: payload.documentId, 
        confidence: finalExtractionData.confidence_score,
        category: enhancedCategory.category,
        requiresValidation: finalExtractionData.requires_validation,
        backend: finalExtractionData.backend_used
      };

    } catch (dspyError) {
      console.error("❌ DSPy processing failed:", dspyError);
      console.log("🔄 Attempting vLLM fallback processing...");
      
      // vLLM fallback processing
      if (process.env.OCR_ENDPOINT_URL) {
        try {
          console.log("🚀 Starting vLLM fallback processing...");
          
          const vllmImageData = {
            base64: processedImageBase64,
            mimeType: processedMimeType,
            filename: docRecord.file_name
          };

          const dspyVllmResult = await python.runInline(`
# =============================================================================
# VLLM FALLBACK DSPy PROCESSING
# =============================================================================

import dspy
import os
import json
import sys
from datetime import datetime
from PIL import Image
import io
import base64
import traceback

# Inject unified DSPy processing (consolidated)
${unifiedDspyScript}

def main():
    print("🚀 vLLM Fallback DSPy Processing", file=sys.stderr)
    
    try:
        # Prepare image data
        document_image_data = ${JSON.stringify(vllmImageData)}
        
        # Convert to PIL Image
        image_bytes = base64.b64decode(document_image_data['base64'])
        document_image_pil = Image.open(io.BytesIO(image_bytes))
        
        print(f"🖼️ vLLM Image ready: {document_image_pil.size}", file=sys.stderr)
        
        # Configure vLLM backend
        vllm_endpoint = os.getenv('OCR_ENDPOINT_URL')
        vllm_model = os.getenv('OCR_MODEL_NAME', 'brandonbeiler/Skywork-R1V3-38B-FP8-Dynamic')
        
        print(f"🔧 vLLM endpoint: {vllm_endpoint}", file=sys.stderr)
        print(f"🔧 vLLM model: {vllm_model}", file=sys.stderr)
        
        skywork_lm = dspy.LM(
            model=f"openai/{vllm_model}",
            api_base=vllm_endpoint,
            api_key="dummy",
            model_type='chat',
            temperature=0.1,
            max_tokens=16384
        )
        
        result = process_document_with_dspy(
            document_image=document_image_pil,
            lm_client=skywork_lm,
            processing_strategy="auto",
            processing_options={'backend': 'vllm_fallback'}
        )
        
        # Safely access result - handle both dict and string returns
        if isinstance(result, dict):
            document_summary = result.get('document_summary', {})
            if isinstance(document_summary, dict):
                vendor_name = document_summary.get('vendor_name', 'N/A')
            else:
                vendor_name = result.get('vendor_name', 'N/A')
            print(f"✅ vLLM success: {vendor_name}", file=sys.stderr)
            result['backend_used'] = 'vllm_fallback'
        else:
            print(f"✅ vLLM returned: {str(result)[:100]}...", file=sys.stderr)
            # Convert string result to dict format
            result = {
                "success": False,
                "error": str(result),
                "backend_used": "vllm_fallback_failed"
            }
        return result
        
    except Exception as e:
        print(f"❌ vLLM processing failed: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return {
            "success": False,
            "error": str(e),
            "backend_used": "vllm_fallback_failed"
        }

# Execute
result = main()
print(json.dumps(result))
`);

          console.log("🐍 vLLM fallback processing completed");
          
          // Parse vLLM result
          let vllmExtractionData;
          try {
            let jsonString: string;
            if (typeof dspyVllmResult === 'string') {
              jsonString = dspyVllmResult;
            } else if (dspyVllmResult && typeof dspyVllmResult === 'object' && 'stdout' in dspyVllmResult) {
              jsonString = (dspyVllmResult as any).stdout;
            } else {
              jsonString = JSON.stringify(dspyVllmResult);
            }
            
            const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
              vllmExtractionData = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error("No valid JSON object found in vLLM output");
            }
          } catch (parseError) {
            console.error("❌ Failed to parse vLLM output:", parseError);
            throw new Error(`vLLM processing failed: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
          }
          
          if (!vllmExtractionData || !vllmExtractionData.success) {
            const errorMessage = vllmExtractionData?.error || 'Unknown vLLM processing error';
            throw new Error(`vLLM processing failed: ${errorMessage}`);
          }

          console.log(`✅ vLLM fallback successful with ${vllmExtractionData.backend_used}`);
          console.log(`🏪 Vendor: ${vllmExtractionData.document_summary?.vendor_name || vllmExtractionData.vendor_name}`);
          console.log(`💰 Amount: ${vllmExtractionData.document_summary?.total_amount || vllmExtractionData.total_amount}`);

          // Business categorization for vLLM result
          const businessId = docRecord.business_id;
          if (!businessId) {
            throw new Error('Unable to determine business ID for categorization');
          }
          
          const businessCategories = await fetchEnabledCategoriesFromDB(businessId);
          const enhancedCategory = categorizeExpenseWithDynamicCategories(vllmExtractionData, businessCategories);
          
          console.log(`🏷️ vLLM Category: ${enhancedCategory.category} (${(enhancedCategory.confidence * 100).toFixed(1)}%)`);

          // Store vLLM DSPy structure directly (simplified approach)
          console.log(`🔍 Storing vLLM DSPy structure directly, no transformation needed`);

          // Add enhanced category to the vLLM DSPy result for business logic
          const finalVllmDspyResult = {
            ...vllmExtractionData,
            // Add business categorization directly to DSPy structure
            suggested_category: enhancedCategory.category,
            category_confidence: enhancedCategory.confidence,
            category_reasoning: enhancedCategory.reasoning,
            // Keep processing metadata in the main structure
            processing_method: vllmExtractionData.backend_used || 'vllm_fallback'
          };

          // Update database with vLLM raw DSPy structure
          const { error: vllmUpdateError } = await supabase.from('documents').update({
            processing_status: 'completed',
            extracted_data: finalVllmDspyResult, // Store raw DSPy structure directly
            confidence_score: vllmExtractionData.confidence_score,
            processed_at: new Date().toISOString(),
            error_message: null,
            processing_metadata: {
              backend_used: vllmExtractionData.backend_used,
              requires_validation: vllmExtractionData.requires_validation,
              category_suggestion: {
                enhanced: enhancedCategory.category,
                confidence: enhancedCategory.confidence
              },
              fallback_reason: 'Primary DSPy processing failed',
              primary_error: dspyError instanceof Error ? dspyError.message : 'Primary processing failed'
            }
          }).eq('id', payload.documentId);

          if (vllmUpdateError) {
            throw new Error(`Failed to update document with vLLM results: ${vllmUpdateError.message}`);
          }

          console.log(`✅ Document ${payload.documentId} processed successfully with vLLM fallback`);
          
          return { 
            success: true, 
            documentId: payload.documentId, 
            confidence: vllmExtractionData.confidence_score,
            category: enhancedCategory.category,
            requiresValidation: vllmExtractionData.requires_validation,
            backend: vllmExtractionData.backend_used,
            method: 'vllm_fallback'
          };

        } catch (fallbackError) {
          console.error("❌ vLLM fallback also failed:", fallbackError);
          
          // Both DSPy and vLLM failed - mark as failed
          await supabase.from('documents').update({
            processing_status: 'failed',
            error_message: `Primary DSPy processing failed: ${dspyError instanceof Error ? dspyError.message : 'Unknown error'}. vLLM fallback failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
            processed_at: new Date().toISOString(),
            processing_method: 'both_methods_failed'
          }).eq('id', payload.documentId);
          
          throw new Error(`Both primary and vLLM processing failed. Primary: ${dspyError}. vLLM: ${fallbackError}`);
        }
      } else {
        console.warn("⚠️ No OCR_ENDPOINT_URL configured for vLLM fallback");
        
        // No fallback available - mark as failed
        await supabase.from('documents').update({
          processing_status: 'failed',
          error_message: `DSPy processing failed: ${dspyError instanceof Error ? dspyError.message : 'Processing failed'}. No vLLM fallback configured.`,
          processed_at: new Date().toISOString(),
          processing_method: 'dspy_only_failed'
        }).eq('id', payload.documentId);
        
        throw dspyError;
      }
    }
  },
});