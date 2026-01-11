"""Steps package for document processing workflow."""

# Import dspy_config FIRST to configure DSPy at Lambda cold start
# This avoids threading issues with AWS Durable Execution SDK
from .dspy_config import ensure_dspy_configured, get_lm, is_configured

from .convert_pdf import convert_pdf_step
from .validate import validate_document_step
from .extract_invoice import extract_invoice_step
from .extract_receipt import extract_receipt_step

__all__ = [
    "ensure_dspy_configured",
    "get_lm",
    "is_configured",
    "convert_pdf_step",
    "validate_document_step",
    "extract_invoice_step",
    "extract_receipt_step",
]
