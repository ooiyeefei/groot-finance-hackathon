#!/usr/bin/env python3
"""
DSPy Receipt Extraction Script
Follows extract tasks architecture pattern: receives signed URLs, downloads images, processes with DSPy
"""

import sys
import json
import base64
import requests
import mimetypes
import traceback
from typing import Dict, Any, Optional, List
from datetime import datetime
from io import BytesIO
from contextlib import redirect_stdout
import io
import os

# DSPy imports
import dspy

# Pydantic models for structured output
from pydantic import BaseModel, Field
from typing import Literal


def log_gemini_usage(lm, model_name: str, image_count: int = 0) -> Dict[str, Any]:
    """
    Log Gemini API usage for cost tracking and return token data.

    Args:
        lm: The configured dspy.LM object
        model_name: Name of the Gemini model being used
        image_count: Number of images sent in the API call

    Returns:
        Dict with token usage data for billing
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
            # Get the most recent API call from history
            last_call = lm.history[-1]

            # Extract usage data from the last call
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

                # Print usage log to stderr for Trigger.dev logs
                print(f"[Usage] Model: {model_name}, Images: {image_count}, Input Tokens: {prompt_tokens}, Output Tokens: {completion_tokens}, Total Tokens: {total_tokens}", file=sys.stderr)
            else:
                print(f"[Usage] Model: {model_name}, Images: {image_count}, No usage data available in history", file=sys.stderr)
        else:
            print(f"[Usage] Model: {model_name}, Images: {image_count}, LM history not available", file=sys.stderr)
    except Exception as e:
        print(f"[Usage] Failed to log usage: {str(e)}", file=sys.stderr)

    return token_data


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
    receipt_number: Optional[str] = Field(None, description="Receipt, invoice, or reference number")
    line_items: List[ExtractedLineItem] = Field(default_factory=list, description="Individual purchased items")
    selected_category: Optional[str] = Field(None, description="REQUIRED: Select ONE category_name from available_categories JSON list. Must EXACTLY match a category_name value provided.")
    suggested_description: Optional[str] = Field(None, description="Concise expense description (2-5 words) based on vendor and items. E.g., 'Team lunch supplies', 'Office printer ink', 'Client meeting dinner'. Do NOT include date or amounts.")
    suggested_business_purpose: Optional[str] = Field(None, description="Professional justification for this expense (1 sentence). E.g., 'Office supplies for Q1 inventory', 'Client entertainment for project kickoff', 'Team building meal'. Be specific to visible receipt content.")
    extraction_quality: Literal['high', 'medium', 'low'] = Field(..., description="Quality assessment")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence score")
    dspy_confidence: float = Field(..., ge=0.0, le=1.0, description="DSPy model confidence")
    missing_fields: List[str] = Field(default_factory=list, description="Fields that couldn't be extracted")
    processing_method: Literal['dspy', 'manual_entry'] = Field(default='dspy')
    model_used: Optional[str] = Field(None, description="AI model used for extraction")
    backend_used: Optional[str] = Field(None, description="Backend used: gemini_dspy or vllm_dspy")
    user_message: Optional[str] = Field(None, description="User-friendly message explaining the extraction results or issues")
    suggestions: Optional[List[str]] = Field(None, description="Actionable suggestions for improving extraction quality")


class ScriptResponse(BaseModel):
    success: bool = Field(..., description="Whether the script executed successfully")
    data: Optional[Dict[str, Any]] = Field(None, description="Extraction result data")
    error: Optional[str] = Field(None, description="Error message if failed")
    debug_info: Optional[Dict[str, Any]] = Field(None, description="Debug information")
    processing_time_ms: Optional[int] = Field(None, description="Processing time in milliseconds")
    tokens_used: Optional[Dict[str, Any]] = Field(None, description="API token usage for billing")


# DSPy Signature for receipt extraction
class SimpleReceiptSignature(dspy.Signature):
    """Fast structured extraction for receipts with user-friendly error handling.

    CATEGORY SELECTION (CRITICAL):
    - Parse available_categories JSON to get the list of valid category names
    - For selected_category, you MUST choose exactly one category_name from the list
    - Match the receipt vendor/items to the most appropriate expense category

    DESCRIPTION & BUSINESS PURPOSE (IMPORTANT):
    - suggested_description: Concise 2-5 word summary (e.g., 'Office supplies purchase', 'Team lunch')
    - suggested_business_purpose: Professional 1-sentence justification based on receipt content

    ERROR HANDLING:
    If the image quality is poor or critical information is missing, provide:
    1. A clear user_message explaining the issue
    2. Actionable suggestions for improvement (e.g., 'Take a clearer photo', 'Ensure entire receipt is visible')
    """
    receipt_image: dspy.Image = dspy.InputField(desc="Receipt image for analysis")
    available_categories: str = dspy.InputField(desc="JSON list of available expense categories with category_name and id fields. Select ONE category_name for categorization.")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data with: selected_category from available_categories, suggested_description (2-5 words), and suggested_business_purpose (1 sentence).")


class ReceiptExtractor(dspy.Module):
    """DSPy extractor for receipt processing"""

    def __init__(self, model_name: str = "gemini-2.5-flash"):
        super().__init__()
        self.model_name = model_name
        self.extractor = dspy.ChainOfThought(SimpleReceiptSignature)

    def forward(self, image_data: Dict[str, Any], business_categories: List[Dict] = None):
        """Process receipt image with DSPy"""

        # Convert base64 to dspy.Image
        if not image_data or not image_data.get('base64'):
            raise ValueError("No valid image data provided")

        try:
            from PIL import Image
            image_bytes = base64.b64decode(image_data['base64'])
            pil_image = Image.open(BytesIO(image_bytes))
            dspy_image = dspy.Image.from_PIL(pil_image)
            print("🖼️ Created dspy.Image from PIL for processing", file=sys.stderr)
        except Exception as img_error:
            print(f"❌ Failed to create dspy.Image: {img_error}", file=sys.stderr)
            raise ValueError(f"Failed to process image: {img_error}")

        # Format categories for LLM
        categories_json = self._format_categories_for_llm(business_categories)

        # Run DSPy extraction
        prediction = self.extractor(
            receipt_image=dspy_image,
            available_categories=categories_json
        )

        # Log API usage for cost tracking and capture token data
        token_data = None
        if hasattr(dspy.settings, 'lm') and dspy.settings.lm:
            token_data = log_gemini_usage(dspy.settings.lm, "gemini-2.5-flash", image_count=1)

        # Return the full prediction object and token data
        return prediction, token_data

    def _format_categories_for_llm(self, business_categories: List[Dict] = None) -> str:
        """Format business categories as JSON for LLM"""
        if not business_categories:
            # Fallback categories when no business categories provided
            # Note: Using 'id' instead of 'category_code' for consistency with Convex schema
            fallback_categories = [
                {"category_name": "Office Supplies", "id": "fallback_office_supplies"},
                {"category_name": "Business Meals & Entertainment", "id": "fallback_entertainment"},
                {"category_name": "Transportation & Travel", "id": "fallback_transport"},
                {"category_name": "Other Business Expenses", "id": "fallback_other"}
            ]
            print(f"⚠️ No business categories provided, using {len(fallback_categories)} fallback categories", file=sys.stderr)
            return json.dumps(fallback_categories)

        # Format business categories for LLM - uses 'id' (Convex document ID) for lookups
        formatted_categories = [
            {
                "category_name": cat.get('category_name', cat.get('name', 'Unknown')),
                "id": cat.get('id', cat.get('_id', 'unknown'))
            }
            for cat in business_categories
        ]

        # Log category names for debugging
        category_names = [c["category_name"] for c in formatted_categories]
        print(f"🏷️ {len(formatted_categories)} business categories available: {category_names}", file=sys.stderr)

        return json.dumps(formatted_categories)


def download_image_from_url(image_url: str) -> Dict[str, Any]:
    """Download image from signed URL and convert to base64"""
    print(f"🌐 Downloading image from signed URL...", file=sys.stderr)

    try:
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()

        # Get MIME type from response headers or URL extension
        content_type = response.headers.get('content-type', '')
        if not content_type:
            content_type = mimetypes.guess_type(image_url)[0] or 'image/jpeg'

        # Convert to base64 format expected by DSPy processing
        image_base64 = base64.b64encode(response.content).decode('utf-8')

        image_data = {
            'base64': image_base64,
            'mimeType': content_type,
            'filename': 'receipt.jpg'  # Default filename
        }

        print(f"✅ Successfully downloaded image ({len(response.content)} bytes, {content_type})", file=sys.stderr)
        return image_data

    except Exception as download_error:
        print(f"❌ Failed to download image from URL: {str(download_error)}", file=sys.stderr)
        raise download_error


def process_receipt_extraction(params: Dict[str, Any]) -> Dict[str, Any]:
    """Main DSPy receipt extraction logic"""
    start_time = datetime.now()

    # Extract parameters
    image_url = params.get('imageUrl')
    image_data = params.get('imageData')
    business_categories = params.get('businessCategories', [])
    forced_method = params.get('forcedProcessingMethod', 'auto')
    expense_claim_id = params.get('expenseClaimId')

    print(f"📊 Processing parameters: imageUrl={bool(image_url)}, imageData={bool(image_data)}, categories={len(business_categories)}", file=sys.stderr)

    # Handle image input - prioritize signed URL download
    if image_url and not image_data:
        image_data = download_image_from_url(image_url)

    if not image_data or not image_data.get('base64'):
        return {
            "success": False,
            "error": "No receipt image data provided for DSPy processing"
        }

    try:
        # Configure DSPy with Gemini
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not found")

        print("🚀 Configuring DSPy with Gemini 2.5 Flash", file=sys.stderr)
        gemini_lm = dspy.LM(
            model="gemini/gemini-2.5-flash",
            api_key=api_key,
            temperature=0.1,
            max_tokens=4000
        )
        # ✅ Enable usage tracking for cost monitoring
        dspy.settings.configure(lm=gemini_lm, adapter=dspy.JSONAdapter(), track_usage=True)

        # Run extraction
        print("🧠 Running DSPy receipt extraction...", file=sys.stderr)
        extractor = ReceiptExtractor(model_name="gemini-2.5-flash")
        prediction, token_data = extractor(image_data=image_data, business_categories=business_categories)

        # Extract the data from the prediction
        extracted_data = prediction.extracted_data

        # Create a new instance with updated backend info (Pydantic model is immutable)
        extracted_data = extracted_data.model_copy(update={
            'backend_used': 'gemini_dspy',
            'model_used': 'gemini-2.5-flash'
        })

        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

        print(f"✅ DSPy extraction completed: {extracted_data.vendor_name}, {extracted_data.total_amount} {extracted_data.currency}", file=sys.stderr)
        print(f"🏷️ DSPy selected category: '{extracted_data.selected_category}'", file=sys.stderr)

        # Use AI-generated suggestions if available, otherwise fall back to templates
        description = extracted_data.suggested_description or f"{extracted_data.vendor_name} expense"
        business_purpose = extracted_data.suggested_business_purpose or f"Business expense at {extracted_data.vendor_name}"

        print(f"📝 AI-generated description: '{description}'", file=sys.stderr)
        print(f"📝 AI-generated business purpose: '{business_purpose}'", file=sys.stderr)

        # Convert to dictionary format expected by TypeScript
        result_data = {
            "vendor_name": extracted_data.vendor_name,
            "total_amount": extracted_data.total_amount,
            "currency": extracted_data.currency,
            "transaction_date": extracted_data.transaction_date,
            "description": description,
            "suggested_category": extracted_data.selected_category,
            "business_purpose": business_purpose,
            "line_items": [
                {
                    "description": item.description,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "line_total": item.line_total,
                    "total_amount": item.line_total
                }
                for item in extracted_data.line_items
            ],
            "tax_amount": extracted_data.tax_amount,
            "receipt_number": extracted_data.receipt_number,
            "confidence_score": extracted_data.confidence_score,
            "extraction_method": "dspy",
            "processing_tier": 1,
            "requires_validation": extracted_data.confidence_score < 0.8,
            "missing_fields": extracted_data.missing_fields,
            "processing_time_ms": processing_time,
            "extraction_quality": extracted_data.extraction_quality,
            "model_used": extracted_data.model_used,
            "backend_used": extracted_data.backend_used,
            "user_message": extracted_data.user_message,
            "suggestions": extracted_data.suggestions
        }

        return {
            "success": True,
            "data": result_data,
            "processing_time_ms": processing_time,
            "tokens_used": token_data
        }

    except Exception as e:
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        print(f"❌ DSPy extraction failed: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

        return {
            "success": False,
            "error": str(e),
            "extraction_method": "dspy",
            "processing_time_ms": processing_time,
            "tokens_used": None  # No tokens consumed if failed before API call
        }


def main():
    """Main execution function"""
    print("🚀 Starting DSPy receipt extraction", file=sys.stderr)

    try:
        # Parse command line arguments
        if len(sys.argv) < 2:
            raise ValueError("Missing parameters argument")

        params_json = sys.argv[1]
        params = json.loads(params_json)

        print(f"📝 Received parameters: {list(params.keys())}", file=sys.stderr)

        # Redirect stdout during processing to prevent pollution
        dummy_stdout = io.StringIO()

        with redirect_stdout(dummy_stdout):
            print("🛡️ DSPy processing protected from stdout pollution", file=sys.stderr)
            extraction_result = process_receipt_extraction(params)

        # Check for stdout pollution
        captured_output = dummy_stdout.getvalue()
        if captured_output.strip():
            print(f"🚨 Captured stdout pollution ({len(captured_output)} chars)", file=sys.stderr)
        else:
            print("✅ No stdout pollution detected", file=sys.stderr)

        print(f"✅ Extraction completed: {extraction_result.get('success', False)}", file=sys.stderr)

        # Create response
        if extraction_result.get('success', False):
            response = ScriptResponse(
                success=True,
                data=extraction_result['data'],
                processing_time_ms=extraction_result.get('processing_time_ms', 0),
                tokens_used=extraction_result.get('tokens_used')
            )
        else:
            response = ScriptResponse(
                success=False,
                error=extraction_result.get('error', 'Unknown extraction error'),
                debug_info=extraction_result,
                tokens_used=extraction_result.get('tokens_used')  # Include if API was called before failure
            )

    except Exception as e:
        print(f"❌ Critical error in main(): {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        response = ScriptResponse(
            success=False,
            error=f"Critical execution error: {str(e)}",
            debug_info={"error_type": type(e).__name__},
            tokens_used=None  # No API call made
        )

    # CRITICAL: Only this line outputs to stdout - everything else goes to stderr
    print(response.model_dump_json())


if __name__ == "__main__":
    main()