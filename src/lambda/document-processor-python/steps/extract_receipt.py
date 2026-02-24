"""
Receipt Extraction Step

Uses DSPy with Gemini 3 Flash for structured receipt data extraction.
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
from steps.dspy_config import ensure_dspy_configured, get_lm
from types_def import BusinessCategory, get_user_friendly_error, ERROR_CODES


# =============================================================================
# Pydantic Models for DSPy
# =============================================================================

class ReceiptLineItem(BaseModel):
    """Line item from receipt."""
    description: str = Field(..., description="Item description")
    quantity: Optional[float] = Field(None, description="Quantity")
    unit_price: Optional[float] = Field(None, description="Price per unit")
    line_total: float = Field(..., description="Total for this line")


class ReceiptAdditionalCharge(BaseModel):
    """A single additional charge on a receipt (tax, service charge, rounding, etc.)."""
    label: str = Field(..., description="Charge label exactly as on receipt, e.g. 'SST (6%)', 'Service Charge (10%)', 'GST 9%', 'Rounding', 'Discount'")
    amount: float = Field(..., description="Charge amount. Use negative values for discounts and rounding adjustments.")
    charge_type: Optional[str] = Field(None, description="Category: 'tax', 'service_charge', 'tip', 'rounding', 'discount', 'other'")


# =============================================================================
# Two-Phase Extraction Schemas
# Phase 1 (CoreReceiptData): Core fields only - NO line_items (~3-4s)
# Phase 2 (LineItemsOnlyData): Line items only (~3-4s)
# =============================================================================

class CoreReceiptData(BaseModel):
    """Phase 1: Core receipt fields only - NO line_items for fast initial render."""
    # Core fields (required)
    vendor_name: str = Field(..., description="Store/merchant name")
    transaction_date: str = Field(..., description="Date in YYYY-MM-DD format")
    total_amount: float = Field(..., description="Final total amount")
    currency: str = Field(..., description="ISO 4217 currency code (SGD, MYR, USD, etc.)")

    # Useful identifiers
    receipt_number: Optional[str] = Field(None, description="Receipt/invoice number")

    # Financial breakdown
    subtotal_amount: Optional[float] = Field(None, description="Subtotal before any additional charges (tax, service charge, etc.)")
    additional_charges: List[ReceiptAdditionalCharge] = Field(
        default_factory=list,
        description="All additional charges after subtotal: taxes (SST, GST, VAT), service charges, tips, rounding adjustments, discounts. Extract each as a separate entry with the exact label from the receipt."
    )

    # Legacy fields (kept for backward compat, will be computed from additional_charges)
    service_charge_amount: Optional[float] = Field(None, description="Service charge amount (deprecated: use additional_charges instead)")
    tax_amount: Optional[float] = Field(None, description="Tax amount (deprecated: use additional_charges instead)")
    tip_amount: Optional[float] = Field(None, description="Tip amount (deprecated: use additional_charges instead)")

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

    # Quality
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence")
    extraction_quality: Literal['high', 'medium', 'low'] = Field(..., description="Quality assessment")


class LineItemsOnlyData(BaseModel):
    """Phase 2: Line items extraction only - runs after core data is sent to frontend."""
    line_items: List[ReceiptLineItem] = Field(default_factory=list, description="Line items from receipt")


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
    subtotal_amount: Optional[float] = Field(None, description="Subtotal before any additional charges (tax, service charge, etc.)")
    additional_charges: List[ReceiptAdditionalCharge] = Field(
        default_factory=list,
        description="All additional charges after subtotal: taxes (SST, GST, VAT), service charges, tips, rounding adjustments, discounts. Extract each as a separate entry with the exact label from the receipt."
    )

    # Legacy fields (kept for backward compat)
    service_charge_amount: Optional[float] = Field(None, description="Service charge amount (deprecated: use additional_charges)")
    tax_amount: Optional[float] = Field(None, description="Tax amount (deprecated: use additional_charges)")
    tip_amount: Optional[float] = Field(None, description="Tip amount (deprecated: use additional_charges)")

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
       - Use LAST PAGE for: total_amount, subtotal_amount, additional_charges (final totals)
       - Payment method may appear on any page - extract from wherever found

    2. ADDITIONAL CHARGES: Extract ALL charges between subtotal and total as additional_charges:
       - Taxes: SST, GST, VAT, Sales Tax, Service Tax — use charge_type='tax'
       - Service charges: 10% service charge, etc. — use charge_type='service_charge'
       - Tips: gratuity, tip — use charge_type='tip'
       - Rounding: bill rounding adjustments (often negative) — use charge_type='rounding'
       - Discounts: member discounts, promotions (negative amounts) — use charge_type='discount'
       Use the EXACT label from the receipt (e.g., 'SST (6%)', 'Service Charge (10%)', 'Rounding Adj')

    3. ERROR HANDLING: If image quality is poor or critical information is missing, provide:
       - A clear user_message explaining the issue
       - Actionable suggestions for improvement (e.g., 'Take a clearer photo', 'Ensure entire receipt is visible')

    4. CATEGORY: Select the BEST matching category from available_categories.
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
        subtotal, additional_charges, and payment method. For currency: determine from vendor
        location and symbols. Select expense_category from available_categories list.
        Set extraction_quality based on image clarity. If quality is 'low' or
        critical fields are missing, provide user_message and suggestions.

        IMPORTANT: Generate 'description' and 'business_purpose' for the expense claim.
        For receipt_number: Look for 'Check #', 'Invoice #', 'Receipt #', 'Ref #', 'No.' or similar.
        IMPORTANT: Extract ALL charges between subtotal and total into additional_charges with exact receipt labels."""
    )


# =============================================================================
# Two-Phase Extraction DSPy Signatures
# Phase 1: Core fields only (~3-4s) - renders immediately
# Phase 2: Line items only (~3-4s) - updates via Convex real-time
# =============================================================================

class CoreReceiptExtractionSignature(dspy.Signature):
    """Phase 1: Fast extraction of core receipt fields WITHOUT line_items.

    This is optimized for speed - extracts only essential fields so frontend
    can render immediately while Phase 2 extracts line items in background.

    Extract: vendor_name, transaction_date, total_amount, currency, receipt_number,
    subtotal_amount, additional_charges, expense_category, description, business_purpose,
    confidence_score, extraction_quality.

    ADDITIONAL CHARGES: Extract ALL charges between subtotal and total into additional_charges:
    - Taxes (SST, GST, VAT) → charge_type='tax'
    - Service charges → charge_type='service_charge'
    - Tips → charge_type='tip'
    - Rounding adjustments (often negative) → charge_type='rounding'
    - Discounts (negative) → charge_type='discount'
    Use the EXACT label from the receipt.

    DO NOT extract: line_items (Phase 2 handles this separately).
    """

    receipt_image: dspy.Image = dspy.InputField(
        desc="Receipt image for core field extraction"
    )

    available_categories: str = dspy.InputField(
        desc="JSON list of expense categories"
    )

    extracted_data: CoreReceiptData = dspy.OutputField(
        desc="""Extract CORE receipt data only (NO line_items):
        vendor_name, transaction_date, total_amount, currency, receipt_number,
        subtotal_amount, additional_charges, expense_category.
        Generate 'description' and 'business_purpose' for the expense claim.
        IMPORTANT: Extract ALL charges between subtotal and total into additional_charges
        with exact labels from the receipt (e.g., 'SST (6%)', 'Service Charge (10%)', 'Rounding').
        Do NOT extract line_items - that happens in Phase 2."""
    )


class LineItemsExtractionSignature(dspy.Signature):
    """Phase 2: Extract line items only from receipt image.

    This runs AFTER Phase 1 has already extracted core fields.
    Focus solely on identifying and extracting individual line items.
    """

    receipt_image: dspy.Image = dspy.InputField(
        desc="Receipt image for line items extraction"
    )

    extracted_data: LineItemsOnlyData = dspy.OutputField(
        desc="""Extract ONLY the line items from the receipt.
        For each item: description, quantity (if shown), unit_price (if shown), line_total.
        Be thorough - capture all individual items/products listed on the receipt."""
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


def find_fallback_category(categories: Optional[List[BusinessCategory]]) -> Optional[BusinessCategory]:
    """
    Find a generic fallback category like 'Miscellaneous' or 'Other' from business categories.

    This is used as a last resort when:
    1. LLM doesn't select a category
    2. Pattern matching doesn't find a match

    Args:
        categories: Business expense categories from Convex

    Returns:
        A fallback BusinessCategory if found, None otherwise
    """
    if not categories:
        return None

    # List of common fallback category names (case-insensitive)
    fallback_names = [
        "miscellaneous",
        "other",
        "general",
        "uncategorized",
        "misc",
        "others",
    ]

    # First pass: exact match (case-insensitive)
    for cat in categories:
        if cat.name.lower() in fallback_names:
            print(f"[Fallback Category] Found exact match: {cat.name}")
            return cat

    # Second pass: partial match (contains)
    for cat in categories:
        cat_name_lower = cat.name.lower()
        for fallback_name in fallback_names:
            if fallback_name in cat_name_lower or cat_name_lower in fallback_name:
                print(f"[Fallback Category] Found partial match: {cat.name}")
                return cat

    print("[Fallback Category] No fallback category found in business categories")
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
) -> Dict[str, Any]:
    """
    Extract structured data from receipt using DSPy with Gemini.

    NOTE: This is the LEGACY single-phase extraction function. For production,
    use extract_receipt_phase1_step() and extract_receipt_phase2_step() which
    provide faster perceived performance via Convex real-time updates.

    Args:
        document_id: Document ID for logging
        images: Converted image info (for PDFs) or None
        storage_path: S3 path to original document
        domain: 'invoices' or 'expense_claims'
        categories: Business categories for categorization
        s3: S3 client instance

    Returns:
        Dict with extracted receipt data including user_message, suggestions, and token usage
    """
    print(f"[{document_id}] Extracting receipt data with DSPy (single-phase)")
    start_time = datetime.utcnow()
    token_data = None

    try:
        # Get page images - fetch all pages for complete extraction
        all_image_bytes = []
        if images and len(images) > 0:
            print(f"[{document_id}] Processing {len(images)} page(s)...")
            for idx in range(len(images)):
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

        # Ensure DSPy is configured (module-level, thread-safe)
        # This avoids threading issues with AWS Durable Execution SDK
        if not ensure_dspy_configured():
            raise ValueError("GEMINI_API_KEY not set - cannot configure DSPy")

        print(f"[{document_id}] Using pre-configured DSPy with Gemini 3 Flash...")

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

        # Run DSPy extraction with full ReceiptData schema
        print(f"[{document_id}] Running DSPy Predict with {len(receipt_images)} page(s)...")
        processor = dspy.Predict(ReceiptExtractionSignature)
        prediction = processor(
            receipt_images=receipt_images,
            available_categories=categories_json
        )
        extracted = prediction.extracted_data

        # Convert line items
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
        token_data = log_token_usage(get_lm(), "gemini-3-flash-preview", image_count=len(receipt_images))

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
                # Fallback to 'Miscellaneous' or 'Other' category if available
                fallback_category = find_fallback_category(categories)
                if fallback_category:
                    expense_category_name = fallback_category.name
                    expense_category_id = fallback_category.id
                    category_confidence = 0.5  # Medium confidence for fallback
                    print(f"[{document_id}] Using fallback category: {expense_category_name} (id: {expense_category_id})")
                else:
                    # No fallback category found - user must select manually in UI
                    expense_category_name = None
                    expense_category_id = None
                    category_confidence = 0.0
                    print(f"[{document_id}] No category match and no fallback - user will select manually")

        # Use category ID for storage (frontend expects ID), name for display/logging
        expense_category = expense_category_id

        # Calculate processing time
        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # Build result
        result = {
            "success": True,
            "backend_used": "dspy_gemini",
            "processing_method": "dspy",
            "document_type": "receipt",
            "model_used": "gemini-3-flash-preview",

            # Core fields
            "vendor_name": extracted.vendor_name,
            "total_amount": extracted.total_amount,
            "currency": extracted.currency,
            "transaction_date": extracted.transaction_date,
            "receipt_number": getattr(extracted, 'receipt_number', None) or "",

            # Vendor details
            "vendor_address": getattr(extracted, 'vendor_address', None) or "",
            "vendor_contact": getattr(extracted, 'vendor_contact', None) or "",

            # Financial breakdown
            "subtotal_amount": getattr(extracted, 'subtotal_amount', None) or 0.0,
            "additional_charges": [
                {"label": c.label, "amount": c.amount, "chargeType": c.charge_type or "other"}
                for c in getattr(extracted, 'additional_charges', []) or []
            ],
            # Legacy fields (computed from additional_charges for backward compat)
            "service_charge_amount": sum(c.amount for c in getattr(extracted, 'additional_charges', []) or [] if c.charge_type == 'service_charge') or getattr(extracted, 'service_charge_amount', None) or 0.0,
            "tax_amount": sum(c.amount for c in getattr(extracted, 'additional_charges', []) or [] if c.charge_type == 'tax') or getattr(extracted, 'tax_amount', None) or 0.0,
            "tip_amount": sum(c.amount for c in getattr(extracted, 'additional_charges', []) or [] if c.charge_type == 'tip') or getattr(extracted, 'tip_amount', None) or 0.0,

            # Payment
            "payment_method": getattr(extracted, 'payment_method', None) or "",

            # Line items
            "line_items": [
                {
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total,
                }
                for item in line_items
            ],

            # Quality - LLM determined
            "confidence": extracted.confidence_score,
            "confidence_score": extracted.confidence_score,
            "extraction_confidence": extracted.confidence_score,
            "extraction_quality": extracted.extraction_quality,
            "missing_fields": getattr(extracted, 'missing_fields', []) or [],
            "requires_validation": extracted.confidence_score < 0.8,

            # User feedback - for UX
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
        user_msg = getattr(extracted, 'user_message', None)
        suggestions = getattr(extracted, 'suggestions', None)
        if user_msg:
            print(f"[{document_id}] User message: {user_msg}")
        if suggestions:
            print(f"[{document_id}] Suggestions: {suggestions}")

        return result

    except Exception as e:
        import traceback
        technical_error = f"Receipt extraction failed: {str(e)}"

        # Log technical details for debugging (visible in CloudWatch)
        print(f"[{document_id}] {technical_error}")
        print(f"[{document_id}] Traceback: {traceback.format_exc()}")

        # Calculate processing time even for failures
        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # Get user-friendly message for frontend display
        user_friendly_msg = get_user_friendly_error(
            ERROR_CODES["EXTRACTION_FAILED"],
            str(e)
        )

        return {
            "success": False,
            "error": technical_error,  # Kept for debugging/logging
            "error_message": user_friendly_msg,  # For frontend display
            "backend_used": "dspy_gemini_failed",
            "processing_time_ms": processing_time_ms,
            "tokens_used": token_data,  # Include if API was called before failure
            # User-friendly error for UX
            "user_message": user_friendly_msg,
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


# =============================================================================
# Two-Phase Extraction Functions
# Phase 1: Core fields only (~3-4s) → frontend renders immediately
# Phase 2: Line items only (~3-4s) → Convex real-time update
# =============================================================================

def extract_receipt_phase1_step(
    document_id: str,
    images: Optional[List[ConvertedImageInfo]],
    storage_path: str,
    domain: str,
    categories: Optional[List[BusinessCategory]],
    s3: S3Client,
) -> Dict[str, Any]:
    """
    Phase 1: Extract core receipt fields WITHOUT line items.

    This provides fast initial rendering (~3-4s) while Phase 2 extracts
    line items in parallel. Uses CoreReceiptExtractionSignature.

    Args:
        document_id: Document ID for logging
        images: Converted image info (for PDFs) or None
        storage_path: S3 path to original document
        domain: 'invoices' or 'expense_claims'
        categories: Business categories for categorization
        s3: S3 client instance

    Returns:
        Dict with core receipt data (no line_items), ready for Convex update
    """
    print(f"[{document_id}] Phase 1: Extracting core receipt fields (NO line_items)")
    start_time = datetime.utcnow()
    token_data = None

    try:
        # Fetch first page only for Phase 1 (core fields are on first page)
        all_image_bytes = []
        if images and len(images) > 0:
            print(f"[{document_id}] Phase 1: Fetching first page only...")
            img_info = images[0]
            image_url = s3.get_presigned_url(img_info.s3_key)
            img_bytes = _fetch_image_bytes(image_url)
            all_image_bytes.append(img_bytes)
        else:
            # Single image (not from PDF conversion)
            image_bytes, _ = get_image_from_s3(s3, storage_path, domain)
            all_image_bytes.append(image_bytes)

        # Ensure DSPy is configured
        if not ensure_dspy_configured():
            raise ValueError("GEMINI_API_KEY not set - cannot configure DSPy")

        # Convert to DSPy image
        pil_image = Image.open(io.BytesIO(all_image_bytes[0]))
        dspy_image = dspy.Image.from_PIL(pil_image)
        print(f"[{document_id}] Phase 1: Image size: {pil_image.size}")

        # Format categories for LLM
        categories_json = format_categories_for_llm(categories)

        # Run Phase 1 extraction - CoreReceiptExtractionSignature (NO line_items)
        print(f"[{document_id}] Phase 1: Running DSPy Predict (core fields only)...")
        processor = dspy.Predict(CoreReceiptExtractionSignature)
        prediction = processor(
            receipt_image=dspy_image,
            available_categories=categories_json
        )
        extracted = prediction.extracted_data

        # Log token usage
        token_data = log_token_usage(get_lm(), "gemini-3-flash-preview", image_count=1)

        print(f"[{document_id}] Phase 1 extracted: {extracted.vendor_name} - {extracted.total_amount} {extracted.currency}")

        # Process category (same logic as main function)
        expense_category = extracted.expense_category
        category_confidence = 0.9
        expense_category_name = None
        expense_category_id = None

        if expense_category and categories:
            matching_cat = next((cat for cat in categories if cat.name == expense_category), None)
            if matching_cat:
                expense_category_name = matching_cat.name
                expense_category_id = matching_cat.id
            else:
                expense_category = None
                category_confidence = 0.0

        if not expense_category:
            # Pattern matching fallback
            category_result = categorize_receipt_fallback(
                vendor_name=extracted.vendor_name,
                line_items=[],  # No line items in Phase 1
                categories=categories,
            )
            if category_result:
                expense_category_name = category_result["category_name"]
                expense_category_id = category_result.get("category_id")
                category_confidence = category_result["confidence"]
            else:
                fallback_category = find_fallback_category(categories)
                if fallback_category:
                    expense_category_name = fallback_category.name
                    expense_category_id = fallback_category.id
                    category_confidence = 0.5

        expense_category = expense_category_id

        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        result = {
            "success": True,
            "phase": 1,
            "backend_used": "dspy_gemini_phase1",
            "processing_method": "dspy_two_phase",
            "document_type": "receipt",
            "model_used": "gemini-3-flash-preview",

            # Core fields
            "vendor_name": extracted.vendor_name,
            "total_amount": extracted.total_amount,
            "currency": extracted.currency,
            "transaction_date": extracted.transaction_date,
            "receipt_number": extracted.receipt_number or "",

            # Financial breakdown
            "subtotal_amount": extracted.subtotal_amount or 0.0,
            "additional_charges": [
                {"label": c.label, "amount": c.amount, "chargeType": c.charge_type or "other"}
                for c in extracted.additional_charges or []
            ],
            # Legacy fields (computed from additional_charges for backward compat)
            "service_charge_amount": sum(c.amount for c in extracted.additional_charges or [] if c.charge_type == 'service_charge') or extracted.service_charge_amount or 0.0,
            "tax_amount": sum(c.amount for c in extracted.additional_charges or [] if c.charge_type == 'tax') or extracted.tax_amount or 0.0,
            "tip_amount": sum(c.amount for c in extracted.additional_charges or [] if c.charge_type == 'tip') or extracted.tip_amount or 0.0,

            # Quality
            "confidence": extracted.confidence_score,
            "confidence_score": extracted.confidence_score,
            "extraction_quality": extracted.extraction_quality,

            # Category
            "expense_category": expense_category,
            "expense_category_name": expense_category_name,
            "category_confidence": category_confidence,

            # AI-generated fields
            "description": extracted.description or (f"Receipt from {extracted.vendor_name}" if extracted.vendor_name else "Receipt expense"),
            "business_purpose": extracted.business_purpose or (f"Business expense - {expense_category_name}" if expense_category_name else "Business expense"),

            # Processing metadata
            "processing_time_ms": processing_time_ms,
            "extracted_at": datetime.utcnow().isoformat(),
            "tokens_used": token_data,

            # Phase 1 does NOT include line_items - they come in Phase 2
            "line_items": [],  # Empty - Phase 2 will populate
        }

        print(f"[{document_id}] Phase 1 complete in {processing_time_ms}ms")
        return result

    except Exception as e:
        import traceback
        print(f"[{document_id}] Phase 1 failed: {str(e)}")
        print(f"[{document_id}] Traceback: {traceback.format_exc()}")

        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        user_friendly_msg = get_user_friendly_error(ERROR_CODES["EXTRACTION_FAILED"], str(e))

        return {
            "success": False,
            "phase": 1,
            "error": f"Phase 1 extraction failed: {str(e)}",
            "error_message": user_friendly_msg,
            "backend_used": "dspy_gemini_phase1_failed",
            "processing_time_ms": processing_time_ms,
            "tokens_used": token_data,
        }


def extract_receipt_phase2_step(
    document_id: str,
    images: Optional[List[ConvertedImageInfo]],
    storage_path: str,
    domain: str,
    s3: S3Client,
) -> Dict[str, Any]:
    """
    Phase 2: Extract line items only from receipt.

    Called AFTER Phase 1 has already updated Convex with core fields.
    This runs in parallel with frontend rendering and updates Convex
    via real-time when complete.

    Args:
        document_id: Document ID for logging
        images: Converted image info (for PDFs) or None
        storage_path: S3 path to original document
        domain: 'invoices' or 'expense_claims'
        s3: S3 client instance

    Returns:
        Dict with line_items only, ready for Convex update
    """
    print(f"[{document_id}] Phase 2: Extracting line items only")
    start_time = datetime.utcnow()
    token_data = None

    try:
        # Fetch first page (line items typically on same page as totals)
        all_image_bytes = []
        if images and len(images) > 0:
            print(f"[{document_id}] Phase 2: Fetching first page for line items...")
            img_info = images[0]
            image_url = s3.get_presigned_url(img_info.s3_key)
            img_bytes = _fetch_image_bytes(image_url)
            all_image_bytes.append(img_bytes)
        else:
            image_bytes, _ = get_image_from_s3(s3, storage_path, domain)
            all_image_bytes.append(image_bytes)

        # Ensure DSPy is configured
        if not ensure_dspy_configured():
            raise ValueError("GEMINI_API_KEY not set - cannot configure DSPy")

        # Convert to DSPy image
        pil_image = Image.open(io.BytesIO(all_image_bytes[0]))
        dspy_image = dspy.Image.from_PIL(pil_image)

        # Run Phase 2 extraction - LineItemsExtractionSignature (line_items only)
        print(f"[{document_id}] Phase 2: Running DSPy Predict (line items only)...")
        processor = dspy.Predict(LineItemsExtractionSignature)
        prediction = processor(receipt_image=dspy_image)
        extracted = prediction.extracted_data

        # Log token usage
        token_data = log_token_usage(get_lm(), "gemini-3-flash-preview", image_count=1)

        # Convert line items to dict format with defensive None handling
        # Convex requires: description (string), line_total (number), quantity/unit_price (optional number)
        # IMPORTANT: Convex v.optional() expects undefined, not null. Omit keys with None values.
        line_items = []
        for item in (extracted.line_items or []):
            # Skip items with missing required fields
            if not item.description or item.line_total is None:
                print(f"[{document_id}] Skipping invalid line item: description={item.description}, line_total={item.line_total}")
                continue

            line_item = {
                "description": str(item.description),  # Ensure string
                "line_total": float(item.line_total),  # Ensure number, required
            }
            # Only include optional fields if they have values (omit = undefined in Convex)
            if item.quantity is not None:
                line_item["quantity"] = float(item.quantity)
            if item.unit_price is not None:
                line_item["unit_price"] = float(item.unit_price)

            line_items.append(line_item)

        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        print(f"[{document_id}] Phase 2 extracted {len(line_items)} line items in {processing_time_ms}ms")

        return {
            "success": True,
            "phase": 2,
            "line_items": line_items,
            "line_items_count": len(line_items),
            "processing_time_ms": processing_time_ms,
            "tokens_used": token_data,
        }

    except Exception as e:
        import traceback
        print(f"[{document_id}] Phase 2 failed: {str(e)}")
        print(f"[{document_id}] Traceback: {traceback.format_exc()}")

        processing_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        return {
            "success": False,
            "phase": 2,
            "error": f"Phase 2 extraction failed: {str(e)}",
            "line_items": [],  # Empty on failure
            "processing_time_ms": processing_time_ms,
            "tokens_used": token_data,
        }
