"""
Convex HTTP Client for Python Lambda

Provides HTTP-based access to Convex mutations and queries for updating
document processing status and extraction results.

Security Model: System functions in Convex don't require authentication.
Document IDs are long random strings that only our backend knows,
providing implicit authorization.
"""

import json
from typing import Any, Dict, Optional
import httpx


class ConvexClient:
    """HTTP client for Convex system functions."""

    def __init__(self, convex_url: str, timeout: float = 30.0):
        """
        Initialize Convex client.

        Args:
            convex_url: Convex deployment URL (e.g., https://xxx.convex.cloud)
            timeout: Request timeout in seconds
        """
        self.base_url = convex_url.rstrip("/")
        self.timeout = timeout
        self._client = httpx.Client(timeout=timeout)

    def _mutation(self, function_path: str, args: Dict[str, Any]) -> Any:
        """
        Call a Convex mutation.

        Args:
            function_path: Full function path (e.g., "functions/system:updateInvoiceStatus")
            args: Arguments to pass to the mutation

        Returns:
            Mutation result

        Raises:
            ConvexError: If mutation fails
        """
        url = f"{self.base_url}/api/mutation"
        payload = {
            "path": function_path,
            "args": args,
            "format": "json",
        }

        try:
            response = self._client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            result = response.json()

            if result.get("status") == "error":
                raise ConvexError(result.get("errorMessage", "Unknown error"))

            return result.get("value")

        except httpx.HTTPStatusError as e:
            raise ConvexError(f"HTTP error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise ConvexError(f"Request failed: {str(e)}")

    def _query(self, function_path: str, args: Dict[str, Any]) -> Any:
        """
        Call a Convex query.

        Args:
            function_path: Full function path (e.g., "functions/system:getInvoiceById")
            args: Arguments to pass to the query

        Returns:
            Query result
        """
        url = f"{self.base_url}/api/query"
        payload = {
            "path": function_path,
            "args": args,
            "format": "json",
        }

        try:
            response = self._client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            result = response.json()

            if result.get("status") == "error":
                raise ConvexError(result.get("errorMessage", "Unknown error"))

            return result.get("value")

        except httpx.HTTPStatusError as e:
            raise ConvexError(f"HTTP error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            raise ConvexError(f"Request failed: {str(e)}")

    # =========================================================================
    # Invoice Functions
    # =========================================================================

    def update_status(
        self,
        document_id: str,
        domain: str,
        status: str,
        error_message: Optional[str] = None,
    ) -> str:
        """
        Update document status.

        Args:
            document_id: Document ID
            domain: 'invoices' or 'expense_claims'
            status: New status
            error_message: Optional error message for failed status

        Returns:
            Updated document ID
        """
        # Build args dict - only include errorMessage if it has a value
        # Convex v.optional() doesn't accept null, only omitted or string
        args = {
            "id": document_id,
            "status": status,
        }
        if error_message is not None:
            args["errorMessage"] = error_message

        if domain == "invoices":
            return self._mutation("functions/system:updateInvoiceStatus", args)
        else:
            return self._mutation("functions/system:updateExpenseClaimStatus", args)

    def update_invoice_extraction(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        confidence_score: float,
        extraction_method: str = "dspy_gemini",
    ) -> str:
        """
        Update invoice with extraction results.

        Args:
            document_id: Invoice document ID
            extracted_data: Extracted financial data
            confidence_score: Extraction confidence (0-1)
            extraction_method: Method used for extraction

        Returns:
            Updated document ID
        """
        return self._mutation(
            "functions/system:updateInvoiceExtraction",
            {
                "id": document_id,
                "extractedData": extracted_data,
                "confidenceScore": confidence_score,
                "extractionMethod": extraction_method,
            },
        )

    def update_expense_claim_extraction(
        self,
        document_id: str,
        extracted_data: Dict[str, Any],
        confidence_score: float,
        vendor_name: Optional[str] = None,
        total_amount: Optional[float] = None,
        currency: Optional[str] = None,
        transaction_date: Optional[str] = None,
    ) -> str:
        """
        Update expense claim with extraction results.

        Args:
            document_id: Expense claim document ID
            extracted_data: Extracted financial data
            confidence_score: Extraction confidence (0-1)
            vendor_name: Extracted vendor name
            total_amount: Extracted total amount
            currency: Extracted currency code
            transaction_date: Extracted transaction date

        Returns:
            Updated document ID
        """
        args = {
            "id": document_id,
            "extractedData": extracted_data,
            "confidenceScore": confidence_score,
        }

        if vendor_name is not None:
            args["vendorName"] = vendor_name
        if total_amount is not None:
            args["totalAmount"] = total_amount
        if currency is not None:
            args["currency"] = currency
        if transaction_date is not None:
            args["transactionDate"] = transaction_date

        return self._mutation(
            "functions/system:updateExpenseClaimExtraction",
            args,
        )

    def update_classification(
        self,
        document_id: str,
        domain: str,
        classification: Dict[str, Any],
        task_id: str,
    ) -> str:
        """
        Update document classification results.

        Args:
            document_id: Document ID
            domain: 'invoices' or 'expense_claims'
            classification: Classification result
            task_id: Processing task ID

        Returns:
            Updated document ID
        """
        if domain == "invoices":
            return self._mutation(
                "functions/system:updateInvoiceClassification",
                {
                    "id": document_id,
                    "classification": classification,
                    "taskId": task_id,
                },
            )
        else:
            return self._mutation(
                "functions/system:updateExpenseClaimClassification",
                {
                    "id": document_id,
                    "classification": classification,
                    "taskId": task_id,
                },
            )

    def update_converted_image(
        self,
        document_id: str,
        domain: str,
        converted_image_path: str,
        width: Optional[int] = None,
        height: Optional[int] = None,
        page_metadata: Optional[list] = None,
        total_pages: Optional[int] = None,
    ) -> str:
        """
        Update document with converted image path.

        Args:
            document_id: Document ID
            domain: 'invoices' or 'expense_claims'
            converted_image_path: S3 path to converted image
            width: Image width
            height: Image height
            page_metadata: Metadata for each page
            total_pages: Total number of pages

        Returns:
            Updated document ID
        """
        args = {
            "id": document_id,
            "convertedImagePath": converted_image_path,
        }

        if width is not None:
            args["convertedImageWidth"] = width
        if height is not None:
            args["convertedImageHeight"] = height
        if page_metadata is not None:
            args["pageMetadata"] = page_metadata
        if total_pages is not None:
            args["totalPages"] = total_pages

        if domain == "invoices":
            return self._mutation(
                "functions/system:updateInvoiceConvertedImage",
                args,
            )
        else:
            return self._mutation(
                "functions/system:updateExpenseClaimConvertedImage",
                args,
            )

    def mark_as_failed(
        self,
        document_id: str,
        domain: str,
        error_code: str,
        error_message: str,
    ) -> str:
        """
        Mark document as failed.

        Args:
            document_id: Document ID
            domain: 'invoices' or 'expense_claims'
            error_code: Error code
            error_message: Error message

        Returns:
            Updated document ID
        """
        return self.update_status(
            document_id=document_id,
            domain=domain,
            status="failed",
            error_message=f"{error_code}: {error_message}",
        )

    def get_business_categories(
        self,
        business_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get business categories from Convex.

        Fetches COGS and expense categories for AI categorization.

        Args:
            business_id: Business ID

        Returns:
            Dict with customCogsCategories and customExpenseCategories,
            or None if business not found
        """
        return self._query(
            "functions/system:getBusinessCategories",
            {"businessId": business_id},
        )

    def record_ocr_usage(
        self,
        business_id: str,
        document_id: Optional[str] = None,
        token_usage: Optional[Dict[str, Any]] = None,
        credits: int = 1,
    ) -> Dict[str, Any]:
        """
        Record OCR usage for billing.

        Args:
            business_id: Business ID
            document_id: Document ID
            token_usage: Token usage details
            credits: Credits to charge

        Returns:
            Usage recording result
        """
        args = {
            "businessId": business_id,
            "credits": credits,
        }

        if document_id is not None:
            args["documentId"] = document_id
        if token_usage is not None:
            args["tokenUsage"] = token_usage

        return self._mutation(
            "functions/system:recordOcrUsage",
            args,
        )

    def close(self):
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class ConvexError(Exception):
    """Error from Convex operations."""
    pass
