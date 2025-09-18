/**
 * Trigger.dev Task: DSPy Receipt Extraction
 * 
 * Advanced receipt processing using DSPy framework with Gemini 2.5 Flash
 * Uses existing DSPy implementation with Pydantic models for structured extraction
 */

import { task } from "@trigger.dev/sdk/v3";
import { python } from "@trigger.dev/python";
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for background processing
const createSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is missing');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is missing');
  }

  console.log(`🔗 Connecting to Supabase: ${supabaseUrl.substring(0, 30)}...`);

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};

const supabase = createSupabaseClient();

export const dspyReceiptExtraction = task({
  id: "dspy-receipt-extraction",
  maxDuration: 180, // 3 minutes - with vLLM fallback system
  retry: {
    maxAttempts: 1, // No retries - we have vLLM fallback internally
  },
  run: async (payload: {
    receiptText?: string;
    receiptImageData?: {
      base64: string;
      mimeType: string;
      filename: string;
    };
    receiptImageUrl?: string;
    documentId?: string;
    expenseClaimId?: string; // New parameter for expense claim updates
    userId?: string;
    imageMetadata?: {
      confidence?: number;
      quality?: 'excellent' | 'good' | 'acceptable' | 'poor';
      textLength?: number;
    };
    forcedProcessingMethod?: 'simple' | 'complex' | 'auto';
    requestId?: string;
  }) => {
    console.log(`🚀 Starting DSPy receipt extraction`);
    console.log(`📝 Receipt text length: ${payload.receiptText?.length || 0} chars`);
    console.log(`🖼️ Image URL provided: ${!!payload.receiptImageUrl}`);
    console.log(`📄 Document ID: ${payload.documentId}`);
    console.log(`💰 Expense Claim ID: ${payload.expenseClaimId}`);
    console.log(`🔍 Request ID: ${payload.requestId}`);

    try {
      // Step 1: Fetch business categories for enhanced categorization (if expense claim provided)
      let businessCategories: any[] = [];
      if (payload.expenseClaimId) {
        console.log(`🏢 Fetching business categories for enhanced DSPy categorization`);

        // Get the expense claim and its business_id
        const { data: expenseClaim, error: fetchError } = await supabase
          .from('expense_claims')
          .select('id, transaction_id, business_id')
          .eq('id', payload.expenseClaimId)
          .single();

        if (!fetchError && expenseClaim?.business_id) {
          const { data: business, error: businessError } = await supabase
            .from('businesses')
            .select('custom_expense_categories')
            .eq('id', expenseClaim.business_id)
            .single();

          if (!businessError && business?.custom_expense_categories) {
            businessCategories = (business.custom_expense_categories as any[])
              .filter(cat => cat.is_active)
              .map(cat => ({
                code: cat.category_code,
                name: cat.category_name,
                vendor_patterns: cat.vendor_patterns || [],
                ai_keywords: cat.ai_keywords || []
              }));
            console.log(`📋 Found ${businessCategories.length} active business categories for DSPy`);
          }
        }
      }

      // Step 2: Run DSPy extraction using Python inline code with business categories
      console.log("🐍 Running DSPy extraction with Python runtime...");

      // Step 2: Run optimized DSPy extraction (simplified processing)
      console.log("🔍 Running streamlined DSPy extraction...");

      const result = await python.runInline(`
# Hybrid DSPy Receipt Extraction with Adaptive Processing  
import dspy
import os
import json
import re
import sys
from typing import Optional, List, Literal, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import hashlib
import traceback

# Southeast Asian Vendor Patterns Cache (Performance Optimization)
SEASIA_VENDOR_PATTERNS = {
    # Major chains - Simple processing
    "7-ELEVEN": {"confidence": 0.98, "category": "retail", "complexity": "simple"},
    "STARBUCKS": {"confidence": 0.98, "category": "entertainment", "complexity": "simple"},
    "MCDONALD'S": {"confidence": 0.98, "category": "entertainment", "complexity": "simple"},
    "KFC": {"confidence": 0.98, "category": "entertainment", "complexity": "simple"},
    "SHELL": {"confidence": 0.97, "category": "petrol", "complexity": "simple"},
    "ESSO": {"confidence": 0.97, "category": "petrol", "complexity": "simple"},
    "CALTEX": {"confidence": 0.97, "category": "petrol", "complexity": "simple"},
    "PETRON": {"confidence": 0.97, "category": "petrol", "complexity": "simple"},
    
    # Regional chains
    "WATSONS": {"confidence": 0.95, "category": "office_supplies", "complexity": "simple"},
    "GUARDIAN": {"confidence": 0.95, "category": "office_supplies", "complexity": "simple"},
    "NTUC FAIRPRICE": {"confidence": 0.96, "category": "retail", "complexity": "simple"},
    "GIANT": {"confidence": 0.95, "category": "retail", "complexity": "simple"},
    "COLD STORAGE": {"confidence": 0.95, "category": "retail", "complexity": "simple"},
    
    # Thai patterns
    "เซเว่น": {"confidence": 0.95, "category": "retail", "complexity": "medium"},  # 7-Eleven Thai
    "ทีเอสซี": {"confidence": 0.94, "category": "retail", "complexity": "medium"},  # TSC
    "บิ๊กซี": {"confidence": 0.94, "category": "retail", "complexity": "medium"},   # Big C
    
    # Malaysian patterns  
    "MYDIN": {"confidence": 0.94, "category": "retail", "complexity": "simple"},
    "AEON": {"confidence": 0.94, "category": "retail", "complexity": "simple"},
    "TESCO": {"confidence": 0.94, "category": "retail", "complexity": "simple"},
}

# Currency patterns for Southeast Asia
SEASIA_CURRENCY_PATTERNS = {
    r'\$[\d.,]+': 'SGD',  # Singapore Dollar (default $)
    r'SGD\s*[\d.,]+': 'SGD',
    r'RM\s*[\d.,]+': 'MYR',  # Malaysian Ringgit
    r'฿[\d.,]+': 'THB',       # Thai Baht
    r'Rp[\d.,]+': 'IDR',      # Indonesian Rupiah
    r'₱[\d.,]+': 'PHP',       # Philippine Peso
    r'₫[\d.,]+': 'VND',       # Vietnamese Dong
    r'¥[\d.,]+': 'CNY',       # Chinese Yuan
    r'€[\d.,]+': 'EUR'        # Euro
}

class ComplexityClassification(BaseModel):
    level: Literal['simple', 'medium', 'complex'] = Field(..., description="Processing complexity level")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Classification confidence")
    reasoning: str = Field(..., description="Why this complexity was chosen")
    processing_method: Literal['fast_dspy', 'guided_dspy', 'chain_of_thought'] = Field(..., description="Recommended DSPy method")
    estimated_time: float = Field(..., description="Estimated processing time in seconds")

class VendorMatch(BaseModel):
    vendor_name: str = Field(..., description="Matched vendor name")
    confidence: float = Field(..., description="Match confidence")
    suggested_category: Optional[str] = Field(None, description="Suggested expense category")
    complexity: Literal['simple', 'medium', 'complex'] = Field(..., description="Processing complexity")

# Pydantic models for structured receipt processing
class ExtractedLineItem(BaseModel):
    description: str = Field(..., description="Item description/name")
    quantity: Optional[float] = Field(None, description="Quantity purchased")
    unit_price: Optional[float] = Field(None, description="Price per unit")
    line_total: float = Field(..., description="Total amount for this line item")

class ExtractedReceiptData(BaseModel):
    vendor_name: str = Field(..., description="The name of the merchant or store")
    transaction_date: str = Field(..., description="Transaction date in YYYY-MM-DD format")
    total_amount: float = Field(..., description="Final total amount")
    currency: str = Field(..., description="Currency code in ISO 4217 format")
    subtotal_amount: Optional[float] = Field(None, description="Subtotal before tax and tips")
    tax_amount: Optional[float] = Field(None, description="Total tax amount")
    receipt_number: Optional[str] = Field(None, description="Receipt or invoice number")
    line_items: List[ExtractedLineItem] = Field(default_factory=list, description="Individual purchased items")
    selected_category: Optional[str] = Field(None, description="Selected expense category name from available business categories")
    extraction_quality: Literal['high', 'medium', 'low'] = Field(..., description="Quality assessment")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence score from 0.0 to 1.0")
    dspy_confidence: float = Field(..., ge=0.0, le=1.0, description="DSPy model confidence from 0.0 to 1.0")
    missing_fields: List[str] = Field(default_factory=list, description="Fields that couldn't be extracted")
    processing_method: Literal['dspy', 'manual_entry'] = Field(default='dspy')
    model_used: Optional[str] = Field(None, description="AI model used for extraction")
    backend_used: Optional[str] = Field(None, description="Backend used: gemini_dspy or vllm_dspy")

class ExtractionReasoning(BaseModel):
    step1_vendor_analysis: str = Field(..., description="Reasoning for vendor identification")
    step2_date_identification: str = Field(..., description="Reasoning for date extraction")
    step3_amount_parsing: str = Field(..., description="Reasoning for amount extraction")
    step4_tax_calculation: str = Field(..., description="Reasoning for tax analysis")
    step5_line_items_extraction: str = Field(..., description="Reasoning for line items extraction")
    step6_validation_checks: str = Field(..., description="Reasoning for validation")
    final_confidence_assessment: str = Field(..., description="Overall confidence reasoning")

# Response model for consistent Trigger.dev communication
class ScriptResponse(BaseModel):
    success: bool = Field(..., description="Whether the script executed successfully")
    data: Optional[Dict[str, Any]] = Field(None, description="Extraction result data")
    error: Optional[str] = Field(None, description="Error message if failed")
    debug_info: Optional[Dict[str, Any]] = Field(None, description="Debug information")

class DSPyExtractionResult(BaseModel):
    thinking: ExtractionReasoning = Field(..., description="Chain-of-thought reasoning")
    extracted_data: ExtractedReceiptData = Field(..., description="Structured extracted data")
    processing_complete: bool = Field(..., description="Whether processing completed successfully")
    needs_manual_review: bool = Field(..., description="Whether manual review is recommended")
    suggested_corrections: List[str] = Field(default_factory=list, description="Suggested improvements")

# Modern DSPy Structured Output Signatures (TypedPredictor + JSONAdapter)

class SimpleReceiptSignature(dspy.Signature):
    """Fast structured extraction for clear receipts with known vendors"""
    receipt_text: str = dspy.InputField(desc="OCR text from receipt")
    available_categories: str = dspy.InputField(desc="JSON list of available expense categories with names and codes")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data with selected category")

class GuidedReceiptSignature(dspy.Signature):
    """Guided structured extraction with reasoning for unclear receipts"""
    receipt_text: str = dspy.InputField(desc="OCR text from receipt")
    available_categories: str = dspy.InputField(desc="JSON list of available expense categories with names and codes")
    reasoning: ExtractionReasoning = dspy.OutputField(desc="Step-by-step reasoning process")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data with selected category")

class ComplexReceiptSignature(dspy.Signature):
    """Full chain-of-thought structured extraction for complex receipts"""
    receipt_text: str = dspy.InputField(desc="Raw OCR text from receipt")
    available_categories: str = dspy.InputField(desc="JSON list of available expense categories with names and codes")
    reasoning: ExtractionReasoning = dspy.OutputField(desc="Detailed step-by-step reasoning")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data with selected category")

# Hybrid Receipt Classification System
class HybridReceiptClassifier:
    """Fast heuristics + LLM assessment for receipt complexity classification"""
    
    def __init__(self):
        # Pre-computed patterns for fast classification
        self.simple_indicators = [
            r'7-ELEVEN', r'STARBUCKS', r'MCDONALD', r'KFC', r'SHELL', 
            r'ESSO', r'CALTEX', r'PETRON', r'WATSONS', r'GUARDIAN'
        ]
        
        # LLM-based classifier for uncertain cases
        self.llm_classifier = None  # Will be initialized when needed
    
    def fast_classify(self, receipt_text: str, image_metadata: Dict[str, Any]) -> ComplexityClassification:
        """Stage 1: Fast heuristic classification (0.1 seconds)"""
        
        text_upper = receipt_text.upper()
        text_length = len(receipt_text)
        line_count = len(receipt_text.splitlines())
        
        # Check vendor patterns
        vendor_match = self._match_known_vendor(text_upper)
        
        # Fast quality indicators
        has_clear_total = bool(re.search(r'TOTAL[:\\s]*\\$?[\\d.,]+', text_upper))
        has_clear_date = bool(re.search(r'\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}', receipt_text))
        has_clear_currency = any(re.search(pattern, receipt_text) for pattern in SEASIA_CURRENCY_PATTERNS.keys())
        
        # Image quality factors
        ocr_confidence = image_metadata.get('confidence', 0.7)
        image_quality = image_metadata.get('quality', 'acceptable')
        
        # Simplicity scoring
        simplicity_score = sum([
            ocr_confidence > 0.85,
            vendor_match is not None,
            has_clear_total,
            has_clear_date,
            has_clear_currency,
            text_length < 500,
            line_count < 25,
            image_quality in ['excellent', 'good']
        ])
        
        if simplicity_score >= 6:
            return ComplexityClassification(
                level='simple',
                confidence=0.9,
                reasoning=f"Clear receipt: known vendor={vendor_match is not None}, clear total={has_clear_total}, good OCR={ocr_confidence > 0.85}",
                processing_method='fast_dspy',
                estimated_time=1.5
            )
        elif simplicity_score <= 3:
            return ComplexityClassification(
                level='complex',
                confidence=0.8,
                reasoning=f"Complex receipt: poor OCR={ocr_confidence < 0.7}, unclear format, {line_count} lines",
                processing_method='chain_of_thought',
                estimated_time=4.5
            )
        else:
            # Uncertain - needs LLM assessment
            return ComplexityClassification(
                level='medium',
                confidence=0.5,
                reasoning="Uncertain complexity - requires LLM assessment",
                processing_method='guided_dspy',
                estimated_time=3.0
            )
    
    def _match_known_vendor(self, text_upper: str) -> Optional[VendorMatch]:
        """Match against Southeast Asian vendor patterns"""
        for vendor, info in SEASIA_VENDOR_PATTERNS.items():
            if vendor.upper() in text_upper:
                return VendorMatch(
                    vendor_name=vendor,
                    confidence=info['confidence'],
                    suggested_category=info['category'],
                    complexity=info['complexity']
                )
        return None

# 🚀 Modern Adaptive DSPy Extractor with Structured Output + Assertions
class AdaptiveReceiptExtractor(dspy.Module):
    """Intelligent DSPy extractor that adapts processing based on receipt complexity"""
    
    def __init__(self, model_name: str = "gemini-2.5-flash"):
        super().__init__()
        
        # 🔧 Configure DSPy with proper LM and JSONAdapter
        # Use DSPy's built-in Gemini integration with proper model format
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not found")
        
        # Configure with DSPy's native Gemini integration - use "gemini/" prefix
        lm = dspy.LM(f"gemini/{model_name}", api_key=api_key)
        dspy.settings.configure(lm=lm, adapter=dspy.JSONAdapter())
        
        # Initialize different extractors for different complexity levels - all use structured output
        self.simple_extractor = dspy.Predict(SimpleReceiptSignature)
        self.guided_extractor = dspy.ChainOfThought(GuidedReceiptSignature) 
        self.complex_extractor = dspy.ChainOfThought(ComplexReceiptSignature)
        
        # Hybrid classifier
        self.classifier = HybridReceiptClassifier()
        
        # Performance tracking for continuous learning
        self.processing_history = []
    
    def forward(self, receipt_text: str, image_metadata: Dict[str, Any] = None,
                forced_method: Optional[str] = None, business_categories: List[Dict] = None) -> DSPyExtractionResult:
        """Adaptive processing with intelligent routing"""
        
        start_time = datetime.now()
        
        if image_metadata is None:
            image_metadata = {'confidence': 0.7, 'quality': 'acceptable'}
        
        # Stage 1: Fast classification (unless forced)
        if forced_method:
            if forced_method == 'simple':
                classification = ComplexityClassification(
                    level='simple', confidence=1.0, reasoning="Forced simple processing",
                    processing_method='fast_dspy', estimated_time=1.5
                )
            elif forced_method == 'complex':
                classification = ComplexityClassification(
                    level='complex', confidence=1.0, reasoning="Forced complex processing", 
                    processing_method='chain_of_thought', estimated_time=4.5
                )
            else:
                classification = ComplexityClassification(
                    level='medium', confidence=1.0, reasoning="Forced guided processing",
                    processing_method='guided_dspy', estimated_time=3.0
                )
        else:
            classification = self.classifier.fast_classify(receipt_text, image_metadata)
        
        print(f"🎯 Classification: {classification.level} ({classification.processing_method}) - {classification.reasoning}")
        
        # Stage 2: Adaptive DSPy processing with Pure Structured Output
        try:
            if classification.processing_method == 'fast_dspy':
                result = self._process_simple_structured(receipt_text, classification, business_categories)
            elif classification.processing_method == 'guided_dspy':
                result = self._process_guided_structured(receipt_text, classification, business_categories)
            else:  # chain_of_thought
                result = self._process_complex_structured(receipt_text, classification, business_categories)
                
            processing_time = (datetime.now() - start_time).total_seconds()
            
            # Record for continuous learning
            self._record_processing_result(classification, result, processing_time)
            
            return result
            
        except Exception as e:
            print(f"❌ Processing failed with {classification.processing_method}: {str(e)}")
            # Fallback to complex processing if simple/guided fails
            if classification.processing_method != 'chain_of_thought':
                print("🔄 Falling back to complex processing...")
                return self._process_complex_structured(receipt_text, classification, business_categories)
            else:
                raise e
    
    def _process_simple_structured(self, receipt_text: str, classification: ComplexityClassification, business_categories: List[Dict] = None) -> DSPyExtractionResult:
        """Fast structured processing for simple receipts with pure structured output"""
        
        print("🚀 Running simple structured DSPy processing...", file=sys.stderr)
        
        try:
            # Prepare categories for LLM
            categories_json = self._format_categories_for_llm(business_categories)

            prediction = self.simple_extractor(
                receipt_text=receipt_text,
                available_categories=categories_json
            )
            extracted_data = prediction.extracted_data

            print(f"✅ Simple extraction completed: {extracted_data.vendor_name}, {extracted_data.total_amount} {extracted_data.currency}", file=sys.stderr)
            print(f"🎯 Selected category: {extracted_data.selected_category}", file=sys.stderr)

            # Basic validation without assertions - NO hardcoded fallbacks
            if (not extracted_data.vendor_name or
                extracted_data.vendor_name.strip() == "" or
                extracted_data.total_amount <= 0):
                print("⚠️ Simple extraction quality issues, trying guided processing", file=sys.stderr)
                return self._process_guided_structured(receipt_text, classification, business_categories)

            return self._build_structured_result(prediction, classification, 'simple')
        except Exception as e:
            print(f"❌ Simple processing failed: {e}", file=sys.stderr)
            # Fallback to guided processing if simple fails
            return self._process_guided_structured(receipt_text, classification, business_categories)
        
    def _process_guided_structured(self, receipt_text: str, classification: ComplexityClassification, business_categories: List[Dict] = None) -> DSPyExtractionResult:
        """Guided structured processing for medium complexity with pure structured output"""
        
        print("🧭 Running guided structured DSPy processing...", file=sys.stderr)
        
        try:
            # Prepare categories for LLM
            categories_json = self._format_categories_for_llm(business_categories)

            prediction = self.guided_extractor(
                receipt_text=receipt_text,
                available_categories=categories_json
            )
            extracted_data = prediction.extracted_data

            print(f"✅ Guided extraction completed: {extracted_data.vendor_name}, {extracted_data.total_amount} {extracted_data.currency}", file=sys.stderr)
            print(f"🎯 Selected category: {extracted_data.selected_category}", file=sys.stderr)

            # Basic validation without assertions
            if (not extracted_data.vendor_name or
                extracted_data.vendor_name.strip() == "" or
                extracted_data.total_amount <= 0):
                print("⚠️ Guided extraction quality issues, falling back to complex processing", file=sys.stderr)
                return self._process_complex_structured(receipt_text, classification, business_categories)

            return self._build_structured_result(prediction, classification, 'guided')
        except Exception as e:
            print(f"❌ Guided processing failed: {e}", file=sys.stderr)
            # Fallback to complex processing if guided fails
            return self._process_complex_structured(receipt_text, classification, business_categories)
        
    def _process_complex_structured(self, receipt_text: str, classification: ComplexityClassification, business_categories: List[Dict] = None) -> DSPyExtractionResult:
        """Full chain-of-thought structured processing for complex receipts with pure structured output"""
        
        print("🧠 Running complex structured DSPy processing...", file=sys.stderr)
        
        try:
            # Prepare categories for LLM
            categories_json = self._format_categories_for_llm(business_categories)

            prediction = self.complex_extractor(
                receipt_text=receipt_text,
                available_categories=categories_json
            )
            extracted_data = prediction.extracted_data

            print(f"✅ Complex extraction completed: {extracted_data.vendor_name}, {extracted_data.total_amount} {extracted_data.currency}", file=sys.stderr)
            print(f"🎯 Selected category: {extracted_data.selected_category}", file=sys.stderr)

            # Even if extraction quality is poor, return the result for complex processing
            # This is the final fallback, so we accept whatever we got
            return self._build_structured_result(prediction, classification, 'complex')
        except Exception as e:
            print(f"❌ Complex processing failed: {e}", file=sys.stderr)
            # NO FALLBACK - FAIL CLEARLY
            raise Exception(f"Unable to extract information from this receipt. The document may be unclear, damaged, or in an unsupported format. Please try uploading a clearer image or manually enter the receipt details.")
    
    def _build_structured_result(self, prediction, classification: ComplexityClassification, processing_level: str) -> DSPyExtractionResult:
        """Build result from structured DSPy prediction - no manual parsing needed!"""
        
        print(f"🔧 Building structured result for {processing_level} processing", file=sys.stderr)
        print(f"🔧 Prediction type: {type(prediction)}", file=sys.stderr)
        
        # Extract structured data from DSPy prediction
        # With JSONAdapter + Pydantic, these are already validated objects!
        
        if processing_level == 'simple':
            # Simple predictions only have extracted_data
            extracted_data = prediction.extracted_data
            # Create minimal reasoning for simple processing
            reasoning = ExtractionReasoning(
                step1_vendor_analysis=f"Simple processing: {extracted_data.vendor_name}",
                step2_date_identification=f"Date extracted: {extracted_data.transaction_date}",
                step3_amount_parsing=f"Amount: {extracted_data.total_amount} {extracted_data.currency}",
                step4_tax_calculation="Tax analysis skipped for simple processing",
                step5_line_items_extraction="Line items not extracted in simple mode",
                step6_validation_checks="Simple validation passed",
                final_confidence_assessment=f"Simple processing confidence: {extracted_data.confidence_score}"
            )
        else:
            # Guided and complex predictions include reasoning
            extracted_data = prediction.extracted_data  
            reasoning = prediction.reasoning if hasattr(prediction, 'reasoning') else ExtractionReasoning(
                step1_vendor_analysis=f"{processing_level.capitalize()} processing: {extracted_data.vendor_name}",
                step2_date_identification=f"Date extracted: {extracted_data.transaction_date}",
                step3_amount_parsing=f"Amount: {extracted_data.total_amount} {extracted_data.currency}",
                step4_tax_calculation=f"Tax: {extracted_data.tax_amount or 'N/A'}",
                step5_line_items_extraction=f"Line items: {len(extracted_data.line_items)} found",
                step6_validation_checks=f"{processing_level.capitalize()} validation passed",
                final_confidence_assessment=f"{processing_level.capitalize()} confidence: {extracted_data.confidence_score}"
            )
        
        # Update model used based on processing level
        extracted_data.model_used = f'gemini-2.5-flash-{processing_level}'
        
        print(f"✅ Structured extraction complete: {extracted_data.vendor_name}, {extracted_data.total_amount} {extracted_data.currency}", file=sys.stderr)
        
        needs_review = (
            extracted_data.confidence_score < 0.7 or  
            not extracted_data.vendor_name or 
            extracted_data.total_amount <= 0
        )
        
        return DSPyExtractionResult(
            thinking=reasoning,
            extracted_data=extracted_data,
            processing_complete=True,
            needs_manual_review=needs_review,
            suggested_corrections=self._generate_suggestions(extracted_data)
        )
    
    
    
    
        
    def _record_processing_result(self, classification: ComplexityClassification, 
                                result: DSPyExtractionResult, processing_time: float):
        """Record processing results for continuous learning"""
        record = {
            'classification': classification.level,
            'processing_method': classification.processing_method,
            'estimated_time': classification.estimated_time,
            'actual_time': processing_time,
            'success': result.processing_complete,
            'confidence': result.extracted_data.confidence_score,
            'needs_review': result.needs_manual_review,
            'timestamp': datetime.now().isoformat()
        }
        self.processing_history.append(record)
        
        # Keep only last 100 records for memory efficiency
        if len(self.processing_history) > 100:
            self.processing_history = self.processing_history[-100:]
    
    # 🚀 Modern DSPy Implementation: No Manual Parsing Needed!
    # With JSONAdapter + Pydantic, all parsing is handled automatically by DSPy

    def _format_categories_for_llm(self, business_categories: List[Dict] = None) -> str:
        """Format business categories as JSON for LLM to select from"""
        if not business_categories:
            # Provide fallback categories if no business categories available
            fallback_categories = [
                {"category_name": "Office Supplies", "category_code": "office_supplies"},
                {"category_name": "Business Meals & Entertainment", "category_code": "entertainment"},
                {"category_name": "Transportation & Travel", "category_code": "transport"},
                {"category_name": "Other Business Expenses", "category_code": "other"}
            ]
            print("🔄 No business categories provided, using fallback categories", file=sys.stderr)
            return json.dumps(fallback_categories)

        # Format business categories for LLM selection
        formatted_categories = [
            {
                "category_name": cat['name'],
                "category_code": cat['code']
            }
            for cat in business_categories
        ]

        print(f"📋 Formatted {len(formatted_categories)} business categories for LLM selection", file=sys.stderr)
        return json.dumps(formatted_categories)

    def _normalize_quality(self, quality_str: str) -> str:
        quality_lower = quality_str.lower().strip()
        if quality_lower in ['high', 'medium', 'low']:
            return quality_lower
        return 'medium'
    
    def _generate_suggestions(self, data: ExtractedReceiptData) -> list:
        suggestions = []
        
        if data.confidence_score < 0.5:
            suggestions.append("Low confidence extraction - please review all fields")
        
        if not data.line_items:
            suggestions.append("No line items detected - consider manual entry")
        
        if not data.tax_amount and data.total_amount > 10:
            suggestions.append("No tax detected - verify if tax is included")
        
        return suggestions

# Gemini LM wrapper for DSPy  
class GeminiLM(dspy.LM):
    def __init__(self, model_name: str = "gemini-2.5-flash"):
        # Call parent constructor first
        super().__init__(model_name)
        
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not found")
        
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        self.model_name = model_name
        self.history = []
    
    def basic_request(self, prompt: str, **kwargs) -> str:
        """Core generation logic called by DSPy framework"""
        try:
            response = self.model.generate_content(prompt, **kwargs)
            # CRITICAL: Extract text content, not the raw response object
            if hasattr(response, 'text') and response.text:
                return response.text
            elif hasattr(response, 'parts') and response.parts:
                # Fallback for complex responses
                return response.parts[0].text if response.parts[0].text else ""
            else:
                return ""
        except Exception as e:
            print(f"Gemini generation error: {e}", file=sys.stderr)
            return ""
    
    def __call__(self, messages, **kwargs) -> list:
        """Main entry point for DSPy - handles both messages list and string prompts"""
        # DSPy's chat adapter sends a list of message dicts
        # Handle both messages list and direct string prompts
        if isinstance(messages, str):
            prompt = messages
        elif isinstance(messages, list) and len(messages) > 0:
            # Extract content from the last message (most common pattern)
            last_message = messages[-1]
            if isinstance(last_message, dict) and 'content' in last_message:
                prompt = last_message['content']
            elif isinstance(last_message, str):
                prompt = last_message
            else:
                # Fallback: join all message contents
                prompt = ' '.join(str(msg.get('content', msg) if isinstance(msg, dict) else msg) for msg in messages)
        else:
            raise TypeError(f"Unsupported input type for 'messages': {type(messages)} - {messages}")
        
        # Call the core generation logic
        response_text = self.basic_request(prompt, **kwargs)
        
        # DSPy expects a list of string completions
        return [response_text]

# Enhanced DSPy Signature with confidence scoring for multi-stage processing
class ReceiptExtractionSignature(dspy.Signature):
    """Extract key information from receipt text with confidence scoring for quality assessment"""
    receipt_text: str = dspy.InputField(desc="Raw text extracted from receipt")
    vendor_name: str = dspy.OutputField(desc="Name of the merchant or store")
    transaction_date: str = dspy.OutputField(desc="Transaction date in YYYY-MM-DD format")
    total_amount: str = dspy.OutputField(desc="Total amount as string")
    currency: str = dspy.OutputField(desc="Currency code (SGD, MYR, THB, etc.)")
    receipt_number: str = dspy.OutputField(desc="Receipt or invoice number if available")
    confidence_score: str = dspy.OutputField(desc="Overall confidence score from 0.0 to 1.0")
    dspy_confidence: str = dspy.OutputField(desc="DSPy model confidence from 0.0 to 1.0 for fallback decision")

# Modern DSPy Extractor with Structured Output
class DSPyReceiptExtractor(dspy.Module):
    def __init__(self):
        super().__init__()
        self.extract_receipt_data = dspy.ChainOfThought(ReceiptExtractionSignature)
        
        # 🔧 Configure DSPy with JSONAdapter for structured Pydantic output
        if not hasattr(dspy.settings, 'lm') or dspy.settings.lm is None:
            api_key = os.getenv('GEMINI_API_KEY')
            if not api_key:
                raise ValueError("GEMINI_API_KEY environment variable not found")
            
            # Use DSPy's built-in Google LM integration
            lm = dspy.Google(model="gemini-2.5-flash", api_key=api_key)
            dspy.settings.configure(lm=lm, adapter=dspy.JSONAdapter())
    
    def forward(self, receipt_text: str):
        # Run the DSPy predictor
        prediction = self.extract_receipt_data(receipt_text=receipt_text)
        
        # Parse line items JSON if present
        line_items = []
        if hasattr(prediction, 'line_items_json') and prediction.line_items_json:
            try:
                line_items_data = json.loads(prediction.line_items_json)
                if isinstance(line_items_data, list):
                    for item_data in line_items_data:
                        if isinstance(item_data, dict):
                            line_items.append(ExtractedLineItem(
                                description=item_data.get('description', 'Item'),
                                quantity=self._parse_float(item_data.get('quantity')),
                                unit_price=self._parse_float(item_data.get('unit_price')),
                                line_total=self._parse_float(item_data.get('line_total', 0)) or 0
                            ))
            except (json.JSONDecodeError, TypeError):
                pass
        
        # Build the structured result
        reasoning = ExtractionReasoning(
            step1_vendor_analysis=getattr(prediction, 'step1_vendor_analysis', ''),
            step2_date_identification=getattr(prediction, 'step2_date_identification', ''),
            step3_amount_parsing=getattr(prediction, 'step3_amount_parsing', ''),
            step4_tax_calculation=getattr(prediction, 'step4_tax_calculation', ''),
            step5_line_items_extraction=getattr(prediction, 'step5_line_items_extraction', ''),
            step6_validation_checks=getattr(prediction, 'step6_validation_checks', ''),
            final_confidence_assessment=f"Confidence: {getattr(prediction, 'confidence_score', '0.7')}"
        )
        
        extracted_data = ExtractedReceiptData(
            vendor_name=getattr(prediction, 'vendor_name', 'Unknown Vendor'),
            transaction_date=self._normalize_date(getattr(prediction, 'transaction_date', '')),
            total_amount=self._parse_float(getattr(prediction, 'total_amount', '0')) or 0,
            currency=getattr(prediction, 'currency', 'SGD'),
            subtotal_amount=self._parse_float(getattr(prediction, 'subtotal_amount', None)),
            tax_amount=self._parse_float(getattr(prediction, 'tax_amount', None)),
            receipt_number=getattr(prediction, 'receipt_number', None),
            line_items=line_items,
            confidence_score=self._parse_float(getattr(prediction, 'confidence_score', '0.8')) or 0.8,
            extraction_quality=self._normalize_quality(getattr(prediction, 'extraction_quality', 'medium')),
            processing_method='dspy',
            model_used='gemini-2.5-flash'
        )
        
        # Determine if manual review is needed
        needs_review = (
            extracted_data.confidence_score < 0.8 or
            not extracted_data.vendor_name or
            extracted_data.total_amount <= 0
        )
        
        return DSPyExtractionResult(
            thinking=reasoning,
            extracted_data=extracted_data,
            processing_complete=True,
            needs_manual_review=needs_review,
            suggested_corrections=self._generate_suggestions(extracted_data)
        )
    
    def _normalize_date(self, date_str: str) -> str:
        if not date_str:
            return datetime.now().strftime('%Y-%m-%d')
        
        print(f"🔍 DEBUG: _normalize_date input: {repr(date_str)}", file=sys.stderr)
        
        # Try multiple date patterns commonly found in Southeast Asian receipts
        date_patterns = [
            # ISO format: "2024-12-15" 
            (r'(\\d{4}-\\d{1,2}-\\d{1,2})', lambda m: m.group(1)),
            
            # Southeast Asian format: "27/JUL/2025", "15/DEC/2024"
            (r'(\\d{1,2})/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/(\\d{4})', 
             lambda m: self._convert_month_name_date(m.group(1), m.group(2), m.group(3))),
            
            # Common formats: "27/07/2025", "15/12/2024", "3/1/2024"
            (r'(\\d{1,2})/(\\d{1,2})/(\\d{4})', 
             lambda m: f"{m.group(3)}-{m.group(2):0>2}-{m.group(1):0>2}"),
             
            # US format: "12/15/2024" (MM/DD/YYYY)
            (r'(\\d{1,2})/(\\d{1,2})/(\\d{4})', 
             lambda m: f"{m.group(3)}-{m.group(1):0>2}-{m.group(2):0>2}"),
             
            # Dot separated: "27.07.2025", "15.12.2024"
            (r'(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})', 
             lambda m: f"{m.group(3)}-{m.group(2):0>2}-{m.group(1):0>2}"),
             
            # Hyphen separated: "27-07-2025", "15-12-2024"  
            (r'(\\d{1,2})-(\\d{1,2})-(\\d{4})', 
             lambda m: f"{m.group(3)}-{m.group(2):0>2}-{m.group(1):0>2}"),
        ]
        
        for pattern, converter in date_patterns:
            match = re.search(pattern, date_str, re.IGNORECASE)
            if match:
                try:
                    normalized_date = converter(match)
                    print(f"🔍 DEBUG: Pattern '{pattern}' matched, converted to: {normalized_date}", file=sys.stderr)
                    return normalized_date
                except Exception as e:
                    print(f"🔍 DEBUG: Date conversion failed for pattern '{pattern}': {e}", file=sys.stderr)
                    continue
        
        # Fallback: use current date
        fallback_date = datetime.now().strftime('%Y-%m-%d')
        print(f"🔍 DEBUG: No date pattern matched, using fallback: {fallback_date}", file=sys.stderr)
        return fallback_date
    
    def _convert_month_name_date(self, day: str, month_name: str, year: str) -> str:
        \"\"\"Convert month name format to YYYY-MM-DD\"\"\"
        month_mapping = {
            'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
            'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08', 
            'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        }
        
        month_num = month_mapping.get(month_name.upper(), '01')
        return f"{year}-{month_num}-{day.zfill(2)}"
    
    def _parse_float(self, value) -> Optional[float]:
        if value is None or value == '':
            return None
        
        try:
            if isinstance(value, str):
                print(f"🔍 DEBUG: _parse_float input: {repr(value)}", file=sys.stderr)
                
                # Handle Southeast Asian currency formats: "RM 91.23", "SGD 25.50", "$50.00", "฿100.50"
                # First try to extract currency patterns
                currency_patterns = [
                    r'RM\\s*([\\d.,]+)',      # Malaysian Ringgit: "RM 91.23" or "RM91.23"
                    r'SGD\\s*([\\d.,]+)',     # Singapore Dollar: "SGD 25.50"
                    r'\\$([\\d.,]+)',         # Dollar sign: "$25.50" 
                    r'฿([\\d.,]+)',           # Thai Baht: "฿100.50"
                    r'Rp\\s*([\\d.,]+)',      # Indonesian Rupiah: "Rp 50000"
                    r'₱([\\d.,]+)',           # Philippine Peso: "₱500.00"
                    r'([\\d.,]+)\\s*(?:RM|SGD|USD|THB|IDR|PHP|MYR|CNY|EUR|VND)?' # Fallback: number followed by optional currency
                ]
                
                extracted_amount = None
                for pattern in currency_patterns:
                    match = re.search(pattern, value, re.IGNORECASE)
                    if match:
                        extracted_amount = match.group(1)
                        print(f"🔍 DEBUG: Pattern '{pattern}' matched: {repr(extracted_amount)}", file=sys.stderr)
                        break
                
                if not extracted_amount:
                    # Fallback: clean all non-numeric except dots and commas
                    clean_value = re.sub(r'[^\\d.,]', '', value)
                    extracted_amount = clean_value
                    print(f"🔍 DEBUG: Using fallback cleaning: {repr(extracted_amount)}", file=sys.stderr)
                
                if not extracted_amount:
                    print(f"🔍 DEBUG: No amount found in value: {repr(value)}", file=sys.stderr)
                    return None
                
                # Convert comma-separated thousands (European format) to dots
                # Handle formats like "1,234.56" (US) vs "1.234,56" (European)
                if ',' in extracted_amount and '.' in extracted_amount:
                    # Check if comma comes after dot -> European format "1.234,56"
                    comma_pos = extracted_amount.rfind(',')
                    dot_pos = extracted_amount.rfind('.')
                    if comma_pos > dot_pos:
                        # European format: "1.234,56" -> "1234.56"
                        extracted_amount = extracted_amount.replace('.', '').replace(',', '.')
                    else:
                        # US format: "1,234.56" -> "1234.56" 
                        extracted_amount = extracted_amount.replace(',', '')
                elif ',' in extracted_amount:
                    # Only commas - could be thousands separator or decimal
                    # If more than 3 digits after comma, it's thousands separator
                    parts = extracted_amount.split(',')
                    if len(parts) == 2 and len(parts[1]) <= 2:
                        # Decimal comma: "91,23" -> "91.23"
                        extracted_amount = extracted_amount.replace(',', '.')
                    else:
                        # Thousands separator: "1,234" -> "1234"
                        extracted_amount = extracted_amount.replace(',', '')
                
                final_float = float(extracted_amount)
                print(f"🔍 DEBUG: Successfully parsed to float: {final_float}", file=sys.stderr)
                return final_float
                
            return float(value)
        except (ValueError, TypeError) as e:
            print(f"🔍 DEBUG: _parse_float failed for {repr(value)}: {e}", file=sys.stderr)
            return None
    
    def _normalize_quality(self, quality_str: str) -> str:
        quality_lower = quality_str.lower().strip()
        if quality_lower in ['high', 'medium', 'low']:
            return quality_lower
        return 'medium'
    
    def _generate_suggestions(self, data: ExtractedReceiptData) -> list:
        suggestions = []
        
        if data.confidence_score < 0.5:
            suggestions.append("Low confidence extraction - please review all fields")
        
        if not data.line_items:
            suggestions.append("No line items detected - consider manual entry")
        
        if not data.tax_amount and data.total_amount > 10:
            suggestions.append("No tax detected - verify if tax is included")
        
        return suggestions

# Smart categorization helper function with business categories priority
def _categorize_expense(vendor_name: str, line_items: List, business_categories: List[Dict] = None) -> str:
    """Categorize expense based on business categories first, then fallback to generic patterns"""
    vendor_lower = vendor_name.lower()

    # Priority 1: Use business-specific categories if available
    if business_categories:
        print(f"🎯 Checking {len(business_categories)} business categories for vendor: {vendor_name}", file=sys.stderr)

        for category in business_categories:
            # Check vendor patterns first (more specific)
            if category.get('vendor_patterns'):
                for pattern in category['vendor_patterns']:
                    if pattern.lower() in vendor_lower:
                        print(f"✅ Matched vendor pattern '{pattern}' -> {category['name']} ({category['code']})", file=sys.stderr)
                        return category['code']

            # Check AI keywords
            if category.get('ai_keywords'):
                for keyword in category['ai_keywords']:
                    if keyword.lower() in vendor_lower:
                        print(f"✅ Matched AI keyword '{keyword}' -> {category['name']} ({category['code']})", file=sys.stderr)
                        return category['code']

        print(f"🔍 No business category match found for '{vendor_name}', using fallback", file=sys.stderr)

    # Priority 2: Fallback to generic categorization patterns with business category codes
    # Check line items for food-related content
    line_items_text = ' '.join([item.description.lower() if hasattr(item, 'description') and item.description else '' for item in line_items])
    has_food_items = any(word in line_items_text for word in ['tea', 'rice', 'chicken', 'pork', 'seafood', 'soup', 'noodle', 'meal', 'food', 'dining'])

    # Food & Restaurant patterns - use business category code
    food_keywords = ['restaurant', 'cafe', 'coffee', 'mcdonald', 'kfc', 'starbucks', 'pizza',
                     'food', 'dinner', 'lunch', 'breakfast', 'kitchen', 'cuisine', 'bar',
                     'mansion', 'seafood', 'chicken', 'rice', 'noodle', 'tea', 'dining']

    # Transportation patterns
    transport_keywords = ['grab', 'taxi', 'uber', 'bus', 'train', 'mrt', 'lrt', 'parking',
                         'toll', 'fuel', 'petrol', 'gas', 'shell', 'esso', 'caltex']

    # Office supplies patterns
    office_keywords = ['office', 'supplies', 'stationery', 'paper', 'pen', 'printer',
                      'computer', 'laptop', 'software', '7-eleven', 'guardian', 'watson']

    # Accommodation patterns
    accommodation_keywords = ['hotel', 'accommodation', 'lodging', 'inn', 'resort', 'airbnb']

    # Categorization logic using business categories
    # Try to match vendor/items to business category keywords, otherwise use generic fallback
    if business_categories:
        # Try to find a matching business category for the expense type
        if any(keyword in vendor_lower for keyword in food_keywords) or has_food_items:
            # Look for food/entertainment categories first
            for category in business_categories:
                keywords = (category.get('ai_keywords', []) + category.get('vendor_patterns', []))
                if any('food' in kw.lower() or 'meal' in kw.lower() or 'restaurant' in kw.lower() or 'entertainment' in kw.lower() for kw in keywords):
                    print(f"✅ Matched business category for food/entertainment: {category['name']} ({category['code']})", file=sys.stderr)
                    return category['code']

        elif any(keyword in vendor_lower for keyword in transport_keywords):
            # Look for transport/petrol categories
            for category in business_categories:
                keywords = (category.get('ai_keywords', []) + category.get('vendor_patterns', []))
                if any('transport' in kw.lower() or 'petrol' in kw.lower() or 'fuel' in kw.lower() or 'travel' in kw.lower() for kw in keywords):
                    print(f"✅ Matched business category for transport: {category['name']} ({category['code']})", file=sys.stderr)
                    return category['code']

        elif any(keyword in vendor_lower for keyword in accommodation_keywords):
            # Look for accommodation/travel categories
            for category in business_categories:
                keywords = (category.get('ai_keywords', []) + category.get('vendor_patterns', []))
                if any('accommodation' in kw.lower() or 'hotel' in kw.lower() or 'travel' in kw.lower() for kw in keywords):
                    print(f"✅ Matched business category for accommodation: {category['name']} ({category['code']})", file=sys.stderr)
                    return category['code']

        # If no specific match, return the first available business category
        if business_categories:
            fallback_category = business_categories[0]
            print(f"🎯 Using fallback business category: {fallback_category['name']} ({fallback_category['code']})", file=sys.stderr)
            return fallback_category['code']

    # Ultimate fallback if no business categories available
    return 'other'

# Smart business purpose generator
def _generate_business_purpose(vendor_name: str, category: str, line_items: List) -> str:
    """Generate appropriate business purpose based on expense details"""

    category_purposes = {
        'entertainment': f"Business meal/entertainment at {vendor_name}",
        'transport': f"Business transportation expense - {vendor_name}",
        'accommodation': f"Business accommodation at {vendor_name}",
        'office_supplies': f"Office supplies purchase from {vendor_name}",
        'other': f"Business expense at {vendor_name}"
    }

    base_purpose = category_purposes.get(category, f"Business expense at {vendor_name}")

    # Add context from line items for entertainment
    if category == 'entertainment' and line_items:
        item_count = len(line_items)
        if item_count > 3:
            base_purpose += f" - group dining ({item_count} items)"
        elif any('tea' in (item.description.lower() if hasattr(item, 'description') and item.description else '') for item in line_items):
            base_purpose += " - business meeting with refreshments"

    return base_purpose

# Legacy function - now redirects to multi-stage processing
def extract_receipt_data(receipt_text: str, image_metadata: Dict[str, Any] = None, forced_method: str = None, business_categories: List[Dict] = None) -> dict:
    """Legacy function - redirects to new multi-stage system"""
    print("⚠️ Legacy extract_receipt_data called, redirecting to multi-stage system", file=sys.stderr)
    return run_multi_stage_receipt_processing(receipt_text, business_categories or [])
        
def run_multi_stage_receipt_processing(receipt_text, business_categories):
    """Run the comprehensive multi-stage receipt processing system"""
    start_time = datetime.now()

    if not receipt_text.strip():
        return {
            "success": False,
            "error": "No receipt text provided for DSPy processing"
        }

    print(f"Processing receipt text: {len(receipt_text)} characters", file=sys.stderr)

    # Multi-Stage Processing: Gemini Primary + vLLM Fallback
    print("🏆 Starting Tier 2: Comprehensive Multi-Stage Receipt Processing", file=sys.stderr)

    gemini_result = None
    vllm_result = None
    gemini_error_details = None
    vllm_error_details = None

    # Stage 1: Try Gemini DSPy (Primary)
    print("🥇 Stage 1: Gemini Primary DSPy Processing", file=sys.stderr)
    try:
            gemini_extractor = DSPyReceiptExtractor()

            # Configure Gemini LM for receipt processing
            api_key = os.getenv('GEMINI_API_KEY')
            if not api_key:
                raise ValueError("GEMINI_API_KEY not found in environment")

            gemini_lm = GeminiLanguageModel(model="gemini-2.5-flash", api_key=api_key)

            with dspy.context(lm=gemini_lm):
                print("📞 Calling Gemini DSPy for receipt extraction...", file=sys.stderr)
                gemini_result = gemini_extractor.forward(receipt_text=receipt_text)

                if gemini_result and hasattr(gemini_result, 'extracted_data'):
                    gemini_result.extracted_data.backend_used = 'gemini_dspy'
                    gemini_result.extracted_data.model_used = 'gemini-2.5-flash'
                    print("✅ Gemini DSPy extraction completed successfully", file=sys.stderr)
                else:
                    raise ValueError("Gemini returned invalid result structure")

        except Exception as gemini_error:
            gemini_error_details = {
                "error_type": type(gemini_error).__name__,
                "error_message": str(gemini_error),
                "stage": "gemini_dspy"
            }
            print(f"❌ Gemini DSPy failed: {gemini_error_details['error_type']}: {gemini_error_details['error_message']}", file=sys.stderr)
            gemini_result = None

        # Stage 2: vLLM Fallback (if Gemini failed or low confidence)
        vllm_endpoint = os.getenv('OCR_ENDPOINT_URL')
        should_try_vllm = False

        if not gemini_result:
            print("🔄 Gemini failed, triggering vLLM fallback", file=sys.stderr)
            should_try_vllm = True
        elif gemini_result and hasattr(gemini_result, 'extracted_data'):
            gemini_confidence = getattr(gemini_result.extracted_data, 'dspy_confidence', 0.0)
            if isinstance(gemini_confidence, str):
                try:
                    gemini_confidence = float(gemini_confidence)
                except:
                    gemini_confidence = 0.0

            if gemini_confidence < 0.75:
                print(f"🔄 Gemini confidence {gemini_confidence:.2f} < 0.75, triggering vLLM fallback", file=sys.stderr)
                should_try_vllm = True
            else:
                print(f"✅ Gemini confidence {gemini_confidence:.2f} >= 0.75, skipping vLLM", file=sys.stderr)

        if should_try_vllm and vllm_endpoint:
            print("🥈 Stage 2: vLLM Skywork Fallback Processing", file=sys.stderr)
            try:
                vllm_model = os.getenv('OCR_MODEL_NAME', 'brandonbeiler/Skywork-R1V3-38B-FP8-Dynamic')
                print(f"🔧 Configuring vLLM: {vllm_endpoint}, model: {vllm_model}", file=sys.stderr)

                skywork_lm = dspy.LM(
                    model=f"openai/{vllm_model}",
                    api_base=vllm_endpoint,
                    api_key="dummy-key"
                )

                vllm_extractor = DSPyReceiptExtractor()

                with dspy.context(lm=skywork_lm):
                    print("📞 Calling vLLM Skywork DSPy for receipt extraction...", file=sys.stderr)
                    vllm_result = vllm_extractor.forward(receipt_text=receipt_text)

                    if vllm_result and hasattr(vllm_result, 'extracted_data'):
                        vllm_result.extracted_data.backend_used = 'vllm_dspy'
                        vllm_result.extracted_data.model_used = vllm_model
                        print("✅ vLLM DSPy extraction completed successfully", file=sys.stderr)
                    else:
                        raise ValueError("vLLM returned invalid result structure")

            except Exception as vllm_error:
                vllm_error_details = {
                    "error_type": type(vllm_error).__name__,
                    "error_message": str(vllm_error),
                    "stage": "vllm_dspy"
                }
                print(f"❌ vLLM DSPy failed: {vllm_error_details['error_type']}: {vllm_error_details['error_message']}", file=sys.stderr)
                vllm_result = None
        elif not vllm_endpoint:
            vllm_error_details = "No vLLM endpoint configured (OCR_ENDPOINT_URL not set)"

        # Stage 3: Smart Selection with Quality Scoring
        print("🎯 Stage 3: Smart Selection with Quality Scoring", file=sys.stderr)

        def score_receipt_quality(result_data):
            """Score receipt extraction quality"""
            if not result_data or not hasattr(result_data, 'extracted_data'):
                return 0

            data = result_data.extracted_data
            score = 0

            # Core fields (40 points)
            if getattr(data, 'vendor_name', '') and getattr(data, 'vendor_name', '') != 'Unknown':
                score += 15
            if getattr(data, 'total_amount', 0) > 0:
                score += 15
            if getattr(data, 'transaction_date', '') and len(getattr(data, 'transaction_date', '')) >= 8:
                score += 10

            # DSPy confidence (30 points)
            dspy_conf = getattr(data, 'dspy_confidence', 0.0)
            if isinstance(dspy_conf, str):
                try:
                    dspy_conf = float(dspy_conf)
                except:
                    dspy_conf = 0.0
            score += int(dspy_conf * 30)

            # Overall confidence (20 points)
            overall_conf = getattr(data, 'confidence_score', 0.0)
            if isinstance(overall_conf, str):
                try:
                    overall_conf = float(overall_conf)
                except:
                    overall_conf = 0.0
            score += int(overall_conf * 20)

            # Missing fields penalty (10 points)
            missing = len(getattr(data, 'missing_fields', []))
            score += max(0, 10 - missing * 2)

            return min(score, 100)

        gemini_score = score_receipt_quality(gemini_result) if gemini_result else 0
        vllm_score = score_receipt_quality(vllm_result) if vllm_result else 0

        print(f"🏆 Quality scores: Gemini={gemini_score}, vLLM={vllm_score}", file=sys.stderr)

        # Select best result
        if not gemini_result and not vllm_result:
            error_details = {
                'gemini_error': gemini_error_details,
                'vllm_error': vllm_error_details
            }
            raise RuntimeError(f"Both Gemini and vLLM processing failed: {error_details}")

        # Use Gemini if significantly better or vLLM unavailable
        if gemini_score > vllm_score and gemini_result:
            print(f"✅ Using Gemini result (better quality score: {gemini_score})", file=sys.stderr)
            result = gemini_result
        elif vllm_score > gemini_score and vllm_result:
            print(f"✅ Using vLLM result (better quality score: {vllm_score})", file=sys.stderr)
            result = vllm_result
        elif gemini_result:
            print(f"✅ Using Gemini result (fallback, score: {gemini_score})", file=sys.stderr)
            result = gemini_result
        elif vllm_result:
            print(f"✅ Using vLLM result (fallback, score: {vllm_score})", file=sys.stderr)
            result = vllm_result
    else:
        raise RuntimeError("No valid results from either backend")

    processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

    extracted_data = result.extracted_data

    # Return the result in the expected format
    return {
        "success": True,
        "data": extracted_data.dict() if hasattr(extracted_data, 'dict') else extracted_data,
        "processing_time_ms": processing_time,
        "confidence_score": getattr(extracted_data, 'confidence_score', 0.8),
        "backend_used": getattr(extracted_data, 'backend_used', 'unknown')
    }
        
        print(f"✅ DSPy extraction completed successfully", file=sys.stderr)
        print(f"🏪 Vendor: {extracted_data.vendor_name}", file=sys.stderr)
        print(f"💰 Amount: {extracted_data.total_amount} {extracted_data.currency}", file=sys.stderr)
        print(f"🗓️ Date: {extracted_data.transaction_date}", file=sys.stderr)
        print(f"🎯 Confidence: {extracted_data.confidence_score * 100:.1f}%", file=sys.stderr)
        print(f"⚡ Processing time: {processing_time}ms", file=sys.stderr)
        
        # Use LLM-selected category from DSPy extraction
        suggested_category = None
        if extracted_data.selected_category and business_categories:
            # Find the category_code from the selected category_name
            for category in business_categories:
                if category['name'] == extracted_data.selected_category:
                    suggested_category = category['code']
                    print(f"✅ Matched LLM-selected category '{extracted_data.selected_category}' to code: {suggested_category}", file=sys.stderr)
                    break

            if not suggested_category:
                print(f"⚠️ LLM selected category '{extracted_data.selected_category}' not found in business categories, using fallback", file=sys.stderr)
                # Fallback: use first business category or 'other'
                suggested_category = business_categories[0]['code'] if business_categories else 'other'
        else:
            # Fallback if no LLM selection or no business categories
            print("🔄 No LLM category selection, using fallback logic", file=sys.stderr)
            suggested_category = _categorize_expense(extracted_data.vendor_name, extracted_data.line_items, business_categories)

        # Generate smart business purpose
        business_purpose = _generate_business_purpose(extracted_data.vendor_name, suggested_category, extracted_data.line_items)

        # Convert to JSON-serializable format
        output_data = {
            "success": True,
            "vendor_name": extracted_data.vendor_name,
            "total_amount": extracted_data.total_amount,
            "currency": extracted_data.currency,
            "transaction_date": extracted_data.transaction_date,
            "description": f"{extracted_data.vendor_name} - {extracted_data.transaction_date}",
            "suggested_category": suggested_category,
            "business_purpose": business_purpose,
            "line_items": [
                {
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "total_amount": item.line_total
                }
                for item in extracted_data.line_items
            ],
            "tax_amount": extracted_data.tax_amount,
            "tax_rate": None,  # Calculate from tax_amount/subtotal if needed
            "receipt_number": extracted_data.receipt_number,
            "confidence_score": extracted_data.confidence_score,
            "extraction_method": "dspy",
            "processing_tier": 1,
            "requires_validation": result.needs_manual_review,
            "missing_fields": extracted_data.missing_fields,
            "processing_time_ms": processing_time,
            "extraction_quality": extracted_data.extraction_quality,
            "reasoning_steps": {
                "step1_vendor_analysis": result.thinking.step1_vendor_analysis,
                "step2_date_identification": result.thinking.step2_date_identification,
                "step3_amount_parsing": result.thinking.step3_amount_parsing,
                "step4_tax_calculation": result.thinking.step4_tax_calculation,
                "step5_line_items_extraction": result.thinking.step5_line_items_extraction,
                "step6_validation_checks": result.thinking.step6_validation_checks,
                "final_confidence_assessment": result.thinking.final_confidence_assessment
            },
            "suggested_corrections": result.suggested_corrections
        }
        
        return output_data
        
    except Exception as e:
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        print(f"❌ DSPy extraction failed: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        
        return {
            "success": False,
            "error": str(e),
            "extraction_method": "dspy",
            "processing_time_ms": processing_time
        }

# Main execution function with robust error handling and stdout protection
def main():
    # All logging goes to stderr - stdout is ONLY for final JSON result
    print("🚀 Starting DSPy receipt extraction", file=sys.stderr)
    
    try:
        # Extract input parameters with comprehensive logging
        receipt_text = ${JSON.stringify((payload.receiptText || '').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/"/g, '\\"'))}
        receipt_image_data = ${payload.receiptImageData ? JSON.stringify(payload.receiptImageData) : 'None'}
        
        image_metadata = {
            'confidence': ${payload.imageMetadata?.confidence || 0.7},
            'quality': ${JSON.stringify(payload.imageMetadata?.quality || 'acceptable')},
        }
        
        forced_method = ${JSON.stringify(payload.forcedProcessingMethod || 'auto')}
        if forced_method == "auto":
            forced_method = None

        # Business categories for enhanced categorization
        business_categories = ${JSON.stringify(businessCategories)}
        print(f"🏢 Received {len(business_categories)} business categories from Node.js", file=sys.stderr)
        
        # Handle image-only uploads: Add OCR preprocessing before multi-stage processing
        if not receipt_text and receipt_image_data:
            print("🖼️ No text provided, performing OCR with DSPy+Gemini multimodal...", file=sys.stderr)
            
            # Use Gemini 2.5 Flash multimodal capabilities for OCR
            import base64
            
            try:
                # Configure Gemini for OCR extraction
                api_key = os.getenv('GEMINI_API_KEY')
                if not api_key:
                    raise ValueError("GEMINI_API_KEY environment variable not found for OCR")
                
                import google.generativeai as genai
                genai.configure(api_key=api_key)
                
                # Use Gemini 2.5 Flash for multimodal OCR
                model = genai.GenerativeModel('gemini-2.5-flash')
                
                # Prepare image data for Gemini
                image_bytes = base64.b64decode(receipt_image_data['base64'])
                
                # Create the image part for Gemini  
                import io
                try:
                    from PIL import Image
                except ImportError:
                    print("❌ PIL (Pillow) not available, using image bytes directly", file=sys.stderr)
                    # Fallback: pass raw bytes to Gemini
                    image = {"mime_type": receipt_image_data['mimeType'], "data": receipt_image_data['base64']}
                else:
                    image = Image.open(io.BytesIO(image_bytes))
                
                # OCR prompt for Gemini
                ocr_prompt = """Extract ALL text from this receipt image exactly as it appears. 
Include all numbers, dates, merchant names, addresses, item descriptions, and amounts.
Preserve the layout and formatting as much as possible.
Return only the extracted text without any analysis or interpretation."""
                
                print("🤖 Calling Gemini 2.5 Flash for OCR extraction...", file=sys.stderr)

                # Enhanced debugging and timeout handling
                import time
                import threading
                from datetime import datetime

                max_retries = 2
                attempt_timeout = 60  # 1 minute per attempt

                def timeout_monitor(attempt_num, start_time):
                    """Monitor timeout progress"""
                    checkpoints = [10, 20, 30, 45, 55]  # Seconds to report progress
                    for checkpoint in checkpoints:
                        time.sleep(checkpoint - (checkpoints[checkpoints.index(checkpoint)-1] if checkpoint != checkpoints[0] else 0))
                        elapsed = time.time() - start_time
                        print(f"⏱️ OCR attempt {attempt_num}: {elapsed:.1f}s elapsed (still processing...)", file=sys.stderr)

                for attempt in range(max_retries + 1):
                    attempt_start = time.time()
                    try:
                        print(f"🔄 OCR attempt {attempt + 1}/{max_retries + 1} started at {datetime.now().strftime('%H:%M:%S')}", file=sys.stderr)
                        print(f"📊 Image size: {len(image_bytes) / 1024:.1f} KB", file=sys.stderr)

                        # Start timeout monitor in background
                        monitor_thread = threading.Thread(target=timeout_monitor, args=(attempt + 1, attempt_start))
                        monitor_thread.daemon = True
                        monitor_thread.start()

                        # Call Gemini with enhanced config for reliability
                        response = model.generate_content(
                            [ocr_prompt, image],
                            generation_config={
                                'max_output_tokens': 2000,
                                'temperature': 0.1,
                                'candidate_count': 1
                            }
                        )

                        attempt_time = time.time() - attempt_start
                        print(f"✅ OCR attempt {attempt + 1} succeeded in {attempt_time:.1f}s", file=sys.stderr)
                        break

                    except Exception as retry_error:
                        attempt_time = time.time() - attempt_start
                        error_type = type(retry_error).__name__

                        print(f"❌ OCR attempt {attempt + 1} failed after {attempt_time:.1f}s: {error_type}", file=sys.stderr)
                        print(f"🔍 Error details: {str(retry_error)[:200]}...", file=sys.stderr)

                        # Check error type for specific handling
                        if 'timeout' in str(retry_error).lower():
                            print(f"⏰ Timeout detected on attempt {attempt + 1}", file=sys.stderr)
                        elif 'quota' in str(retry_error).lower() or 'limit' in str(retry_error).lower():
                            print(f"🚫 Quota/rate limit hit on attempt {attempt + 1}", file=sys.stderr)
                        elif 'network' in str(retry_error).lower() or 'connection' in str(retry_error).lower():
                            print(f"🌐 Network issue detected on attempt {attempt + 1}", file=sys.stderr)

                        if attempt < max_retries:
                            wait_time = (attempt + 1) * 3  # 3, 6 seconds
                            print(f"⏳ Retrying in {wait_time} seconds...", file=sys.stderr)
                            time.sleep(wait_time)
                        else:
                            print(f"🚨 All OCR attempts failed, raising final error", file=sys.stderr)
                            raise retry_error
                
                if response.text:
                    receipt_text = response.text.strip()
                    print(f"✅ OCR completed: extracted {len(receipt_text)} characters", file=sys.stderr)
                    print(f"📝 First 200 chars: {receipt_text[:200]}...", file=sys.stderr)
                else:
                    raise ValueError("Gemini OCR returned empty response")
                    
            except Exception as ocr_error:
                print(f"❌ OCR extraction failed: {str(ocr_error)}", file=sys.stderr)
                raise ValueError(f"Failed to extract text from image: {str(ocr_error)}")
        elif not receipt_text:
            raise ValueError("No receipt text or image data provided for processing")
            
        print(f"📝 Receipt text length: {len(receipt_text)} chars", file=sys.stderr)
        print(f"🖼️ Image metadata: {json.dumps(image_metadata)}", file=sys.stderr)
        print(f"🔧 Forced method: {forced_method}", file=sys.stderr)
        
        # Validate inputs
        if not receipt_text.strip():
            response = ScriptResponse(
                success=False,
                error="No receipt text provided for DSPy processing",
                debug_info={"input_length": len(receipt_text)}
            )
        else:
            # CRITICAL: Redirect stdout during DSPy processing to prevent pollution
            print("🔍 Starting DSPy extraction with stdout protection...", file=sys.stderr)
            
            import io
            from contextlib import redirect_stdout
            
            # Capture any stdout pollution from DSPy/dependencies
            dummy_stdout = io.StringIO()
            
            with redirect_stdout(dummy_stdout):
                print("🛡️ DSPy processing protected from stdout pollution", file=sys.stderr)
                # Use new multi-stage processing system
                extraction_result = run_multi_stage_receipt_processing(receipt_text, business_categories)
                
            # Check what was captured (for debugging)
            captured_output = dummy_stdout.getvalue()
            if captured_output.strip():
                print(f"🚨 Captured stdout pollution ({len(captured_output)} chars): {captured_output[:200]}...", file=sys.stderr)
            else:
                print("✅ No stdout pollution detected", file=sys.stderr)
            
            print(f"✅ Extraction completed: {extraction_result.get('success', False)}", file=sys.stderr)
            
            if extraction_result.get('success', False):
                response = ScriptResponse(
                    success=True,
                    data=extraction_result,
                    debug_info={
                        "processing_time_ms": extraction_result.get('processing_time_ms', 0),
                        "confidence_score": extraction_result.get('confidence_score', 0.0),
                        "stdout_pollution_length": len(captured_output)
                    }
                )
            else:
                response = ScriptResponse(
                    success=False,
                    error=extraction_result.get('error', 'Unknown extraction error'),
                    debug_info=extraction_result
                )
                
    except Exception as e:
        # Catch any unexpected errors in main execution
        print(f"❌ Critical error in main(): {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        response = ScriptResponse(
            success=False,
            error=f"Critical execution error: {str(e)}",
            debug_info={"error_type": type(e).__name__}
        )
    
    # CRITICAL: Only this line outputs to stdout - everything else goes to stderr
    print(response.model_dump_json())

# Execute the main function
if __name__ == "__main__":
    main()
else:
    # This handles the inline execution context
    main()
`);
      
      // Note: Dependencies should be handled in requirements.txt or trigger.config.ts

      // Step 2: Parse the result from Python output
      console.log("🐍 DSPy extraction completed");
      console.log("Raw Python result:", result);
      
      // Parse the ScriptResponse structure from Python
      let scriptResponse;
      
      console.log("🔍 Raw Python result type:", typeof result);
      console.log("🔍 Raw Python result length:", result ? JSON.stringify(result).length : 0);
      console.log("🔍 Raw Python result (first 500 chars):", JSON.stringify(result).substring(0, 500));
      
      try {
        // IMPORTANT: python.runInline() returns an object with stdout/stderr properties
        // The actual JSON response is in the 'stdout' field
        console.log("📝 Parsing python.runInline() result structure");
        
        let jsonString: string;
        if (typeof result === 'string') {
          console.log("📝 Result is string, using directly");
          jsonString = result;
        } else if (result && typeof result === 'object' && 'stdout' in result) {
          console.log("📝 Result has stdout property, extracting from stdout");
          jsonString = (result as any).stdout;
        } else {
          console.log("📝 Result is object without stdout, stringifying");
          jsonString = JSON.stringify(result);
        }
        
        console.log("📝 JSON string to parse:", jsonString.substring(0, 200) + '...');
        scriptResponse = JSON.parse(jsonString);
        
        console.log("✅ Parsed script response structure:", {
          success: scriptResponse?.success,
          hasData: !!scriptResponse?.data,
          hasError: !!scriptResponse?.error,
          hasDebugInfo: !!scriptResponse?.debug_info
        });
      } catch (parseError) {
        // CRITICAL: Log the exact raw output that failed to parse
        console.error("❌ CRITICAL: Failed to parse Python script output");
        console.error("❌ Parse Error:", parseError);
        console.error("❌ Raw result type:", typeof result);
        console.error("❌ Raw result structure:", result && typeof result === 'object' ? Object.keys(result) : 'not object');
        console.error("❌ Raw result length:", result ? String(result).length : 0);
        console.error("❌ FULL Raw result that failed to parse:");
        console.error("================== RAW OUTPUT START ==================");
        console.error(result);
        console.error("================== RAW OUTPUT END ====================");
        throw new Error(`DSPy extraction failed: Malformed response from Python script. Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
      }
      
      // Check if the script executed successfully
      if (!scriptResponse || !scriptResponse.success) {
        const errorMessage = scriptResponse?.error || 'Unknown Python execution error';
        console.error("❌ Python script failed:", errorMessage);
        console.error("❌ Full script response:", JSON.stringify(scriptResponse, null, 2));
        console.error("❌ Debug info:", scriptResponse?.debug_info);
        throw new Error(`DSPy extraction failed: ${errorMessage}`);
      }
      
      // Extract the actual extraction result from the data field
      const extractionResult = scriptResponse.data;
      if (!extractionResult) {
        throw new Error('DSPy extraction succeeded but returned no data');
      }

      console.log(`✅ DSPy extraction successful`);
      console.log(`📊 Confidence: ${(extractionResult.confidence_score * 100).toFixed(1)}%`);
      console.log(`🏪 Vendor: ${extractionResult.vendor_name}`);
      console.log(`💰 Amount: ${extractionResult.total_amount} ${extractionResult.currency}`);

      // Step 3: Update document if documentId provided
      if (payload.documentId) {
        console.log(`💾 Updating document ${payload.documentId} with DSPy results`);
        
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            processing_status: extractionResult.requires_validation ? 
              'requires_validation' : 'completed',
            confidence_score: extractionResult.confidence_score,
            extracted_data: extractionResult,
            processing_metadata: {
              task_id: payload.requestId, // Use requestId as task identifier
              extraction_method: 'dspy',
              confidence_score: extractionResult.confidence_score,
              extracted_data: extractionResult,
              processing_time_ms: extractionResult.processing_time_ms,
              processing_tier: 1,
              extracted_at: new Date().toISOString()
            },
            ocr_metadata: {
              extraction_method: 'dspy',
              confidence_score: extractionResult.confidence_score,
              extracted_data: extractionResult,
              processing_time_ms: extractionResult.processing_time_ms,
              processing_tier: 1,
              extracted_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.documentId);

        if (updateError) {
          console.error('Failed to update document:', updateError);
          throw new Error(`Failed to update document: ${updateError.message}`);
        }

        console.log(`✅ Document ${payload.documentId} updated successfully`);
      }

      // Step 4: Update expense claim and linked transaction if expenseClaimId provided
      if (payload.expenseClaimId) {
        console.log(`💰 Updating expense claim ${payload.expenseClaimId} with DSPy results`);

        // First, get the expense claim and its linked transaction_id
        console.log(`🔍 Attempting to fetch expense claim from Supabase...`);

        let expenseClaim: any;

        try {
          const { data: fetchedExpenseClaim, error: fetchError } = await supabase
            .from('expense_claims')
            .select('id, transaction_id, business_id')
            .eq('id', payload.expenseClaimId)
            .single();

          if (fetchError) {
            console.error('Supabase query error details:', {
              message: fetchError.message,
              details: fetchError.details,
              hint: fetchError.hint,
              code: fetchError.code
            });
            throw new Error(`Supabase query failed: ${fetchError.message}`);
          }

          if (!fetchedExpenseClaim) {
            throw new Error(`Expense claim not found: ${payload.expenseClaimId}`);
          }

          expenseClaim = fetchedExpenseClaim;
          console.log(`✅ Successfully fetched expense claim: ${expenseClaim.id}`);
        } catch (networkError) {
          console.error('Network/connection error when accessing Supabase:', {
            message: networkError instanceof Error ? networkError.message : String(networkError),
            stack: networkError instanceof Error ? networkError.stack : undefined,
            type: typeof networkError
          });

          // Re-throw with more context
          throw new Error(`Failed to connect to database: ${networkError instanceof Error ? networkError.message : 'Unknown network error'}`);
        }

        // Use the category determined by DSPy with business categories context
        const autoCategory = extractionResult.suggested_category || 'other';
        console.log(`🎯 Using DSPy-determined category: ${autoCategory}`);

        // Update the linked transaction (financial data per Otto's guidance)
        if (expenseClaim.transaction_id) {
          console.log(`💳 Updating transaction ${expenseClaim.transaction_id} with financial data`);

          // Get user's home currency preference
          let userHomeCurrency = 'SGD'; // Default
          try {
            const { data: userProfile } = await supabase
              .from('users')
              .select('home_currency')
              .eq('id', payload.userId)
              .single();

            if (userProfile?.home_currency) {
              userHomeCurrency = userProfile.home_currency;
              console.log(`👤 User home currency: ${userHomeCurrency}`);
            }
          } catch (error) {
            console.log(`⚠️ Could not get user home currency, using default: ${userHomeCurrency}`);
          }

          // Prepare transaction update data
          const transactionUpdateData: any = {
            description: extractionResult.description,
            original_amount: extractionResult.total_amount,
            original_currency: extractionResult.currency,
            home_currency: userHomeCurrency,
            transaction_date: extractionResult.transaction_date,
            vendor_name: extractionResult.vendor_name,
            reference_number: extractionResult.receipt_number || null,
            updated_at: new Date().toISOString()
          };

          // Calculate home currency amount if currencies are different
          if (extractionResult.currency !== userHomeCurrency) {
            console.log(`💱 Converting ${extractionResult.total_amount} ${extractionResult.currency} to ${userHomeCurrency}`);

            try {
              // Call currency conversion API
              const conversionResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3005'}/api/currency/convert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  amount: extractionResult.total_amount,
                  from_currency: extractionResult.currency,
                  to_currency: userHomeCurrency
                })
              });

              if (conversionResponse.ok) {
                const conversionResult = await conversionResponse.json();
                if (conversionResult.success && conversionResult.data) {
                  transactionUpdateData.home_currency_amount = conversionResult.data.conversion.converted_amount;
                  transactionUpdateData.exchange_rate = conversionResult.data.conversion.exchange_rate;
                  console.log(`✅ Converted to ${conversionResult.data.conversion.converted_amount} ${userHomeCurrency} (rate: ${conversionResult.data.conversion.exchange_rate})`);
                }
              } else {
                console.log(`⚠️ Currency conversion failed, setting home currency amount same as original`);
                transactionUpdateData.home_currency_amount = extractionResult.total_amount;
              }
            } catch (conversionError) {
              console.log(`⚠️ Currency conversion error: ${conversionError}, setting home currency amount same as original`);
              transactionUpdateData.home_currency_amount = extractionResult.total_amount;
            }
          } else {
            // Same currency - just copy the amount
            transactionUpdateData.home_currency_amount = extractionResult.total_amount;
            console.log(`💰 Same currency (${extractionResult.currency}), no conversion needed`);
          }

          const { error: transactionUpdateError } = await supabase
            .from('transactions')
            .update(transactionUpdateData)
            .eq('id', expenseClaim.transaction_id);

          if (transactionUpdateError) {
            console.error('Failed to update transaction:', transactionUpdateError);
            throw new Error(`Failed to update transaction: ${transactionUpdateError.message}`);
          }

          console.log(`✅ Transaction ${expenseClaim.transaction_id} updated successfully with currency conversion`);
        }

        // Update the expense claim (workflow data per Otto's guidance)
        const { error: expenseUpdateError } = await supabase
          .from('expense_claims')
          .update({
            processing_status: extractionResult.requires_validation ?
              'requires_validation' : 'completed',
            confidence_score: extractionResult.confidence_score,
            processed_at: new Date().toISOString(),
            error_message: null,
            failed_at: null,
            // Workflow fields only (not financial data - that's in transactions)
            business_purpose: extractionResult.business_purpose || `Business expense at ${extractionResult.vendor_name}`,
            expense_category: autoCategory
          })
          .eq('id', payload.expenseClaimId);

        if (expenseUpdateError) {
          console.error('Failed to update expense claim:', expenseUpdateError);
          throw new Error(`Failed to update expense claim: ${expenseUpdateError.message}`);
        }

        console.log(`✅ Expense claim ${payload.expenseClaimId} updated successfully with auto-category: ${autoCategory}`);
      }

      return {
        success: true,
        data: extractionResult,
        processing_method: 'dspy',
        confidence_score: extractionResult.confidence_score,
        requires_validation: extractionResult.requires_validation,
        document_id: payload.documentId,
        processing_time_ms: extractionResult.processing_time_ms
      };

    } catch (error) {
      console.error("❌ DSPy extraction task failed:", error);
      
      // Update document status to failed if documentId provided
      if (payload.documentId) {
        await supabase
          .from('documents')
          .update({
            processing_status: 'failed',
            error_message: error instanceof Error ? error.message : 'DSPy processing failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.documentId);
      }

      // Update expense claim status to failed if expenseClaimId provided
      if (payload.expenseClaimId) {
        await supabase
          .from('expense_claims')
          .update({
            processing_status: 'failed',
            error_message: error instanceof Error ? error.message : 'DSPy processing failed',
            failed_at: new Date().toISOString()
          })
          .eq('id', payload.expenseClaimId);
      }

      throw error;
    }
  },
});