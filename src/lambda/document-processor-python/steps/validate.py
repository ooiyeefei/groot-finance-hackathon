"""
Document Validation Step

Uses Gemini 2.5 Flash for visual validation of document type.
Determines if a document is an invoice, receipt, or unsupported type.
"""

import os
import base64
from typing import Dict, Any, List, Optional

import httpx

from utils.s3_client import S3Client, ConvertedImageInfo
from steps.convert_pdf import get_image_from_s3


def validate_document_step(
    document_id: str,
    images: Optional[List[ConvertedImageInfo]],
    storage_path: str,
    domain: str,
    expected_type: Optional[str],
    s3: S3Client,
) -> Dict[str, Any]:
    """
    Validate document type using Gemini 2.5 Flash.

    Args:
        document_id: Document ID for logging
        images: Converted image info (for PDFs) or None (for direct images)
        storage_path: S3 path to original document
        domain: 'invoices' or 'expense_claims'
        expected_type: Expected document type ('invoice' or 'receipt')
        s3: S3 client instance

    Returns:
        Dict with:
        - is_supported: Whether document is processable
        - document_type: Detected type ('invoice', 'receipt', or 'unknown')
        - confidence: Confidence score (0-1)
        - reasoning: Explanation of classification
        - user_message: Message for end user (if unsupported)
    """
    print(f"[{document_id}] Validating document type with Gemini")

    try:
        # Get image data
        if images and len(images) > 0:
            # Use first converted image
            image_url = s3.get_presigned_url(images[0].s3_key)
            image_bytes, mime_type = _fetch_image_from_url(image_url)
        else:
            # Use original image directly
            image_bytes, mime_type = get_image_from_s3(s3, storage_path, domain)

        # Convert to base64
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")

        # Call Gemini for classification
        result = _classify_with_gemini(
            document_id=document_id,
            image_base64=image_base64,
            mime_type=mime_type,
            expected_type=expected_type,
        )

        return result

    except Exception as e:
        error_msg = f"Validation failed: {str(e)}"
        print(f"[{document_id}] {error_msg}")
        return {
            "is_supported": False,
            "document_type": "unknown",
            "confidence": 0.0,
            "reasoning": error_msg,
            "user_message": "Failed to validate document. Please try again.",
        }


def _fetch_image_from_url(url: str) -> tuple:
    """Fetch image from presigned URL."""
    response = httpx.get(url, timeout=30.0)
    response.raise_for_status()

    # Detect MIME type from URL or response headers
    content_type = response.headers.get("content-type", "image/png")
    return response.content, content_type


def _classify_with_gemini(
    document_id: str,
    image_base64: str,
    mime_type: str,
    expected_type: Optional[str],
) -> Dict[str, Any]:
    """
    Classify document using Gemini 2.5 Flash.

    Args:
        document_id: Document ID for logging
        image_base64: Base64-encoded image
        mime_type: Image MIME type
        expected_type: Expected document type

    Returns:
        Classification result
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not set")

    # Build classification prompt
    prompt = """Analyze this document image and classify it.

Determine:
1. Is this a financial document (invoice, receipt, bill)?
2. What specific type is it?
3. Is the image quality sufficient for data extraction?

Respond in JSON format:
{
    "document_type": "invoice" | "receipt" | "bill" | "unknown",
    "is_financial_document": true | false,
    "quality_assessment": "good" | "fair" | "poor",
    "confidence": 0.0-1.0,
    "detected_elements": {
        "has_vendor_name": true | false,
        "has_total_amount": true | false,
        "has_date": true | false,
        "has_line_items": true | false
    },
    "reasoning": "Brief explanation"
}"""

    # Gemini API endpoint - use gemini-3.1-flash-lite-preview (best price/performance)
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={api_key}"

    # Build request payload
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": image_base64,
                        }
                    },
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
        },
    }

    # Call Gemini API with retry logic for transient failures
    import json
    import time
    from json_repair import repair_json

    max_retries = 3
    classification = None

    for attempt in range(max_retries):
        try:
            print(f"[{document_id}] Calling Gemini for classification (attempt {attempt + 1}/{max_retries})...")
            response = httpx.post(
                api_url,
                json=payload,
                timeout=60.0,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()

            # Parse response
            result = response.json()
            candidates = result.get("candidates", [])
            if not candidates:
                raise ValueError("No candidates in Gemini response")

            # Check finish reason for potential issues
            finish_reason = candidates[0].get("finishReason", "STOP")
            if finish_reason != "STOP":
                print(f"[{document_id}] Warning: Gemini finish_reason={finish_reason}")

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                raise ValueError("No parts in Gemini response")

            # Parse JSON from response text
            response_text = parts[0].get("text", "{}")

            try:
                classification = json.loads(response_text)
            except json.JSONDecodeError as e:
                print(f"[{document_id}] JSON parse error: {e}")
                print(f"[{document_id}] Raw response (first 200 chars): {response_text[:200]}")

                # Try json_repair for malformed JSON
                repaired_text = repair_json(response_text, return_objects=False)
                classification = json.loads(repaired_text)
                print(f"[{document_id}] JSON repaired successfully")

            # Validate response has required fields with reasonable values
            confidence = classification.get("confidence", 0.0)
            doc_type = classification.get("document_type", "unknown")

            # If confidence is 0.0 and doc_type is valid, this looks like truncation - retry
            if confidence == 0.0 and doc_type in ["invoice", "receipt", "bill"]:
                if attempt < max_retries - 1:
                    print(f"[{document_id}] Suspicious response (valid doc_type but confidence=0), retrying...")
                    time.sleep(1)  # Brief delay before retry
                    continue
                else:
                    # Final attempt: if doc_type is valid, use conservative confidence
                    print(f"[{document_id}] Final attempt: using default confidence 0.7 for valid doc_type")
                    classification["confidence"] = 0.7

            break  # Success - exit retry loop

        except Exception as e:
            if attempt < max_retries - 1:
                print(f"[{document_id}] Attempt {attempt + 1} failed: {e}, retrying...")
                time.sleep(1)
            else:
                raise  # Re-raise on final attempt

    print(f"[{document_id}] Classification: {classification.get('document_type')} (confidence: {classification.get('confidence', 0):.2f})")

    # Determine if document is supported
    is_financial = classification.get("is_financial_document", False)
    doc_type = classification.get("document_type", "unknown")
    confidence = classification.get("confidence", 0.0)
    quality = classification.get("quality_assessment", "fair")

    # Support logic
    is_supported = (
        is_financial
        and doc_type in ["invoice", "receipt", "bill"]
        and quality != "poor"
        and confidence >= 0.5
    )

    # Check against expected type if provided
    type_mismatch = False
    if expected_type and is_supported:
        if expected_type == "invoice" and doc_type == "receipt":
            type_mismatch = True
        elif expected_type == "receipt" and doc_type == "invoice":
            type_mismatch = True

    # Normalize document type
    if doc_type == "bill":
        doc_type = "invoice"  # Treat bills as invoices

    # Build user message for unsupported documents
    user_message = None
    if not is_supported:
        if quality == "poor":
            user_message = "The image quality is too low for accurate extraction. Please upload a clearer image."
        elif not is_financial:
            user_message = "This doesn't appear to be a financial document. Please upload an invoice or receipt."
        elif confidence < 0.5:
            user_message = "Unable to confidently identify this document. Please ensure the full document is visible."
        else:
            user_message = "This document type is not currently supported."
    elif type_mismatch:
        user_message = f"This appears to be a {doc_type}, but you uploaded it as {expected_type}."

    return {
        "is_supported": is_supported,
        "document_type": doc_type,
        "confidence": confidence,
        "reasoning": classification.get("reasoning", ""),
        "detected_elements": classification.get("detected_elements", {}),
        "quality_assessment": quality,
        "user_message": user_message,
        "type_mismatch": type_mismatch,
    }
