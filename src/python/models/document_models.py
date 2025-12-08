from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict
from datetime import date

# Note: ICExtraction, PayslipExtraction, and ApplicationFormExtraction models removed
# Legacy application types (ic, payslip, application_form) are no longer supported
# Only invoice extraction is supported in the invoices domain

# ==================================
# Invoice Model
# Comprehensive model matching the legacy UI layout
# ==================================
class InvoiceLineItem(BaseModel):
    """Individual line item in an invoice"""
    item_code: Optional[str] = Field(None, description="Product/service code")
    description: str = Field(..., description="Item description")
    quantity: Optional[float] = Field(None, description="Quantity ordered/delivered")
    unit: Optional[str] = Field(None, description="Unit of measurement (PC, KG, etc.)")
    unit_price: Optional[float] = Field(None, description="Price per unit")
    discount: Optional[float] = Field(None, description="Line item discount amount")
    total_price: Optional[float] = Field(None, description="Total line item amount")

class InvoiceExtraction(BaseModel):
    """
    Comprehensive invoice extraction model - source of truth for invoice data structure.
    This model defines all fields shown in the legacy invoice UI and matches the exact layout requirements.
    """
    document_type: Literal["invoice"] = Field("invoice", description="The classified type of the document.")

    # Document Summary Fields (colSpan layout: vendor_name=1, total_amount=1, transaction_date=2)
    vendor_name: Optional[str] = Field(None, description="Name of the vendor/supplier company")
    total_amount: Optional[float] = Field(None, description="Final total amount due")
    transaction_date: Optional[str] = Field(None, description="Invoice date/transaction date in YYYY-MM-DD format")

    # Vendor Information (colSpan layout: vendor_address=1, vendor_contact=1, vendor_tax_id=2)
    vendor_address: Optional[str] = Field(None, description="Vendor's complete address")
    vendor_contact: Optional[str] = Field(None, description="Vendor contact information (phone, fax)")
    vendor_tax_id: Optional[str] = Field(None, description="Vendor's tax registration number")

    # Customer Information (colSpan layout: customer_name=2, customer_address=1, customer_contact=1)
    customer_name: Optional[str] = Field(None, description="Customer/buyer company name")
    customer_address: Optional[str] = Field(None, description="Customer's billing address")
    customer_contact: Optional[str] = Field(None, description="Customer contact information")

    # Document Information (colSpan layout: document_number=1, due_date=1)
    document_number: Optional[str] = Field(None, description="Invoice number/document ID")
    due_date: Optional[str] = Field(None, description="Payment due date in YYYY-MM-DD format")

    # Payment Information (colSpan layout: payment_terms=1, payment_method=1, bank_details=2)
    payment_terms: Optional[str] = Field(None, description="Payment terms (30 DAYS, etc.)")
    payment_method: Optional[str] = Field(None, description="Preferred payment method")
    bank_details: Optional[str] = Field(None, description="Bank account details for payment")

    # Tax & Financial Breakdown (colSpan layout: subtotal_amount=1, tax_amount=1, discount_amount=1)
    subtotal_amount: Optional[float] = Field(None, description="Amount before taxes")
    tax_amount: Optional[float] = Field(None, description="Total tax amount")
    discount_amount: Optional[float] = Field(None, description="Total discount amount")

    # Line Items (full-width table)
    line_items: List[InvoiceLineItem] = Field(default_factory=list, description="List of invoice line items")

    # Additional Metadata
    currency: Optional[str] = Field(None, description="Currency code (MYR, USD, etc.)")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall extraction confidence")