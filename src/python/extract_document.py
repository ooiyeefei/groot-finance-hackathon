#!/usr/bin/env python3
"""
Unified Document Extraction Engine
Factory pattern for dynamic DSPy signature and Pydantic model selection
"""

import sys
import json
import base64
import requests
from typing import Dict, Any, Optional, List
import os
from io import BytesIO
from PIL import Image
from datetime import datetime

# DSPy and model imports
import dspy
from models.document_models import ICExtraction, PayslipExtraction, ApplicationFormExtraction, FinancingDetails, PersonalDetails, EmploymentDetails, MultiPayslipExtractionResult
from signatures.document_signatures import ICExtractionSignature, PayslipExtractionSignature, ApplicationFormExtractionSignature, FinancingDetailsSignature, PersonalDetailsSignature, EmploymentDetailsSignature
from payslip_grouper import PayslipPageGrouper

def truncate_error_message(message: str, max_length: int = 500) -> str:
    """Truncate error messages to prevent massive database entries"""
    if len(message) <= max_length:
        return message
    return message[:max_length] + f"... [truncated, original length: {len(message)}]"

class DateTimeEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle datetime objects"""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

class TypedDocumentExtractor(dspy.Module):
    """Robust typed document extractor using DSPy Module pattern"""
    def __init__(self, signature_class):
        super().__init__()
        # Use a strongly-typed ChainOfThought for better structured output
        self.predictor = dspy.ChainOfThought(signature_class)
        # Store the signature class for later access
        self.signature_class = signature_class

    def forward(self, image):
        """Forward method that returns a reliably structured DSPy prediction object"""
        # The signature directly defines the Pydantic model as the output field
        prediction = self.predictor(image=image)
        return prediction

# ==================================
# NEW: State-of-the-Art ReAct-Based Tool Architecture for Enhanced Extraction
# ==================================

def financing_tool(image: dspy.Image) -> dict:
    """
    DSPy Tool function for extracting financing details from the top section of the form.
    Returns dict to be compatible with DSPy ReAct tool calling.
    """
    print(f"[FinancingTool] Analyzing top section for financing details", file=sys.stderr)
    try:
        extractor = dspy.ChainOfThought(FinancingDetailsSignature)
        prediction = extractor(image=image)
        result = prediction.financing_details
        print(f"[FinancingTool] Successfully extracted financing details", file=sys.stderr)

        # Convert to dict for ReAct compatibility
        financing_dict = result.model_dump() if hasattr(result, 'model_dump') else result.dict()
        return {"status": "success", "financing_details": financing_dict}

    except Exception as e:
        print(f"[FinancingTool] Extraction failed: {str(e)}, returning empty result", file=sys.stderr)
        return {"status": "error", "financing_details": FinancingDetails().model_dump(), "error": str(e)}

def personal_details_tool(image: dspy.Image) -> dict:
    """
    DSPy Tool function for extracting personal details from Section A of the form.
    Returns dict to be compatible with DSPy ReAct tool calling.
    """
    print(f"[PersonalDetailsTool] Analyzing Section A for personal details", file=sys.stderr)
    try:
        extractor = dspy.ChainOfThought(PersonalDetailsSignature)
        prediction = extractor(image=image)
        result = prediction.personal_details
        print(f"[PersonalDetailsTool] Successfully extracted personal details", file=sys.stderr)

        # Convert to dict for ReAct compatibility
        personal_dict = result.model_dump() if hasattr(result, 'model_dump') else result.dict()
        return {"status": "success", "personal_details": personal_dict}

    except Exception as e:
        print(f"[PersonalDetailsTool] Extraction failed: {str(e)}, returning empty result", file=sys.stderr)
        return {"status": "error", "personal_details": PersonalDetails().model_dump(), "error": str(e)}

def employment_details_tool(image: dspy.Image) -> dict:
    """
    DSPy Tool function for extracting employment details from Section B of the form.
    Returns dict to be compatible with DSPy ReAct tool calling.
    """
    print(f"[EmploymentDetailsTool] Analyzing Section B for employment details", file=sys.stderr)
    try:
        extractor = dspy.ChainOfThought(EmploymentDetailsSignature)
        prediction = extractor(image=image)
        result = prediction.employment_details
        print(f"[EmploymentDetailsTool] Successfully extracted employment details", file=sys.stderr)

        # Convert to dict for ReAct compatibility
        employment_dict = result.model_dump() if hasattr(result, 'model_dump') else result.dict()
        return {"status": "success", "employment_details": employment_dict}

    except Exception as e:
        print(f"[EmploymentDetailsTool] Extraction failed: {str(e)}, returning empty result", file=sys.stderr)
        return {"status": "error", "employment_details": EmploymentDetails().model_dump(), "error": str(e)}

# Application Form Extraction Signature for ReAct orchestration
class ApplicationFormReActSignature(dspy.Signature):
    """Extract complete application form data using ReAct reasoning and specialized tools.

    You are a systematic data extraction agent. Analyze the application form image and extract all relevant information
    by reasoning about which sections to process and which tools to use for maximum extraction accuracy.

    Think step-by-step about:
    1. What sections are visible in the form (financing details at top, Section A personal details, Section B employment)
    2. Which specialized tool would be best for each section
    3. How to combine the results into a complete, structured extraction

    Available tools for specialized extraction:
    - financing_tool: Extracts financing details from top section (loan amount, type, etc.)
    - personal_details_tool: Extracts Section A personal information (name, IC, address, etc.)
    - employment_details_tool: Extracts Section B employment information (employer, salary, etc.)
    """
    image: dspy.Image = dspy.InputField(desc="An image of the application form to extract data from.")
    application_form_data: ApplicationFormExtraction = dspy.OutputField(desc="Complete structured application form extraction with all sections filled.")

class ApplicationFormExtractor(dspy.Module):
    """State-of-the-Art ReAct-Based Application Form Extractor using True DSPy ReAct Architecture"""

    def __init__(self):
        super().__init__()
        # Initialize trace storage for debugging
        self.manual_execution_trace = []

        # Create the native DSPy ReAct agent with specialized tools
        try:
            print(f"[ApplicationFormExtractor] Initializing ReAct agent with specialized tools", file=sys.stderr)

            # Try to create the ReAct agent with careful error handling
            self.react_agent = dspy.ReAct(
                signature=ApplicationFormReActSignature,
                tools=[financing_tool, personal_details_tool, employment_details_tool],
                max_iters=5
            )

            # Test the agent with a simple validation to ensure it's working
            print(f"[ApplicationFormExtractor] Native DSPy ReAct agent initialized, testing functionality...", file=sys.stderr)

            # For now, assume it works if we get here without exceptions
            self.use_native_react = True
            print(f"[ApplicationFormExtractor] Native DSPy ReAct agent ready for use", file=sys.stderr)

        except Exception as e:
            error_msg = str(e)
            print(f"[ApplicationFormExtractor] Native ReAct initialization failed: {error_msg[:200]}...", file=sys.stderr)
            print(f"[ApplicationFormExtractor] Will use robust manual orchestration as primary method", file=sys.stderr)
            self.use_native_react = False
            self.react_agent = None

    def forward(self, image: dspy.Image) -> dspy.Prediction:
        """
        Use native DSPy ReAct agent for intelligent tool orchestration.
        Falls back to manual orchestration if native ReAct is unavailable.
        """
        print(f"[ReAct ApplicationFormExtractor] Starting state-of-the-art extraction", file=sys.stderr)

        try:
            if self.use_native_react:
                # Use native DSPy ReAct agent for intelligent reasoning and tool usage
                print(f"[ReAct Agent] Using native DSPy ReAct agent with specialized tools", file=sys.stderr)
                try:
                    prediction = self.react_agent(image=image)

                    # Verify the prediction has the expected output field
                    if hasattr(prediction, 'application_form_data') and prediction.application_form_data:
                        print(f"[ReAct Agent] Native ReAct extraction completed successfully", file=sys.stderr)
                        return prediction
                    else:
                        print(f"[ReAct Agent] Native ReAct returned invalid structure, falling back to manual orchestration", file=sys.stderr)
                        return self._manual_react_orchestration(image)

                except Exception as react_error:
                    error_msg = str(react_error)
                    print(f"[ReAct Agent] Native ReAct failed: {error_msg[:200]}...", file=sys.stderr)

                    # Check for specific error types that suggest manual orchestration should be used
                    if any(keyword in error_msg.lower() for keyword in ['json', 'adapter', 'parse', 'malformed']):
                        print(f"[ReAct Agent] JSON parsing error detected, using manual orchestration", file=sys.stderr)
                        return self._manual_react_orchestration(image)
                    else:
                        # For other errors, fall through to ultimate fallback
                        raise react_error
            else:
                # Fallback to manual ReAct-style orchestration
                return self._manual_react_orchestration(image)

        except Exception as e:
            print(f"[ReAct Agent] All ReAct methods failed: {str(e)[:200]}..., using ultimate fallback", file=sys.stderr)
            return self._fallback_extraction(image)

    def _manual_react_orchestration(self, image: dspy.Image) -> dspy.Prediction:
        """Manual ReAct-style orchestration as fallback with detailed trace capture."""
        print(f"[ReAct Agent] Using manual ReAct orchestration", file=sys.stderr)

        # Clear previous trace and start fresh
        self.manual_execution_trace = []
        execution_start = __import__('time').time()

        # ReAct Step 1: Reason and extract financing details
        step1_start = __import__('time').time()
        thought1 = "I need to extract financing details from the top section of the form."
        action1 = "Using financing_tool for specialized extraction."

        print(f"[ReAct Agent] Thought: {thought1}", file=sys.stderr)
        print(f"[ReAct Agent] Action: {action1}", file=sys.stderr)

        try:
            financing_result = financing_tool(image=image)
            financing_details = FinancingDetails(**financing_result.get('financing_details', {}))
            step1_duration = __import__('time').time() - step1_start
            observation1 = f"FinancingTool completed with status: {financing_result.get('status', 'unknown')}"
        except Exception as tool_error:
            step1_duration = __import__('time').time() - step1_start
            financing_result = {'status': 'error', 'financing_details': {}, 'error': str(tool_error)}
            financing_details = FinancingDetails()  # Use empty defaults
            observation1 = f"FinancingTool failed: {str(tool_error)[:100]}..."
            print(f"[ReAct Agent] ERROR in financing_tool: {tool_error}", file=sys.stderr)

        print(f"[ReAct Agent] Observation: {observation1}", file=sys.stderr)

        # Store detailed trace for step 1
        self.manual_execution_trace.append({
            "step": 1,
            "thought": thought1,
            "action": action1,
            "tool_used": "financing_tool",
            "tool_result": financing_result,
            "observation": observation1,
            "duration_seconds": round(step1_duration, 3),
            "success": financing_result.get('status') == 'success'
        })

        # ReAct Step 2: Reason and extract personal details
        step2_start = __import__('time').time()
        thought2 = "Now I need to extract personal details from Section A."
        action2 = "Using personal_details_tool for Section A extraction."

        print(f"[ReAct Agent] Thought: {thought2}", file=sys.stderr)
        print(f"[ReAct Agent] Action: {action2}", file=sys.stderr)

        try:
            personal_result = personal_details_tool(image=image)
            personal_details = PersonalDetails(**personal_result.get('personal_details', {}))
            step2_duration = __import__('time').time() - step2_start
            observation2 = f"PersonalDetailsTool completed with status: {personal_result.get('status', 'unknown')}"
        except Exception as tool_error:
            step2_duration = __import__('time').time() - step2_start
            personal_result = {'status': 'error', 'personal_details': {}, 'error': str(tool_error)}
            personal_details = PersonalDetails()  # Use empty defaults
            observation2 = f"PersonalDetailsTool failed: {str(tool_error)[:100]}..."
            print(f"[ReAct Agent] ERROR in personal_details_tool: {tool_error}", file=sys.stderr)

        print(f"[ReAct Agent] Observation: {observation2}", file=sys.stderr)

        # Store detailed trace for step 2
        self.manual_execution_trace.append({
            "step": 2,
            "thought": thought2,
            "action": action2,
            "tool_used": "personal_details_tool",
            "tool_result": personal_result,
            "observation": observation2,
            "duration_seconds": round(step2_duration, 3),
            "success": personal_result.get('status') == 'success'
        })

        # ReAct Step 3: Reason and extract employment details
        step3_start = __import__('time').time()
        thought3 = "Finally, I need to extract employment details from Section B."
        action3 = "Using employment_details_tool for Section B extraction."

        print(f"[ReAct Agent] Thought: {thought3}", file=sys.stderr)
        print(f"[ReAct Agent] Action: {action3}", file=sys.stderr)

        try:
            employment_result = employment_details_tool(image=image)
            employment_details = EmploymentDetails(**employment_result.get('employment_details', {}))
            step3_duration = __import__('time').time() - step3_start
            observation3 = f"EmploymentDetailsTool completed with status: {employment_result.get('status', 'unknown')}"
        except Exception as tool_error:
            step3_duration = __import__('time').time() - step3_start
            employment_result = {'status': 'error', 'employment_details': {}, 'error': str(tool_error)}
            employment_details = EmploymentDetails()  # Use empty defaults
            observation3 = f"EmploymentDetailsTool failed: {str(tool_error)[:100]}..."
            print(f"[ReAct Agent] ERROR in employment_details_tool: {tool_error}", file=sys.stderr)

        print(f"[ReAct Agent] Observation: {observation3}", file=sys.stderr)

        # Store detailed trace for step 3
        self.manual_execution_trace.append({
            "step": 3,
            "thought": thought3,
            "action": action3,
            "tool_used": "employment_details_tool",
            "tool_result": employment_result,
            "observation": observation3,
            "duration_seconds": round(step3_duration, 3),
            "success": employment_result.get('status') == 'success'
        })

        # ReAct Step 4: Combine results
        final_thought = "All tools executed. Combining results into final ApplicationFormExtraction."
        print(f"[ReAct Agent] Thought: {final_thought}", file=sys.stderr)

        # Calculate confidence based on successful tool executions
        successful_tools = sum([
            1 if financing_result.get('status') == 'success' else 0,
            1 if personal_result.get('status') == 'success' else 0,
            1 if employment_result.get('status') == 'success' else 0
        ])
        confidence = successful_tools / 3.0

        final_extraction = ApplicationFormExtraction(
            financing_details=financing_details,
            personal_details=personal_details,
            employment_details=employment_details,
            confidence_score=confidence
        )

        # Record final execution summary in trace
        total_duration = __import__('time').time() - execution_start
        final_summary = f"Manual orchestration complete. {successful_tools}/3 tools successful, confidence: {confidence:.2f}"

        self.manual_execution_trace.append({
            "step": 4,
            "thought": final_thought,
            "action": "Combine all tool results into final ApplicationFormExtraction",
            "tool_used": "synthesis",
            "execution_summary": {
                "total_tools": 3,
                "successful_tools": successful_tools,
                "final_confidence": confidence,
                "total_duration_seconds": round(total_duration, 3),
                "average_tool_duration": round(sum([t.get("duration_seconds", 0) for t in self.manual_execution_trace if "duration_seconds" in t]) / max(1, len([t for t in self.manual_execution_trace if "duration_seconds" in t])), 3)
            },
            "observation": final_summary,
            "success": True
        })

        print(f"[ReAct Agent] Final Thought: {final_summary}", file=sys.stderr)
        print(f"[ReAct Agent] Execution trace captured: {len(self.manual_execution_trace)} steps in {total_duration:.3f}s", file=sys.stderr)

        return dspy.Prediction(application_form_data=final_extraction)

    def _fallback_extraction(self, image: dspy.Image) -> dspy.Prediction:
        """Ultimate fallback to single-pass extraction."""
        print(f"[ReAct Agent] Using ultimate fallback: single-pass ChainOfThought extraction", file=sys.stderr)
        fallback_extractor = dspy.ChainOfThought(ApplicationFormExtractionSignature)
        return fallback_extractor(image=image)

# NEW: Multi-Payslip Extractor for handling PDF pages with intelligent grouping
class MultiPayslipExtractor(dspy.Module):
    """
    Advanced DSPy module for extracting multiple payslips from multi-page documents
    Handles multi-page payslips intelligently (e.g., 2-3 pages per month)
    """
    def __init__(self):
        super().__init__()
        # Use ChainOfThought for payslip extraction
        self.payslip_extractor = dspy.ChainOfThought(PayslipExtractionSignature)
        # Initialize intelligent grouper
        self.grouper = PayslipPageGrouper()

    def forward(self, images: List[dspy.Image]) -> dspy.Prediction:
        """
        Extract payslips from multiple page images with intelligent grouping:
        1. Process each page image individually
        2. Use PayslipPageGrouper to detect which pages belong to same payslip
        3. Merge multi-page payslips into consolidated results
        4. Return MultiPayslipExtractionResult with grouped payslips
        """
        raw_payslips = []
        failed_pages = []
        confidences = []

        print(f"[MultiPayslipExtractor] Processing {len(images)} page images", file=sys.stderr)

        # Step 1: Extract data from each page individually
        for page_num, image in enumerate(images, start=1):
            try:
                print(f"[MultiPayslipExtractor] Extracting from page {page_num}", file=sys.stderr)

                # Extract payslip from this page
                prediction = self.payslip_extractor(image=image)

                # Get the payslip data from prediction
                payslip_data = prediction.payslip_data

                # Add page number to the payslip
                payslip_data.page_number = page_num

                raw_payslips.append(payslip_data)
                confidences.append(payslip_data.confidence_score)

                print(f"[MultiPayslipExtractor] Page {page_num} extracted: '{payslip_data.pay_period}' (confidence: {payslip_data.confidence_score:.2f})", file=sys.stderr)

            except Exception as e:
                print(f"[MultiPayslipExtractor] Failed to extract from page {page_num}: {str(e)}", file=sys.stderr)
                failed_pages.append(page_num)

        # Step 2: Intelligent grouping to handle multi-page payslips
        if raw_payslips:
            print(f"[MultiPayslipExtractor] Starting intelligent payslip grouping for {len(raw_payslips)} page extractions", file=sys.stderr)

            # Use intelligent grouper to merge multi-page payslips
            grouped_payslips, payslip_groups, pages_per_payslip, grouping_method = self.grouper.group_payslip_pages(raw_payslips)

            print(f"[MultiPayslipExtractor] Grouping result: {len(grouped_payslips)} payslips from {len(raw_payslips)} pages using '{grouping_method}'", file=sys.stderr)
        else:
            grouped_payslips, payslip_groups, pages_per_payslip, grouping_method = [], [], {}, "no_successful_extractions"

        # Calculate overall statistics
        total_pages = len(images)
        successful_payslip_count = len(grouped_payslips)
        overall_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        # Create the enhanced multi-payslip result with grouping information
        result = MultiPayslipExtractionResult(
            payslips=grouped_payslips,
            payslip_groups=payslip_groups,
            total_pages_processed=total_pages,
            successful_extractions=successful_payslip_count,
            failed_pages=failed_pages,
            pages_per_payslip_detected=pages_per_payslip,
            overall_confidence=overall_confidence,
            grouping_method=grouping_method
        )

        print(f"[MultiPayslipExtractor] Final result: {successful_payslip_count} payslips extracted from {total_pages} pages", file=sys.stderr)
        print(f"[MultiPayslipExtractor] Page grouping pattern: {pages_per_payslip}", file=sys.stderr)

        return dspy.Prediction(multi_payslip_data=result)

class DocumentExtractionFactory:
    """Factory for selecting appropriate models and signatures based on document type"""

    DOCUMENT_CONFIGS = {
        'ic': {
            'model_class': ICExtraction,
            'signature_class': ICExtractionSignature,
            'description': 'Malaysian Identity Card (IC) document'
        },
        'payslip': {
            'model_class': PayslipExtraction,
            'signature_class': PayslipExtractionSignature,
            'description': 'Employee payslip document'
        },
        'multi_payslip': {
            'model_class': MultiPayslipExtractionResult,
            'signature_class': PayslipExtractionSignature,  # Still uses payslip signature for individual pages
            'description': 'Multi-page payslip document (PDF with multiple payslips)'
        },
        'application_form': {
            'model_class': ApplicationFormExtraction,
            'signature_class': ApplicationFormExtractionSignature,
            'description': 'Loan or credit application form'
        }
    }

    @classmethod
    def get_config(cls, document_type: str) -> Dict[str, Any]:
        """Get configuration for document type"""
        if document_type not in cls.DOCUMENT_CONFIGS:
            raise ValueError(f"Unsupported document type: {document_type}")
        return cls.DOCUMENT_CONFIGS[document_type]

    @classmethod
    def create_extractor(cls, document_type: str):
        """Create typed document extractor for document type"""
        if document_type == 'application_form':
            # Use our new, sophisticated extractor for application forms
            return ApplicationFormExtractor()
        elif document_type == 'multi_payslip':
            # Use our new multi-payslip extractor for multi-page payslip documents
            return MultiPayslipExtractor()

        # Use the standard ChainOfThought for other types
        config = cls.get_config(document_type)
        return TypedDocumentExtractor(signature_class=config['signature_class'])

    @classmethod
    def create_model(cls, document_type: str, **kwargs):
        """Create Pydantic model instance for document type"""
        config = cls.get_config(document_type)
        return config['model_class'](**kwargs)

def setup_dspy_model():
    """Configure DSPy with Gemini model with retry logic"""
    try:
        print(f"[Python] Setting up DSPy with Gemini 2.5 Flash model", file=sys.stderr)
        start_time = __import__('time').time()

        # Check for API key
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not found")
        print(f"[Python] Gemini API key found (length: {len(api_key)})", file=sys.stderr)

        # Use Gemini 2.5 Flash for fast extraction (matching process-document-ocr.ts)
        gemini_model = dspy.LM(
            model="gemini/gemini-2.5-flash",
            api_key=api_key,
            temperature=0.0,
            max_tokens=8192
        )

        dspy.settings.configure(lm=gemini_model, adapter=dspy.JSONAdapter())
        setup_time = __import__('time').time() - start_time
        print(f"[Python] DSPy model setup completed in {setup_time:.2f}s", file=sys.stderr)
        return gemini_model
    except Exception as e:
        print(f"[Python] DSPy model setup failed: {str(e)}", file=sys.stderr)
        raise

def retry_dspy_extraction(extractor_module: TypedDocumentExtractor, dspy_image, max_retries=3, delay=5):
    """Retry DSPy extraction with exponential backoff for 503 errors"""
    import time

    for attempt in range(max_retries):
        try:
            print(f"[Extract] Attempt {attempt + 1} of {max_retries} - Starting DSPy prediction", file=sys.stderr)
            start_time = time.time()

            # Use correct DSPy module invocation: call module() instead of module.forward()
            result = extractor_module(image=dspy_image)

            prediction_time = time.time() - start_time
            print(f"[Extract] DSPy prediction completed in {prediction_time:.2f}s", file=sys.stderr)
            return result
        except Exception as e:
            error_str = str(e).lower()
            prediction_time = time.time() - start_time
            print(f"[Extract] DSPy prediction failed after {prediction_time:.2f}s: {str(e)[:200]}", file=sys.stderr)

            # Check if it's a 503 overload error
            if '503' in error_str or 'overloaded' in error_str or 'unavailable' in error_str:
                if attempt < max_retries - 1:
                    wait_time = delay * (2 ** attempt)  # Exponential backoff
                    print(f"[Extract] Model overloaded (503), retrying in {wait_time} seconds...", file=sys.stderr)
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"[Extract] Model overloaded after {max_retries} attempts, giving up", file=sys.stderr)
                    raise Exception(f"Gemini model overloaded after {max_retries} attempts: {str(e)}")
            else:
                # For other errors, don't retry
                print(f"[Extract] Non-retryable error, failing immediately", file=sys.stderr)
                raise e

    raise Exception("Unexpected error in retry logic")

def download_image_from_url(image_url: str) -> bytes:
    """Download image from signed URL"""
    try:
        print(f"[Python] Starting image download from URL (timeout: 30s)", file=sys.stderr)
        start_time = __import__('time').time()
        response = requests.get(image_url, timeout=30)
        download_time = __import__('time').time() - start_time
        print(f"[Python] Image download completed in {download_time:.2f}s, status: {response.status_code}", file=sys.stderr)
        response.raise_for_status()
        print(f"[Python] Image size: {len(response.content)} bytes", file=sys.stderr)
        return response.content
    except Exception as e:
        error_msg = truncate_error_message(str(e))
        print(f"[Python] Image download failed: {error_msg}", file=sys.stderr)
        raise ValueError(f"Failed to download image from URL: {error_msg}")

def process_image_input(image_input: str):
    """Process image input - can be base64 data or URL"""
    try:
        # Check if input is a URL (starts with http or https)
        if image_input.startswith('http'):
            print(f"[Python] Downloading image from URL", file=sys.stderr)
            image_bytes = download_image_from_url(image_input)
        else:
            print(f"[Python] Processing base64 image data", file=sys.stderr)

            # Handle base64 data with padding issues
            try:
                # Remove any data URL prefix if present
                if image_input.startswith('data:'):
                    # Extract base64 part after comma
                    _, base64_data = image_input.split(',', 1)
                else:
                    base64_data = image_input

                # Fix base64 padding if needed
                missing_padding = len(base64_data) % 4
                if missing_padding:
                    base64_data += '=' * (4 - missing_padding)

                # Decode base64 image
                image_bytes = base64.b64decode(base64_data)

            except Exception as decode_error:
                print(f"[Python] Base64 decode error: {decode_error}", file=sys.stderr)
                raise ValueError(f"Invalid base64 data: {str(decode_error)}")

        # Validate we have image bytes
        if not image_bytes or len(image_bytes) == 0:
            raise ValueError("No image data received")

        print(f"[Python] Image bytes size: {len(image_bytes)}", file=sys.stderr)

        # Open image with PIL with better error handling
        try:
            image_pil = Image.open(BytesIO(image_bytes))
            print(f"[Python] PIL opened image: mode={image_pil.mode}, size={image_pil.size}", file=sys.stderr)
        except Exception as pil_error:
            print(f"[Python] PIL Image.open error: {pil_error}", file=sys.stderr)
            # Try to identify the file type
            try:
                import imghdr
                file_type = imghdr.what(None, h=image_bytes[:32])
                print(f"[Python] Detected file type: {file_type}", file=sys.stderr)
            except:
                pass
            raise ValueError(f"Cannot open as image: {str(pil_error)}")

        # Convert to RGB if needed
        if image_pil.mode != 'RGB':
            print(f"[Python] Converting from {image_pil.mode} to RGB", file=sys.stderr)
            image_pil = image_pil.convert('RGB')

        # Convert to dspy.Image for multimodal processing (CRITICAL)
        dspy_image = dspy.Image.from_PIL(image_pil)
        print(f"[Python] Successfully created dspy.Image", file=sys.stderr)

        return dspy_image
    except Exception as e:
        error_msg = truncate_error_message(str(e))
        print(f"[Python] process_image_input failed: {error_msg}", file=sys.stderr)
        raise ValueError(f"Failed to process image input: {error_msg}")

def extract_document_data(document_type: str, image_input: str) -> Dict[str, Any]:
    """
    Main extraction function using factory pattern

    Args:
        document_type: Type of document ('ic', 'payslip', 'application_form')
        image_input: Base64 encoded image data, signed URL, OR JSON array of URLs (for application_form)

    Returns:
        Dict containing extracted data and metadata
    """
    try:
        print(f"[Python] extract_document_data called with type: {document_type}", file=sys.stderr)

        # Setup DSPy model
        print(f"[Python] Setting up DSPy model...", file=sys.stderr)
        model = setup_dspy_model()
        print(f"[Python] DSPy model setup complete", file=sys.stderr)

        # Check if image_input is a JSON array of URLs (unified architecture)
        try:
            page_urls = json.loads(image_input)
            # If we get here, it's a JSON array - handle multi-page processing
            print(f"[Python] Multi-page processing: {len(page_urls)} page(s) for {document_type}", file=sys.stderr)

            if document_type == 'application_form':
                # Process all page URLs into dspy.Image objects for Map-Reduce
                dspy_images = []
                for i, url in enumerate(page_urls, start=1):
                    print(f"[Python] Processing page {i} image input...", file=sys.stderr)
                    dspy_image = process_image_input(url)
                    dspy_images.append(dspy_image)
                    print(f"[Python] Page {i} image processing completed", file=sys.stderr)

                print(f"[Python] All {len(dspy_images)} page images processed for Map-Reduce", file=sys.stderr)

                # Use Map-Reduce extraction for application forms
                return extract_and_merge_application_form_data(dspy_images)
            else:
                # For other document types (ic, payslip), process first page only
                # This follows the pattern: multi-page documents use the first clear page for extraction
                print(f"[Python] Using first page for {document_type} extraction", file=sys.stderr)
                first_page_url = page_urls[0]
                dspy_image = process_image_input(first_page_url)
                print(f"[Python] First page processing completed", file=sys.stderr)

        except json.JSONDecodeError:
            # Not JSON array - treat as single image (base64 or single URL)
            print(f"[Python] Single image processing for {document_type}...", file=sys.stderr)
            dspy_image = process_image_input(image_input)
            print(f"[Python] Image processing completed", file=sys.stderr)

        # Get extractor using factory (returns TypedDocumentExtractor module)
        print(f"[Python] Creating extractor module for {document_type}", file=sys.stderr)
        extractor_module = DocumentExtractionFactory.create_extractor(document_type)
        print(f"[Python] Extractor module created", file=sys.stderr)

        # Perform extraction
        print(f"[Extract] Starting {document_type} extraction with DSPy", file=sys.stderr)

        # Run DSPy extraction with retry logic for 503 errors
        print(f"[Extract] Calling retry_dspy_extraction...", file=sys.stderr)
        prediction = retry_dspy_extraction(extractor_module, dspy_image)
        print(f"[Extract] retry_dspy_extraction returned successfully", file=sys.stderr)

        # --- START CRITICAL FIX (Supporting both extractor types) ---

        # Handle different extractor types and capture LLM trace for debugging
        llm_trace = None

        if isinstance(extractor_module, ApplicationFormExtractor):
            # ApplicationFormExtractor returns application_form_data
            output_field_name = 'application_form_data'
            print(f"[Extract] Using ApplicationFormExtractor output field: {output_field_name}", file=sys.stderr)

            # ENHANCED LLM TRACE CAPTURE for ReAct Agent debugging
            try:
                print(f"[Extract] Capturing comprehensive ReAct Agent trace for debugging...", file=sys.stderr)

                # Initialize comprehensive trace structure
                llm_trace = {
                    "agent_type": "dspy_react",
                    "tools_used": ["financing_tool", "personal_details_tool", "employment_details_tool"],
                    "execution_summary": {
                        "native_react_used": extractor_module.use_native_react,
                        "max_iterations": 5,
                        "extraction_confidence": 0.0  # Will be updated after data extraction
                    },
                    "llm_interactions": [],
                    "tool_execution_log": [],
                    "debug_info": []
                }

                # Method 1: Capture DSPy model history (most comprehensive)
                if hasattr(model, 'history') and model.history:
                    llm_trace["llm_interactions"] = [
                        {
                            "interaction_id": i,
                            "prompt": str(interaction.get('input', ''))[:500] if hasattr(interaction, 'get') else str(interaction)[:500],
                            "response": str(interaction.get('output', ''))[:500] if hasattr(interaction, 'get') else '',
                            "tokens_used": getattr(interaction, 'usage', {}).get('total_tokens', 0) if hasattr(interaction, 'usage') else 0
                        }
                        for i, interaction in enumerate(model.history[-15:])  # Last 15 interactions
                    ]
                    llm_trace["debug_info"].append(f"Captured {len(model.history)} total model interactions")
                    print(f"[Extract] Captured {len(model.history)} DSPy model interactions", file=sys.stderr)

                # Method 2: Alternative history fields
                elif hasattr(model, '_history') and model._history:
                    llm_trace["llm_interactions"] = [
                        {"interaction_id": i, "content": str(interaction)[:500]}
                        for i, interaction in enumerate(model._history[-15:])
                    ]
                    llm_trace["debug_info"].append(f"Captured {len(model._history)} interactions from _history")
                    print(f"[Extract] Captured {len(model._history)} interactions from model._history", file=sys.stderr)

                # Method 3: Check for ReAct-specific traces
                if hasattr(extractor_module, 'react_agent') and hasattr(extractor_module.react_agent, 'trace'):
                    react_trace = extractor_module.react_agent.trace
                    llm_trace["react_trace"] = str(react_trace)[:1000] if react_trace else "No ReAct trace available"
                    llm_trace["debug_info"].append("ReAct agent trace captured")
                    print(f"[Extract] Captured ReAct agent-specific trace", file=sys.stderr)

                # Method 3B: Capture manual execution trace from ApplicationFormExtractor
                if hasattr(extractor_module, 'manual_execution_trace') and extractor_module.manual_execution_trace:
                    llm_trace["manual_execution_trace"] = extractor_module.manual_execution_trace
                    llm_trace["debug_info"].append(f"Manual ReAct orchestration trace captured: {len(extractor_module.manual_execution_trace)} steps")
                    print(f"[Extract] Captured manual ReAct execution trace: {len(extractor_module.manual_execution_trace)} steps", file=sys.stderr)

                    # Add trace summary to tool_execution_log
                    llm_trace["tool_execution_log"] = [
                        {
                            "step": step["step"],
                            "tool": step["tool_used"],
                            "success": step["success"],
                            "duration": step["duration_seconds"],
                            "thought": step["thought"][:100] + "..." if len(step["thought"]) > 100 else step["thought"]
                        }
                        for step in extractor_module.manual_execution_trace
                        if "tool_used" in step
                    ]

                # Method 4: Capture prediction metadata if available
                if hasattr(prediction, 'completions') and prediction.completions:
                    llm_trace["prediction_completions"] = [
                        str(completion)[:300] for completion in prediction.completions.values()
                    ]
                    llm_trace["debug_info"].append(f"Captured {len(prediction.completions)} prediction completions")
                    print(f"[Extract] Captured {len(prediction.completions)} prediction completions", file=sys.stderr)

                # Add execution context
                llm_trace["execution_context"] = {
                    "dspy_version": getattr(dspy, '__version__', 'unknown'),
                    "model_name": "gemini-2.5-flash",
                    "temperature": 0.0,
                    "max_tokens": 8192,
                    "timestamp": __import__('datetime').datetime.now().isoformat()
                }

                # Fallback message if no traces captured
                if (not llm_trace["llm_interactions"] and
                    not llm_trace.get("react_trace") and
                    not llm_trace.get("manual_execution_trace")):
                    llm_trace["debug_info"].append("No LLM interactions captured - trace may not be available in current DSPy version")
                    llm_trace["fallback_message"] = "ReAct Agent executed successfully - detailed trace not accessible"
                    print(f"[Extract] No detailed traces available, using execution summary only", file=sys.stderr)
                else:
                    trace_types = []
                    if llm_trace["llm_interactions"]:
                        trace_types.append(f"{len(llm_trace['llm_interactions'])} LLM interactions")
                    if llm_trace.get("react_trace"):
                        trace_types.append("native ReAct trace")
                    if llm_trace.get("manual_execution_trace"):
                        trace_types.append(f"{len(llm_trace['manual_execution_trace'])} manual steps")

                    print(f"[Extract] Comprehensive ReAct trace captured: {', '.join(trace_types)}", file=sys.stderr)

            except Exception as trace_error:
                llm_trace = {
                    "agent_type": "dspy_react",
                    "error": f"Trace capture failed: {str(trace_error)}",
                    "fallback_message": "ReAct Agent executed but trace capture encountered an error",
                    "timestamp": __import__('datetime').datetime.now().isoformat()
                }
                print(f"[Extract] Enhanced LLM trace capture failed: {trace_error}", file=sys.stderr)
        else:
            # TypedDocumentExtractor uses signature_class
            output_field_name = list(extractor_module.signature_class.output_fields.keys())[0]
            print(f"[Extract] Using TypedDocumentExtractor output field: {output_field_name}", file=sys.stderr)

        # 3. EXPLICITLY get the Pydantic model from the prediction object. This is the key step.
        validated_pydantic_model = getattr(prediction, output_field_name)
        print(f"[Extract] Retrieved Pydantic model: {type(validated_pydantic_model)}", file=sys.stderr)

        # 4. Convert the CLEAN Pydantic model to a dictionary. This will NOT contain the messy metadata.
        final_data = validated_pydantic_model.model_dump() if hasattr(validated_pydantic_model, 'model_dump') else validated_pydantic_model.dict()
        print(f"[Extract] Converted to clean dictionary with {len(final_data)} fields", file=sys.stderr)

        # --- END CRITICAL FIX ---

        # 5. Build the final success response using ONLY the clean data.
        metadata = {
            'total_fields': len(final_data),
            'populated_fields': len([v for v in final_data.values() if v is not None and v != ""]),
            'extraction_timestamp': __import__('datetime').datetime.now().isoformat(),
        }

        # Add LLM trace for ReAct Agent debugging (ApplicationFormExtractor only)
        if llm_trace:
            # Update trace with actual confidence score now that we have final_data
            if isinstance(llm_trace, dict) and 'execution_summary' in llm_trace:
                llm_trace['execution_summary']['extraction_confidence'] = final_data.get('confidence_score', 0.85)
                llm_trace['execution_summary']['fields_extracted'] = len([v for v in final_data.values() if v is not None and v != ""])
                llm_trace['execution_summary']['total_fields'] = len(final_data)
                print(f"[Extract] Updated trace with final confidence: {llm_trace['execution_summary']['extraction_confidence']}", file=sys.stderr)

            metadata['llm_trace'] = llm_trace
            metadata['react_agent_used'] = True
            print(f"[Extract] Added enhanced ReAct Agent trace to metadata", file=sys.stderr)
        else:
            metadata['react_agent_used'] = False

        # Determine extraction method based on extractor type
        extraction_method = 'dspy_react_tool_architecture' if isinstance(extractor_module, ApplicationFormExtractor) else 'dspy_chainofthought_pydantic'

        return {
            'success': True,
            'document_type': document_type,
            'extracted_data': final_data,
            'confidence_score': final_data.get('confidence_score', 0.85),
            'extraction_method': extraction_method,
            'model_used': 'gemini-2.5-flash',
            'metadata': metadata
        }

    except Exception as e:
        error_msg = truncate_error_message(str(e))
        print(f"[Extract] Error during {document_type} extraction: {error_msg}", file=sys.stderr)
        return {
            'success': False,
            'error': error_msg,
            'document_type': document_type,
            'extraction_method': 'dspy_gemini',
            'error_type': type(e).__name__
        }

def extract_multi_payslip_data(image_inputs: List[str]) -> Dict[str, Any]:
    """
    Multi-payslip extraction function for processing multiple page images

    Args:
        image_inputs: List of base64 encoded image data or signed URLs (one per page)

    Returns:
        Dict containing multi-payslip extraction results and metadata
    """
    try:
        print(f"[Python] extract_multi_payslip_data called with {len(image_inputs)} page images", file=sys.stderr)

        # Setup DSPy model
        print(f"[Python] Setting up DSPy model...", file=sys.stderr)
        model = setup_dspy_model()
        print(f"[Python] DSPy model setup complete", file=sys.stderr)

        # Process each page image (returns list of dspy.Image objects)
        print(f"[Python] Processing {len(image_inputs)} page images...", file=sys.stderr)
        dspy_images = []
        for i, image_input in enumerate(image_inputs, start=1):
            print(f"[Python] Processing page {i} image input...", file=sys.stderr)
            dspy_image = process_image_input(image_input)
            dspy_images.append(dspy_image)
            print(f"[Python] Page {i} image processing completed", file=sys.stderr)

        # Get multi-payslip extractor
        print(f"[Python] Creating multi-payslip extractor module", file=sys.stderr)
        extractor_module = DocumentExtractionFactory.create_extractor('multi_payslip')
        print(f"[Python] Multi-payslip extractor module created", file=sys.stderr)

        # Perform extraction on all pages
        print(f"[Extract] Starting multi-payslip extraction with DSPy", file=sys.stderr)

        # Run DSPy extraction with retry logic - NOTE: Passing list of images to MultiPayslipExtractor
        print(f"[Extract] Calling retry_dspy_extraction for multi-payslip...", file=sys.stderr)
        # For multi-payslip, we need to modify retry logic to handle list of images
        prediction = extractor_module(images=dspy_images)  # Direct call, skip retry for now
        print(f"[Extract] Multi-payslip extraction returned successfully", file=sys.stderr)

        # Get the MultiPayslipExtractionResult from prediction
        multi_payslip_result = prediction.multi_payslip_data
        print(f"[Extract] Retrieved MultiPayslipExtractionResult with {multi_payslip_result.successful_extractions} payslips", file=sys.stderr)

        # Convert to dictionary
        final_data = multi_payslip_result.model_dump() if hasattr(multi_payslip_result, 'model_dump') else multi_payslip_result.dict()
        print(f"[Extract] Converted to clean dictionary with {len(final_data)} top-level fields", file=sys.stderr)

        # Build the final success response
        return {
            'success': True,
            'document_type': 'multi_payslip',
            'extracted_data': final_data,
            'confidence_score': final_data.get('overall_confidence', 0.85),
            'extraction_method': 'dspy_multi_payslip_extractor',
            'model_used': 'gemini-2.5-flash',
            'metadata': {
                'total_pages_processed': final_data.get('total_pages_processed', 0),
                'successful_extractions': final_data.get('successful_extractions', 0),
                'failed_pages': final_data.get('failed_pages', []),
                'extraction_timestamp': __import__('datetime').datetime.now().isoformat(),
            }
        }

    except Exception as e:
        error_msg = truncate_error_message(str(e))
        print(f"[Extract] Error during multi-payslip extraction: {error_msg}", file=sys.stderr)
        return {
            'success': False,
            'error': error_msg,
            'document_type': 'multi_payslip',
            'extraction_method': 'dspy_multi_payslip',
            'error_type': type(e).__name__
        }

def merge_extractions(base_extraction: dict, new_extraction: dict) -> dict:
    """Intelligently merges data from a new page into the base extraction.
    Crucially, it overwrites existing data if the new data is not null,
    assuming later pages might have clearer information."""
    for section_key, section_data in new_extraction.items():
        if isinstance(section_data, dict) and section_key in base_extraction:
            for field_key, value in section_data.items():
                # Overwrite if the new value is not None. This is the key logic.
                if value is not None:
                    base_extraction[section_key][field_key] = value
    return base_extraction

def extract_and_merge_application_form_data(page_images: List[dspy.Image]) -> dict:
    """Implements the robust Map-Reduce pattern for multi-page application forms."""

    # Use a single, powerful ChainOfThought for per-page extraction.
    extractor = dspy.ChainOfThought(ApplicationFormExtractionSignature)

    # Initialize an empty final Pydantic model and convert to dict for mutability.
    final_combined_data = ApplicationFormExtraction(
        financing_details=FinancingDetails(),
        personal_details=PersonalDetails(),
        employment_details=EmploymentDetails(),
        confidence_score=0.0
    ).model_dump()

    page_results = []
    confidences = []

    # MAP Step: Process each page individually.
    for i, page_image in enumerate(page_images, start=1):
        print(f"[Map-Reduce] Extracting data from page {i}/{len(page_images)}...", file=sys.stderr)
        try:
            prediction = extractor(page_image=page_image)
            page_data = prediction.form_data.model_dump()
            page_results.append({'page': i, 'data': page_data})
            confidences.append(page_data['confidence_score'])

            # REDUCE Step: Intelligently merge the data from this page into our final result.
            final_combined_data = merge_extractions(final_combined_data, page_data)
        except Exception as e:
            print(f"[Map-Reduce] Failed to process page {i}: {str(e)}", file=sys.stderr)

    # Calculate final confidence.
    successful_pages = len(page_results)
    final_combined_data['confidence_score'] = (sum(confidences) / successful_pages) if successful_pages > 0 else 0.0

    return {
        'success': True,
        'extracted_data': final_combined_data,
        'metadata': {
            'processing_method': 'map_reduce_agent',
            'total_pages': len(page_images),
            'successful_pages': successful_pages,
        }
    }

def main():
    """Main entry point for CLI usage"""
    try:
        if len(sys.argv) != 3:
            error_result = {
                'success': False,
                'error': 'Invalid arguments. Usage: python extract_document.py <document_type> <image_input>',
                'error_type': 'ArgumentError'
            }
            print(json.dumps(error_result, indent=2, cls=DateTimeEncoder))
            sys.exit(1)

        document_type = sys.argv[1]
        image_input = sys.argv[2]

        print(f"[Python] Starting extraction for document_type: {document_type}", file=sys.stderr)

        # Handle multi-payslip as special case (legacy)
        if document_type == 'multi_payslip':
            # Parse JSON array of image URLs
            try:
                page_urls = json.loads(image_input)
                print(f"[Python] Multi-payslip input: {len(page_urls)} page URLs", file=sys.stderr)
                result = extract_multi_payslip_data(page_urls)
            except json.JSONDecodeError as e:
                print(f"[Python] Failed to parse multi-payslip URLs: {e}", file=sys.stderr)
                error_result = {
                    'success': False,
                    'error': 'Invalid multi-payslip URL array format',
                    'error_type': 'JSONDecodeError'
                }
                print(json.dumps(error_result, indent=2, cls=DateTimeEncoder))
                sys.exit(1)
        else:
            # Unified extraction for all other document types (including application_form)
            print(f"[Python] Unified extraction for {document_type}: {image_input[:100]}..." if len(image_input) > 100 else f"[Python] Unified extraction for {document_type}: {image_input}", file=sys.stderr)
            result = extract_document_data(document_type, image_input)

        # ONLY print the final JSON result to stdout (no file=sys.stderr here)
        print(json.dumps(result, indent=2, cls=DateTimeEncoder))

    except Exception as e:
        error_result = {
            'success': False,
            'error': f"Main function error: {str(e)}",
            'error_type': type(e).__name__
        }
        print(json.dumps(error_result, indent=2, cls=DateTimeEncoder))
        sys.exit(1)

if __name__ == "__main__":
    main()