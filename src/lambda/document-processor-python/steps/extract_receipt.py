"""
Receipt Extraction Step

Uses DSPy with Gemini 2.5 Flash for structured receipt data extraction.
Receipts have simpler structure than invoices - optimized for expense claims.

Updated to match Trigger.dev implementation:
- available_categories input for LLM-based categorization
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

class ReceiptLineItem(BaseModel):
    """Line item from receipt."""
    description: str = Field(..., description="Item description")
    quantity: Optional[float] = Field(None, description="Quantity")
    unit_price: Optional[float] = Field(None, description="Price per unit")
    line_total: float = Field(..., description="Total for this line")


# =============================================================================
# Fast Mode Schema - Simplified for speed (saves ~3-5s)
# Keeps: line_items, subtotal, tax, tip (essential for expense claims)
# Removes: vendor_address, vendor_contact, payment_method, missing_fields, suggestions
# =============================================================================

class FastReceiptData(BaseModel):
    """Simplified receipt extraction for fast mode - essential fields only."""
    # Core fields (required)
    vendor_name: str = Field(..., description="Store/merchant name")
    transaction_date: str = Field(..., description="Date in YYYY-MM-DD format")
    total_amount: float = Field(..., description="Final total amount")
    currency: str = Field(..., description="ISO 4217 currency code (SGD, MYR, USD, etc.)")

    # Useful identifiers
    receipt_number: Optional[str] = Field(None, description="Receipt/invoice number")

    # Financial breakdown (essential for expense claims)
    subtotal_amount: Optional[float] = Field(None, description="Subtotal before tax")
    tax_amount: Optional[float] = Field(None, description="Tax amount")
    tip_amount: Optional[float] = Field(None, description="Tip amount if applicable")

    # Line items (essential for expense claims)
    line_items: List[ReceiptLineItem] = Field(default_factory=list, description="Line items from receipt")

    # Category - selected from available_categories
    expense_category: Optional[str] = Field(
        None,
        description="Selected expense category name from available_categories list"
    )

    # AI-generated descriptive fields
    description: Optional[str] = Field(
        None,
        description="Concise expense summary, e.g., 'Lunch at ABC Restaurant'"
    )
    business_purpose: Optional[str] = Field(
        None,
        description="Business justification, e.g., 'Client meeting lunch'"
    )

    # Quality (minimal)
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence")
    extraction_quality: Literal['high', 'medium', 'low'] = Field(..., description="Quality assessment")


class ReceiptData(BaseModel):
    """Complete receipt extraction result - matches Trigger.dev ExtractedReceiptData."""
    # Core fields
    vendor_name: str = Field(..., description="Store/merchant name")
    transaction_date: str = Field(..., description="Date in YYYY-MM-DD format")
    total_amount: float = Field(..., description="Final total amount")
    currency: str = Field(..., description="ISO 4217 currency code (SGD, MYR, USD, etc.)")

    # Receipt identification
    receipt_number: Optional[str] = Field(
        None,
        description="Receipt/invoice/check number - look for: 'Receipt #', 'Invoice #', 'Check #', 'Ref #', 'No.', 'Transaction #', or any similar identifier"
    )

    # Vendor details
    vendor_address: Optional[str] = Field(None, description="Store address")
    vendor_contact: Optional[str] = Field(None, description="Store phone/contact")

    # Financial breakdown
    subtotal_amount: Optional[float] = Field(None, description="Subtotal before tax")
    tax_amount: Optional[float] = Field(None, description="Tax amount")
    tip_amount: Optional[float] = Field(None, description="Tip amount")

    # Payment
    payment_method: Optional[str] = Field(
        None,
        description="Payment method - look for: 'Cash', 'Cheque', 'Bank Transfer', 'VISA', 'Mastercard', 'AMEX', 'Debit', 'Credit Card', 'E-Wallet', 'GrabPay', 'TouchNGo', 'PayNow', 'DuitNow'"
    )

    # Line items
    line_items: List[ReceiptLineItem] = Field(default_factory=list)

    # Category - selected from available_categories
    expense_category: Optional[str] = Field(
        None,
        description="Selected expense category name from available_categories list"
    )

    # Quality - LLM determines this based on image/document clarity
    extraction_quality: Literal['high', 'medium', 'low'] = Field(
        ...,
        description="Quality assessment: 'high' for clear receipts, 'medium' for readable but some issues, 'low' for poor quality/missing info"
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
        description="Actionable suggestions for improving extraction quality (e.g., 'Take a clearer photo')"
    )

    # AI-generated descriptive fields for expense claims
    description: Optional[str] = Field(
        None,
        description="Concise description of the expense based on receipt content, e.g., 'Lunch meeting with client at Restaurant ABC' or 'Office supplies purchase - paper and ink'"
    )
    business_purpose: Optional[str] = Field(
        None,
        description="Business justification for the expense, e.g., 'Client entertainment for project discussion' or 'Office supplies for daily operations'"
    )


# =============================================================================
# DSPy Signature - Updated to match Trigger.dev
# =============================================================================

class ReceiptExtractionSignature(dspy.Signature):
    """Fast structured extraction for receipts with user-friendly error handling.

    IMPORTANT EXTRACTION GUIDELINES:

    1. MULTI-PAGE HANDLING: If multiple images are provided, they are consecutive pages of the SAME receipt.
       - Use PAGE 1 for: vendor name, vendor address, vendor contact, receipt number, date
       - COMBINE from ALL PAGES: line items (concatenate all line items from all pages)
       - Use LAST PAGE for: total_amount, subtotal_amount, tax_amount, tip_amount (final totals)
       - Payment method may appear on any page - extract from wherever found

    2. ERROR HANDLING: If image quality is poor or critical information is missing, provide:
       - A clear user_message explaining the issue
       - Actionable suggestions for improvement (e.g., 'Take a clearer photo', 'Ensure entire receipt is visible')

    3. CATEGORY: Select the BEST matching category from available_categories.
       If no good match, leave as null.
    """

    receipt_images: List[dspy.Image] = dspy.InputField(
        desc="Receipt image(s) for multimodal analysis. If multiple images, they are consecutive pages of the same receipt."
    )

    available_categories: str = dspy.InputField(
        desc="JSON list of available expense categories with category_name"
    )

    extracted_data: ReceiptData = dspy.OutputField(
        desc="""Complete structured receipt data. Extract vendor name, address, items,
        subtotal, tax, tip, and payment method. For currency: determine from vendor
        location and symbols. Select expense_category from available_categories list.
        Set extraction_quality based on image clarity. If quality is 'low' or
        critical fields are missing, provide user_message and suggestions.

        IMPORTANT: Generate 'description' (concise expense summary like 'Lunch at ABC Restaurant')
        and 'business_purpose' (business justification like 'Client meeting lunch').
        For receipt_number: Look for 'Check #', 'Invoice #', 'Receipt #', 'Ref #', 'No.' or similar."""
    )


# =============================================================================
# Fast Mode DSPy Signature - Simplified for speed
# =============================================================================

class FastReceiptExtractionSignature(dspy.Signature):
    """Quick extraction for simple receipts - essential fields only.

    Extract: vendor_name, transaction_date, total_amount, currency, receipt_number,
    line_items, subtotal_amount, tax_amount, tip_amount,
    expense_category, description, business_purpose, confidence_score, extraction_quality.

    Skip: vendor_address, vendor_contact, payment_method (verbose/optional fields).
    """

    receipt_image: dspy.Image = dspy.InputField(
        desc="Receipt image for quick extraction"
    )

    available_categories: str = dspy.InputField(
        desc="JSON list of expense categories"
    )

    extracted_data: FastReceiptData = dspy.OutputField(
        desc="""Extract essential receipt data: vendor_name, transaction_date,
        total_amount, currency, receipt_number, line_items, subtotal_amount,
        tax_amount, tip_amount, expense_category.
        Generate 'description' and 'business_purpose' for the expense claim.
        Set confidence_score and extraction_quality based on image clarity."""
    )


# =============================================================================
# Expense Category Patterns (Fallback)
# =============================================================================

EXPENSE_PATTERNS = [
    {"code": "meals", "name": "Meals & Entertainment",
     "patterns": ["restaurant", "cafe", "food", "lunch", "dinner", "breakfast", "coffee"],
     "confidence_base": 0.85},
    {"code": "transport", "name": "Transportation",
     "patterns": ["taxi", "uber", "grab", "fuel", "gas", "parking", "toll"],
     "confidence_base": 0.85},
    {"code": "office", "name": "Office Supplies",
     "patterns": ["stationery", "office", "supplies", "paper", "ink", "printer"],
     "confidence_base": 0.8},
    {"code": "travel", "name": "Travel",
     "patterns": ["hotel", "accommodation", "airbnb", "flight", "airline", "train"],
     "confidence_base": 0.9},
    {"code": "utilities", "name": "Utilities",
     "patterns": ["phone", "mobile", "internet", "electricity", "water"],
     "confidence_base": 0.85},
    {"code": "misc", "name": "Miscellaneous",
     "patterns": [],
     "confidence_base": 0.5},
]


def categorize_receipt_fallback(
    vendor_name: str,
    line_items: List[ReceiptLineItem],
    categories: Optional[List[BusinessCategory]],
) -> Optional[Dict[str, Any]]:
    """
    Fallback categorization using pattern matching when LLM doesn't select category.

    IMPORTANT: Only matches against actual business categories from Convex.
    Returns None if no business categories available or no match found.
    User must select category manually in the expense form UI.

    Args:
        vendor_name: Extracted vendor name
        line_items: Extracted line items
        categories: Business expense categories from Convex (required)

    Returns:
        Category result with category_name (for mapping to id) or None
    """
    # If no business categories provided, return None - user must select manually
    if not categories:
        print("[Category Fallback] No business categories - user will select manually")
        return None

    # Build search text
    line_descriptions = " ".join([item.description for item in line_items])
    text = f"{vendor_name} {line_descriptions}".lower()

    # Only match against actual business categories from Convex
    best_match: Optional[Dict[str, Any]] = None

    for cat in categories:
        match_score = 0
        reasons = []

        for pattern in (cat.vendor_patterns or []):
            if pattern.lower() in text:
                match_score += 0.4
                reasons.append(f"vendor: {pattern}")

        for keyword in (cat.keywords or []):
            if keyword.lower() in text:
                match_score += 0.3
                reasons.append(f"keyword: {keyword}")

        if match_score > 0 and (best_match is None or match_score > best_match["confidence"]):
            best_match = {
                "category_name": cat.name,  # Return name, TypeScript maps to id
                "category_id": cat.id,  # Also include id if available
                "confidence": min(match_score, 0.95),
                "reasoning": f"Matched {', '.join(reasons)}",
                "type": "business_expense",
            }

    if best_match and best_match["confidence"] >= 0.2:
        print(f"[Category Fallback] Matched: {best_match['category_name']} (confidence: {best_match['confidence']})")
        return best_match

    # No match found - return None, user must select manually
    print("[Category Fallback] No match in business categories - user will select manually")
    return None


def format_categories_for_llm(categories: Optional[List[BusinessCategory]]) -> str:
    """Format business categories as JSON for LLM input.

    Note: We only send category_name to the LLM. The LLM will return the
    selected category_name, which we then map to the category id for storage.
    This simplifies the flow: LLM returns name → we lookup id → store id.

    IMPORTANT: Only use actual business categories from Convex.
    No hardcoded fallbacks - if no categories exist, return empty list
    and let the user select manually in the UI.
    """
    if not categories:
        # No fallback categories - return empty list
        # User must select category manually in the expense form UI
        print("[Categories] No business categories provided - user will select manually")
        return json.dumps([])

    # Only send names to LLM - the TypeScript layer handles name→id mapping
    formatted = [
        {"category_name": cat.name}
        for cat in categories
    ]
    print(f"[Categories] Formatted {len(formatted)} business categories for LLM")
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

def extract_receipt_step(
    document_id: str,
    images: Optional[List[ConvertedImageInfo]],
    storage_path: str,
    domain: str,
    categories: Optional[List[BusinessCategory]],
    s3: S3Client,
    fast_mode: bool = False,
) -> Dict[str, Any]:
    """
    Extract structured data from receipt using DSPy with Gemini.

    Args:
        document_id: Document ID for logging
        images: Converted image info (for PDFs) or None
        storage_path: S3 path to original document
        domain: 'invoices' or 'expense_claims'
        categories: Business categories for categorization
        s3: S3 client instance
        fast_mode: If True, use simplified extraction (dspy.Predict) for speed

    Returns:
        Dict with extracted receipt data including user_message, suggestions, and token usage
    """
    mode_label = "FAST" if fast_mode else "FULL"
    print(f"[{document_id}] Extracting receipt data with DSPy ({mode_label} mode)")
    start_time = datetime.utcnow()
    token_data = None

    try:
        # Get page images - in fast mode, only fetch first page
        all_image_bytes = []
        if images and len(images) > 0:
            pages_to_fetch = 1 if fast_mode else len(images)
            print(f"[{document_id}] Processing {pages_to_fetch} of {len(images)} page(s) ({mode_label} mode)...")
            for idx in range(pages_to_fetch):
                img_info = images[idx]
                image_url = s3.get_presigned_url(img_info.s3_key)
                img_bytes = _fetch_image_bytes(image_url)
                all_image_bytes.append(img_bytes)
                print(f"[{document_id}] Fetched page {idx + 1}")
        else:
            # Single image (not from PDF conversion)
            image_bytes, _ = get_image_from_s3(s3, storage_path, domain)
            all_image_bytes.append(image_bytes)
            print(f"[{document_id}] Processing single image")

        # Configure DSPy with Gemini
        gemini_api_key = os.environ.get("GEMINI_API_KEY")
        if not gemini_api_key:
            raise ValueError("GEMINI_API_KEY not set")

        print(f"[{document_id}] Configuring DSPy with Gemini...")
        # Use lower max_tokens in fast mode (simpler output)
        max_tokens = 4096 if fast_mode else 8192
        gemini_lm = dspy.LM(
            "gemini/gemini-2.5-flash",
            api_key=gemini_api_key,
            temperature=0.1,
            max_tokens=max_tokens,
        )
        dspy.settings.configure(lm=gemini_lm, adapter=dspy.JSONAdapter(), track_usage=True)

        # Convert pages to DSPy images
        receipt_images = []
        for idx, img_bytes in enumerate(all_image_bytes):
            pil_image = Image.open(io.BytesIO(img_bytes))
            dspy_image = dspy.Image.from_PIL(pil_image)
            receipt_images.append(dspy_image)
            print(f"[{document_id}] Page {idx + 1} size: {pil_image.size}")

        print(f"[{document_id}] Total pages to process: {len(receipt_images)}")

        # Format categories for LLM
        categories_json = format_categories_for_llm(categories)
        print(f"[{document_id}] Categories: {len(categories or [])} available")

        # =================================================================
        # FAST MODE: Use dspy.Predict with simplified schema (saves ~3-5s)
        # FULL MODE: Use dspy.ChainOfThought with complete schema
        # =================================================================
        if fast_mode:
            print(f"[{document_id}] Running DSPy Predict (FAST mode) with 1 image...")
            processor = dspy.Predict(FastReceiptExtractionSignature)
            prediction = processor(
                receipt_image=receipt_images[0],  # Single image only
                available_categories=categories_json
            )
            extracted = prediction.extracted_data
            # Fast mode now includes line_items
            line_items = [
                ReceiptLineItem(
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                )
                for item in (extracted.line_items or [])
            ]
        else:
            print(f"[{document_id}] Running DSPy ChainOfThought (FULL mode) with {len(receipt_images)} page(s)...")
            processor = dspy.ChainOfThought(ReceiptExtractionSignature)
            prediction = processor(
                receipt_images=receipt_images,
                available_categories=categories_json
            )
            extracted = prediction.extracted_data
            # Convert line items (full mode)
            line_items = [
                ReceiptLineItem(
                    description=item.description,
                    quantity=item.quantity,
                    unit_price=item.unit_price,
                    line_total=item.line_total,
                )
                for item in (extracted.line_items or [])
            ]

        # Log token usage for billing (include actual image count)
        token_data = log_token_usage(gemini_lm, "gemini-2.5-flash", image_count=len(receipt_images))

        print(f"[{document_id}] Extracted: {extracted.vendor_name} - {extracted.total_amount} {extracted.currency}")
        print(f"[{document_id}] Quality: {extracted.extraction_quality}, Confidence: {extracted.confidence_score}")

        # DEBUG: Log description and business_purpose from DSPy
        print(f"[{document_id}] DSPy description (raw): '{extracted.description}'")
        print(f"[{document_id}] DSPy business_purpose (raw): '{extracted.business_purpose}'")

        # Use LLM-selected category or fallback to pattern matching
        # Note: expense_category is now the category_name, which TypeScript maps to id
        # IMPORTANT: Only use categories from the business's customExpenseCategories in Convex
        expense_category = extracted.expense_category
        category_confidence = 0.9  # High confidence if LLM selected

        # Track both name (for logging/metadata) and ID (for frontend)
        expense_category_name = None
        expense_category_id = None

        if expense_category:
            # Verify LLM-selected category exists in business categories
            if categories:
                # Find matching category to get its ID
                matching_cat = next((cat for cat in categories if cat.name == expense_category), None)
                if not matching_cat:
                    print(f"[{document_id}] LLM selected invalid category '{expense_category}' - not in business categories")
                    expense_category = None
                    category_confidence = 0.0
                else:
                    expense_category_name = matching_cat.name
                    expense_category_id = matching_cat.id
                    print(f"[{document_id}] LLM selected valid category: {expense_category_name} (id: {expense_category_id})")
            else:
                # No business categories to validate against - clear the selection
                print(f"[{document_id}] Cannot validate LLM category - no business categories available")
                expense_category = None
                category_confidence = 0.0

        if not expense_category:
            # Fallback to pattern matching against business categories only
            category_result = categorize_receipt_fallback(
                vendor_name=extracted.vendor_name,
                line_items=line_items,
                categories=categories,
            )
            if category_result:
                expense_category_name = category_result["category_name"]
                expense_category_id = category_result.get("category_id")  # Already includes ID
                category_confidence = category_result["confidence"]
                print(f"[{document_id}] Category fallback matched: {expense_category_name} (id: {expense_category_id})")
            else:
                # No match - user must select manually in UI
                expense_category_name = None
                expense_category_id = None
                category_confidence = 0.0
                print(f"[{document_id}] No category match - user will select manually")

        # Use category ID for storage (frontend expects ID), name for display/logging
        expense_category = expense_category_id

        # Calculate processing time
        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # Build result - handle fast mode (fewer fields extracted)
        result = {
            "success": True,
            "backend_used": "dspy_gemini",
            "processing_method": "dspy_fast" if fast_mode else "dspy",
            "document_type": "receipt",
            "model_used": "gemini-2.5-flash",
            "fast_mode": fast_mode,

            # Core fields (always present)
            "vendor_name": extracted.vendor_name,
            "total_amount": extracted.total_amount,
            "currency": extracted.currency,
            "transaction_date": extracted.transaction_date,
            "receipt_number": getattr(extracted, 'receipt_number', None) or "",

            # Vendor details (full mode only - skipped in fast mode)
            "vendor_address": getattr(extracted, 'vendor_address', None) or "",
            "vendor_contact": getattr(extracted, 'vendor_contact', None) or "",

            # Financial breakdown (both modes - essential for expense claims)
            "subtotal_amount": getattr(extracted, 'subtotal_amount', None) or 0.0,
            "tax_amount": getattr(extracted, 'tax_amount', None) or 0.0,
            "tip_amount": getattr(extracted, 'tip_amount', None) or 0.0,

            # Payment (full mode only - skipped in fast mode)
            "payment_method": getattr(extracted, 'payment_method', None) or "",

            # Line items (both modes - essential for expense claims)
            "line_items": [
                {
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total,
                }
                for item in line_items
            ],

            # Quality - LLM determined (both modes)
            "confidence": extracted.confidence_score,
            "confidence_score": extracted.confidence_score,
            "extraction_confidence": extracted.confidence_score,
            "extraction_quality": extracted.extraction_quality,
            "missing_fields": getattr(extracted, 'missing_fields', []) or [],
            "requires_validation": extracted.confidence_score < 0.8,

            # User feedback - for UX (full mode only - skipped in fast mode)
            "user_message": getattr(extracted, 'user_message', None),
            "suggestions": getattr(extracted, 'suggestions', []) or [],

            # Category - expense_category is now the ID (for frontend form), expense_category_name is for display
            "suggested_category": expense_category,  # ID
            "expense_category": expense_category,  # ID - what frontend form uses
            "expense_category_name": expense_category_name,  # Name - for display/logging
            "category_confidence": category_confidence,

            # AI-extracted descriptive fields (with template fallbacks)
            "description": extracted.description or (f"Receipt from {extracted.vendor_name}" if extracted.vendor_name else "Receipt expense"),
            "business_purpose": extracted.business_purpose or (f"Business expense - {expense_category_name}" if expense_category_name else "Business expense"),

            # Processing metadata
            "processing_time_ms": processing_time_ms,
            "extracted_at": datetime.utcnow().isoformat(),

            # Token usage for billing
            "tokens_used": token_data,
        }

        # DEBUG: Log final description and business_purpose values
        print(f"[{document_id}] Final description: '{result['description']}'")
        print(f"[{document_id}] Final business_purpose: '{result['business_purpose']}'")

        print(f"[{document_id}] Receipt extraction complete (quality: {extracted.extraction_quality})")
        if extracted.user_message:
            print(f"[{document_id}] User message: {extracted.user_message}")
        if extracted.suggestions:
            print(f"[{document_id}] Suggestions: {extracted.suggestions}")

        return result

    except Exception as e:
        import traceback
        error_msg = f"Receipt extraction failed: {str(e)}"
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
            "user_message": "We couldn't process this receipt. Please try again or upload a clearer image.",
            "suggestions": [
                "Ensure the receipt is well-lit and in focus",
                "Make sure all text is readable",
                "Try taking a photo from directly above the receipt"
            ],
            # Fallback values to prevent empty fields in UI
            "description": "Receipt expense - manual entry required",
            "business_purpose": "Business expense - please specify",
            "expense_category": None,  # Will trigger user to select manually
            "receipt_number": None,
        }


def _fetch_image_bytes(url: str) -> bytes:
    """Fetch image from presigned URL."""
    import httpx
    response = httpx.get(url, timeout=30.0)
    response.raise_for_status()
    return response.content
