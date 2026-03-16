"""
Document Processing Lambda Handler with AWS Durable Functions

This Lambda function processes uploaded documents (invoices/receipts) using
DSPy for structured data extraction with Gemini AI.

Uses AWS Durable Execution SDK for fault-tolerant workflow with checkpointing:
- Each step is checkpointed and can resume after Lambda restarts
- Supports up to 24-hour execution time
- Automatic state persistence and recovery

Workflow Steps:
1. convert_pdf - Convert PDF to images (if needed)
2. validate_document - LLM validation of document type
3. extract_data - DSPy extraction of structured data
4. update_status - Update Convex with results
"""

import os
import json
import traceback
from typing import Any, Optional
from dataclasses import dataclass

# Register HEIC/HEIF support with Pillow (iPhone photos)
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass  # pillow-heif not available — HEIC files won't be processable

# AWS Durable Execution SDK - correct import for aws-durable-execution-sdk-python
from aws_durable_execution_sdk_python import durable_execution, DurableContext

# Sentry for error tracking
import sentry_sdk
from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration

# Local imports
# IMPORTANT: Import dspy_config FIRST to configure DSPy at Lambda cold start
# This avoids threading issues when AWS Durable Execution SDK resumes on different threads
from steps.dspy_config import ensure_dspy_configured

from steps.convert_pdf import convert_pdf_step
from steps.validate import validate_document_step
from steps.extract_invoice import (
    extract_invoice_step,
    extract_invoice_phase1_step,
    extract_invoice_phase2_step,
)
from steps.extract_receipt import (
    extract_receipt_step,
    extract_receipt_phase1_step,
    extract_receipt_phase2_step,
)
from steps.detect_qr import detect_qr_step
from utils.convex_client import ConvexClient
from utils.s3_client import S3Client
from types_def import (
    DocumentProcessingRequest,
    WorkflowState,
    StepStatus,
    ERROR_CODES,
    BusinessCategory,
    ConvertedImageInfo,
    get_user_friendly_error,
    format_error_for_logging,
)

# Initialize Sentry
sentry_dsn = os.environ.get("SENTRY_DSN")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        integrations=[AwsLambdaIntegration(timeout_warning=True)],
        environment=os.environ.get("SENTRY_ENVIRONMENT", "development"),
        traces_sample_rate=0.1,
    )


@dataclass
class WorkflowContext:
    """Context passed through workflow steps."""
    request: DocumentProcessingRequest
    convex: ConvexClient
    s3: S3Client
    state: WorkflowState


# =============================================================================
# Known Malaysian Merchant E-Invoice URLs
# Fallback when QR code is damaged/unreadable and OCR doesn't find a URL.
# Keys are lowercase substrings matched against extracted vendor_name.
# =============================================================================

_KNOWN_MERCHANT_URLS: dict[str, str] = {
    # Convenience stores
    "familymart":       "https://fmeinvoice.ql.com.my/",
    "family mart":      "https://fmeinvoice.ql.com.my/",
    "99 speedmart":     "https://einvois.99speedmart.com.my/",
    "99speedmart":      "https://einvois.99speedmart.com.my/",
    # Retail
    "mr. d.i.y":        "https://mrdiy.com.my/pages/einvoice-company",
    "mr d.i.y":         "https://mrdiy.com.my/pages/einvoice-company",
    "mr diy":           "https://mrdiy.com.my/pages/einvoice-company",
    "mrdiy":            "https://mrdiy.com.my/pages/einvoice-company",
    # Fast food
    "mcdonald":         "https://www.mcdonalds.com.my/contact/invoice",
    "kfc":              "https://kfc.com.my/e-invoice",
    "pizza hut":        "https://www.pizzahut.com.my/e-invoicing",
    "subway":           "https://subwaymalaysia.com/einvoice",
    # Petrol stations
    "petronas":         "https://setel.com/e-invoicing",
    "shell":            "https://einvoice.shell.com.my/",
    # Pharmacies
    "watsons":          "https://einvoice.watsons.com.my/",
    "watson":           "https://einvoice.watsons.com.my/",
    "guardian":         "https://einvoice.guardian.com.my/",
    # Supermarkets
    "aeon":             "https://einvoice.aeongroupmalaysia.com/",
    "jaya grocer":      "https://einvoice.jayagrocer.com/",
    "village grocer":   "https://einvoice.villagegrocer.com.my/",
    "tesco":            "https://einvoice.lotuss.com.my/",
    "lotus":            "https://einvoice.lotuss.com.my/",
    # Home improvement
    "ikea":             "https://einvoice.ikea.com.my/",
    "mr.diy":           "https://mrdiy.com.my/pages/einvoice-company",
}


def _lookup_merchant_einvoice_url(vendor_name: str) -> Optional[str]:
    """Match vendor name against known merchant e-invoice URLs.
    Checks Convex system-wide table first, falls back to hardcoded list."""
    if not vendor_name:
        return None
    vn = vendor_name.lower().strip()

    # Try Convex lookup (system-wide merchant_einvoice table)
    try:
        convex_url = os.environ.get("NEXT_PUBLIC_CONVEX_URL", "")
        if convex_url:
            import urllib.request
            req = urllib.request.Request(
                f"{convex_url}/api/query",
                data=json.dumps({
                    "path": "functions/system:lookupMerchantEinvoiceUrl",
                    "args": {"vendorName": vendor_name, "country": "MY"},
                    "format": "json",
                }).encode(),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                result = json.loads(resp.read())
                if result.get("status") == "success" and result.get("value"):
                    url = result["value"]["einvoiceUrl"]
                    print(f"[Merchant Lookup] Convex match: {vendor_name} → {url[:80]}")
                    return url
    except Exception as e:
        print(f"[Merchant Lookup] Convex query failed: {e}")

    # Fallback 1: hardcoded table (fast, no network)
    for key, url in _KNOWN_MERCHANT_URLS.items():
        if key in vn or vn in key:
            return url

    # Fallback 2: Ask Gemini Flash to find the merchant's e-invoice URL
    return _discover_merchant_url(vendor_name)


def _discover_merchant_url(vendor_name: str) -> Optional[str]:
    """Ask Gemini Flash if this Malaysian merchant has a public e-invoice form URL.
    If found, saves to Convex merchant table for future lookups."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key or not vendor_name:
        return None

    try:
        import urllib.request
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text":
                f"Does the Malaysian merchant \"{vendor_name}\" have a public e-invoice request form "
                f"where buyers can submit their company details to receive an e-invoice?\n\n"
                f"Search for: {vendor_name} malaysia e-invoice company buyer form\n\n"
                f"If YES, respond with ONLY the exact URL (e.g. https://einvoice.merchant.com.my/)\n"
                f"If NO or UNSURE, respond with ONLY the word: NONE\n"
                f"Do NOT guess or fabricate URLs. Only provide URLs you are confident exist."
            }]}],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 100},
        }
        req = urllib.request.Request(api_url, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            answer = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()

        if answer.upper() == "NONE" or not answer.startswith("http"):
            print(f"[Merchant Discovery] No e-invoice URL found for \"{vendor_name}\"")
            return None

        url = answer.split()[0]  # Take first URL if multiple
        print(f"[Merchant Discovery] Found URL for \"{vendor_name}\": {url}")

        # Save to Convex for future lookups (agent_discovered source)
        try:
            convex_url = os.environ.get("NEXT_PUBLIC_CONVEX_URL", "")
            if convex_url:
                save_req = urllib.request.Request(
                    f"{convex_url}/api/mutation",
                    data=json.dumps({
                        "path": "functions/system:upsertMerchantEinvoiceUrl",
                        "args": {
                            "merchantName": vendor_name,
                            "matchPatterns": [vendor_name.lower().strip()],
                            "einvoiceUrl": url,
                            "country": "MY",
                            "urlType": "static",
                            "source": "agent_discovered",
                        },
                        "format": "json",
                    }).encode(),
                    headers={"Content-Type": "application/json"},
                )
                urllib.request.urlopen(save_req, timeout=5)
                print(f"[Merchant Discovery] Saved to Convex merchant table")
        except Exception as e:
            print(f"[Merchant Discovery] Failed to save to Convex: {e}")

        return url
    except Exception as e:
        print(f"[Merchant Discovery] Failed: {e}")
        return None


# =============================================================================
# Initialize Clients (outside handler for reuse)
# =============================================================================

def get_convex_client() -> ConvexClient:
    """Get Convex client instance."""
    return ConvexClient(os.environ.get("NEXT_PUBLIC_CONVEX_URL", ""))


def get_s3_client() -> S3Client:
    """Get S3 client instance."""
    return S3Client(
        bucket=os.environ.get("S3_BUCKET_NAME", "finanseal-bucket"),
        region=os.environ.get("AWS_REGION", "us-west-2"),
    )


# =============================================================================
# Main Lambda Handler with Durable Execution
# =============================================================================

@durable_execution
def handler(event: dict, context: DurableContext):
    """
    Main Lambda handler for document processing with durable execution.

    Uses AWS Durable Execution SDK for fault-tolerant checkpointing:
    - Each step() call is checkpointed and can resume after Lambda restarts
    - State is automatically persisted between invocations
    - Supports long-running workflows up to 24 hours

    Args:
        event: Lambda event containing DocumentProcessingRequest
        context: Lambda context

    Returns:
        DurableResult with workflow status and extracted data
    """
    # =================================================================
    # Step 0: Parse and validate request (no checkpointing needed - fast/deterministic)
    # =================================================================
    try:
        request = DocumentProcessingRequest.from_dict(event)
    except Exception as e:
        error_msg = f"Invalid request: {str(e)}"
        print(f"[ERROR] {error_msg}")
        return {
            "success": False,
            "error_code": ERROR_CODES["INVALID_INPUT"],
            "error_message": error_msg,
        }

    doc_id = request.document_id
    print(f"[{doc_id}] Starting durable document processing workflow")
    print(f"[{doc_id}] Domain: {request.domain}, FileType: {request.file_type}")
    print(f"[{doc_id}] test_mode={request.test_mode}")

    # Initialize clients
    convex = get_convex_client()
    s3 = get_s3_client()

    # =================================================================
    # Step 1: Fetch business categories (checkpointed)
    # Note: Returns list of dicts (not BusinessCategory) for SDK serialization
    # =================================================================
    def fetch_categories():
        if not request.business_categories and request.business_id:
            try:
                print(f"[{doc_id}] Fetching business categories for business_id: {request.business_id}")
                categories_data = convex.get_business_categories(request.business_id)

                if categories_data:
                    if request.domain == "invoices":
                        raw_categories = categories_data.get("customCogsCategories", [])
                        print(f"[{doc_id}] Using COGS categories for invoices: {len(raw_categories)} categories")
                    else:
                        raw_categories = categories_data.get("customExpenseCategories", [])
                        print(f"[{doc_id}] Using expense categories for expense_claims: {len(raw_categories)} categories")

                    # Return as dicts for SDK serialization (convert to BusinessCategory when needed)
                    # Note: We use 'id' (Convex document ID) instead of 'category_code'
                    categories = [
                        {
                            "name": cat.get("category_name", ""),
                            "id": cat.get("id") or cat.get("_id"),  # Convex document ID
                            "keywords": cat.get("ai_keywords", []),
                            "vendor_patterns": cat.get("vendor_patterns", []),
                        }
                        for cat in raw_categories
                        if cat.get("is_active", True)
                    ]
                    print(f"[{doc_id}] Loaded {len(categories)} active categories for LLM")
                    return categories
            except Exception as cat_error:
                print(f"[{doc_id}] Warning: Failed to fetch categories: {str(cat_error)}")
        return []  # Return empty list (SDK can serialize this)

    business_categories_raw = context.step(lambda ctx: fetch_categories(), name="fetch_categories")

    # Convert to BusinessCategory objects for downstream use
    business_categories = [
        BusinessCategory(
            name=cat.get("name", ""),
            id=cat.get("id"),  # Convex document ID
            keywords=cat.get("keywords", []),
            vendor_patterns=cat.get("vendor_patterns", []),
        )
        for cat in business_categories_raw
    ]

    try:
        # =================================================================
        # Step 2: Update status to processing (checkpointed)
        # Skip in test_mode to avoid touching non-existent documents
        # =================================================================
        def update_status_processing():
            if request.test_mode:
                print(f"[{doc_id}] SKIPPING status update to processing (test_mode=True)")
                return True
            print(f"[{doc_id}] Updating status to processing")
            convex.update_status(
                document_id=doc_id,
                domain=request.domain,
                status="processing",
            )
            return True

        context.step(lambda ctx: update_status_processing(), name="update_status_processing")

        # =================================================================
        # Step 3: Convert PDF (checkpointed)
        # =================================================================
        def convert_pdf():
            print(f"[{doc_id}] Step: PDF Conversion")
            if request.file_type != "pdf":
                print(f"[{doc_id}] Skipping PDF conversion - file is already an image")
                return {
                    "status": "skipped",
                    "images": None,
                    "reason": "File is already an image",
                }
            else:
                result = convert_pdf_step(
                    document_id=doc_id,
                    storage_path=request.storage_path,
                    domain=request.domain,
                    s3=s3,
                )
                print(f"[{doc_id}] PDF conversion complete: {len(result.get('images', []))} pages")
                return result

        conversion_result = context.step(lambda ctx: convert_pdf(), name="convert_pdf")

        # Convert image dicts back to ConvertedImageInfo objects for downstream steps
        # (SDK returns dicts, but steps expect ConvertedImageInfo objects)
        converted_images = None
        if conversion_result.get("status") == "success" and conversion_result.get("images"):
            converted_images = [
                ConvertedImageInfo(
                    page_number=img.get("page_number", 1),
                    s3_key=img.get("s3_key", ""),
                    width=img.get("width", 0),
                    height=img.get("height", 0),
                    mime_type=img.get("mime_type", "image/png"),
                )
                for img in conversion_result.get("images", [])
            ]

        # =================================================================
        # Step 3b: Update Convex with converted image path (checkpointed)
        # Skip in test_mode to avoid touching non-existent documents
        # =================================================================
        def update_converted_image():
            if request.test_mode:
                print(f"[{doc_id}] SKIPPING converted image update (test_mode=True)")
                return True
            if conversion_result.get("status") == "success" and conversion_result.get("first_image_path"):
                print(f"[{doc_id}] Updating Convex with converted image path")
                first_image = conversion_result.get("images", [{}])[0]

                # Strip domain prefix - API will add it back via buildS3Key()
                # Lambda stores: invoices/business_id/user_id/doc_id/converted/page_1.png
                # Convex needs: business_id/user_id/doc_id/converted/page_1.png
                first_image_path = conversion_result.get("first_image_path", "")
                domain_prefix = f"{request.domain}/"
                if first_image_path.startswith(domain_prefix):
                    first_image_path = first_image_path[len(domain_prefix):]

                convex.update_converted_image(
                    document_id=doc_id,
                    domain=request.domain,
                    converted_image_path=first_image_path,
                    width=first_image.get("width"),
                    height=first_image.get("height"),
                    page_metadata=conversion_result.get("page_metadata"),
                    total_pages=conversion_result.get("total_pages"),
                )
                print(f"[{doc_id}] Converted image path updated in Convex")
                return True
            return False

        context.step(lambda ctx: update_converted_image(), name="update_converted_image")

        # =================================================================
        # Step 3c: QR Code Detection (019-lhdn-einv-flow-2)
        # Runs for expense_claims only — detects merchant form URLs from receipt QR codes
        # Parallel to extraction — does not add latency
        # =================================================================
        def detect_qr_codes():
            if request.domain != "expense_claims":
                return {"merchant_form_url": None, "detected_qr_codes": []}

            print(f"[{doc_id}] Step: QR Code Detection")
            try:
                # Get image bytes for QR detection
                if converted_images and len(converted_images) > 0:
                    # PDF was converted — use first page image
                    image_data = s3.read_document(converted_images[0].s3_key)
                elif request.storage_path:
                    # Direct image upload — read from S3
                    # Build the full S3 key with domain prefix
                    s3_key = f"{request.domain}/{request.storage_path}"
                    image_data = s3.read_document(s3_key)
                else:
                    print(f"[{doc_id}] QR Detection: No image available")
                    return {"merchant_form_url": None, "detected_qr_codes": []}

                result = detect_qr_step(
                    document_id=doc_id,
                    image_bytes=image_data,
                    mime_type=request.file_type or "image/png",
                )
                return result
            except Exception as qr_error:
                # QR detection failure is non-fatal
                print(f"[{doc_id}] QR Detection failed (non-fatal): {str(qr_error)}")
                return {"merchant_form_url": None, "detected_qr_codes": []}

        qr_result = context.step(lambda ctx: detect_qr_codes(), name="detect_qr_codes")

        # =================================================================
        # Step 4: Validate document type (Gemini Flash classification)
        # =================================================================
        # Expense claims: validate to reject non-receipts (tutorials, ID cards, etc.)
        # Invoices: skip validation (domain-based routing is sufficient)
        def validate_document():
            if request.domain != "expense_claims":
                print(f"[{doc_id}] SKIPPING validation (domain-based routing: {request.domain})")
                return {
                    "is_supported": True,
                    "document_type": "invoice",
                    "confidence": 1.0,
                    "reasoning": "Validation skipped - domain-based routing",
                    "skipped": True,
                }

            from steps.validate import validate_document_step
            return validate_document_step(
                document_id=doc_id,
                images=converted_images,
                storage_path=request.storage_path,
                domain=request.domain,
                expected_type=request.expected_document_type,
                s3=s3,
            )

        validation_result = context.step(lambda ctx: validate_document(), name="validate_document")

        # If document is not a receipt/invoice, reject with user-friendly message
        if not validation_result.get("is_supported", True):
            user_message = validation_result.get("user_message", "This document does not appear to be a receipt or invoice. Please upload a valid receipt.")
            print(f"[{doc_id}] Document rejected: {validation_result.get('document_type')} - {user_message}")
            convex.update_status(
                document_id=doc_id,
                domain=request.domain,
                status="classification_failed",
                error_message=user_message,
            )
            return {"claimId": doc_id, "status": "classification_failed", "reason": user_message}

        # =================================================================
        # Step 5: Extract data (checkpointed - most expensive step)
        # TWO-PHASE extraction for faster perceived performance:
        #   - Phase 1: Core fields only (~3-4s) → Convex update → UI renders immediately
        #   - Phase 2: Line items only (~3-4s) → Convex update → UI updates via real-time
        # =================================================================
        def extract_data():
            print(f"[{doc_id}] Step: Data Extraction (TWO-PHASE)")

            # IMPORTANT: Use domain to determine extraction path, NOT LLM classification
            # Both domains now use two-phase extraction for consistent performance

            if request.domain == "expense_claims":
                # Two-Phase Extraction for expense claims:
                # Phase 1 (here): Extract core fields WITHOUT line_items for fast initial render
                # Phase 2 (separate step): Extract line_items → Convex real-time update
                print(f"[{doc_id}] Using TWO-PHASE receipt extraction (Phase 1: core fields only)")
                result = extract_receipt_phase1_step(
                    document_id=doc_id,
                    images=converted_images,
                    storage_path=request.storage_path,
                    domain=request.domain,
                    categories=business_categories,
                    s3=s3,
                )
                print(f"[{doc_id}] Phase 1 complete in {result.get('processing_time_ms', 0)}ms")
            else:
                # Two-Phase Extraction for invoices:
                # Phase 1 (here): Extract core fields WITHOUT line_items for fast initial render
                # Phase 2 (separate step): Extract line_items → Convex real-time update
                print(f"[{doc_id}] Using TWO-PHASE invoice extraction (Phase 1: core fields only)")
                result = extract_invoice_phase1_step(
                    document_id=doc_id,
                    images=converted_images,
                    storage_path=request.storage_path,
                    domain=request.domain,
                    categories=business_categories,
                    s3=s3,
                )
                print(f"[{doc_id}] Phase 1 complete in {result.get('processing_time_ms', 0)}ms")

            print(f"[{doc_id}] Extraction complete: {result.get('vendor_name', 'Unknown')} - {result.get('total_amount', 0)} {result.get('currency', 'USD')}")
            return result

        extraction_result = context.step(lambda ctx: extract_data(), name="extract_data")

        # Check extraction success
        if not extraction_result.get("success", True):
            technical_error = extraction_result.get("error", "Extraction failed")
            error_code = ERROR_CODES["EXTRACTION_FAILED"]

            # Log technical details for debugging
            print(f"[{doc_id}] {format_error_for_logging(error_code, technical_error)}")

            # Get user-friendly message for frontend display
            user_friendly_msg = get_user_friendly_error(error_code, technical_error)

            convex.mark_as_failed(
                document_id=doc_id,
                domain=request.domain,
                error_code=error_code,
                error_message=user_friendly_msg,  # User sees this
            )
            return {
                "success": False,
                "error_code": error_code,
                "error_message": user_friendly_msg,
                "technical_error": technical_error,  # For debugging only
            }

        # =================================================================
        # Step 7: Update Convex with results (checkpointed)
        # Skip in test_mode to avoid modifying production data
        # =================================================================
        def update_convex_results():
            if request.test_mode:
                print(f"[{doc_id}] SKIPPING Convex update (test_mode=True)")
                return {"claimId": doc_id, "emailRef": None, "requestLogId": None}

            print(f"[{doc_id}] Step: Updating Convex with results")

            # DEBUG: Log description and business_purpose being passed to Convex
            print(f"[{doc_id}] Extraction result keys: {list(extraction_result.keys())}")
            print(f"[{doc_id}] Passing to Convex - description: '{extraction_result.get('description')}'")
            print(f"[{doc_id}] Passing to Convex - business_purpose: '{extraction_result.get('business_purpose')}'")

            if request.domain == "invoices":
                convex.update_invoice_extraction(
                    document_id=doc_id,
                    extracted_data=extraction_result,
                    confidence_score=extraction_result.get("confidence", 0.0),
                    extraction_method="dspy_gemini",
                )
                return {"claimId": doc_id, "emailRef": None, "requestLogId": None}
            else:
                # Include QR detection results in processing metadata
                # Priority: QR code URL > OCR text URL (from extraction)
                merchant_form_url = qr_result.get("merchant_form_url") if qr_result else None
                if not merchant_form_url:
                    # Fallback 1: OCR-extracted URL from Gemini
                    ocr_url = extraction_result.get("merchant_einvoice_url")
                    if ocr_url:
                        if not ocr_url.startswith("http"):
                            ocr_url = "https://" + ocr_url
                        merchant_form_url = ocr_url
                        print(f"[{doc_id}] Using OCR-extracted e-invoice URL: {ocr_url[:80]}")
                if not merchant_form_url:
                    # Fallback 2: known merchant lookup by vendor name
                    vendor = (extraction_result.get("vendor_name") or "").lower().strip()
                    merchant_form_url = _lookup_merchant_einvoice_url(vendor)
                    if merchant_form_url:
                        print(f"[{doc_id}] Matched vendor \"{vendor}\" → {merchant_form_url[:80]}")
                if merchant_form_url:
                    extraction_result["merchant_form_url"] = merchant_form_url
                    extraction_result["detected_qr_codes"] = qr_result.get("detected_qr_codes", [])
                    print(f"[{doc_id}] Including merchant_form_url in extraction: {merchant_form_url[:80]}...")

                result = convex.update_expense_claim_extraction(
                    document_id=doc_id,
                    extracted_data=extraction_result,
                    confidence_score=extraction_result.get("confidence", 0.0),
                    vendor_name=extraction_result.get("vendor_name"),
                    total_amount=extraction_result.get("total_amount"),
                    currency=extraction_result.get("currency"),
                    transaction_date=extraction_result.get("transaction_date"),
                    # Pass category and descriptive fields to Convex
                    expense_category=extraction_result.get("expense_category"),
                    business_purpose=extraction_result.get("business_purpose"),
                    description=extraction_result.get("description"),
                    reference_number=extraction_result.get("receipt_number"),
                    # QR detection (019-lhdn-einv-flow-2)
                    merchant_form_url=merchant_form_url,
                )
                return result

        context.step(lambda ctx: update_convex_results(), name="update_convex_results")

        # =================================================================
        # Step 7d: Trigger e-invoice form fill Lambda (019-lhdn-einv-flow-2)
        # If QR code detected + business has TIN → invoke Node.js Lambda
        # emailRef derived from claim ID (first 10 chars) — deterministic, no Convex round-trip
        # Runs async (fire-and-forget) — user already sees extracted data
        # =================================================================
        def trigger_einvoice_form_fill():
            if request.test_mode:
                print(f"[{doc_id}] SKIPPING e-invoice form fill trigger (test_mode=True)")
                return {"triggered": False, "reason": "test_mode"}

            if request.domain != "expense_claims":
                return {"triggered": False, "reason": "not_expense_claims"}

            # Detection chain: QR → OCR URL → known merchant lookup
            merchant_form_url = qr_result.get("merchant_form_url") if qr_result else None
            if not merchant_form_url:
                # Fallback 1: check OCR-extracted URL from Gemini extraction
                ocr_url = extraction_result.get("merchant_einvoice_url")
                if ocr_url:
                    if not ocr_url.startswith("http"):
                        ocr_url = "https://" + ocr_url
                    merchant_form_url = ocr_url
                    print(f"[{doc_id}] E-invoice: using OCR-extracted URL: {ocr_url[:80]}")
            if not merchant_form_url:
                # Fallback 2: known merchant e-invoice URL lookup by vendor name
                vendor_name = (extraction_result.get("vendor_name") or "").lower().strip()
                merchant_form_url = _lookup_merchant_einvoice_url(vendor_name)
                if merchant_form_url:
                    print(f"[{doc_id}] E-invoice: matched vendor \"{vendor_name}\" → {merchant_form_url[:80]}")
            if not merchant_form_url:
                return {"triggered": False, "reason": "no_merchant_form_url"}

            if not request.business_details:
                print(f"[{doc_id}] E-invoice: merchantFormUrl found but no business details in payload")
                return {"triggered": False, "reason": "no_business_details"}

            form_fill_arn = os.environ.get("EINVOICE_FORM_FILL_LAMBDA_ARN")
            if not form_fill_arn:
                print(f"[{doc_id}] E-invoice: EINVOICE_FORM_FILL_LAMBDA_ARN not configured")
                return {"triggered": False, "reason": "no_lambda_arn"}

            # Derive emailRef from claim ID (first 10 chars — unique, deterministic)
            email_ref = doc_id[:10]

            print(f"[{doc_id}] Triggering e-invoice form fill Lambda: {merchant_form_url[:80]}...")

            import boto3
            lambda_client = boto3.client("lambda")
            # Get extra fields from business_details (passed from Vercel)
            bd = request.business_details
            raw = request.raw_business_details or {}
            payload = {
                "merchantFormUrl": merchant_form_url,
                "buyerDetails": {
                    "name": raw.get("name", bd.name),
                    "userName": raw.get("userName", bd.name),  # User's personal name
                    "tin": bd.tin,
                    "brn": bd.brn,
                    "address": raw.get("address", bd.address),
                    "addressLine1": raw.get("addressLine1", bd.address),
                    "city": raw.get("city", ""),
                    "stateCode": raw.get("stateCode", ""),
                    "email": f"einvoice+{email_ref}@einv.hellogroot.com",
                    "phone": raw.get("phone", bd.phone) or "+60132201176",
                },
                "extractedData": {
                    "referenceNumber": extraction_result.get("receipt_number"),
                    "vendorName": extraction_result.get("vendor_name"),
                    "amount": extraction_result.get("total_amount"),
                    "date": extraction_result.get("transaction_date"),
                },
                "receiptImagePath": request.storage_path,  # Full S3 key of the original receipt image
                "emailRef": email_ref,
                "expenseClaimId": doc_id,
            }

            lambda_client.invoke(
                FunctionName=form_fill_arn,
                InvocationType="Event",  # Async — fire and forget
                Payload=json.dumps(payload),
            )
            print(f"[{doc_id}] E-invoice form fill Lambda invoked successfully")
            return {"triggered": True, "emailRef": email_ref}

        context.step(lambda ctx: trigger_einvoice_form_fill(), name="trigger_einvoice_form_fill")

        # =================================================================
        # Step 7a: Phase 2 Line Items Extraction (expense_claims)
        # Runs AFTER Phase 1 results are saved → frontend renders immediately
        # Phase 2 extracts line_items → Convex real-time update → frontend updates
        # =================================================================
        def extract_expense_claims_phase2():
            # Only run Phase 2 for expense_claims
            if request.domain != "expense_claims":
                return {"skipped": True, "reason": "not_expense_claims"}

            if request.test_mode:
                print(f"[{doc_id}] SKIPPING expense_claims Phase 2 (test_mode=True)")
                return {"skipped": True, "reason": "test_mode"}

            print(f"[{doc_id}] expense_claims Phase 2: Starting line items extraction")

            # Mark lineItemsStatus as 'extracting' before starting
            try:
                convex.update_expense_claim_line_items_status(
                    document_id=doc_id,
                    line_items_status="extracting",
                )
                print(f"[{doc_id}] expense_claims Phase 2: Marked lineItemsStatus='extracting'")
            except Exception as e:
                print(f"[{doc_id}] Warning: Failed to update lineItemsStatus: {str(e)}")

            # Run Phase 2 extraction (line items only)
            phase2_result = extract_receipt_phase2_step(
                document_id=doc_id,
                images=converted_images,
                storage_path=request.storage_path,
                domain=request.domain,
                s3=s3,
            )

            print(f"[{doc_id}] expense_claims Phase 2 complete: {phase2_result.get('line_items_count', 0)} items in {phase2_result.get('processing_time_ms', 0)}ms")

            # Update Convex with line_items and mark as 'complete'
            if phase2_result.get("success"):
                try:
                    line_items = phase2_result.get("line_items", [])
                    print(f"[{doc_id}] expense_claims Phase 2: Sending {len(line_items)} line_items to Convex")

                    convex.update_expense_claim_line_items(
                        document_id=doc_id,
                        line_items=line_items,
                        line_items_status="complete",
                    )
                    print(f"[{doc_id}] expense_claims Phase 2: Updated Convex (status='complete')")
                except Exception as e:
                    import traceback
                    print(f"[{doc_id}] Warning: Failed to update line_items: {str(e)}")
                    print(f"[{doc_id}] Phase 2 ERROR traceback: {traceback.format_exc()}")
                    # CRITICAL: Mark as 'skipped' so frontend doesn't show infinite spinner
                    try:
                        convex.update_expense_claim_line_items_status(
                            document_id=doc_id,
                            line_items_status="skipped",
                        )
                        print(f"[{doc_id}] expense_claims Phase 2: Marked as 'skipped' due to update failure")
                    except Exception as skip_err:
                        print(f"[{doc_id}] Warning: Failed to mark as skipped: {str(skip_err)}")
            else:
                # Phase 2 failed - mark as skipped, don't fail the whole workflow
                print(f"[{doc_id}] expense_claims Phase 2 failed: {phase2_result.get('error', 'unknown')}")
                try:
                    convex.update_expense_claim_line_items_status(
                        document_id=doc_id,
                        line_items_status="skipped",
                    )
                except Exception as e:
                    print(f"[{doc_id}] Warning: Failed to mark lineItemsStatus as skipped: {str(e)}")

            return phase2_result

        context.step(lambda ctx: extract_expense_claims_phase2(), name="extract_expense_claims_phase2")

        # =================================================================
        # Step 7b: Phase 2 Line Items Extraction (invoices)
        # Same pattern as expense_claims - extracts line_items after core data saved
        # =================================================================
        def extract_invoices_phase2():
            # Only run Phase 2 for invoices
            if request.domain != "invoices":
                return {"skipped": True, "reason": "not_invoices"}

            if request.test_mode:
                print(f"[{doc_id}] SKIPPING invoices Phase 2 (test_mode=True)")
                return {"skipped": True, "reason": "test_mode"}

            print(f"[{doc_id}] invoices Phase 2: Starting line items extraction")

            # Mark lineItemsStatus as 'extracting' before starting
            try:
                convex.update_invoice_line_items_status(
                    document_id=doc_id,
                    line_items_status="extracting",
                )
                print(f"[{doc_id}] invoices Phase 2: Marked lineItemsStatus='extracting'")
            except Exception as e:
                print(f"[{doc_id}] Warning: Failed to update lineItemsStatus: {str(e)}")

            # Run Phase 2 extraction (line items only)
            phase2_result = extract_invoice_phase2_step(
                document_id=doc_id,
                images=converted_images,
                storage_path=request.storage_path,
                domain=request.domain,
                s3=s3,
            )

            print(f"[{doc_id}] invoices Phase 2 complete: {len(phase2_result.get('line_items', []))} items in {phase2_result.get('processing_time_ms', 0)}ms")

            # Update Convex with line_items and mark as 'complete'
            if phase2_result.get("success"):
                try:
                    line_items = phase2_result.get("line_items", [])
                    print(f"[{doc_id}] invoices Phase 2: Sending {len(line_items)} line_items to Convex")

                    convex.update_invoice_line_items(
                        document_id=doc_id,
                        line_items=line_items,
                        line_items_status="complete",
                    )
                    print(f"[{doc_id}] invoices Phase 2: Updated Convex (status='complete')")
                except Exception as e:
                    import traceback
                    print(f"[{doc_id}] Warning: Failed to update line_items: {str(e)}")
                    print(f"[{doc_id}] Phase 2 ERROR traceback: {traceback.format_exc()}")
                    # CRITICAL: Mark as 'skipped' so frontend doesn't show infinite spinner
                    try:
                        convex.update_invoice_line_items_status(
                            document_id=doc_id,
                            line_items_status="skipped",
                        )
                        print(f"[{doc_id}] invoices Phase 2: Marked as 'skipped' due to update failure")
                    except Exception as skip_err:
                        print(f"[{doc_id}] Warning: Failed to mark as skipped: {str(skip_err)}")
            else:
                # Phase 2 failed - mark as skipped, don't fail the whole workflow
                print(f"[{doc_id}] invoices Phase 2 failed: {phase2_result.get('error', 'unknown')}")
                try:
                    convex.update_invoice_line_items_status(
                        document_id=doc_id,
                        line_items_status="skipped",
                    )
                except Exception as e:
                    print(f"[{doc_id}] Warning: Failed to mark lineItemsStatus as skipped: {str(e)}")

            return phase2_result

        context.step(lambda ctx: extract_invoices_phase2(), name="extract_invoices_phase2")

        # =================================================================
        # Step 7c: Process vendor from extraction (checkpointed)
        # Creates/upserts vendor and records price history observations
        # =================================================================
        def process_vendor():
            if request.test_mode:
                print(f"[{doc_id}] SKIPPING vendor processing (test_mode=True)")
                return {"success": True, "reason": "test_mode"}

            print(f"[{doc_id}] Step: Processing vendor from extraction")
            try:
                result = convex.process_vendor_from_extraction(
                    document_id=doc_id,
                    domain=request.domain,
                )
                if result.get("success"):
                    print(f"[{doc_id}] Vendor processed: vendorId={result.get('vendorId')}, "
                          f"created={result.get('vendorCreated')}, "
                          f"priceObservations={result.get('priceObservationsCount')}")
                else:
                    print(f"[{doc_id}] Vendor processing skipped: {result.get('reason')}")
                return result
            except Exception as e:
                # Non-fatal: vendor processing failure shouldn't fail the document
                print(f"[{doc_id}] Warning: Failed to process vendor: {str(e)}")
                return {"success": False, "reason": str(e)}

        context.step(lambda ctx: process_vendor(), name="process_vendor")

        # =================================================================
        # Step 8: Record token usage (checkpointed)
        # =================================================================
        def record_token_usage():
            tokens_used = extraction_result.get("tokens_used")
            if tokens_used and tokens_used.get("has_usage_data"):
                try:
                    convex.record_ocr_usage(
                        business_id=request.business_id,
                        document_id=doc_id,
                        token_usage=tokens_used,
                        credits=1,
                    )
                    print(f"[{doc_id}] Token usage recorded: {tokens_used.get('total_tokens', 0)} tokens")
                except Exception as e:
                    print(f"[{doc_id}] Warning: Failed to record token usage: {str(e)}")
            return True

        context.step(lambda ctx: record_token_usage(), name="record_token_usage")

        print(f"[{doc_id}] Durable workflow completed successfully")

        return {
            "success": True,
            "document_id": doc_id,
            "domain": request.domain,
            "extraction_result": extraction_result,
            "validation_result": validation_result,
        }

    except Exception as e:
        technical_error = f"Workflow failed: {str(e)}"
        error_traceback = traceback.format_exc()
        error_code = ERROR_CODES["WORKFLOW_FAILED"]

        # Log technical details for debugging (visible in CloudWatch)
        print(f"[{doc_id}] {format_error_for_logging(error_code, technical_error)}")
        print(f"[{doc_id}] Traceback: {error_traceback}")

        # Report to Sentry with full technical details
        sentry_sdk.capture_exception(e)

        # Get user-friendly message for frontend display
        user_friendly_msg = get_user_friendly_error(error_code, str(e))

        # Update Convex with user-friendly message
        try:
            convex.mark_as_failed(
                document_id=doc_id,
                domain=request.domain,
                error_code=error_code,
                error_message=user_friendly_msg,  # User sees this
            )
        except Exception as convex_error:
            print(f"[{doc_id}] Failed to update Convex with error: {convex_error}")

        return {
            "success": False,
            "error_code": error_code,
            "error_message": user_friendly_msg,
            "technical_error": technical_error,  # For debugging only
            "traceback": error_traceback,  # For debugging only
        }
