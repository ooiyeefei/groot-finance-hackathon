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

# AWS Durable Execution SDK - correct import for aws-durable-execution-sdk-python
from aws_durable_execution_sdk_python import durable_execution, DurableContext

# Sentry for error tracking
import sentry_sdk
from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration

# Local imports
from steps.convert_pdf import convert_pdf_step
from steps.validate import validate_document_step
from steps.extract_invoice import extract_invoice_step
from steps.extract_receipt import extract_receipt_step
from utils.convex_client import ConvexClient
from utils.s3_client import S3Client
from types_def import (
    DocumentProcessingRequest,
    WorkflowState,
    StepStatus,
    ERROR_CODES,
    BusinessCategory,
    ConvertedImageInfo,
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
    print(f"[{doc_id}] fast_mode={request.fast_mode}, test_mode={request.test_mode}")

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
        # Step 4: Validate document - ALWAYS SKIP (domain-based routing)
        # =================================================================
        # Skip validation for ALL domains - the upload context (which page user is on)
        # is more reliable than LLM classification. Saves ~4 seconds per document.
        # - invoices domain → document is an invoice
        # - expense_claims domain → document is a receipt
        print(f"[{doc_id}] SKIPPING validation (domain-based routing: {request.domain})")
        validation_result = {
            "is_supported": True,
            "document_type": "receipt" if request.domain == "expense_claims" else "invoice",
            "confidence": 1.0,
            "reasoning": "Validation skipped - domain-based routing",
            "skipped": True,
        }

        # =================================================================
        # Step 5: Extract data (checkpointed - most expensive step)
        # Note: "extracting" status update removed to save ~1s (processing → done)
        # =================================================================
        def extract_data():
            print(f"[{doc_id}] Step: Data Extraction (fast_mode={request.fast_mode})")

            # IMPORTANT: Use domain to determine extraction path, NOT LLM classification
            # - expense_claims domain → always use receipt extraction (optimized for receipts)
            # - invoices domain → always use invoice extraction (uploaded from invoice page)
            #
            # Why: The upload context (which page the user is on) is more reliable than
            # LLM classification. Validation step still runs for quality checks and
            # rejecting unsupported documents.

            if request.domain == "expense_claims":
                # Expense claims always use receipt extraction
                print(f"[{doc_id}] Using receipt extraction (domain: expense_claims)")
                result = extract_receipt_step(
                    document_id=doc_id,
                    images=converted_images,
                    storage_path=request.storage_path,
                    domain=request.domain,
                    categories=business_categories,
                    s3=s3,
                    fast_mode=request.fast_mode,  # Enable fast extraction
                )
            else:
                # Invoices domain: always use invoice extraction (skip LLM classification routing)
                print(f"[{doc_id}] Using invoice extraction (domain: invoices)")
                result = extract_invoice_step(
                    document_id=doc_id,
                    images=converted_images,
                    storage_path=request.storage_path,
                    domain=request.domain,
                    categories=business_categories,
                    s3=s3,
                    fast_mode=request.fast_mode,  # Enable fast extraction
                )

            print(f"[{doc_id}] Extraction complete: {result.get('vendor_name', 'Unknown')} - {result.get('total_amount', 0)} {result.get('currency', 'USD')}")
            return result

        extraction_result = context.step(lambda ctx: extract_data(), name="extract_data")

        # Check extraction success
        if not extraction_result.get("success", True):
            error_msg = extraction_result.get("error", "Extraction failed")
            print(f"[{doc_id}] Extraction failed: {error_msg}")
            convex.mark_as_failed(
                document_id=doc_id,
                domain=request.domain,
                error_code=ERROR_CODES["EXTRACTION_FAILED"],
                error_message=error_msg,
            )
            return {
                "success": False,
                "error_code": ERROR_CODES["EXTRACTION_FAILED"],
                "error_message": error_msg,
            }

        # =================================================================
        # Step 7: Update Convex with results (checkpointed)
        # Skip in test_mode to avoid modifying production data
        # =================================================================
        def update_convex_results():
            if request.test_mode:
                print(f"[{doc_id}] SKIPPING Convex update (test_mode=True)")
                return True

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
            else:
                convex.update_expense_claim_extraction(
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
                )
            return True

        context.step(lambda ctx: update_convex_results(), name="update_convex_results")

        # =================================================================
        # Step 7b: Process vendor from extraction (checkpointed)
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
        error_msg = f"Workflow failed: {str(e)}"
        error_traceback = traceback.format_exc()
        print(f"[{doc_id}] {error_msg}")
        print(f"[{doc_id}] Traceback: {error_traceback}")

        # Report to Sentry
        sentry_sdk.capture_exception(e)

        # Update Convex with failure
        try:
            convex.mark_as_failed(
                document_id=doc_id,
                domain=request.domain,
                error_code=ERROR_CODES["WORKFLOW_FAILED"],
                error_message=error_msg,
            )
        except Exception as convex_error:
            print(f"[{doc_id}] Failed to update Convex with error: {convex_error}")

        return {
            "success": False,
            "error_code": ERROR_CODES["WORKFLOW_FAILED"],
            "error_message": error_msg,
            "traceback": error_traceback,
        }
