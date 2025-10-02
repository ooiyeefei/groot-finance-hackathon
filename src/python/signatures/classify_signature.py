#!/usr/bin/env python3
"""
DSPy Signature for Document Classification
Provides structured, controlled output for document type classification
"""

import dspy
from pydantic import BaseModel, Field
from typing import List, Literal

class DocumentClassification(BaseModel):
    """Document classification result with audit metadata - NO PERSONAL DATA EXTRACTION"""
    document_type: str = Field(
        ...,
        description="Classified document type from supported types OR 'other' if not recognized"
    )
    confidence_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Classification confidence from 0.0 to 1.0"
    )
    reasoning: str = Field(
        default="Classification completed",
        description="Brief reasoning for the classification decision (visual indicators that led to this type, NOT personal data)"
    )
    is_supported: bool = Field(
        ...,
        description="Whether the document type is currently supported for processing"
    )
    user_message: str = Field(
        default="",
        description="User-friendly message about the classification result"
    )
    detected_elements: List[str] = Field(
        default_factory=list,
        description="Key visual elements that indicate this document type (layout indicators like 'header format', 'logo position' - NO personal content)"
    )
    context_metadata: dict = Field(
        default_factory=dict,
        description="Basic context for extraction: country, currency, format hints - DO NOT extract detailed document data"
    )

class DocumentClassificationSignature(dspy.Signature):
    """Classify document images into supported business document types or mark as unsupported"""

    document_image: dspy.Image = dspy.InputField(
        desc="Document image for multimodal classification analysis"
    )

    supported_types: str = dspy.InputField(
        desc="JSON list of currently supported document types with descriptions"
    )

    classification: DocumentClassification = dspy.OutputField(
        desc="""Classify the document by analyzing the supported_types list and the document image:

        CRITICAL RULES - DO NOT EXTRACT PERSONAL DATA:
        1. ONLY use document types that are EXACTLY listed in the supported_types JSON input
        2. If the document does NOT clearly match any supported type, you MUST use document_type="other"
        3. DO NOT make up new document types or modify existing type names
        4. DO NOT extract personal/sensitive data (names, addresses, ID numbers, amounts, etc.)

        CLASSIFICATION PROCESS:
        1. Parse the supported_types JSON to understand what document types are currently supported
        2. Analyze the document image for visual layout, text content, and document structure
        3. Match the document against the supported types based on their specific characteristics
        4. If document clearly matches a supported type: classify with appropriate confidence and detailed reasoning
        5. If document does NOT clearly match any supported type: use document_type="other"
        6. If you are uncertain, err on the side of marking as "other" rather than guessing

        OUTPUT REQUIREMENTS - CLASSIFICATION WITH AUDIT METADATA:
        - document_type: Use EXACT type from supported_types JSON OR "other" (never invent new types)
        - confidence_score: High (0.8+) for clear matches, lower (0.3-0.7) for uncertain cases, very low (<0.3) for other
        - reasoning: Brief explanation of WHY this document type (visual layout indicators that justify the classification, NOT personal data)
        - is_supported: true if document_type matches a type in supported_types, false if "other"
        - user_message: Friendly message explaining the classification result
        - detected_elements: List visual/layout indicators that justify classification (e.g., "invoice header format", "ID card layout", "salary table structure" - NO personal content)
        - context_metadata: Basic context only (country, currency format, document format) - NO detailed extraction:
          * identity_card: {"country": "Malaysia/Singapore/etc", "id_format": "MyKad/NRIC/etc"}
          * payslip: {"country": "...", "currency": "MYR/SGD/etc"}
          * application_form: {"country": "...", "form_type": "loan/account/etc"}
          * invoice: {"country": "...", "currency": "MYR/USD/etc"}

        CRITICAL: Provide rich classification justification WITHOUT extracting specific personal/business data

        EXAMPLES:
        - GOOD reasoning: "Document shows typical invoice layout with itemized table structure and billing header format"
        - BAD reasoning: "Invoice #INV-001 from ABC Company for $1000" (contains extracted data)
        - GOOD detected_elements: ["invoice header format", "itemized table layout", "billing address section"]
        - BAD detected_elements: ["John Doe", "123 Main St", "Invoice INV-001"] (contains extracted data)

        CRITICAL: Rich audit metadata for classification decisions, but NO personal data extraction"""
    )