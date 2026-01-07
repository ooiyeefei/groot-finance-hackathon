"""
Type Definitions for Document Processing Lambda

Contains all data classes and type definitions for the document processing workflow.
Mirrors the TypeScript contracts.ts and types.ts for API compatibility.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum


# =============================================================================
# Error Codes
# =============================================================================

ERROR_CODES = {
    "INVALID_INPUT": "INVALID_INPUT",
    "DOCUMENT_NOT_FOUND": "DOCUMENT_NOT_FOUND",
    "PDF_CONVERSION_FAILED": "PDF_CONVERSION_FAILED",
    "VALIDATION_FAILED": "VALIDATION_FAILED",
    "UNSUPPORTED_DOCUMENT": "UNSUPPORTED_DOCUMENT",
    "EXTRACTION_FAILED": "EXTRACTION_FAILED",
    "CONVEX_UPDATE_FAILED": "CONVEX_UPDATE_FAILED",
    "WORKFLOW_FAILED": "WORKFLOW_FAILED",
    "S3_ERROR": "S3_ERROR",
    "TIMEOUT": "TIMEOUT",
}


# =============================================================================
# Business Category
# =============================================================================

@dataclass
class BusinessCategory:
    """Business category for expense categorization."""
    name: str
    code: Optional[str] = None
    keywords: Optional[List[str]] = None
    vendor_patterns: Optional[List[str]] = None

    @classmethod
    def from_dict(cls, data: dict) -> "BusinessCategory":
        return cls(
            name=data.get("name", ""),
            code=data.get("code") or data.get("category_code"),
            keywords=data.get("keywords") or data.get("ai_keywords", []),
            vendor_patterns=data.get("vendorPatterns") or data.get("vendor_patterns", []),
        )


# =============================================================================
# Request/Response Types
# =============================================================================

@dataclass
class DocumentProcessingRequest:
    """Request payload from Vercel API to Lambda."""
    document_id: str
    domain: str  # 'invoices' | 'expense_claims'
    storage_path: str
    file_type: str  # 'pdf' | 'image'
    user_id: str
    business_id: str
    idempotency_key: str
    expected_document_type: Optional[str] = None  # 'invoice' | 'receipt'
    business_categories: Optional[List[BusinessCategory]] = None

    @classmethod
    def from_dict(cls, data: dict) -> "DocumentProcessingRequest":
        categories = None
        if data.get("businessCategories"):
            categories = [BusinessCategory.from_dict(c) for c in data["businessCategories"]]

        return cls(
            document_id=data["documentId"],
            domain=data["domain"],
            storage_path=data["storagePath"],
            file_type=data["fileType"],
            user_id=data["userId"],
            business_id=data["businessId"],
            idempotency_key=data["idempotencyKey"],
            expected_document_type=data.get("expectedDocumentType"),
            business_categories=categories,
        )


# =============================================================================
# Step Status
# =============================================================================

class StepStatus(Enum):
    """Status of individual workflow steps."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class StepResult:
    """Result of a workflow step."""
    status: StepStatus
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


# =============================================================================
# Workflow State
# =============================================================================

@dataclass
class WorkflowState:
    """State tracking for the document processing workflow."""
    convert_pdf: StepResult = field(default_factory=lambda: StepResult(status=StepStatus.PENDING))
    validate: StepResult = field(default_factory=lambda: StepResult(status=StepStatus.PENDING))
    extract: StepResult = field(default_factory=lambda: StepResult(status=StepStatus.PENDING))
    update_status: StepResult = field(default_factory=lambda: StepResult(status=StepStatus.PENDING))


# =============================================================================
# Converted Image Info
# =============================================================================

@dataclass
class ConvertedImageInfo:
    """Information about a converted PDF page image."""
    page_number: int
    s3_key: str
    width: int
    height: int
    mime_type: str = "image/png"

    def to_dict(self) -> dict:
        return {
            "pageNumber": self.page_number,
            "s3Key": self.s3_key,
            "width": self.width,
            "height": self.height,
            "mimeType": self.mime_type,
        }


# =============================================================================
# Extraction Results
# =============================================================================

@dataclass
class ExtractedLineItem:
    """Line item extracted from invoice/receipt."""
    description: str
    quantity: float = 1.0
    unit_price: float = 0.0
    total_amount: float = 0.0
    tax_amount: Optional[float] = None
    tax_rate: Optional[float] = None
    category: Optional[str] = None
    item_code: Optional[str] = None
    unit_measurement: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "description": self.description,
            "quantity": self.quantity,
            "unitPrice": self.unit_price,
            "totalAmount": self.total_amount,
            "taxAmount": self.tax_amount,
            "taxRate": self.tax_rate,
            "category": self.category,
            "itemCode": self.item_code,
            "unitMeasurement": self.unit_measurement,
        }


@dataclass
class InvoiceExtractionResult:
    """Result of invoice extraction."""
    document_type: str = "invoice"
    vendor_name: str = ""
    total_amount: float = 0.0
    currency: str = "USD"
    transaction_date: str = ""
    confidence: float = 0.0
    processing_method: str = "auto"
    extracted_at: str = ""

    # Document identification
    invoice_number: Optional[str] = None

    # Vendor information
    vendor_address: Optional[str] = None
    vendor_contact: Optional[str] = None
    vendor_tax_id: Optional[str] = None

    # Customer information
    customer_name: Optional[str] = None
    customer_address: Optional[str] = None
    customer_contact: Optional[str] = None

    # Financial breakdown
    subtotal_amount: Optional[float] = None
    tax_amount: Optional[float] = None

    # Payment info
    payment_terms: Optional[str] = None

    # Line items
    line_items: List[ExtractedLineItem] = field(default_factory=list)

    # Category suggestion
    suggested_category: Optional[str] = None

    # Quality metrics
    extraction_quality: str = "medium"  # 'high' | 'medium' | 'low'
    user_message: Optional[str] = None  # User-friendly extraction feedback
    suggestions: Optional[List[str]] = None  # Actionable suggestions for user
    reasoning: Optional[str] = None

    # Token usage for billing
    tokens_used: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        return {
            "documentType": self.document_type,
            "vendorName": self.vendor_name,
            "totalAmount": self.total_amount,
            "currency": self.currency,
            "transactionDate": self.transaction_date,
            "confidence": self.confidence,
            "processingMethod": self.processing_method,
            "extractedAt": self.extracted_at,
            "invoiceNumber": self.invoice_number,
            "vendorAddress": self.vendor_address,
            "vendorContact": self.vendor_contact,
            "vendorTaxId": self.vendor_tax_id,
            "customerName": self.customer_name,
            "customerAddress": self.customer_address,
            "customerContact": self.customer_contact,
            "subtotalAmount": self.subtotal_amount,
            "taxAmount": self.tax_amount,
            "paymentTerms": self.payment_terms,
            "lineItems": [item.to_dict() for item in self.line_items],
            "suggestedCategory": self.suggested_category,
            "extractionQuality": self.extraction_quality,
            "userMessage": self.user_message,
            "suggestions": self.suggestions,
            "reasoning": self.reasoning,
            "tokensUsed": self.tokens_used,
        }


@dataclass
class ReceiptExtractionResult:
    """Result of receipt extraction."""
    document_type: str = "receipt"
    vendor_name: str = ""
    total_amount: float = 0.0
    currency: str = "USD"
    transaction_date: str = ""
    confidence: float = 0.0
    processing_method: str = "auto"
    extracted_at: str = ""

    # Receipt-specific fields
    receipt_number: Optional[str] = None
    payment_method: Optional[str] = None

    # Vendor information
    vendor_address: Optional[str] = None
    vendor_contact: Optional[str] = None

    # Financial breakdown
    subtotal_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    tip_amount: Optional[float] = None

    # Line items
    line_items: List[ExtractedLineItem] = field(default_factory=list)

    # Category suggestion
    suggested_category: Optional[str] = None

    # Quality metrics
    extraction_quality: str = "medium"  # 'high' | 'medium' | 'low'
    user_message: Optional[str] = None  # User-friendly extraction feedback
    suggestions: Optional[List[str]] = None  # Actionable suggestions for user

    # Token usage for billing
    tokens_used: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        return {
            "documentType": self.document_type,
            "vendorName": self.vendor_name,
            "totalAmount": self.total_amount,
            "currency": self.currency,
            "transactionDate": self.transaction_date,
            "confidence": self.confidence,
            "processingMethod": self.processing_method,
            "extractedAt": self.extracted_at,
            "receiptNumber": self.receipt_number,
            "paymentMethod": self.payment_method,
            "vendorAddress": self.vendor_address,
            "vendorContact": self.vendor_contact,
            "subtotalAmount": self.subtotal_amount,
            "taxAmount": self.tax_amount,
            "tipAmount": self.tip_amount,
            "lineItems": [item.to_dict() for item in self.line_items],
            "suggestedCategory": self.suggested_category,
            "extractionQuality": self.extraction_quality,
            "userMessage": self.user_message,
            "suggestions": self.suggestions,
            "tokensUsed": self.tokens_used,
        }


# =============================================================================
# Validation Result
# =============================================================================

@dataclass
class ValidationResult:
    """Result of document validation."""
    is_supported: bool
    document_type: Optional[str] = None
    confidence: float = 0.0
    reasoning: Optional[str] = None
    detected_elements: Optional[Dict[str, Any]] = None
    user_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "isSupported": self.is_supported,
            "documentType": self.document_type,
            "confidence": self.confidence,
            "reasoning": self.reasoning,
            "detectedElements": self.detected_elements,
            "userMessage": self.user_message,
        }
