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
    selected_category: Optional[str] = Field(None, description="Selected expense category name")
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


# DSPy Signature for receipt extraction
class SimpleReceiptSignature(dspy.Signature):
    """Fast structured extraction for receipts with user-friendly error handling.
    IMPORTANT: If the image quality is poor or critical information is missing, provide:
    1. A clear user_message explaining the issue
    2. Actionable suggestions for improvement (e.g., 'Take a clearer photo', 'Ensure entire receipt is visible')
    """
    receipt_image: dspy.Image = dspy.InputField(desc="Receipt image for analysis")
    available_categories: str = dspy.InputField(desc="JSON list of available expense categories")
    extracted_data: ExtractedReceiptData = dspy.OutputField(desc="Complete structured receipt data with selected category, user_message for issues, and suggestions for improvement")


class ReceiptExtractor(dspy.Module):
    """DSPy extractor for receipt processing"""

    def __init__(self, model_name: str = "gemini-2.5-flash"):
        super().__init__()
        self.model_name = model_name
        self.extractor = dspy.Predict(SimpleReceiptSignature)

    def forward(self, image_data: Dict[str, Any], business_categories: List[Dict] = None) -> ExtractedReceiptData:
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

        return prediction.extracted_data

    def _format_categories_for_llm(self, business_categories: List[Dict] = None) -> str:
        """Format business categories as JSON for LLM"""
        if not business_categories:
            fallback_categories = [
                {"category_name": "Office Supplies", "category_code": "office_supplies"},
                {"category_name": "Business Meals & Entertainment", "category_code": "entertainment"},
                {"category_name": "Transportation & Travel", "category_code": "transport"},
                {"category_name": "Other Business Expenses", "category_code": "other"}
            ]
            return json.dumps(fallback_categories)

        formatted_categories = [
            {
                "category_name": cat.get('category_name', cat.get('name', 'Unknown')),
                "category_code": cat.get('category_code', cat.get('code', 'other'))
            }
            for cat in business_categories
        ]

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
        dspy.settings.configure(lm=gemini_lm, adapter=dspy.JSONAdapter())

        # Run extraction
        print("🧠 Running DSPy receipt extraction...", file=sys.stderr)
        extractor = ReceiptExtractor(model_name="gemini-2.5-flash")
        extracted_data = extractor(image_data=image_data, business_categories=business_categories)

        # Update backend info
        extracted_data.backend_used = 'gemini_dspy'
        extracted_data.model_used = 'gemini-2.5-flash'

        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)

        print(f"✅ DSPy extraction completed: {extracted_data.vendor_name}, {extracted_data.total_amount} {extracted_data.currency}", file=sys.stderr)

        # Convert to dictionary format expected by TypeScript
        result_data = {
            "vendor_name": extracted_data.vendor_name,
            "total_amount": extracted_data.total_amount,
            "currency": extracted_data.currency,
            "transaction_date": extracted_data.transaction_date,
            "description": f"{extracted_data.vendor_name} - {extracted_data.transaction_date}",
            "suggested_category": extracted_data.selected_category,
            "business_purpose": f"Business expense at {extracted_data.vendor_name}",
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
            "processing_time_ms": processing_time
        }

    except Exception as e:
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        print(f"❌ DSPy extraction failed: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)

        return {
            "success": False,
            "error": str(e),
            "extraction_method": "dspy",
            "processing_time_ms": processing_time
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
                processing_time_ms=extraction_result.get('processing_time_ms', 0)
            )
        else:
            response = ScriptResponse(
                success=False,
                error=extraction_result.get('error', 'Unknown extraction error'),
                debug_info=extraction_result
            )

    except Exception as e:
        print(f"❌ Critical error in main(): {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        response = ScriptResponse(
            success=False,
            error=f"Critical execution error: {str(e)}",
            debug_info={"error_type": type(e).__name__}
        )

    # CRITICAL: Only this line outputs to stdout - everything else goes to stderr
    print(response.model_dump_json())


if __name__ == "__main__":
    main()