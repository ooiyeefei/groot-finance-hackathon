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
