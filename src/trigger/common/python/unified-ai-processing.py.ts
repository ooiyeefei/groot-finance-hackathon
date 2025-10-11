/**
 * Unified DSPy Processing for Southeast Asian Document OCR
 *
 * Consolidates schemas, signatures, and service functions into a single comprehensive file
 * Eliminates duplicate definitions and field name conflicts
 *
 * VERSION: 3.0.0 - Complete consolidation with consistent field names
 */

export const unifiedDspyScript = `
# =============================================================================
# REQUIRED IMPORTS
# =============================================================================

import dspy
import json
import os
import sys
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime
from PIL import Image

# =============================================================================
# ENUMS FOR STANDARDIZED CLASSIFICATIONS
# =============================================================================

class DocumentType(str, Enum):
    INVOICE = "invoice"
    RECEIPT = "receipt"
    PURCHASE_ORDER = "purchase_order"
    STATEMENT = "statement"
    BILL = "bill"
    CREDIT_NOTE = "credit_note"
    DELIVERY_NOTE = "delivery_note"
    QUOTATION = "quotation"
    TRANSPORT = "transport"
    UNKNOWN = "unknown"

class IndustryContext(str, Enum):
    ELECTRICAL = "electrical"
    FOOD_BEVERAGE = "food_beverage"
    RETAIL = "retail"
    SERVICES = "services"
    MANUFACTURING = "manufacturing"
    TRANSPORT = "transport"
    HEALTHCARE = "healthcare"
    GENERAL = "general"

class CurrencyCode(str, Enum):
    SGD = "SGD"  # Singapore Dollar
    USD = "USD"  # US Dollar
    EUR = "EUR"  # Euro
    GBP = "GBP"  # British Pound
    JPY = "JPY"  # Japanese Yen
    MYR = "MYR"  # Malaysian Ringgit
    THB = "THB"  # Thai Baht
    IDR = "IDR"  # Indonesian Rupiah
    PHP = "PHP"  # Philippine Peso
    VND = "VND"  # Vietnamese Dong
    CNY = "CNY"  # Chinese Yuan
    INR = "INR"  # Indian Rupee
    AUD = "AUD"  # Australian Dollar
    CAD = "CAD"  # Canadian Dollar
    CHF = "CHF"  # Swiss Franc
    HKD = "HKD"  # Hong Kong Dollar

# =============================================================================
# PYDANTIC MODELS FOR STRUCTURED OUTPUT
# =============================================================================

class ExtractedLineItem(BaseModel):
    """Individual line item with complete product/service details."""
    item_code: Optional[str] = Field(None, description="Item/product code, SKU, or vendor reference")
    description: str = Field(..., description="Item description or product name")
    quantity: Optional[float] = Field(None, description="Quantity ordered/supplied")
    unit_of_measure: Optional[str] = Field(None, description="Unit of measurement (pcs, kg, hours, etc.)")
    unit_price: Optional[float] = Field(None, description="Price per unit")
    line_total: float = Field(..., description="Total amount for this line")

class DocumentSummary(BaseModel):
    """High-level document metadata and key information."""

    # Document classification
    document_type: DocumentType = Field(..., description="Type of financial document")
    industry_context: IndustryContext = Field(..., description="Industry context for processing")

    # Vendor/supplier information
    vendor_name: str = Field(..., description="Company name from document header")
    vendor_address: Optional[str] = Field(None, description="Complete vendor business address")
    vendor_contact: Optional[str] = Field(None, description="Phone, fax, email, contact person, or reference contact. Can include patterns like 'Your PO Ref.: Leong-Evon', 'Contact: John Smith', 'Tel: +65-1234-5678', 'Email: sales@company.com'")
    vendor_tax_id: Optional[str] = Field(None, description="GST number, tax ID, or business registration")

    # Customer information
    customer_name: Optional[str] = Field(None, description="Bill-to company or customer name")
    customer_address: Optional[str] = Field(None, description="Bill-to or delivery address")
    customer_contact: Optional[str] = Field(None, description="Customer contact information")

    # Document identifiers - STANDARDIZED TO SINGLE FIELD
    document_number: Optional[str] = Field(None, description="Primary document identifier - can be Invoice No., Receipt No., PO Number, D/O Number, Reference No., or any vendor-specific document identifier. Extract the main document reference number regardless of its label. Examples: 'REF/2020-21/017', 'INV-2024-001', 'I-2506/1729', 'SLWL2412/02719', 'PO-123456'")

    # Dates - CONSISTENT FIELD NAME
    document_date: Optional[str] = Field(None, description="Document issue date converted to YYYY-MM-DD format. Extract from various patterns like '31/12/2024', '31-Dec-2024', 'December 31, 2024', or '2024-12-31'")
    due_date: Optional[str] = Field(None, description="Payment due date in YYYY-MM-DD format. Calculate by adding payment terms to document_date (e.g., if document_date is '2024-12-31' and payment_terms is '30 days', due_date should be '2025-01-30')")
    delivery_date: Optional[str] = Field(None, description="Delivery or service date in YYYY-MM-DD format")

    # Financial totals
    currency: CurrencyCode = Field(..., description="Currency code in ISO 4217 format. Analyze the document context including vendor location, customer location, and business addresses to determine the correct currency (e.g., INR for India, USD for US, SGD for Singapore). Do not assume generic '$' symbols - use geographic and contextual clues.")
    total_amount: float = Field(..., description="Final total amount")
    subtotal_amount: Optional[float] = Field(None, description="Subtotal before tax")
    tax_amount: Optional[float] = Field(None, description="Total tax amount")
    discount_amount: Optional[float] = Field(None, description="Total discount amount")

    # Payment information
    payment_terms: Optional[str] = Field(None, description="Payment terms (e.g., Net 30)")
    payment_method: Optional[str] = Field(None, description="Payment method information")
    bank_details: Optional[str] = Field(None, description="Bank account or payment details")

    # Quality indicators
    requires_validation: bool = Field(True, description="Whether manual review is recommended")

class CompleteDocumentExtraction(BaseModel):
    """Complete structured extraction result."""
    document_summary: DocumentSummary = Field(..., description="Document summary data")
    line_items: List[ExtractedLineItem] = Field(default_factory=list, description="Line items breakdown")
    extraction_notes: str = Field("", description="Processing notes or warnings")
    confidence: float = Field(..., description="DSPy confidence score between 0.0 and 1.0 for the extraction")

# =============================================================================
# DSPY SIGNATURES
# =============================================================================

class ExtractCompleteDocument(dspy.Signature):
    """
    Extract ALL visible information from this Southeast Asian business document image.

    Focus on completeness - capture document numbers, addresses, contact details, and all line items.
    Use structured Pydantic output for type safety and validation.

    CRITICAL for currency detection: Analyze the geographic context carefully:
    - India (addresses with cities like Mumbai, Delhi, Bengaluru, etc.) → INR
    - Singapore (addresses mentioning Singapore) → SGD
    - Malaysia (addresses with KL, Selangor, etc.) → MYR
    - Thailand (Thai text, Bangkok addresses) → THB
    - Indonesia (Jakarta, Surabaya addresses) → IDR
    - Philippines (Manila, Cebu addresses) → PHP
    - US (American addresses, states) → USD

    Do NOT assume '$' means SGD - use contextual clues from addresses and business locations.
    Provide confidence score for extraction quality.
    """
    document_image: dspy.Image = dspy.InputField(desc="Business document image to process")
    extracted_data: CompleteDocumentExtraction = dspy.OutputField(desc="Complete structured document data")
    confidence: float = dspy.OutputField(desc="Confidence score between 0.0 and 1.0 for the overall extraction quality")

# =============================================================================
# SOUTHEAST ASIAN BUSINESS CONTEXT
# =============================================================================

# Common vendor patterns across SEA region
COMMON_SEA_VENDORS = [
    # Singapore retail chains
    "7-ELEVEN", "NTUC FAIRPRICE", "GIANT", "COLD STORAGE", "SHENG SIONG",

    # Malaysia retail chains
    "TESCO", "AEON", "JAYA GROCER", "VILLAGE GROCER",

    # F&B chains across SEA
    "STARBUCKS", "MCDONALD'S", "KFC", "BURGER KING", "OLD TOWN WHITE COFFEE",
    "YA KUN KAYA TOAST", "TOAST BOX", "BREADTALK",

    # Transport services
    "GRAB", "GOJEK", "COMFORT DELGRO", "TRANS-CAB", "BLUE SKY TAXI",
]

# =============================================================================
# PROCESSING STRATEGY DETERMINATION
# =============================================================================

def determine_processing_strategy(document_text: str, document_type: str) -> str:
    """
    Determine the best processing strategy based on document characteristics.

    For reliability, always use single-stage processing which uses simple DSPy outputs
    that are less prone to parsing failures compared to complex Pydantic models.
    """
    return 'single_stage'  # Always use reliable single-stage processing

# =============================================================================
# SINGLE-STAGE PROCESSING PIPELINE
# =============================================================================

def process_document_single_stage(document_image, lm_client: dspy.LM, processing_options: dict = None):
    """
    Single-stage DSPy processing using Pydantic models for structured output.

    Args:
        document_image: PIL Image object from document
        lm_client: Configured DSPy language model client
        processing_options: Optional processing configurations

    Returns:
        Complete structured extraction result
    """
    if processing_options is None:
        processing_options = {}

    # Configure DSPy with JSONAdapter for structured output
    dspy.settings.configure(lm=lm_client, adapter=dspy.JSONAdapter())

    # Convert PIL Image to dspy.Image
    print(f"🖼️ Converting PIL Image to dspy.Image: {type(document_image)}", file=sys.stderr)
    try:
        dspy_image = dspy.Image.from_PIL(document_image)
        print(f"✅ Converted to dspy.Image: {type(dspy_image)}", file=sys.stderr)
    except Exception as conversion_error:
        print(f"❌ Failed to convert PIL Image to dspy.Image: {conversion_error}", file=sys.stderr)
        raise ValueError(f"Image conversion failed: {conversion_error}")

    # Try ChainOfThought approach for reasoning-based extraction
    try:
        print(f"🧠 Using ChainOfThought for structured extraction...", file=sys.stderr)

        extractor = dspy.ChainOfThought(ExtractCompleteDocument)
        result = extractor(document_image=dspy_image)

        print(f"✅ ChainOfThought extraction completed", file=sys.stderr)
        print(f"🔍 Result type: {type(result)}", file=sys.stderr)

        # Handle Pydantic structured output
        if result is None:
            raise ValueError("ChainOfThought returned None - LM communication issue")

        if hasattr(result, 'extracted_data'):
            print(f"✅ Found structured Pydantic data", file=sys.stderr)
            extracted_data = result.extracted_data
            doc_summary = extracted_data.document_summary
            line_items = extracted_data.line_items

            print(f"✅ Vendor: {doc_summary.vendor_name}", file=sys.stderr)
            print(f"✅ Amount: {doc_summary.total_amount} {doc_summary.currency}", file=sys.stderr)
            print(f"✅ Line items: {len(line_items)}", file=sys.stderr)

            # Get DSPy confidence score from the result
            dspy_confidence = None
            if hasattr(result, 'confidence'):
                dspy_confidence = result.confidence
                print(f"✅ DSPy confidence score: {dspy_confidence}", file=sys.stderr)
            else:
                print(f"⚠️ No DSPy confidence found in result", file=sys.stderr)

            # Return structured data with dynamic confidence values
            return {
                "success": True,

                # Core document information
                "vendor_name": doc_summary.vendor_name,
                "total_amount": doc_summary.total_amount,
                "currency": doc_summary.currency.value,
                "document_date": doc_summary.document_date,
                "document_type": doc_summary.document_type.value,
                "industry_context": doc_summary.industry_context.value,

                # Enhanced vendor information
                "vendor_address": doc_summary.vendor_address or '',
                "vendor_contact": doc_summary.vendor_contact or '',
                "vendor_tax_id": doc_summary.vendor_tax_id or '',

                # Customer information
                "customer_name": doc_summary.customer_name or '',
                "customer_address": doc_summary.customer_address or '',
                "customer_contact": doc_summary.customer_contact or '',

                # Document identifiers - STANDARDIZED SINGLE FIELD
                "document_number": doc_summary.document_number or '',

                # Additional dates
                "due_date": doc_summary.due_date or '',
                "delivery_date": doc_summary.delivery_date or '',

                # Financial details
                "subtotal_amount": doc_summary.subtotal_amount,
                "tax_amount": doc_summary.tax_amount,
                "discount_amount": doc_summary.discount_amount,

                # Payment information
                "payment_terms": doc_summary.payment_terms or '',
                "payment_method": doc_summary.payment_method or '',
                "bank_details": doc_summary.bank_details or '',

                # Line items as native list (properly structured)
                "line_items": [{
                    "item_code": item.item_code or '',
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit_of_measure": item.unit_of_measure,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total
                } for item in line_items],

                # Processing metadata
                "requires_validation": doc_summary.requires_validation,
                "extraction_method": "dspy_pydantic_structured",
                "dspy_confidence": dspy_confidence,  # DSPy confidence score from signature
                "complexity_score": 0.3
            }

        else:
            raise ValueError("Result missing extracted_data - unexpected structure")

    except Exception as extraction_error:
        print(f"❌ Extraction failed: {str(extraction_error)}", file=sys.stderr)

        # Return error result
        return {
            "success": False,
            "error": f"DSPy processing failed: {extraction_error}",
            "extraction_method": "dspy_failed"
        }

# =============================================================================
# MAIN UNIFIED PROCESSING FUNCTION
# =============================================================================

def process_document_with_dspy(document_image, lm_client: dspy.LM,
                              processing_strategy: str = "auto",
                              processing_options: dict = None):
    """
    Complete DSPy document processing with unified schema and processing.

    Args:
        document_image: PIL Image object
        lm_client: Configured DSPy language model client
        processing_strategy: Processing strategy (always uses single-stage)
        processing_options: Optional processing configurations

    Returns:
        Structured dict with extraction results
    """

    if document_image is None:
        raise ValueError("Document image cannot be empty")

    if processing_options is None:
        processing_options = {}

    # Use single-stage processing for reliability
    return process_document_single_stage(document_image, lm_client, processing_options)

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def _clean_number_format(number_str: str) -> float:
    """Clean number formatting and convert to float safely."""
    if not number_str or number_str == '':
        return 0.0

    # Convert to string and strip whitespace
    clean_str = str(number_str).strip()

    # Handle empty or 'None' strings
    if not clean_str or clean_str.lower() == 'none':
        return 0.0

    # Remove common currency symbols and formatting
    clean_str = clean_str.replace('$', '').replace('RM', '').replace('SGD', '').replace('MYR', '')
    clean_str = clean_str.replace('USD', '').replace('THB', '').replace('IDR', '').replace('PHP', '')
    clean_str = clean_str.replace('VND', '').replace('CNY', '').replace('EUR', '')

    # Remove commas (common in currency formatting like 1,200.00)
    clean_str = clean_str.replace(',', '')

    # Remove extra whitespace
    clean_str = clean_str.strip()

    try:
        return float(clean_str)
    except ValueError:
        print(f"⚠️ Could not convert '{number_str}' to float, returning 0.0", file=sys.stderr)
        return 0.0

def _normalize_document_type(raw_value: str) -> str:
    """Smart mapping of document type variations to valid enum values."""
    if not raw_value:
        return 'unknown'

    # Convert to lowercase and strip
    normalized = raw_value.strip().lower()

    # Direct mappings for common variations
    document_type_mappings = {
        # Common variations
        'tax invoice': 'invoice',
        'sales invoice': 'invoice',
        'commercial invoice': 'invoice',
        'purchase receipt': 'receipt',
        'cash receipt': 'receipt',
        'sale receipt': 'receipt',
        'sales receipt': 'receipt',
        'customer receipt': 'receipt',
        'transaction receipt': 'receipt',
        'po': 'purchase_order',
        'purchase order': 'purchase_order',
        'account statement': 'statement',
        'monthly statement': 'statement',
        'billing statement': 'statement',
        'utility bill': 'bill',
        'electric bill': 'bill',
        'phone bill': 'bill',
        'credit memo': 'credit_note',
        'credit note': 'credit_note',
        'delivery order': 'delivery_note',
        'delivery receipt': 'delivery_note',
        'quote': 'quotation',
        'price quote': 'quotation',
        'estimate': 'quotation',
        'taxi receipt': 'transport',
        'ride receipt': 'transport',
        'grab receipt': 'transport',
        'uber receipt': 'transport',
        'transport receipt': 'transport'
    }

    # Check exact matches first
    if normalized in document_type_mappings:
        return document_type_mappings[normalized]

    # Check if any valid enum value is contained in the input
    valid_types = ['invoice', 'receipt', 'purchase_order', 'statement', 'bill', 'credit_note', 'delivery_note', 'quotation', 'transport']
    for valid_type in valid_types:
        if valid_type in normalized:
            return valid_type

    # Fallback to unknown
    return 'unknown'

def _normalize_industry_context(raw_value: str) -> str:
    """Smart mapping of industry context variations to valid enum values."""
    if not raw_value:
        return 'general'

    # Convert to lowercase and strip
    normalized = raw_value.strip().lower()

    # Industry context mappings for common variations
    industry_mappings = {
        # Electrical variations
        'electrical & lighting': 'electrical',
        'electrical and lighting': 'electrical',
        'lighting': 'electrical',
        'electronics': 'electrical',
        'led': 'electrical',
        'wiring': 'electrical',
        'electrical supplies': 'electrical',
        'electrical equipment': 'electrical',

        # Food & beverage variations
        'food': 'food_beverage',
        'beverage': 'food_beverage',
        'restaurant': 'food_beverage',
        'cafe': 'food_beverage',
        'catering': 'food_beverage',
        'food court': 'food_beverage',
        'food & beverage': 'food_beverage',
        'food and beverage': 'food_beverage',
        'f&b': 'food_beverage',
        'fnb': 'food_beverage',

        # Retail variations
        'supermarket': 'retail',
        'convenience store': 'retail',
        'department store': 'retail',
        'store': 'retail',
        'shop': 'retail',
        'shopping': 'retail',
        'mart': 'retail',

        # Transport variations
        'taxi': 'transport',
        'ride': 'transport',
        'delivery': 'transport',
        'logistics': 'transport',
        'shipping': 'transport',
        'ride-hailing': 'transport',
        'transportation': 'transport',

        # Services variations
        'professional services': 'services',
        'consulting': 'services',
        'repair': 'services',
        'maintenance': 'services',
        'service': 'services',

        # Manufacturing variations
        'production': 'manufacturing',
        'factory': 'manufacturing',
        'industrial': 'manufacturing',
        'manufacturing': 'manufacturing',

        # Healthcare variations
        'medical': 'healthcare',
        'pharmacy': 'healthcare',
        'health': 'healthcare',
        'hospital': 'healthcare',
        'clinic': 'healthcare'
    }

    # Check exact matches first
    if normalized in industry_mappings:
        return industry_mappings[normalized]

    # Check if any mapping key is contained in the input
    for variation, mapped_value in industry_mappings.items():
        if variation in normalized:
            return mapped_value

    # Check if any valid enum value is contained in the input
    valid_industries = ['electrical', 'food_beverage', 'retail', 'transport', 'services', 'manufacturing', 'healthcare', 'general']
    for valid_industry in valid_industries:
        if valid_industry in normalized:
            return valid_industry

    # Fallback to general
    return 'general'

def _normalize_currency_code(raw_value: str) -> str:
    """
    Intelligent currency detection without hardcoded assumptions.
    Let DSPy/Gemini handle contextual inference instead of rigid mappings.
    """
    if not raw_value:
        return 'USD'  # More neutral default

    # Convert to uppercase and strip
    normalized = raw_value.strip().upper()

    # Only handle EXPLICIT currency codes and unambiguous symbols
    explicit_currency_mappings = {
        # Explicit codes - no ambiguity
        'SGD': 'SGD', 'USD': 'USD', 'EUR': 'EUR', 'GBP': 'GBP', 'JPY': 'JPY',
        'MYR': 'MYR', 'THB': 'THB', 'IDR': 'IDR', 'PHP': 'PHP', 'VND': 'VND',
        'CNY': 'CNY', 'INR': 'INR', 'AUD': 'AUD', 'CAD': 'CAD', 'CHF': 'CHF', 'HKD': 'HKD',

        # Unambiguous prefixed symbols
        'S$': 'SGD', 'US$': 'USD', 'A$': 'AUD', 'C$': 'CAD', 'HK$': 'HKD',

        # Unique symbols
        '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR',
        '฿': 'THB', '₱': 'PHP', '₫': 'VND',
        'RM': 'MYR', 'RP': 'IDR',

        # Alternative names (unambiguous)
        'SINGAPORE DOLLAR': 'SGD', 'US DOLLAR': 'USD', 'EURO': 'EUR',
        'BRITISH POUND': 'GBP', 'JAPANESE YEN': 'JPY', 'INDIAN RUPEE': 'INR',
        'THAI BAHT': 'THB', 'MALAYSIAN RINGGIT': 'MYR',
        'INDONESIAN RUPIAH': 'IDR', 'PHILIPPINE PESO': 'PHP', 'VIETNAMESE DONG': 'VND'
    }

    # Check exact matches first
    if normalized in explicit_currency_mappings:
        return explicit_currency_mappings[normalized]

    # Check if any valid currency code is contained in the input
    all_currencies = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'MYR', 'THB', 'IDR', 'PHP', 'VND', 'CNY', 'INR', 'AUD', 'CAD', 'CHF', 'HKD']
    for currency in all_currencies:
        if currency in normalized:
            return currency

    # For ambiguous '$' symbol, return USD as more common globally
    # (Let Gemini use context to determine the actual currency)
    if '$' in normalized:
        return 'USD'

    # Fallback to USD (more globally neutral than SGD)
    return 'USD'

`;