"""
Invoice Extraction Step

Uses DSPy with Gemini 2.5 Flash for structured invoice data extraction.
This is the core document processing logic - directly integrated without subprocess.

Updated to match Trigger.dev implementation:
- available_categories input for LLM-based COGS categorization
- user_message and suggestions for UX feedback
- extraction_quality determined by LLM
- Token usage tracking for billing
"""

import os
import io
import json
from typing import Dict, Any, List, Optional, Literal
from datetime import datetime

import dspy
from pydantic import BaseModel, Field
from PIL import Image

from utils.s3_client import S3Client, ConvertedImageInfo
from steps.convert_pdf import get_image_from_s3
from types_def import BusinessCategory


# =============================================================================
# Pydantic Models for DSPy
# =============================================================================

class DocumentLineItem(BaseModel):
    """Line item from invoice."""
    description: str = Field(..., description="Item description/name")
    item_code: Optional[str] = Field(None, description="Item code, HSN code, SKU")
    quantity: Optional[float] = Field(None, description="Quantity purchased")
    unit_measurement: Optional[str] = Field(None, description="Unit (PC, PCS, KG, L, etc.)")
    unit_price: Optional[float] = Field(None, description="Price per unit")
    line_total: float = Field(..., description="Total for this line")


class InvoiceData(BaseModel):
    """Complete invoice extraction result - matches Trigger.dev ExtractedInvoiceData."""
    # Core fields
    vendor_name: str = Field(..., description="Merchant/vendor name")
    transaction_date: str = Field(..., description="Date in YYYY-MM-DD format")
    total_amount: float = Field(..., description="Final total amount")
    currency: str = Field(..., description="ISO 4217 currency code (SGD, MYR, USD, etc.)")

    # Document identification
    document_number: Optional[str] = Field(None, description="Invoice number")

    # Vendor details
    vendor_address: Optional[str] = Field(None, description="Vendor address")
    vendor_contact: Optional[str] = Field(None, description="Vendor phone/email")
    vendor_tax_id: Optional[str] = Field(None, description="Tax ID/GSTIN")

    # Customer details
    customer_name: Optional[str] = Field(None, description="Customer name")
    customer_address: Optional[str] = Field(None, description="Customer address")
    customer_contact: Optional[str] = Field(None, description="Customer contact")

    # Financial breakdown
    subtotal_amount: Optional[float] = Field(None, description="Subtotal before tax")
    tax_amount: Optional[float] = Field(None, description="Total tax")
    discount_amount: Optional[float] = Field(None, description="Total discount")

    # Payment info
    payment_terms: Optional[str] = Field(None, description="Payment terms")
    payment_method: Optional[str] = Field(None, description="Payment method")
    bank_details: Optional[str] = Field(None, description="Bank details")

    # Line items
    line_items: List[DocumentLineItem] = Field(default_factory=list)

    # Category - selected from available_categories (COGS categories)
    suggested_category: Optional[str] = Field(
        None,
        description="Selected category name from available_categories list"
    )

    # Quality - LLM determines this based on image/document clarity
    extraction_quality: Literal['high', 'medium', 'low'] = Field(
        ...,
        description="Quality assessment: 'high' for clear invoices, 'medium' for readable but some issues, 'low' for poor quality/missing info"
    )
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence score")
    missing_fields: List[str] = Field(default_factory=list, description="Fields that couldn't be extracted")

    # User feedback - IMPORTANT for UX
    user_message: Optional[str] = Field(
        None,
        description="User-friendly message explaining the extraction results or issues"
    )
    suggestions: Optional[List[str]] = Field(
        None,
        description="Actionable suggestions for improving extraction quality (e.g., 'Upload a clearer image')"
    )


# =============================================================================
# DSPy Signature - Updated to match Trigger.dev
# =============================================================================

class InvoiceExtractionSignature(dspy.Signature):
    """Extract comprehensive structured data from invoice image with user-friendly error handling.

    IMPORTANT: If the image quality is poor or critical information is missing, provide:
    1. A clear user_message explaining the issue
    2. Actionable suggestions for improvement (e.g., 'Upload a clearer image', 'Ensure invoice number is visible')

    For suggested_category: Select the BEST matching category from available_categories (COGS/expense categories).
    If no good match, leave as null.
    """

    document_image: dspy.Image = dspy.InputField(
        desc="Invoice image for multimodal analysis"
    )

    available_categories: str = dspy.InputField(
        desc="JSON list of available COGS/expense categories with category_name and category_code"
    )

    extracted_data: InvoiceData = dspy.OutputField(
        desc="""Complete structured invoice data. Extract vendor address,
        contact info, customer details, line items with codes/quantities/units,
        subtotal, tax amounts, and payment information.
        For currency: analyze vendor location and symbols to determine ISO code.
        Select suggested_category from available_categories list.
        Set extraction_quality based on image clarity. If quality is 'low' or
        critical fields are missing, provide user_message and suggestions."""
    )


# =============================================================================
# IFRS Category Patterns
# =============================================================================

IFRS_PATTERNS = [
    {"code": "travel_entertainment", "name": "Travel & Entertainment",
     "patterns": ["flight", "airline", "hotel", "taxi", "uber", "restaurant", "food"],
     "confidence_base": 0.8},
    {"code": "utilities_communications", "name": "Utilities & Communications",
     "patterns": ["electricity", "water", "internet", "phone", "utility"],
     "confidence_base": 0.85},
    {"code": "marketing_advertising", "name": "Marketing & Advertising",
     "patterns": ["advertising", "promotion", "facebook", "google ads", "marketing"],
     "confidence_base": 0.8},
    {"code": "software_subscriptions", "name": "Software & Subscriptions",
     "patterns": ["software", "subscription", "saas", "cloud", "license"],
     "confidence_base": 0.85},
    {"code": "professional_services", "name": "Professional Services",
     "patterns": ["consulting", "legal", "accounting", "audit", "lawyer"],
     "confidence_base": 0.85},
    {"code": "rent_facilities", "name": "Rent & Facilities",
     "patterns": ["rent", "lease", "facility", "office space"],
     "confidence_base": 0.9},
    {"code": "insurance", "name": "Insurance",
     "patterns": ["insurance", "policy", "coverage", "premium"],
     "confidence_base": 0.9},
]


def categorize_invoice(
    vendor_name: str,
    line_items: List[DocumentLineItem],
    categories: Optional[List[BusinessCategory]],
) -> Dict[str, Any]:
    """
    Categorize invoice using business categories or IFRS fallback.

    Args:
        vendor_name: Extracted vendor name
        line_items: Extracted line items
        categories: Business categories (if available)

    Returns:
        Category result with code, confidence, reasoning
    """
    # Build search text
    line_descriptions = " ".join([item.description for item in line_items])
    text = f"{vendor_name} {line_descriptions}".lower()

    # Try business categories first
    if categories:
        best_match = {"category": "", "confidence": 0.1, "reasoning": "No match"}

        for cat in categories:
            match_score = 0
            reasons = []

            # Check vendor patterns
            for pattern in (cat.vendor_patterns or []):
                if pattern.lower() in text:
                    match_score += 0.4
                    reasons.append(f"vendor: {pattern}")

            # Check keywords
            for keyword in (cat.keywords or []):
                if keyword.lower() in text:
                    match_score += 0.3
                    reasons.append(f"keyword: {keyword}")

            if match_score > best_match["confidence"]:
                best_match = {
                    "category": cat.code or cat.name,
                    "confidence": min(match_score, 0.95),
                    "reasoning": f"Matched {', '.join(reasons)}",
                    "type": "business_cogs",
                }

        if best_match["confidence"] >= 0.2:
            return best_match

    # Fallback to IFRS patterns
    best_ifrs = {
        "category": "other_operating",
        "name": "Other Operating Expenses",
        "confidence": 0.1,
        "reasoning": "No pattern match - defaulted",
        "type": "ifrs",
    }

    for pattern in IFRS_PATTERNS:
        match_score = sum(0.3 for term in pattern["patterns"] if term in text)
        if match_score > 0:
            confidence = min(match_score * pattern["confidence_base"], 0.95)
            if confidence > best_ifrs["confidence"]:
                best_ifrs = {
                    "category": pattern["code"],
                    "name": pattern["name"],
                    "confidence": confidence,
                    "reasoning": f"IFRS pattern match",
                    "type": "ifrs",
                }

    return best_ifrs


def format_categories_for_llm(categories: Optional[List[BusinessCategory]]) -> str:
    """Format business categories as JSON for LLM input."""
    if not categories:
        # Fallback COGS categories for invoices
        fallback_categories = [
            {"category_name": "Cost of Goods Sold", "category_code": "cogs"},
            {"category_name": "Office Supplies", "category_code": "office_supplies"},
            {"category_name": "Software & Subscriptions", "category_code": "software"},
            {"category_name": "Professional Services", "category_code": "professional_services"},
            {"category_name": "Other Operating Expenses", "category_code": "other_operating"},
        ]
        return json.dumps(fallback_categories)

    formatted = [
        {
            "category_name": cat.name,
            "category_code": cat.code or cat.name.lower().replace(" ", "_")
        }
        for cat in categories
    ]
    return json.dumps(formatted)


def log_token_usage(lm, model_name: str, image_count: int = 1) -> Dict[str, Any]:
    """
    Log and return token usage for billing.

    Args:
        lm: The configured dspy.LM object
        model_name: Name of the model used
        image_count: Number of images processed

    Returns:
        Dict with token usage data
    """
    token_data = {
        "model": model_name,
        "image_count": image_count,
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "has_usage_data": False
    }

    try:
        if hasattr(lm, 'history') and lm.history:
            last_call = lm.history[-1]
            usage = last_call.get('usage', {}) if isinstance(last_call, dict) else {}

            if usage:
                prompt_tokens = usage.get('prompt_tokens', usage.get('input_tokens', 0))
                completion_tokens = usage.get('completion_tokens', usage.get('output_tokens', 0))
                total_tokens = usage.get('total_tokens', prompt_tokens + completion_tokens)

                token_data.update({
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens,
                    "has_usage_data": True
                })

                print(f"[Usage] Model: {model_name}, Images: {image_count}, "
                      f"Input: {prompt_tokens}, Output: {completion_tokens}, Total: {total_tokens}")
    except Exception as e:
        print(f"[Usage] Failed to log usage: {str(e)}")

    return token_data


# =============================================================================
# Main Extraction Function
# =============================================================================

def extract_invoice_step(
    document_id: str,
    images: Optional[List[ConvertedImageInfo]],
    storage_path: str,
    domain: str,
    categories: Optional[List[BusinessCategory]],
    s3: S3Client,
) -> Dict[str, Any]:
    """
    Extract structured data from invoice using DSPy with Gemini.

    Args:
        document_id: Document ID for logging
        images: Converted image info (for PDFs) or None
        storage_path: S3 path to original document
        domain: 'invoices' or 'expense_claims'
        categories: Business categories for COGS categorization
        s3: S3 client instance

    Returns:
        Dict with extracted invoice data including user_message, suggestions, and token usage
    """
    print(f"[{document_id}] Extracting invoice data with DSPy")
    start_time = datetime.utcnow()
    token_data = None

    try:
        # Get image data
        if images and len(images) > 0:
            image_url = s3.get_presigned_url(images[0].s3_key)
            image_bytes = _fetch_image_bytes(image_url)
        else:
            image_bytes, _ = get_image_from_s3(s3, storage_path, domain)

        # Configure DSPy with Gemini
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if not gemini_api_key:
            raise ValueError("GEMINI_API_KEY not set")

        print(f"[{document_id}] Configuring DSPy with Gemini...")
        gemini_lm = dspy.LM(
            "gemini/gemini-2.5-flash",
            api_key=gemini_api_key,
            temperature=0.1,  # Slight temperature for better user_message generation
            max_tokens=16384,
        )
        dspy.settings.configure(lm=gemini_lm, adapter=dspy.JSONAdapter(), track_usage=True)

        # Convert to DSPy image
        pil_image = Image.open(io.BytesIO(image_bytes))
        document_image = dspy.Image.from_PIL(pil_image)
        print(f"[{document_id}] Image: {pil_image.size}")

        # Format categories for LLM
        categories_json = format_categories_for_llm(categories)
        print(f"[{document_id}] Categories: {len(categories or [])} available")

        # Run DSPy extraction with ChainOfThought
        print(f"[{document_id}] Running DSPy ChainOfThought...")
        processor = dspy.ChainOfThought(InvoiceExtractionSignature)
        prediction = processor(
            document_image=document_image,
            available_categories=categories_json
        )
        extracted = prediction.extracted_data

        # Log token usage for billing
        token_data = log_token_usage(gemini_lm, "gemini-2.5-flash", image_count=1)

        print(f"[{document_id}] Extracted: {extracted.vendor_name} - {extracted.total_amount} {extracted.currency}")
        print(f"[{document_id}] Quality: {extracted.extraction_quality}, Confidence: {extracted.confidence_score}")

        # Convert line items
        line_items = [
            DocumentLineItem(
                description=item.description,
                item_code=item.item_code,
                quantity=item.quantity,
                unit_measurement=item.unit_measurement,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in extracted.line_items
        ]

        # Use LLM-selected category or fallback to pattern matching
        suggested_category = extracted.suggested_category
        category_confidence = 0.9  # High confidence if LLM selected

        if not suggested_category:
            # Fallback to pattern matching (IFRS)
            category_result = categorize_invoice(
                vendor_name=extracted.vendor_name,
                line_items=line_items,
                categories=categories,
            )
            suggested_category = category_result["category"]
            category_confidence = category_result["confidence"]
            print(f"[{document_id}] Category fallback: {suggested_category}")
        else:
            print(f"[{document_id}] LLM selected category: {suggested_category}")

        # Calculate processing time
        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # Calculate due_date from transaction_date + payment_terms
        # (Same logic as Trigger.dev version)
        calculated_due_date = None
        if extracted.transaction_date and extracted.payment_terms:
            try:
                import re
                from datetime import timedelta
                # Parse transaction date (YYYY-MM-DD format)
                transaction_date = datetime.strptime(extracted.transaction_date, "%Y-%m-%d")
                payment_terms = extracted.payment_terms.lower()

                # Extract number of days from payment terms (e.g., "Net 30", "30 days")
                days_to_add = 30  # Default Net 30
                match = re.search(r'(\d+)', payment_terms)
                if match:
                    days_to_add = int(match.group(1))

                # Calculate due date
                due_date = transaction_date + timedelta(days=days_to_add)
                calculated_due_date = due_date.strftime("%Y-%m-%d")
                print(f"[{document_id}] Calculated due_date: {calculated_due_date} (transaction: {extracted.transaction_date} + {days_to_add} days)")
            except Exception as e:
                print(f"[{document_id}] Warning: Could not calculate due_date: {e}")

        # Build result
        result = {
            "success": True,
            "backend_used": "dspy_gemini",
            "processing_method": "dspy",
            "document_type": "invoice",
            "model_used": "gemini-2.5-flash",

            # Core fields
            "vendor_name": extracted.vendor_name,
            "total_amount": extracted.total_amount,
            "currency": extracted.currency,
            "transaction_date": extracted.transaction_date,
            "document_number": extracted.document_number or "",

            # Vendor details
            "vendor_address": extracted.vendor_address or "",
            "vendor_contact": extracted.vendor_contact or "",
            "vendor_tax_id": extracted.vendor_tax_id or "",

            # Customer details
            "customer_name": extracted.customer_name or "",
            "customer_address": extracted.customer_address or "",
            "customer_contact": extracted.customer_contact or "",

            # Financial breakdown
            "subtotal_amount": extracted.subtotal_amount or 0.0,
            "tax_amount": extracted.tax_amount or 0.0,
            "discount_amount": extracted.discount_amount or 0.0,

            # Payment info
            "payment_terms": extracted.payment_terms or "",
            "due_date": calculated_due_date,  # Calculated from transaction_date + payment_terms
            "payment_method": extracted.payment_method or "",
            "bank_details": extracted.bank_details or "",

            # Line items
            "line_items": [
                {
                    "description": item.description,
                    "item_code": item.item_code,
                    "quantity": item.quantity,
                    "unit_measurement": item.unit_measurement,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total,
                }
                for item in extracted.line_items
            ],

            # Quality - LLM determined
            "confidence": extracted.confidence_score,
            "confidence_score": extracted.confidence_score,
            "extraction_confidence": extracted.confidence_score,
            "extraction_quality": extracted.extraction_quality,
            "missing_fields": extracted.missing_fields,
            "requires_validation": extracted.confidence_score < 0.8,

            # User feedback - for UX
            "user_message": extracted.user_message,
            "suggestions": extracted.suggestions or [],

            # Category
            "suggested_category": suggested_category,
            "category_confidence": category_confidence,

            # Processing metadata
            "processing_time_ms": processing_time_ms,
            "extracted_at": datetime.utcnow().isoformat(),

            # Token usage for billing
            "tokens_used": token_data,
        }

        print(f"[{document_id}] Invoice extraction complete (quality: {extracted.extraction_quality})")
        if extracted.user_message:
            print(f"[{document_id}] User message: {extracted.user_message}")
        if extracted.suggestions:
            print(f"[{document_id}] Suggestions: {extracted.suggestions}")

        return result

    except Exception as e:
        import traceback
        error_msg = f"Invoice extraction failed: {str(e)}"
        print(f"[{document_id}] {error_msg}")
        print(f"[{document_id}] Traceback: {traceback.format_exc()}")

        # Calculate processing time even for failures
        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        return {
            "success": False,
            "error": error_msg,
            "backend_used": "dspy_gemini_failed",
            "processing_time_ms": processing_time_ms,
            "tokens_used": token_data,  # Include if API was called before failure
            # User-friendly error for UX
            "user_message": "We couldn't process this invoice. Please try again or upload a clearer image.",
            "suggestions": [
                "Ensure the invoice is well-lit and in focus",
                "Make sure all text is readable",
                "Try taking a photo from directly above the document"
            ],
        }


def _fetch_image_bytes(url: str) -> bytes:
    """Fetch image from presigned URL."""
    import httpx
    response = httpx.get(url, timeout=30.0)
    response.raise_for_status()
    return response.content
