"""
Document Processing Lambda Handler

This Lambda function processes uploaded documents (invoices/receipts) using
DSPy for structured data extraction with Gemini AI.

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
# Main Lambda Handler
# =============================================================================

def handler(event: dict, context: Any) -> dict:
    """
    Main Lambda handler for document processing.

    Args:
        event: Lambda event containing DocumentProcessingRequest
        context: Lambda context

    Returns:
        Workflow result with status and extracted data
    """
    # Parse request
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

    # Initialize clients
    convex = ConvexClient(os.environ.get("NEXT_PUBLIC_CONVEX_URL", ""))
    s3 = S3Client(
        bucket=os.environ.get("S3_BUCKET_NAME", "finanseal-bucket"),
        region=os.environ.get("AWS_REGION", "us-west-2"),
    )

    # Fetch business categories from Convex for LLM categorization
    if not request.business_categories and request.business_id:
        try:
            print(f"[{doc_id}] Fetching business categories for business_id: {request.business_id}")
            categories_data = convex.get_business_categories(request.business_id)

            if categories_data:
                # Select appropriate categories based on domain
                if request.domain == "invoices":
                    raw_categories = categories_data.get("customCogsCategories", [])
                    print(f"[{doc_id}] Using COGS categories for invoices: {len(raw_categories)} categories")
                else:
                    raw_categories = categories_data.get("customExpenseCategories", [])
                    print(f"[{doc_id}] Using expense categories for expense_claims: {len(raw_categories)} categories")

                # Convert to BusinessCategory objects and filter active only
                request.business_categories = [
                    BusinessCategory(
                        name=cat.get("category_name", ""),
                        code=cat.get("category_code"),
                        keywords=cat.get("ai_keywords", []),
                        vendor_patterns=cat.get("vendor_patterns", []),
                    )
                    for cat in raw_categories
                    if cat.get("is_active", True)  # Only include active categories
                ]
                print(f"[{doc_id}] Loaded {len(request.business_categories)} active categories for LLM")
            else:
                print(f"[{doc_id}] No business categories found, will use IFRS fallback")
        except Exception as cat_error:
            print(f"[{doc_id}] Warning: Failed to fetch categories: {str(cat_error)}")
            print(f"[{doc_id}] Will continue with IFRS categorization fallback")

    try:
        # =================================================================
        # Step 1: Convert PDF (if needed)
        # =================================================================
        print(f"[{doc_id}] Step 1: PDF Conversion")

        # Update status to processing
        convex.update_status(
            document_id=doc_id,
            domain=request.domain,
            status="processing",
        )

        if request.file_type != "pdf":
            print(f"[{doc_id}] Skipping PDF conversion - file is already an image")
            conversion_result = {
                "status": "skipped",
                "images": None,
                "reason": "File is already an image",
            }
        else:
            # Convert PDF to images
            conversion_result = convert_pdf_step(
                document_id=doc_id,
                storage_path=request.storage_path,
                domain=request.domain,
                s3=s3,
            )
            print(f"[{doc_id}] PDF conversion complete: {len(conversion_result.get('images', []))} pages")

        # =================================================================
        # Step 2: Validate document
        # =================================================================
        print(f"[{doc_id}] Step 2: Document Validation")

        # Get images (from conversion or original)
        images = conversion_result.get("images") if conversion_result.get("status") == "success" else None

        validation_result = validate_document_step(
            document_id=doc_id,
            images=images,
            storage_path=request.storage_path,
            domain=request.domain,
            expected_type=request.expected_document_type,
            s3=s3,
        )

        print(f"[{doc_id}] Validation result: {validation_result.get('document_type')} (confidence: {validation_result.get('confidence', 0):.2f})")

        # Check if document is supported
        if not validation_result.get("is_supported", True):
            print(f"[{doc_id}] Document not supported: {validation_result.get('reason')}")
            convex.mark_as_failed(
                document_id=doc_id,
                domain=request.domain,
                error_code=ERROR_CODES["UNSUPPORTED_DOCUMENT"],
                error_message=validation_result.get("reason", "Document type not supported"),
            )
            return {
                "success": False,
                "error_code": ERROR_CODES["UNSUPPORTED_DOCUMENT"],
                "error_message": validation_result.get("reason"),
                "validation_result": validation_result,
            }

        # =================================================================
        # Step 3: Extract data
        # =================================================================
        print(f"[{doc_id}] Step 3: Data Extraction")

        # Update status to extracting
        convex.update_status(
            document_id=doc_id,
            domain=request.domain,
            status="extracting",
        )

        # Get images
        images = conversion_result.get("images") if conversion_result.get("status") == "success" else None
        document_type = validation_result.get("document_type", "invoice")

        # Route to appropriate extractor
        if document_type == "receipt":
            extraction_result = extract_receipt_step(
                document_id=doc_id,
                images=images,
                storage_path=request.storage_path,
                domain=request.domain,
                categories=request.business_categories,
                s3=s3,
            )
        else:
            extraction_result = extract_invoice_step(
                document_id=doc_id,
                images=images,
                storage_path=request.storage_path,
                domain=request.domain,
                categories=request.business_categories,
                s3=s3,
            )

        print(f"[{doc_id}] Extraction complete: {extraction_result.get('vendor_name', 'Unknown')} - {extraction_result.get('total_amount', 0)} {extraction_result.get('currency', 'USD')}")

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
        # Step 4: Update Convex
        # =================================================================
        print(f"[{doc_id}] Step 4: Updating Convex")

        # Update extraction results based on domain
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
            )

        # Record token usage for billing
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

        print(f"[{doc_id}] Convex update complete")
        print(f"[{doc_id}] Workflow completed successfully")

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
