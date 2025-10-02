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
        # Use JSONAdapter without structured output to avoid warnings
        dspy.settings.configure(lm=self.model)

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

    def classify_document(self, image_data: str) -> Dict[str, Any]:
        """Classify document using structured AI signatures with supported types validation"""
        try:
            print("[Classify] Starting structured document classification", file=sys.stderr)

            # Get supported document types from environment variable
            supported_types_env = os.environ.get("SUPPORTED_OCR_DOC_TYPE", "")
            if not supported_types_env:
                raise ValueError("SUPPORTED_OCR_DOC_TYPE environment variable not set")

            # Parse supported types and create structured list with generic descriptions
            type_descriptions = {
                "invoice": "Business invoice with itemized list, vendor details, total amount, and payment terms. Extract vendor info, amounts, dates, and items.",
                "ic": "Government-issued identity card with ID number, name, address, and photo. Extract personal details, ID numbers, addresses, and country/region info.",
                "payslip": "Employee payslip with salary details, deductions, and employer information. Extract salary components, employer details, and regional tax/deduction info.",
                "application_form": "Application form for services, loans, or accounts. Extract applicant details, form type, institution, and specific application context."
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

            # Convert to JSON string for DSPy input
            supported_types_json = json.dumps(supported_types, indent=2)

            # Process image
            ai_image = self.process_image(image_data)

            # Run AI classification with supported types
            print("[Classify] Running structured AI classification with supported types validation", file=sys.stderr)
            prediction = self.classifier(
                document_image=ai_image,
                supported_types=supported_types_json
            )

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
    if len(sys.argv) != 2:
        print("Usage: python classify_document_dspy.py <base64_image_data>")
        sys.exit(1)

    image_data = sys.argv[1]

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
    result = classifier.classify_document(image_data)

    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()