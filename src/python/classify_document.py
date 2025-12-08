#!/usr/bin/env python3
"""
Enhanced Document Classification Engine
Uses structured AI signatures for reliable, controlled classification output
"""

import sys
import json
import base64
import os
import requests
from typing import Dict, Any
from io import BytesIO

# Check for critical dependencies
try:
    from PIL import Image
    import dspy
    DEPENDENCIES_AVAILABLE = True
except ImportError as e:
    DEPENDENCIES_AVAILABLE = False
    MISSING_DEPENDENCY_ERROR = f"Missing dependency: {str(e)}"

def truncate_error_message(message: str, max_length: int = 500) -> str:
    """Truncate error messages to prevent massive database entries"""
    if len(message) <= max_length:
        return message
    return message[:max_length] + f"... [truncated, original length: {len(message)}]"

def log_gemini_usage(lm, model_name: str, image_count: int = 0):
    """
    Log Gemini API usage for cost tracking with robust 4-tier fallback system.

    Args:
        lm: The configured dspy.LM object
        model_name: Name of the Gemini model being used
        image_count: Number of images sent in the API call

    Note: Requires dspy.settings.configure(track_usage=True) to populate lm.history with usage data
    """
    try:
        # Debug: Check if track_usage is enabled
        import dspy
        track_usage_enabled = getattr(dspy.settings, 'track_usage', False)
        if not track_usage_enabled:
            print(f"[Usage] WARNING: track_usage is disabled - usage data will NOT be available. Enable with dspy.settings.configure(track_usage=True)", file=sys.stderr)
            return

        if not (hasattr(lm, 'history') and lm.history):
            print(f"[Usage] WARNING: LM history is empty or not available - model may not have been called yet", file=sys.stderr)
            return

        # Get the most recent API call from history
        last_call = lm.history[-1]
        print(f"[Usage] DEBUG: last_call type: {type(last_call)}, keys: {last_call.keys() if isinstance(last_call, dict) else 'N/A'}", file=sys.stderr)

        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        fallback_used = None

        # ============ TIER 1: Standard 'usage' dictionary ============
        usage = last_call.get('usage') if isinstance(last_call, dict) else None
        if usage and isinstance(usage, dict) and usage:  # Check it's not None or empty dict
            prompt_tokens = usage.get('prompt_tokens', usage.get('input_tokens', 0))
            completion_tokens = usage.get('completion_tokens', usage.get('output_tokens', 0))
            total_tokens = usage.get('total_tokens', prompt_tokens + completion_tokens)
            if total_tokens > 0:
                fallback_used = "Tier 1: Standard usage dict"
                print(f"[Usage] {fallback_used}", file=sys.stderr)

        # ============ TIER 2: Check 'cost' field ============
        if total_tokens == 0 and isinstance(last_call, dict):
            cost_data = last_call.get('cost')
            if cost_data:
                print(f"[Usage] Tier 2: Found cost field but no token extraction method implemented", file=sys.stderr)
                fallback_used = "Tier 2: Cost field (no tokens)"

        # ============ TIER 3: Raw response 'usage_metadata' (Gemini API) ============
        if total_tokens == 0 and isinstance(last_call, dict):
            response = last_call.get('response')
            if response:
                # Try accessing as object attribute
                if hasattr(response, 'usage_metadata'):
                    try:
                        metadata = response.usage_metadata
                        # Google Gemini uses these field names
                        prompt_tokens = getattr(metadata, 'prompt_token_count', 0)
                        completion_tokens = getattr(metadata, 'candidates_token_count', 0)
                        total_tokens = getattr(metadata, 'total_token_count', prompt_tokens + completion_tokens)
                        if total_tokens > 0:
                            fallback_used = "Tier 3: response.usage_metadata (object)"
                            print(f"[Usage] {fallback_used}", file=sys.stderr)
                    except Exception as e:
                        print(f"[Usage] Tier 3 object access failed: {e}", file=sys.stderr)

                # Try accessing as dict
                if total_tokens == 0 and isinstance(response, dict):
                    metadata = response.get('usage_metadata', {})
                    if metadata:
                        prompt_tokens = metadata.get('prompt_token_count', 0)
                        completion_tokens = metadata.get('candidates_token_count', 0)
                        total_tokens = metadata.get('total_token_count', prompt_tokens + completion_tokens)
                        if total_tokens > 0:
                            fallback_used = "Tier 3: response.usage_metadata (dict)"
                            print(f"[Usage] {fallback_used}", file=sys.stderr)

        # ============ TIER 4: Estimation as last resort ============
        if total_tokens == 0:
            print(f"[Usage] Tier 4: Estimating tokens based on content length", file=sys.stderr)
            # Estimate from prompt/response content
            prompt_content = ""
            response_content = ""

            if isinstance(last_call, dict):
                # Get prompt from messages
                messages = last_call.get('messages', [])
                if messages:
                    prompt_content = str(messages)

                # Get response outputs
                outputs = last_call.get('outputs')
                if outputs:
                    response_content = str(outputs)

            # Heuristic: 1 token ≈ 4 characters, plus ~258 tokens per image
            prompt_tokens = len(prompt_content) // 4 + (image_count * 258)
            completion_tokens = len(response_content) // 4
            total_tokens = prompt_tokens + completion_tokens
            fallback_used = "Tier 4: Estimated (content length)"

        # Log the final usage data
        if total_tokens > 0:
            print(f"[Usage] Model: {model_name}, Images: {image_count}, Input Tokens: {prompt_tokens}, Output Tokens: {completion_tokens}, Total Tokens: {total_tokens} [{fallback_used}]", file=sys.stderr)
        else:
            print(f"[Usage] WARNING: All fallback tiers failed - could not extract or estimate token usage", file=sys.stderr)
            print(f"[Usage] DEBUG: last_call content: {str(last_call)[:500]}...", file=sys.stderr)

    except Exception as e:
        print(f"[Usage] ERROR: Failed to log usage - {type(e).__name__}: {str(e)}", file=sys.stderr)
        import traceback
        print(f"[Usage] DEBUG: Traceback: {traceback.format_exc()}", file=sys.stderr)

def download_image_from_url(url: str) -> bytes:
    """Download image from URL with timeout and error handling"""
    try:
        print(f"[Python] Downloading image from URL: {url[:100]}...", file=sys.stderr)
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.content
    except Exception as e:
        raise ValueError(f"Failed to download image from URL: {str(e)}")

def process_image_input(image_input: str) -> Image.Image:
    """Process image input - can be base64 data or URL"""
    try:
        # Check if input is a URL (starts with http)
        if image_input.startswith('http'):
            print(f"[Python] Processing image from URL", file=sys.stderr)
            image_bytes = download_image_from_url(image_input)
        else:
            print(f"[Python] Processing base64 image data", file=sys.stderr)
            # Decode base64 image
            image_bytes = base64.b64decode(image_input)

        # Open image with PIL
        image_pil = Image.open(BytesIO(image_bytes))

        # Convert to RGB if needed
        if image_pil.mode != 'RGB':
            image_pil = image_pil.convert('RGB')

        # ⚡ OPTIMIZATION: Resize large images to reduce API payload size
        # This speeds up API requests and reduces costs
        MAX_DIMENSION = 1920  # Max width or height in pixels
        width, height = image_pil.size

        if width > MAX_DIMENSION or height > MAX_DIMENSION:
            # Calculate aspect ratio and resize proportionally
            if width > height:
                new_width = MAX_DIMENSION
                new_height = int((height / width) * MAX_DIMENSION)
            else:
                new_height = MAX_DIMENSION
                new_width = int((width / height) * MAX_DIMENSION)

            original_size = len(image_bytes)
            print(f"[Python] Resizing image from {width}x{height} to {new_width}x{new_height} (original: {original_size/1024/1024:.2f}MB)", file=sys.stderr)

            # Resize with high-quality Lanczos filter
            image_pil = image_pil.resize((new_width, new_height), Image.Resampling.LANCZOS)

            print(f"[Python] Image resized successfully", file=sys.stderr)
        else:
            print(f"[Python] Image size {width}x{height} is within limits, no resizing needed", file=sys.stderr)

        return image_pil
    except Exception as e:
        error_msg = truncate_error_message(str(e))
        raise ValueError(f"Failed to process image input: {error_msg}")

class DocumentClassifier:
    """Document classifier using structured AI signatures"""

    def __init__(self):
        """Initialize AI classification model"""
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable required")

        # Configure AI model with Gemini Flash
        self.model = dspy.LM(
            model="gemini/gemini-2.5-flash",
            api_key=api_key,
            temperature=0.0,
            max_tokens=8192
        )
        # ✅ CRITICAL FIX: Enable usage tracking to populate lm.history with token usage
        # Without track_usage=True, lm.history will NOT contain usage data
        dspy.settings.configure(lm=self.model, track_usage=True)

        # Import the classification signature
        from signatures.classify_signature import DocumentClassificationSignature
        self.classifier = dspy.ChainOfThought(DocumentClassificationSignature)

    def process_image(self, image_data: str):
        """Process image input (base64 or URL) for AI multimodal input"""
        try:
            # Use the new process_image_input function that handles both URL and base64
            pil_image = process_image_input(image_data)

            # Convert PIL image to AI framework Image object
            ai_image = dspy.Image.from_PIL(pil_image)
            return ai_image

        except Exception as e:
            error_msg = truncate_error_message(str(e))
            raise ValueError(f"Failed to process image: {error_msg}")

    def classify_document(self, image_data: str, expected_type: str = "", slot_context: str = "") -> Dict[str, Any]:
        """Classify document using structured AI signatures with supported types validation"""
        try:
            print("[Classify] Starting structured document classification", file=sys.stderr)

            # Get supported document types from environment variable
            supported_types_env = os.environ.get("SUPPORTED_OCR_DOC_TYPE", "")
            if not supported_types_env:
                raise ValueError("SUPPORTED_OCR_DOC_TYPE environment variable not set")

            # Parse supported types and create structured list with generic descriptions
            # Note: ic, payslip, and application_form removed - legacy application types no longer supported
            type_descriptions = {
                "invoice": "Business invoice with itemized list, vendor details, total amount, and payment terms. Extract vendor info, amounts, dates, and items.",
                "receipt": "Purchase receipt, restaurant bill, taxi receipt, or retail transaction receipt. Extract vendor name, amount, date, and purchased items. Includes both printed and digital receipts."
            }

            supported_types = []
            for doc_type in supported_types_env.split(","):
                doc_type = doc_type.strip()
                if doc_type in type_descriptions:
                    supported_types.append({
                        "type": doc_type,
                        "description": type_descriptions[doc_type]
                    })

            print(f"[Classify] Loaded {len(supported_types)} supported document types from environment", file=sys.stderr)

            # Convert to JSON string for AI Processing input
            supported_types_json = json.dumps(supported_types, indent=2)

            # Process image
            ai_image = self.process_image(image_data)

            # Run AI classification with supported types and slot validation
            print(f"[Classify] Running structured AI classification with slot validation - expected: '{expected_type}', slot: '{slot_context}'", file=sys.stderr)
            prediction = self.classifier(
                document_image=ai_image,
                supported_types=supported_types_json,
                expected_type=expected_type,
                slot_context=slot_context
            )

            # Log API usage for cost tracking
            log_gemini_usage(self.model, "gemini-2.5-flash", image_count=1)

            # Extract classification result (already a Pydantic object)
            classification = prediction.classification

            # Convert to dict for JSON serialization
            classification_dict = classification.model_dump() if hasattr(classification, 'model_dump') else classification

            print(f"[Classify] Classification: {classification_dict['document_type']} ({classification_dict['confidence_score']:.2f})", file=sys.stderr)
            print(f"[Classify] Supported: {classification_dict['is_supported']}", file=sys.stderr)
            print(f"[Classify] User Message: {classification_dict['user_message']}", file=sys.stderr)

            # Return structured result - CLASSIFICATION WITH AUDIT METADATA
            result = {
                'success': True,
                'document_type': classification_dict['document_type'],
                'confidence_score': classification_dict['confidence_score'],
                'reasoning': classification_dict.get('reasoning', 'Classification completed'),
                'is_supported': classification_dict['is_supported'],
                'user_message': classification_dict['user_message'],
                'detected_elements': classification_dict.get('detected_elements', []),
                'context_metadata': classification_dict.get('context_metadata', {}),
                'classification_method': 'structured_ai_signature',
                'model_used': 'gemini-2.5-flash'
            }

            return result

        except Exception as e:
            error_msg = truncate_error_message(str(e))
            print(f"[Classify] Classification failed: {error_msg}", file=sys.stderr)
            return {
                'success': False,
                'error': error_msg,
                'error_type': type(e).__name__,
                'classification_method': 'structured_ai_signature'
            }

def main():
    """Main entry point for CLI usage"""
    if len(sys.argv) < 2 or len(sys.argv) > 4:
        print("Usage: python classify_document.py <image_data> [expected_type] [slot_context]")
        sys.exit(1)

    image_data = sys.argv[1]
    expected_type = sys.argv[2] if len(sys.argv) > 2 else ""
    slot_context = sys.argv[3] if len(sys.argv) > 3 else ""

    # Check for missing dependencies first
    if not DEPENDENCIES_AVAILABLE:
        error_msg = truncate_error_message(MISSING_DEPENDENCY_ERROR)
        result = {
            'success': False,
            'error': error_msg,
            'error_type': 'ImportError',
            'classification_method': 'dependency_check_failed'
        }
        print(json.dumps(result, indent=2))
        return

    classifier = DocumentClassifier()
    result = classifier.classify_document(image_data, expected_type, slot_context)

    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()