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
import {
  mapExpenseCategoryToAccounting,
  ACCOUNTING_CATEGORIES
} from '@/lib/expense-category-mapper';
import { IFRS_CATEGORIES_FOR_DSPY, IFRS_CATEGORIES } from '@/lib/constants/ifrs-categories';

// Note: DSPy processing function defined directly in Python inline code below

// Initialize Supabase client with service role key for background processing
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ✅ PHASE 4C: Domain-to-table mapping for multi-domain architecture
const DOMAIN_TABLE_MAP = {
  'invoices': 'invoices',
  'expense_claims': 'expense_claims',
  'applications': 'application_documents'
} as const;

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

// IFRS accounting category auto-categorization using pattern matching (fallback only)
function categorizeWithIFRSAccountingCategories(
  extractionData: any
): { category_code: string; category_name: string; confidence: number; reasoning: string } {
  // Extract text data for pattern matching
  const vendorName = extractionData.vendor_name || extractionData.document_summary?.vendor_name || '';
  const documentType = extractionData.document_type || extractionData.document_summary?.document_type || '';
  const industryContext = extractionData.industry_context || extractionData.document_summary?.industry_context || '';
  const description = extractionData.description || '';

  // Combine text for pattern matching
  const text = `${vendorName} ${documentType} ${industryContext} ${description}`.toLowerCase();

  // IFRS category patterns based on Otto's IFRS recommendations
  const ifrsPatterns = [
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

  let bestMatch = {
    category_code: 'administrative_expenses',
    category_name: 'Administrative Expenses',
    confidence: 0.1,
    reasoning: 'No clear pattern match - defaulted to administrative expenses'
  };

  // Check each IFRS pattern
  for (const pattern of ifrsPatterns) {
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


export const processDocumentOCR = task({
  id: "process-document-ocr",
  run: async (payload: { documentId: string; imageStoragePath?: string; expenseCategory?: string; documentDomain: 'invoices' | 'expense_claims' | 'applications' }) => {  // ✅ PHASE 4C: Add domain parameter
    // ✅ PHASE 4C: Route to correct table based on domain
    const tableName = DOMAIN_TABLE_MAP[payload.documentDomain];

    console.log(`🚀 Starting DSPy Document OCR extraction`);
    console.log(`📄 Document ID: ${payload.documentId}`);
    console.log(`📊 Table: ${tableName} (domain: ${payload.documentDomain})`);
    console.log(`🖼️ Image storage path: ${payload.imageStoragePath || 'Will fetch from document record'}`);
    console.log(`🏷️ Expense category: ${payload.expenseCategory || 'Not provided'}`);

    // Declare variables at function scope for catch block access
    let processedImageBase64: string = '';
    let processedMimeType: string = '';
    let docRecord: any = null;
    let imageStoragePath: string;

    try {
      // Step 1: Fetch document record and determine image path
      const { data: fetchedDocRecord, error: fetchError } = await supabase
        .from(tableName)  // ✅ PHASE 4C: Routed based on domain
        .select('file_name, file_type, file_size, user_id, business_id, storage_path, converted_image_path')
        .eq('id', payload.documentId)
        .single();

      if (fetchError || !fetchedDocRecord) {
        throw new Error(`Failed to fetch document record: ${fetchError?.message}`);
      }

      // Assign to function-scoped variable
      docRecord = fetchedDocRecord;

      // Determine image storage path: use provided path or fall back to document.storage_path
      imageStoragePath = payload.imageStoragePath || docRecord.storage_path;

      if (!imageStoragePath) {
        throw new Error('No storage path available - neither provided in payload nor found in document record');
      }

      console.log(`📄 Processing: ${docRecord.file_name} (${docRecord.file_type}, ${Math.round(docRecord.file_size / 1024)}KB)`);
      console.log(`🖼️ Using image storage path: ${imageStoragePath}`);

      // Step 2: GRACEFUL PATH HANDLING: Different approaches for images vs converted PDFs
      console.log(`[ProcessDocumentOCR] Document type: ${docRecord.file_type}, has converted path: ${!!docRecord.converted_image_path}`);

      let processImagePath: string;
      let pageUrls = [];

      if (docRecord.converted_image_path) {
        // PDF CASE: converted_image_path is a folder containing multiple images
        console.log(`[ProcessDocumentOCR] PDF workflow - using converted image folder: ${docRecord.converted_image_path}`);

        const { data: fileList, error: listError } = await supabase.storage
          .from(tableName)  // ✅ PHASE 4C: Routed based on domain
          .list(docRecord.converted_image_path, {
            limit: 100,
            sortBy: { column: 'name', order: 'asc' }
          });

        if (listError) {
          throw new Error(`Failed to list converted images: ${listError.message}`);
        }

        if (!fileList || fileList.length === 0) {
          throw new Error(`No converted images found in folder: ${docRecord.converted_image_path}`);
        }

        console.log(`[ProcessDocumentOCR] Found ${fileList.length} converted image(s) for processing`);

        // Create signed URLs for ALL discovered files (multi-page PDF processing)
        for (const file of fileList) {
          const filePath = `${docRecord.converted_image_path}/${file.name}`;
          console.log(`[ProcessDocumentOCR] Creating signed URL for file: ${filePath}`);

          const { data: urlData, error: urlError } = await supabase.storage
            .from(tableName)  // ✅ PHASE 4C: Routed based on domain
            .createSignedUrl(filePath, 600);

          if (urlError || !urlData) {
            throw new Error(`Failed to create signed URL for ${filePath}: ${urlError?.message}`);
          }

          pageUrls.push({
            url: urlData.signedUrl,
            filename: file.name,
            path: filePath
          });
        }

      } else {
        // IMAGE CASE: storage_path is the direct file path
        console.log(`[ProcessDocumentOCR] Image workflow - using direct file path: ${imageStoragePath}`);
        processImagePath = imageStoragePath;

        // Create signed URL for the single image file
        console.log(`[ProcessDocumentOCR] Creating signed URL for single image: ${processImagePath}`);

        const { data: urlData, error: urlError } = await supabase.storage
          .from(tableName)  // ✅ PHASE 4C: Routed based on domain
          .createSignedUrl(processImagePath, 600);

        if (urlError || !urlData) {
          throw new Error(`Failed to create signed URL for ${processImagePath}: ${urlError?.message}`);
        }

        // Extract filename from path for consistency
        const filename = processImagePath.split('/').pop() || 'image';
        pageUrls.push({
          url: urlData.signedUrl,
          filename: filename,
          path: processImagePath
        });
      }

      console.log(`[ProcessDocumentOCR] Created ${pageUrls.length} signed URLs for processing`);

      // For single page processing, use the first file (maintain backwards compatibility)
      // TODO: Future enhancement could process all pages and combine results
      const firstPageUrl = pageUrls[0];
      console.log(`📥 Downloading first image for processing: ${firstPageUrl.filename}`);

      const imageResponse = await fetch(firstPageUrl.url);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      processedImageBase64 = Buffer.from(imageBuffer).toString('base64');
      processedMimeType = firstPageUrl.filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

      console.log(`🖼️ Image prepared: ${Math.round(imageBuffer.byteLength / 1024)}KB`);

      // Step 3: Process with DSPy Common Services
      console.log(`🐍 Starting DSPy processing with Python runtime...`);
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

# Define the missing DSPy processing function for IFRS categorization
def process_document_with_ifrs_dspy(document_image, lm_client, ifrs_categories):
    \"\"\"Document processing with proper DSPy signature matching receipt extraction pattern\"\"\"
    try:
        # Configure DSPy with the provided LM
        dspy.settings.configure(lm=lm_client, adapter=dspy.JSONAdapter())

        # Define structured Pydantic model for extraction (matching receipt extraction pattern)
        from pydantic import BaseModel, Field

        # Comprehensive line item model
        class DocumentLineItem(BaseModel):
            description: str = Field(..., description="Item description/name")
            item_code: Optional[str] = Field(None, description="Item code, HSN code, SKU, or product identifier")
            quantity: Optional[float] = Field(None, description="Quantity purchased")
            unit_measurement: Optional[str] = Field(None, description="Unit of measurement as shown in invoice (e.g., PC, PCE, PCS, SET, KG, L, M, etc.). Extract the exact abbreviation from the document.")
            unit_price: Optional[float] = Field(None, description="Price per unit")
            line_total: float = Field(..., description="Total amount for this line item")

        class DocumentData(BaseModel):
            # Core transaction fields
            vendor_name: str = Field(..., description="The name of the merchant or store")
            transaction_date: str = Field(..., description="Transaction date in YYYY-MM-DD format")
            total_amount: float = Field(..., description="Final total amount")
            currency: str = Field(..., description="Currency code in ISO 4217 format")

            # Document identification
            document_number: Optional[str] = Field(None, description="Invoice or receipt number")

            # Detailed vendor information
            vendor_address: Optional[str] = Field(None, description="Complete vendor address")
            vendor_contact: Optional[str] = Field(None, description="Vendor phone, email or contact information")
            vendor_tax_id: Optional[str] = Field(None, description="Vendor tax ID, registration number, or GSTIN")

            # Customer information
            customer_name: Optional[str] = Field(None, description="Customer or buyer name")
            customer_address: Optional[str] = Field(None, description="Customer address")
            customer_contact: Optional[str] = Field(None, description="Customer contact information")

            # Financial breakdown
            subtotal_amount: Optional[float] = Field(None, description="Subtotal before tax and discounts")
            tax_amount: Optional[float] = Field(None, description="Total tax amount")
            discount_amount: Optional[float] = Field(None, description="Total discount amount")

            # Payment information
            payment_terms: Optional[str] = Field(None, description="Payment terms or due date")
            payment_method: Optional[str] = Field(None, description="Payment method")
            bank_details: Optional[str] = Field(None, description="Bank account details, routing numbers, or payment instructions")

            # Line items
            line_items: List[DocumentLineItem] = Field(default_factory=list, description="Individual items or services")

            # Quality and confidence
            extraction_confidence: float = Field(..., ge=0.0, le=1.0, description="Overall extraction confidence from 0.0 to 1.0")
            missing_fields: List[str] = Field(default_factory=list, description="Fields that couldn't be extracted")

        # Create proper signature using structured output (like receipt extraction)
        class DocumentExtractionSignature(dspy.Signature):
            \"\"\"Extract comprehensive structured data from document image including all vendor details, customer information, line items, and financial breakdowns\"\"\"
            document_image: dspy.Image = dspy.InputField(desc="Document image for multimodal analysis")
            extracted_data: DocumentData = dspy.OutputField(desc="Complete structured document data with all available fields. IMPORTANT: Extract vendor address, contact info, customer details, line items with item codes/HSN codes, quantities, unit measurements (PC, PCE, PCS, SET, KG, L, M, etc.), and prices, subtotal, tax amounts, and payment information. For unit measurements: extract the EXACT abbreviation shown in the invoice table (PC for pieces, PCE for piece, PCS for pieces, SET for set, KG for kilogram, L for liter, M for meter, etc.). For currency: analyze vendor location, address, currency symbols, and context to determine the correct ISO 4217 currency code (e.g., INR for India, USD for US, SGD for Singapore, MYR for Malaysia, etc.). If any field cannot be found, add it to missing_fields list.")

        # Use ChainOfThought processor (same as receipt extraction)
        processor = dspy.ChainOfThought(DocumentExtractionSignature)

        print(f"🔧 Processing document with DSPy using {type(lm_client).__name__}", file=sys.stderr)

        # Process the document
        prediction = processor(document_image=document_image)

        # Extract the structured data
        extracted = prediction.extracted_data

        # Build result using direct DSPy output (like receipt extraction)
        result = {
            "success": True,
            # Direct DSPy output - primary structure
            "vendor_name": extracted.vendor_name,
            "total_amount": extracted.total_amount,
            "currency": extracted.currency,
            "transaction_date": extracted.transaction_date,
            "document_number": extracted.document_number or "",
            "confidence_score": extracted.extraction_confidence,
            "requires_validation": extracted.extraction_confidence < 0.8,
            "backend_used": "structured_dspy",

            # Comprehensive fields from DSPy - direct output
            "vendor_address": extracted.vendor_address or "",
            "vendor_contact": extracted.vendor_contact or "",
            "vendor_tax_id": extracted.vendor_tax_id or "",
            "customer_name": extracted.customer_name or "",
            "customer_address": extracted.customer_address or "",
            "customer_contact": extracted.customer_contact or "",
            "subtotal_amount": extracted.subtotal_amount or 0.0,
            "tax_amount": extracted.tax_amount or 0.0,
            "discount_amount": extracted.discount_amount or 0.0,
            "payment_terms": extracted.payment_terms or "",
            "payment_method": extracted.payment_method or "",
            "bank_details": extracted.bank_details or "",

            # Line items - direct DSPy output
            "line_items": [
                {
                    "description": item.description,
                    "item_code": item.item_code,
                    "quantity": item.quantity,
                    "unit_measurement": item.unit_measurement,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total
                }
                for item in extracted.line_items
            ],

            # Quality tracking
            "missing_fields": extracted.missing_fields
        }

        print(f"✅ Structured DSPy processing completed: {result['vendor_name']}, {result['total_amount']} {result['currency']}", file=sys.stderr)
        return result

    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"❌ Structured DSPy processing failed: {str(e)}", file=sys.stderr)
        print(f"❌ Full traceback: {error_traceback}", file=sys.stderr)
        return {
            "success": False,
            "error": str(e),
            "backend_used": "structured_dspy_failed",
            "traceback": error_traceback
        }

# Define IFRS categories for DSPy processing
ifrs_categories = ${JSON.stringify(IFRS_CATEGORIES_FOR_DSPY)}

def main():
    print("🚀 Clean DSPy Processing with Common Services", file=sys.stderr)

    import traceback  # Import here for exception handling

    try:
        # Prepare image data
        document_image_data = ${JSON.stringify({
          base64: processedImageBase64,
          mimeType: processedMimeType,
          filename: docRecord.file_name
        })}

        # Convert to PIL Image and then to dspy.Image (CRITICAL for multimodal processing)
        image_bytes = base64.b64decode(document_image_data['base64'])
        document_image_pil = Image.open(io.BytesIO(image_bytes))
        document_image = dspy.Image.from_PIL(document_image_pil)  # CRITICAL: Convert to dspy.Image

        print(f"🖼️ Image ready: {document_image_pil.size}, converted to dspy.Image", file=sys.stderr)
        # Run both Gemini and vLLM for comparison
        gemini_result = None
        vllm_result = None

        # Try Gemini first - capture all errors in return value
        gemini_error_details = None
        try:
            print("🔧 Running Gemini processing with IFRS categorization...", file=sys.stderr)

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

            print(f"🤖 Calling process_document_with_ifrs_dspy for Gemini...", file=sys.stderr)
            gemini_result = process_document_with_ifrs_dspy(
                document_image=document_image,  # Use dspy.Image object instead of PIL
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
                        vendor_name = document_summary.get('vendor_name', {}).get('value', 'N/A') if isinstance(document_summary.get('vendor_name'), dict) else document_summary.get('vendor_name', 'N/A')
                        doc_number = document_summary.get('document_number', {}).get('value', 'N/A') if isinstance(document_summary.get('document_number'), dict) else document_summary.get('document_number', 'N/A')
                        vendor_address = document_summary.get('vendor_address', {}).get('value', 'N/A') if isinstance(document_summary.get('vendor_address'), dict) else document_summary.get('vendor_address', 'N/A')
                    else:
                        # Fallback to flat structure
                        vendor_name = gemini_result.get('vendor_name', 'N/A')
                        doc_number = gemini_result.get('document_number', 'N/A')
                        vendor_address = gemini_result.get('vendor_address', 'N/A')
                    # Safely handle string slicing
                    address_display = str(vendor_address)[:50] + ('...' if len(str(vendor_address)) > 50 else '') if vendor_address else 'N/A'
                    print(f"✅ Gemini extraction: vendor={vendor_name}, doc_num={doc_number}, address={address_display}", file=sys.stderr)
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
                print("🔧 Running vLLM processing with IFRS categories...", file=sys.stderr)

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

                print(f"🤖 Calling process_document_with_ifrs_dspy for vLLM...", file=sys.stderr)
                vllm_result = process_document_with_ifrs_dspy(
                    document_image=document_image,  # Use dspy.Image object instead of PIL
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
                            vendor_name = document_summary.get('vendor_name', {}).get('value', 'N/A') if isinstance(document_summary.get('vendor_name'), dict) else document_summary.get('vendor_name', 'N/A')
                            doc_number = document_summary.get('document_number', {}).get('value', 'N/A') if isinstance(document_summary.get('document_number'), dict) else document_summary.get('document_number', 'N/A')
                            vendor_address = document_summary.get('vendor_address', {}).get('value', 'N/A') if isinstance(document_summary.get('vendor_address'), dict) else document_summary.get('vendor_address', 'N/A')
                        else:
                            # Fallback to flat structure
                            vendor_name = vllm_result.get('vendor_name', 'N/A')
                            doc_number = vllm_result.get('document_number', 'N/A')
                            vendor_address = vllm_result.get('vendor_address', 'N/A')
                        # Safely handle string slicing
                        address_display = str(vendor_address)[:50] + ('...' if len(str(vendor_address)) > 50 else '') if vendor_address else 'N/A'
                        print(f"✅ vLLM extraction: vendor={vendor_name}, doc_num={doc_number}, address={address_display}", file=sys.stderr)
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

            # Check key field completeness (safe string handling)
            vendor_name = doc_summary.get('vendor_name', {}).get('value', '')
            if isinstance(vendor_name, str) and vendor_name.strip():
                score += 2

            doc_number = doc_summary.get('document_number', {}).get('value', '')
            if isinstance(doc_number, str) and doc_number.strip():
                score += 3  # Document number is critical

            vendor_address = doc_summary.get('vendor_address', {}).get('value', '')
            if isinstance(vendor_address, str) and vendor_address.strip():
                score += 2  # Address is important

            vendor_contact = doc_summary.get('vendor_contact', {}).get('value', '')
            if isinstance(vendor_contact, str) and vendor_contact.strip():
                score += 2  # Contact info is important

            total_amount = doc_summary.get('total_amount', {}).get('value', 0)
            if isinstance(total_amount, (int, float)) and total_amount > 0:
                score += 1
            elif isinstance(total_amount, str) and total_amount.strip():
                try:
                    if float(total_amount) > 0:
                        score += 1
                except ValueError:
                    pass

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

      // Step 5: IFRS categorization for transactions table (standardized categories only)
      console.log(`📊 Performing IFRS categorization for transactions table...`);

      // Use IFRS categories for DSPy-based categorization (NOT business categories)
      const selectedCategory = categorizeWithIFRSAccountingCategories(finalExtractionData);
      console.log(`📊 IFRS Category: ${selectedCategory.category_code} -> ${selectedCategory.category_name} (${(selectedCategory.confidence * 100).toFixed(1)}%)`);
      console.log(`📊 Reasoning: ${selectedCategory.reasoning}`);

      // Step 6: Prepare final DSPy result with standard IFRS categorization only
      console.log(`🔄 Preparing final DSPy result with standard IFRS categorization`);

      // Calculate due date from transaction date + payment terms
      let calculatedDueDate = null;
      if (finalExtractionData.transaction_date && finalExtractionData.payment_terms) {
        try {
          const transactionDate = new Date(finalExtractionData.transaction_date);
          const paymentTerms = finalExtractionData.payment_terms.toLowerCase();

          // Extract days from payment terms (e.g., "30 DAYS", "NET 30", "15 days")
          const dayMatches = paymentTerms.match(/(\d+)\s*(days?|day)/i);
          if (dayMatches && !isNaN(transactionDate.getTime())) {
            const daysToAdd = parseInt(dayMatches[1]);
            const dueDate = new Date(transactionDate);
            dueDate.setDate(dueDate.getDate() + daysToAdd);
            calculatedDueDate = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD format
            console.log(`📅 Calculated due date: ${calculatedDueDate} (${daysToAdd} days from ${finalExtractionData.transaction_date})`);
          }
        } catch (error) {
          console.log(`⚠️ Could not calculate due date: ${error}`);
        }
      }

      // Store raw DSPy output directly with standard IFRS categorization only
      const finalDspyResult = {
        ...finalExtractionData, // All raw DSPy fields (vendor_name, total_amount, currency, etc.)
        // Add calculated due date
        due_date: calculatedDueDate,
        // Add standard IFRS accounting categorization (Documents page - accounting purpose)
        suggested_category: selectedCategory.category_code,
        accounting_category: selectedCategory.category_name,
        category_confidence: selectedCategory.confidence,
        category_reasoning: selectedCategory.reasoning,
        processing_method: finalExtractionData.backend_used || 'dspy_processing'
      };

      // Step 7: Update database with raw DSPy structure
      console.log(`💾 Updating database with extraction results...`);
      const { error: updateError } = await supabase
        .from(tableName)  // ✅ PHASE 4C: Routed based on domain
        .update({
          processing_status: 'completed',
        extracted_data: finalDspyResult, // Store raw DSPy structure directly
        confidence_score: finalExtractionData.confidence_score,
        processed_at: new Date().toISOString(),
        error_message: null,
        processing_metadata: {
          backend_used: finalExtractionData.backend_used,
          requires_validation: finalExtractionData.requires_validation,
          category_suggestion: {
            ifrs_accounting: {
              category: selectedCategory.category_code,
              accounting_category: selectedCategory.category_name,
              confidence: selectedCategory.confidence,
              reasoning: selectedCategory.reasoning
            }
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
        suggested_category: selectedCategory.category_code,
        accounting_category: selectedCategory.category_name,
        requiresValidation: finalExtractionData.requires_validation,
        backend: finalExtractionData.backend_used,
        processing_type: 'ifrs_categorization'
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

# Define the missing DSPy processing function for IFRS categorization
def process_document_with_ifrs_dspy(document_image, lm_client, ifrs_categories):
    \"\"\"Document processing with proper DSPy signature matching receipt extraction pattern\"\"\"
    try:
        # Configure DSPy with the provided LM
        dspy.settings.configure(lm=lm_client, adapter=dspy.JSONAdapter())

        # Define structured Pydantic model for extraction (matching receipt extraction pattern)
        from pydantic import BaseModel, Field

        # Comprehensive line item model
        class DocumentLineItem(BaseModel):
            description: str = Field(..., description="Item description/name")
            item_code: Optional[str] = Field(None, description="Item code, HSN code, SKU, or product identifier")
            quantity: Optional[float] = Field(None, description="Quantity purchased")
            unit_measurement: Optional[str] = Field(None, description="Unit of measurement as shown in invoice (e.g., PC, PCE, PCS, SET, KG, L, M, etc.). Extract the exact abbreviation from the document.")
            unit_price: Optional[float] = Field(None, description="Price per unit")
            line_total: float = Field(..., description="Total amount for this line item")

        class DocumentData(BaseModel):
            # Core transaction fields
            vendor_name: str = Field(..., description="The name of the merchant or store")
            transaction_date: str = Field(..., description="Transaction date in YYYY-MM-DD format")
            total_amount: float = Field(..., description="Final total amount")
            currency: str = Field(..., description="Currency code in ISO 4217 format")

            # Document identification
            document_number: Optional[str] = Field(None, description="Invoice or receipt number")

            # Detailed vendor information
            vendor_address: Optional[str] = Field(None, description="Complete vendor address")
            vendor_contact: Optional[str] = Field(None, description="Vendor phone, email or contact information")
            vendor_tax_id: Optional[str] = Field(None, description="Vendor tax ID, registration number, or GSTIN")

            # Customer information
            customer_name: Optional[str] = Field(None, description="Customer or buyer name")
            customer_address: Optional[str] = Field(None, description="Customer address")
            customer_contact: Optional[str] = Field(None, description="Customer contact information")

            # Financial breakdown
            subtotal_amount: Optional[float] = Field(None, description="Subtotal before tax and discounts")
            tax_amount: Optional[float] = Field(None, description="Total tax amount")
            discount_amount: Optional[float] = Field(None, description="Total discount amount")

            # Payment information
            payment_terms: Optional[str] = Field(None, description="Payment terms or due date")
            payment_method: Optional[str] = Field(None, description="Payment method")
            bank_details: Optional[str] = Field(None, description="Bank account details, routing numbers, or payment instructions")

            # Line items
            line_items: List[DocumentLineItem] = Field(default_factory=list, description="Individual items or services")

            # Quality and confidence
            extraction_confidence: float = Field(..., ge=0.0, le=1.0, description="Overall extraction confidence from 0.0 to 1.0")
            missing_fields: List[str] = Field(default_factory=list, description="Fields that couldn't be extracted")

        # Create proper signature using structured output (like receipt extraction)
        class DocumentExtractionSignature(dspy.Signature):
            \"\"\"Extract comprehensive structured data from document image including all vendor details, customer information, line items, and financial breakdowns\"\"\"
            document_image: dspy.Image = dspy.InputField(desc="Document image for multimodal analysis")
            extracted_data: DocumentData = dspy.OutputField(desc="Complete structured document data with all available fields. IMPORTANT: Extract vendor address, contact info, customer details, line items with item codes/HSN codes, quantities, unit measurements (PC, PCE, PCS, SET, KG, L, M, etc.), and prices, subtotal, tax amounts, and payment information. For unit measurements: extract the EXACT abbreviation shown in the invoice table (PC for pieces, PCE for piece, PCS for pieces, SET for set, KG for kilogram, L for liter, M for meter, etc.). For currency: analyze vendor location, address, currency symbols, and context to determine the correct ISO 4217 currency code (e.g., INR for India, USD for US, SGD for Singapore, MYR for Malaysia, etc.). If any field cannot be found, add it to missing_fields list.")

        # Use ChainOfThought processor (same as receipt extraction)
        processor = dspy.ChainOfThought(DocumentExtractionSignature)

        print(f"🔧 Processing document with DSPy using {type(lm_client).__name__}", file=sys.stderr)

        # Process the document
        prediction = processor(document_image=document_image)

        # Extract the structured data
        extracted = prediction.extracted_data

        # Build result using direct DSPy output (like receipt extraction)
        result = {
            "success": True,
            # Direct DSPy output - primary structure
            "vendor_name": extracted.vendor_name,
            "total_amount": extracted.total_amount,
            "currency": extracted.currency,
            "transaction_date": extracted.transaction_date,
            "document_number": extracted.document_number or "",
            "confidence_score": extracted.extraction_confidence,
            "requires_validation": extracted.extraction_confidence < 0.8,
            "backend_used": "structured_dspy",

            # Comprehensive fields from DSPy - direct output
            "vendor_address": extracted.vendor_address or "",
            "vendor_contact": extracted.vendor_contact or "",
            "vendor_tax_id": extracted.vendor_tax_id or "",
            "customer_name": extracted.customer_name or "",
            "customer_address": extracted.customer_address or "",
            "customer_contact": extracted.customer_contact or "",
            "subtotal_amount": extracted.subtotal_amount or 0.0,
            "tax_amount": extracted.tax_amount or 0.0,
            "discount_amount": extracted.discount_amount or 0.0,
            "payment_terms": extracted.payment_terms or "",
            "payment_method": extracted.payment_method or "",
            "bank_details": extracted.bank_details or "",

            # Line items - direct DSPy output
            "line_items": [
                {
                    "description": item.description,
                    "item_code": item.item_code,
                    "quantity": item.quantity,
                    "unit_measurement": item.unit_measurement,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total
                }
                for item in extracted.line_items
            ],

            # Quality tracking
            "missing_fields": extracted.missing_fields
        }

        print(f"✅ Structured DSPy processing completed: {result['vendor_name']}, {result['total_amount']} {result['currency']}", file=sys.stderr)
        return result

    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"❌ Structured DSPy processing failed: {str(e)}", file=sys.stderr)
        print(f"❌ Full traceback: {error_traceback}", file=sys.stderr)
        return {
            "success": False,
            "error": str(e),
            "backend_used": "structured_dspy_failed",
            "traceback": error_traceback
        }

# Define IFRS categories for DSPy processing
ifrs_categories = ${JSON.stringify(IFRS_CATEGORIES_FOR_DSPY)}

def main():
    print("🚀 vLLM Fallback DSPy Processing with AI IFRS Categorization", file=sys.stderr)
    
    try:
        # Prepare image data
        document_image_data = ${JSON.stringify(vllmImageData)}
        
        # Convert to PIL Image and then to dspy.Image (CRITICAL for multimodal processing)
        image_bytes = base64.b64decode(document_image_data['base64'])
        document_image_pil = Image.open(io.BytesIO(image_bytes))
        document_image = dspy.Image.from_PIL(document_image_pil)  # CRITICAL: Convert to dspy.Image

        print(f"🖼️ vLLM Image ready: {document_image_pil.size}, converted to dspy.Image", file=sys.stderr)

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
        
        result = process_document_with_ifrs_dspy(
            document_image=document_image,  # Use dspy.Image object instead of PIL
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

          // Standard IFRS accounting categorization for vLLM result (Documents page - accounting purpose only)
          console.log(`📊 Performing standard IFRS accounting categorization (vLLM fallback)...`);
          const selectedCategory = categorizeWithIFRSAccountingCategories(vllmExtractionData);

          console.log(`📊 vLLM IFRS Accounting Category: ${selectedCategory.category_code} -> ${selectedCategory.category_name} (${(selectedCategory.confidence * 100).toFixed(1)}%)`);
          console.log(`📊 vLLM Reasoning: ${selectedCategory.reasoning}`);

          // Prepare final vLLM DSPy result with standard IFRS categorization only
          console.log(`🔄 Preparing final vLLM DSPy result with standard IFRS categorization`);

          // Calculate due date from transaction date + payment terms (vLLM fallback)
          let vllmCalculatedDueDate = null;
          if (vllmExtractionData.transaction_date && vllmExtractionData.payment_terms) {
            try {
              const transactionDate = new Date(vllmExtractionData.transaction_date);
              const paymentTerms = vllmExtractionData.payment_terms.toLowerCase();

              // Extract days from payment terms (e.g., "30 DAYS", "NET 30", "15 days")
              const dayMatches = paymentTerms.match(/(\d+)\s*(days?|day)/i);
              if (dayMatches && !isNaN(transactionDate.getTime())) {
                const daysToAdd = parseInt(dayMatches[1]);
                const dueDate = new Date(transactionDate);
                dueDate.setDate(dueDate.getDate() + daysToAdd);
                vllmCalculatedDueDate = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD format
                console.log(`📅 vLLM calculated due date: ${vllmCalculatedDueDate} (${daysToAdd} days from ${vllmExtractionData.transaction_date})`);
              }
            } catch (error) {
              console.log(`⚠️ Could not calculate due date (vLLM): ${error}`);
            }
          }

          // Store raw vLLM DSPy output directly with standard IFRS categorization only
          const finalVllmDspyResult = {
            ...vllmExtractionData, // All raw DSPy fields (vendor_name, total_amount, currency, etc.)
            // Add calculated due date
            due_date: vllmCalculatedDueDate,
            // Add standard IFRS accounting categorization (Documents page - accounting purpose)
            suggested_category: selectedCategory.category_code,
            accounting_category: selectedCategory.category_name,
            category_confidence: selectedCategory.confidence,
            category_reasoning: selectedCategory.reasoning,
            processing_method: vllmExtractionData.backend_used || 'vllm_fallback'
          };

          // Update database with vLLM raw DSPy structure
          console.log(`💾 Updating database with vLLM fallback results...`);
          const { error: vllmUpdateError } = await supabase
            .from(tableName)  // ✅ PHASE 4C: Routed based on domain
            .update({
              processing_status: 'completed',
            extracted_data: finalVllmDspyResult, // Store raw DSPy structure directly
            confidence_score: vllmExtractionData.confidence_score,
            processed_at: new Date().toISOString(),
            error_message: null,
            processing_metadata: {
              backend_used: vllmExtractionData.backend_used,
              requires_validation: vllmExtractionData.requires_validation,
              category_suggestion: {
                ifrs_accounting: {
                  category: selectedCategory.category_code,
                  accounting_category: selectedCategory.category_name,
                  confidence: selectedCategory.confidence,
                  reasoning: selectedCategory.reasoning
                }
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
            suggested_category: selectedCategory.category_code,
            accounting_category: selectedCategory.category_name,
            requiresValidation: vllmExtractionData.requires_validation,
            backend: vllmExtractionData.backend_used,
            processing_type: 'vllm_ifrs_fallback'
          };

        } catch (fallbackError) {
          console.error("❌ vLLM fallback also failed:", fallbackError);
          
          // Both DSPy and vLLM failed - mark as failed
          await supabase
            .from(tableName)  // ✅ PHASE 4C: Routed based on domain
            .update({
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
        await supabase
          .from(tableName)  // ✅ PHASE 4C: Routed based on domain
          .update({
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