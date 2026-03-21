"""
Document Processing Lambda Handler

This Lambda function processes uploaded documents (invoices/receipts) using
DSPy for structured data extraction with Gemini AI.

Plain Lambda handler — no durable execution SDK. Total processing time is
~15-20 seconds, well within Lambda's 5-minute timeout. Removing the durable
SDK eliminates env-var-not-available bugs caused by checkpoint/resume across
invocations and threading issues with DSPy configuration.

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

# =============================================================================
# Resolve GEMINI_API_KEY from SSM at cold start (BEFORE any imports that need it)
# CDK sets GEMINI_API_KEY_SSM_PARAM='/finanseal/gemini-api-key' but Python code
# reads GEMINI_API_KEY directly. This bridge fetches the actual key from SSM.
# =============================================================================
if not os.environ.get("GEMINI_API_KEY") and os.environ.get("GEMINI_API_KEY_SSM_PARAM"):
    try:
        import boto3
        _ssm = boto3.client("ssm")
        _param = _ssm.get_parameter(
            Name=os.environ["GEMINI_API_KEY_SSM_PARAM"],
            WithDecryption=True,
        )
        os.environ["GEMINI_API_KEY"] = _param["Parameter"]["Value"]
        print(f"[SSM] Resolved GEMINI_API_KEY from {os.environ['GEMINI_API_KEY_SSM_PARAM']}")
    except Exception as _ssm_err:
        print(f"[SSM] ERROR: Failed to resolve GEMINI_API_KEY from SSM: {_ssm_err}")

# Register HEIC/HEIF support with Pillow (iPhone photos)
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass  # pillow-heif not available — HEIC files won't be processable

# Sentry for error tracking
import sentry_sdk
from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration

# Local imports
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
# Initialize Clients (outside handler for reuse across warm invocations)
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
# Main Lambda Handler (plain — no durable execution)
# =============================================================================

def handler(event: dict, context: Any):
    """
    Main Lambda handler for document processing.

    Plain sequential handler — total processing ~15-20s, well within Lambda
    timeout. No durable execution SDK needed.

    Args:
        event: Lambda event containing DocumentProcessingRequest
        context: Lambda context (standard AWS)

    Returns:
        Dict with workflow status and extracted data
    """
    # =================================================================
    # Step 0: Parse and validate request
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
    print(f"[{doc_id}] Starting document processing workflow")
    print(f"[{doc_id}] Domain: {request.domain}, FileType: {request.file_type}")
    print(f"[{doc_id}] test_mode={request.test_mode}")

    # Initialize clients
    convex = get_convex_client()
    s3 = get_s3_client()

    # =================================================================
    # Step 1: Fetch business categories
    # =================================================================
    business_categories = []
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

                business_categories = [
                    BusinessCategory(
                        name=cat.get("category_name", ""),
                        id=cat.get("id") or cat.get("_id"),
                        keywords=cat.get("ai_keywords", []),
                        vendor_patterns=cat.get("vendor_patterns", []),
                    )
                    for cat in raw_categories
                    if cat.get("is_active", True)
                ]
                print(f"[{doc_id}] Loaded {len(business_categories)} active categories for LLM")
        except Exception as cat_error:
            print(f"[{doc_id}] Warning: Failed to fetch categories: {str(cat_error)}")

    try:
        # =================================================================
        # Step 2: Update status to processing
        # =================================================================
        if not request.test_mode:
            print(f"[{doc_id}] Updating status to processing")
            convex.update_status(
                document_id=doc_id,
                domain=request.domain,
                status="processing",
            )

        # =================================================================
        # Step 3: Convert PDF
        # =================================================================
        print(f"[{doc_id}] Step: PDF Conversion")
        converted_images = None
        if request.file_type != "pdf":
            print(f"[{doc_id}] Skipping PDF conversion - file is already an image")
        else:
            conversion_result = convert_pdf_step(
                document_id=doc_id,
                storage_path=request.storage_path,
                domain=request.domain,
                s3=s3,
            )
            print(f"[{doc_id}] PDF conversion complete: {len(conversion_result.get('images', []))} pages")

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

            # Update Convex with converted image path
            if not request.test_mode and conversion_result.get("status") == "success" and conversion_result.get("first_image_path"):
                print(f"[{doc_id}] Updating Convex with converted image path")
                first_image = conversion_result.get("images", [{}])[0]

                # Strip domain prefix - API will add it back via buildS3Key()
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

        # =================================================================
        # Step 3c: QR Code Detection (019-lhdn-einv-flow-2)
        # =================================================================
        qr_result = {"merchant_form_url": None, "detected_qr_codes": []}
        if request.domain == "expense_claims":
            print(f"[{doc_id}] Step: QR Code Detection")
            try:
                if converted_images and len(converted_images) > 0:
                    image_data = s3.read_document(converted_images[0].s3_key)
                elif request.storage_path:
                    s3_key = f"{request.domain}/{request.storage_path}"
                    image_data = s3.read_document(s3_key)
                else:
                    print(f"[{doc_id}] QR Detection: No image available")
                    image_data = None

                if image_data:
                    qr_result = detect_qr_step(
                        document_id=doc_id,
                        image_bytes=image_data,
                        mime_type=request.file_type or "image/png",
                    )
            except Exception as qr_error:
                print(f"[{doc_id}] QR Detection failed (non-fatal): {str(qr_error)}")

        # =================================================================
        # Step 4: Validate document type (Gemini Flash classification)
        # =================================================================
        if request.domain != "expense_claims":
            print(f"[{doc_id}] SKIPPING validation (domain-based routing: {request.domain})")
            validation_result = {
                "is_supported": True,
                "document_type": "invoice",
                "confidence": 1.0,
                "reasoning": "Validation skipped - domain-based routing",
                "skipped": True,
            }
        else:
            validation_result = validate_document_step(
                document_id=doc_id,
                images=converted_images,
                storage_path=request.storage_path,
                domain=request.domain,
                expected_type=request.expected_document_type,
                s3=s3,
            )

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
        # Step 5: Extract data (TWO-PHASE extraction)
        # Phase 1: Core fields only → Convex update → UI renders immediately
        # Phase 2: Line items only → Convex update → UI updates via real-time
        # =================================================================
        print(f"[{doc_id}] Step: Data Extraction (TWO-PHASE)")

        if request.domain == "expense_claims":
            print(f"[{doc_id}] Using TWO-PHASE receipt extraction (Phase 1: core fields only)")
            extraction_result = extract_receipt_phase1_step(
                document_id=doc_id,
                images=converted_images,
                storage_path=request.storage_path,
                domain=request.domain,
                categories=business_categories,
                s3=s3,
            )
            print(f"[{doc_id}] Phase 1 complete in {extraction_result.get('processing_time_ms', 0)}ms")
        else:
            print(f"[{doc_id}] Using TWO-PHASE invoice extraction (Phase 1: core fields only)")
            extraction_result = extract_invoice_phase1_step(
                document_id=doc_id,
                images=converted_images,
                storage_path=request.storage_path,
                domain=request.domain,
                categories=business_categories,
                s3=s3,
            )
            print(f"[{doc_id}] Phase 1 complete in {extraction_result.get('processing_time_ms', 0)}ms")

        print(f"[{doc_id}] Extraction complete: {extraction_result.get('vendor_name', 'Unknown')} - {extraction_result.get('total_amount', 0)} {extraction_result.get('currency', 'USD')}")

        # Check extraction success
        if not extraction_result.get("success", True):
            technical_error = extraction_result.get("error", "Extraction failed")
            error_code = ERROR_CODES["EXTRACTION_FAILED"]
            print(f"[{doc_id}] {format_error_for_logging(error_code, technical_error)}")
            user_friendly_msg = get_user_friendly_error(error_code, technical_error)
            convex.mark_as_failed(
                document_id=doc_id,
                domain=request.domain,
                error_code=error_code,
                error_message=user_friendly_msg,
            )
            return {
                "success": False,
                "error_code": error_code,
                "error_message": user_friendly_msg,
                "technical_error": technical_error,
            }

        # =================================================================
        # Step 6: Update Convex with results
        # =================================================================
        if not request.test_mode:
            print(f"[{doc_id}] Step: Updating Convex with results")
            print(f"[{doc_id}] Extraction result keys: {list(extraction_result.keys())}")
            print(f"[{doc_id}] Passing to Convex - description: '{extraction_result.get('description')}'")
            print(f"[{doc_id}] Passing to Convex - business_purpose: '{extraction_result.get('business_purpose')}'")

            if request.domain == "invoices":
                # Dual LHDN detection: QR code + DSPy
                lhdn_long_id = qr_result.get("lhdn_long_id") if qr_result else None
                lhdn_validation_url = (qr_result.get("lhdn_validation_urls") or [None])[0] if qr_result else None
                is_lhdn = extraction_result.get("is_lhdn_einvoice", False)
                dspy_lhdn_uuid = extraction_result.get("lhdn_uuid")

                if is_lhdn and not lhdn_long_id:
                    print(f"[{doc_id}] LHDN e-invoice detected by DSPy (no QR): uuid={dspy_lhdn_uuid}")

                convex.update_invoice_extraction(
                    document_id=doc_id,
                    extracted_data=extraction_result,
                    confidence_score=extraction_result.get("confidence", 0.0),
                    extraction_method="dspy_gemini",
                    lhdn_long_id=lhdn_long_id,
                    lhdn_validation_url=lhdn_validation_url,
                    is_lhdn_einvoice=is_lhdn if is_lhdn else None,
                    dspy_lhdn_uuid=dspy_lhdn_uuid,
                )
            else:
                # Include QR detection results in processing metadata
                merchant_form_url = qr_result.get("merchant_form_url") if qr_result else None
                if not merchant_form_url:
                    ocr_url = extraction_result.get("merchant_einvoice_url")
                    if ocr_url:
                        if not ocr_url.startswith("http"):
                            ocr_url = "https://" + ocr_url
                        merchant_form_url = ocr_url
                        print(f"[{doc_id}] Using OCR-extracted e-invoice URL: {ocr_url[:80]}")
                if not merchant_form_url:
                    vendor = (extraction_result.get("vendor_name") or "").lower().strip()
                    merchant_form_url = _lookup_merchant_einvoice_url(vendor)
                    if merchant_form_url:
                        print(f"[{doc_id}] Matched vendor \"{vendor}\" → {merchant_form_url[:80]}")
                if merchant_form_url:
                    extraction_result["merchant_form_url"] = merchant_form_url
                    extraction_result["detected_qr_codes"] = qr_result.get("detected_qr_codes", [])
                    print(f"[{doc_id}] Including merchant_form_url in extraction: {merchant_form_url[:80]}...")

                convex.update_expense_claim_extraction(
                    document_id=doc_id,
                    extracted_data=extraction_result,
                    confidence_score=extraction_result.get("confidence", 0.0),
                    vendor_name=extraction_result.get("vendor_name"),
                    total_amount=extraction_result.get("total_amount"),
                    currency=extraction_result.get("currency"),
                    transaction_date=extraction_result.get("transaction_date"),
                    expense_category=extraction_result.get("expense_category"),
                    business_purpose=extraction_result.get("business_purpose"),
                    description=extraction_result.get("description"),
                    reference_number=extraction_result.get("receipt_number"),
                    merchant_form_url=merchant_form_url,
                )

        # =================================================================
        # Step 7: Trigger e-invoice form fill Lambda (019-lhdn-einv-flow-2)
        # =================================================================
        if not request.test_mode and request.domain == "expense_claims":
            # Detection chain: QR → OCR URL → known merchant lookup
            merchant_form_url = qr_result.get("merchant_form_url") if qr_result else None
            if not merchant_form_url:
                ocr_url = extraction_result.get("merchant_einvoice_url")
                if ocr_url:
                    if not ocr_url.startswith("http"):
                        ocr_url = "https://" + ocr_url
                    merchant_form_url = ocr_url
                    print(f"[{doc_id}] E-invoice: using OCR-extracted URL: {ocr_url[:80]}")
            if not merchant_form_url:
                vendor_name = (extraction_result.get("vendor_name") or "").lower().strip()
                merchant_form_url = _lookup_merchant_einvoice_url(vendor_name)
                if merchant_form_url:
                    print(f"[{doc_id}] E-invoice: matched vendor \"{vendor_name}\" → {merchant_form_url[:80]}")

            if merchant_form_url and request.business_details:
                form_fill_arn = os.environ.get("EINVOICE_FORM_FILL_LAMBDA_ARN")
                if form_fill_arn:
                    email_ref = doc_id[:10]
                    print(f"[{doc_id}] Triggering e-invoice form fill Lambda: {merchant_form_url[:80]}...")

                    import boto3
                    lambda_client = boto3.client("lambda")
                    bd = request.business_details
                    raw = request.raw_business_details or {}
                    payload = {
                        "merchantFormUrl": merchant_form_url,
                        "buyerDetails": {
                            "name": raw.get("name", bd.name),
                            "userName": raw.get("userName", bd.name),
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
                        "receiptImagePath": request.storage_path,
                        "emailRef": email_ref,
                        "expenseClaimId": doc_id,
                    }

                    lambda_client.invoke(
                        FunctionName=form_fill_arn,
                        InvocationType="Event",  # Async — fire and forget
                        Payload=json.dumps(payload),
                    )
                    print(f"[{doc_id}] E-invoice form fill Lambda invoked successfully")

        # =================================================================
        # Step 8a: Phase 2 Line Items Extraction (expense_claims)
        # =================================================================
        if request.domain == "expense_claims" and not request.test_mode:
            print(f"[{doc_id}] expense_claims Phase 2: Starting line items extraction")
            try:
                convex.update_expense_claim_line_items_status(
                    document_id=doc_id,
                    line_items_status="extracting",
                )
            except Exception as e:
                print(f"[{doc_id}] Warning: Failed to update lineItemsStatus: {str(e)}")

            phase2_result = extract_receipt_phase2_step(
                document_id=doc_id,
                images=converted_images,
                storage_path=request.storage_path,
                domain=request.domain,
                s3=s3,
            )
            print(f"[{doc_id}] expense_claims Phase 2 complete: {phase2_result.get('line_items_count', 0)} items in {phase2_result.get('processing_time_ms', 0)}ms")

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
                    print(f"[{doc_id}] Warning: Failed to update line_items: {str(e)}")
                    print(f"[{doc_id}] Phase 2 ERROR traceback: {traceback.format_exc()}")
                    try:
                        convex.update_expense_claim_line_items_status(
                            document_id=doc_id,
                            line_items_status="skipped",
                        )
                    except Exception as skip_err:
                        print(f"[{doc_id}] Warning: Failed to mark as skipped: {str(skip_err)}")
            else:
                print(f"[{doc_id}] expense_claims Phase 2 failed: {phase2_result.get('error', 'unknown')}")
                try:
                    convex.update_expense_claim_line_items_status(
                        document_id=doc_id,
                        line_items_status="skipped",
                    )
                except Exception as e:
                    print(f"[{doc_id}] Warning: Failed to mark lineItemsStatus as skipped: {str(e)}")

        # =================================================================
        # Step 8b: Phase 2 Line Items Extraction (invoices)
        # =================================================================
        if request.domain == "invoices" and not request.test_mode:
            print(f"[{doc_id}] invoices Phase 2: Starting line items extraction")
            try:
                convex.update_invoice_line_items_status(
                    document_id=doc_id,
                    line_items_status="extracting",
                )
            except Exception as e:
                print(f"[{doc_id}] Warning: Failed to update lineItemsStatus: {str(e)}")

            phase2_result = extract_invoice_phase2_step(
                document_id=doc_id,
                images=converted_images,
                storage_path=request.storage_path,
                domain=request.domain,
                s3=s3,
            )
            print(f"[{doc_id}] invoices Phase 2 complete: {len(phase2_result.get('line_items', []))} items in {phase2_result.get('processing_time_ms', 0)}ms")

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
                    print(f"[{doc_id}] Warning: Failed to update line_items: {str(e)}")
                    print(f"[{doc_id}] Phase 2 ERROR traceback: {traceback.format_exc()}")
                    try:
                        convex.update_invoice_line_items_status(
                            document_id=doc_id,
                            line_items_status="skipped",
                        )
                    except Exception as skip_err:
                        print(f"[{doc_id}] Warning: Failed to mark as skipped: {str(skip_err)}")
            else:
                print(f"[{doc_id}] invoices Phase 2 failed: {phase2_result.get('error', 'unknown')}")
                try:
                    convex.update_invoice_line_items_status(
                        document_id=doc_id,
                        line_items_status="skipped",
                    )
                except Exception as e:
                    print(f"[{doc_id}] Warning: Failed to mark lineItemsStatus as skipped: {str(e)}")

        # =================================================================
        # Step 9: Process vendor from extraction
        # =================================================================
        if not request.test_mode and request.domain != "expense_claims":
            print(f"[{doc_id}] Step: Processing vendor from extraction")
            try:
                vendor_result = convex.process_vendor_from_extraction(
                    document_id=doc_id,
                    domain=request.domain,
                )
                if vendor_result.get("success"):
                    print(f"[{doc_id}] Vendor processed: vendorId={vendor_result.get('vendorId')}, "
                          f"created={vendor_result.get('vendorCreated')}, "
                          f"priceObservations={vendor_result.get('priceObservationsCount')}")
                else:
                    print(f"[{doc_id}] Vendor processing skipped: {vendor_result.get('reason')}")
            except Exception as e:
                print(f"[{doc_id}] Warning: Failed to process vendor: {str(e)}")
        elif request.domain == "expense_claims":
            print(f"[{doc_id}] SKIPPING vendor creation for expense claim (merchants != vendors)")

        # =================================================================
        # Step 10: Record token usage
        # =================================================================
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

        print(f"[{doc_id}] Workflow completed successfully")

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
                error_message=user_friendly_msg,
            )
        except Exception as convex_error:
            print(f"[{doc_id}] Failed to update Convex with error: {convex_error}")

        return {
            "success": False,
            "error_code": error_code,
            "error_message": user_friendly_msg,
            "technical_error": technical_error,
            "traceback": error_traceback,
        }
