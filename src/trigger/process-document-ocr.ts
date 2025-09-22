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
import { IFRS_CATEGORIES_FOR_DSPY } from '@/lib/constants/ifrs-categories';

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


export const processDocumentOCR = task({
  id: "process-document-ocr",
  run: async (payload: { documentId: string; imageStoragePath: string; expenseCategory?: string }) => {
    console.log(`🚀 Starting DSPy Document OCR extraction`);
    console.log(`📄 Document ID: ${payload.documentId}`);
    console.log(`🖼️ Image storage path: ${payload.imageStoragePath}`);
    console.log(`🏷️ Expense category: ${payload.expenseCategory || 'Not provided'}`);

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

      // Step 3: Prepare IFRS categories for DSPy AI-powered categorization
      console.log(`📊 Preparing IFRS accounting categories for AI-powered categorization...`);
      const ifrsCategories = IFRS_CATEGORIES_FOR_DSPY;
      console.log(`📋 Prepared ${ifrsCategories.length} IFRS accounting categories for DSPy processing`);

      // Step 4: Process with DSPy Common Services (with AI-powered IFRS categorization)
      console.log(`🐍 Starting DSPy processing with AI-powered IFRS categorization...`);
      const dspyResult = await python.runInline(`
# =============================================================================
# DSPy PROCESSING WITH AI-POWERED IFRS CATEGORIZATION
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
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# IFRS Category Selection Models for AI-powered categorization
class IFRSCategorySelection(BaseModel):
    selected_category: str = Field(..., description="Selected IFRS category code from available options")
    selection_confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in category selection")
    selection_reasoning: str = Field(..., description="Detailed reasoning for category selection")

# Enhanced Document Processing with IFRS Category Selection
class DocumentProcessingWithIFRSSignature(dspy.Signature):
    \"\"\"Process document and intelligently select IFRS accounting category\"\"\"
    document_image: dspy.Image = dspy.InputField(desc="Document image for multimodal analysis")
    available_ifrs_categories: str = dspy.InputField(desc="JSON list of available IFRS accounting categories")

    # Core extraction fields
    vendor_name: str = dspy.OutputField(desc="Vendor/merchant name")
    total_amount: float = dspy.OutputField(desc="Total amount")
    currency: str = dspy.OutputField(desc="Currency code (ISO 4217)")
    transaction_date: str = dspy.OutputField(desc="Transaction date (YYYY-MM-DD)")
    document_number: str = dspy.OutputField(desc="Invoice/receipt number")

    # AI-powered IFRS category selection
    ifrs_category_selection: IFRSCategorySelection = dspy.OutputField(desc="AI-selected IFRS category with confidence and reasoning")

    # Quality metrics
    extraction_confidence: float = dspy.OutputField(desc="Overall extraction confidence (0.0-1.0)")
    requires_validation: bool = dspy.OutputField(desc="Whether manual validation is needed")

# DSPy Processor with AI-powered IFRS Categorization
class AIIFRSDocumentProcessor(dspy.Module):
    def __init__(self):
        super().__init__()
        self.processor = dspy.ChainOfThought(DocumentProcessingWithIFRSSignature)

    def forward(self, document_image, ifrs_categories_json):
        try:
            prediction = self.processor(
                document_image=document_image,
                available_ifrs_categories=ifrs_categories_json
            )

            # Build structured result with AI-powered IFRS categorization
            result = {
                "success": True,
                "vendor_name": prediction.vendor_name,
                "total_amount": prediction.total_amount,
                "currency": prediction.currency,
                "transaction_date": prediction.transaction_date,
                "document_number": prediction.document_number,

                # AI-powered IFRS category selection
                "suggested_category": prediction.ifrs_category_selection.selected_category,
                "category_confidence": prediction.ifrs_category_selection.selection_confidence,
                "category_reasoning": prediction.ifrs_category_selection.selection_reasoning,

                # Quality metrics
                "confidence_score": prediction.extraction_confidence,
                "requires_validation": prediction.requires_validation,
                "backend_used": "ai_ifrs_categorization"
            }

            print(f"✅ AI IFRS processing completed: {result['vendor_name']}, {result['total_amount']} {result['currency']}", file=sys.stderr)
            print(f"🎯 AI-selected IFRS category: {result['suggested_category']} ({result['category_confidence']:.3f})", file=sys.stderr)
            print(f"🤖 AI reasoning: {result['category_reasoning']}", file=sys.stderr)

            return result

        except Exception as e:
            print(f"❌ AI IFRS processing failed: {str(e)}", file=sys.stderr)
            return {
                "success": False,
                "error": str(e),
                "backend_used": "ai_ifrs_failed"
            }

def process_document_with_ai_ifrs(document_image, lm_client, ifrs_categories):
    \"\"\"Process document with AI-powered IFRS category selection\"\"\"

    # Configure DSPy with the provided LM
    dspy.settings.configure(lm=lm_client, adapter=dspy.JSONAdapter())

    # Format IFRS categories as JSON for AI processing
    ifrs_json = json.dumps(ifrs_categories)
    print(f"📋 Using IFRS categories for AI: {ifrs_json}", file=sys.stderr)

    # Initialize and run AI-powered processor
    processor = AIIFRSDocumentProcessor()
    return processor.forward(document_image, ifrs_json)

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
        
        # Run both Gemini and vLLM for comparison with AI-powered IFRS categorization
        gemini_result = None
        vllm_result = None

        # IFRS categories for AI-powered processing (from shared constants)
        ifrs_categories = ${JSON.stringify(ifrsCategories)}
        print(f"📋 Using {len(ifrs_categories)} IFRS categories for AI categorization", file=sys.stderr)

        # Try Gemini first with AI IFRS categorization - capture all errors in return value
        gemini_error_details = None
        try:
            print("🔧 Running Gemini processing with AI-powered IFRS categorization...", file=sys.stderr)

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

            print(f"🤖 Calling process_document_with_ai_ifrs for Gemini...", file=sys.stderr)
            gemini_result = process_document_with_ai_ifrs(
                document_image=document_image_pil,
                lm_client=gemini_lm,
                ifrs_categories=ifrs_categories
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
                print("🔧 Running vLLM processing with AI-powered IFRS categorization...", file=sys.stderr)

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

                print(f"🤖 Calling process_document_with_ai_ifrs for vLLM...", file=sys.stderr)
                vllm_result = process_document_with_ai_ifrs(
                    document_image=document_image_pil,
                    lm_client=skywork_lm,
                    ifrs_categories=ifrs_categories
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

      // Step 5: AI-powered IFRS categorization (already completed by DSPy)
      console.log(`🤖 AI-powered IFRS categorization completed by DSPy`);
      console.log(`🎯 AI-selected IFRS category: ${finalExtractionData.suggested_category}`);
      console.log(`📊 AI confidence: ${(finalExtractionData.category_confidence * 100).toFixed(1)}%`);
      console.log(`🧠 AI reasoning: ${finalExtractionData.category_reasoning}`);

      // Step 6: Prepare final DSPy result with AI-powered IFRS categorization
      console.log(`🔄 Preparing final DSPy result with AI IFRS categorization`);

      // Store raw DSPy output directly (already contains AI-powered IFRS categorization)
      const finalDspyResult = {
        ...finalExtractionData, // All raw DSPy fields including AI-selected IFRS category
        processing_method: finalExtractionData.backend_used || 'ai_ifrs_categorization'
      };

      // Step 7: Update database with raw DSPy structure
      console.log(`💾 Updating database with extraction results...`);
      const { error: updateError } = await supabase.from('documents').update({
        processing_status: 'completed',
        extracted_data: finalDspyResult, // Store raw DSPy structure directly
        confidence_score: finalExtractionData.confidence_score,
        processed_at: new Date().toISOString(),
        error_message: null,
        processing_metadata: {
          backend_used: finalExtractionData.backend_used,
          requires_validation: finalExtractionData.requires_validation,
          ai_ifrs_categorization: {
            selected_category: finalExtractionData.suggested_category,
            confidence: finalExtractionData.category_confidence,
            reasoning: finalExtractionData.category_reasoning,
            processing_type: 'ai_powered_ifrs'
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
        suggested_category: finalExtractionData.suggested_category,
        category_confidence: finalExtractionData.category_confidence,
        category_reasoning: finalExtractionData.category_reasoning,
        requiresValidation: finalExtractionData.requires_validation,
        backend: finalExtractionData.backend_used,
        processing_type: 'ai_powered_ifrs'
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
    print("🚀 vLLM Fallback DSPy Processing with AI IFRS Categorization", file=sys.stderr)
    
    try:
        # Prepare image data
        document_image_data = ${JSON.stringify(vllmImageData)}
        
        # Convert to PIL Image
        image_bytes = base64.b64decode(document_image_data['base64'])
        document_image_pil = Image.open(io.BytesIO(image_bytes))
        
        print(f"🖼️ vLLM Image ready: {document_image_pil.size}", file=sys.stderr)

        # IFRS categories for AI-powered processing
        ifrs_categories = ${JSON.stringify(IFRS_CATEGORIES_FOR_DSPY)}
        print(f"📋 vLLM using {len(ifrs_categories)} IFRS categories for AI categorization", file=sys.stderr)

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
        
        result = process_document_with_ai_ifrs(
            document_image=document_image_pil,
            lm_client=skywork_lm,
            ifrs_categories=ifrs_categories
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

          // AI-powered IFRS categorization (already completed by vLLM DSPy)
          console.log(`🤖 AI-powered IFRS categorization completed by vLLM DSPy`);
          console.log(`🎯 vLLM AI-selected IFRS category: ${vllmExtractionData.suggested_category}`);
          console.log(`📊 vLLM AI confidence: ${(vllmExtractionData.category_confidence * 100).toFixed(1)}%`);
          console.log(`🧠 vLLM AI reasoning: ${vllmExtractionData.category_reasoning}`);

          // Prepare final vLLM DSPy result with AI-powered IFRS categorization
          console.log(`🔄 Preparing final vLLM DSPy result with AI IFRS categorization`);

          // Store raw vLLM DSPy output directly (already contains AI-powered IFRS categorization)
          const finalVllmDspyResult = {
            ...vllmExtractionData, // All raw DSPy fields including AI-selected IFRS category
            processing_method: vllmExtractionData.backend_used || 'vllm_ai_ifrs_fallback'
          };

          // Update database with vLLM raw DSPy structure
          console.log(`💾 Updating database with vLLM fallback results...`);
          const { error: vllmUpdateError } = await supabase.from('documents').update({
            processing_status: 'completed',
            extracted_data: finalVllmDspyResult, // Store raw DSPy structure directly
            confidence_score: vllmExtractionData.confidence_score,
            processed_at: new Date().toISOString(),
            error_message: null,
            processing_metadata: {
              backend_used: vllmExtractionData.backend_used,
              requires_validation: vllmExtractionData.requires_validation,
              ai_ifrs_categorization: {
                selected_category: vllmExtractionData.suggested_category,
                confidence: vllmExtractionData.category_confidence,
                reasoning: vllmExtractionData.category_reasoning,
                processing_type: 'vllm_ai_ifrs_fallback'
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
            suggested_category: vllmExtractionData.suggested_category,
            category_confidence: vllmExtractionData.category_confidence,
            category_reasoning: vllmExtractionData.category_reasoning,
            requiresValidation: vllmExtractionData.requires_validation,
            backend: vllmExtractionData.backend_used,
            processing_type: 'vllm_ai_ifrs_fallback'
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