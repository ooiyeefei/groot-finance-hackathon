from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict
from datetime import date

# ==================================
# 1. Identity Card (IC) Model
# Based on Page 9 of sample
# ==================================
class ICExtraction(BaseModel):
    """Structured data extracted from a Malaysian Identity Card (MyKad)."""
    document_type: Literal["ic"] = Field("ic", description="The classified type of the document.")
    full_name: str = Field(..., description="Full name of the cardholder as it appears on the IC.")
    ic_number: str = Field(..., description="The 12-digit identity card number (e.g., 000429-12-1711).")
    gender: Literal["LELAKI", "PEREMPUAN"] = Field(..., description="Gender of the cardholder.")
    address: str = Field(..., description="Full residential address listed on the card.")
    religion: Optional[str] = Field(None, description="The religion of the cardholder, if stated.")
    # The LLM can be prompted to derive this from the IC number
    date_of_birth: str = Field(..., description="Date of birth in YYYY-MM-DD format, derived from the first 6 digits of the IC number.")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence score for the extracted IC data.")

# ==================================
# 2. Payslip Model
# Based on Page 11 of sample
# ==================================
class PayslipLineItem(BaseModel):
    """Represents a single line item for earnings or deductions."""
    description: str = Field(..., description="Description of the earning or deduction (e.g., 'BASIC PAY', 'EMPLOYEE EPF').")
    amount: float = Field(..., description="The monetary value of the line item.")

class PayslipExtraction(BaseModel):
    """Structured data extracted from an employee payslip."""
    document_type: Literal["payslip"] = Field("payslip", description="The classified type of the document.")
    employee_name: str = Field(..., description="Full name of the employee.")
    ic_number: str = Field(..., description="Employee's 12-digit identity card number.")
    employee_code: Optional[str] = Field(None, description="The employee's unique ID or code.")
    pay_period: str = Field(..., description="The payment period for the payslip. IMPORTANT: Always format as MMM-YYYY (e.g., 'APR-2025', 'JUN-2024'). Convert any date range or other format to this standardized month-year format.")
    gross_wages: float = Field(..., description="The total gross earnings before any deductions.")
    total_deductions: float = Field(..., description="The sum of all deductions.")
    net_wages: float = Field(..., description="The final net pay after all deductions.")
    employer_name: Optional[str] = Field(None, description="Name of the employer or company.")
    earnings_breakdown: List[PayslipLineItem] = Field(..., description="A list of all items contributing to earnings.")
    deductions_breakdown: List[PayslipLineItem] = Field(..., description="A list of all deduction items.")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Overall confidence score for the extracted payslip data.")
    page_number: Optional[int] = Field(None, description="Page number in multi-page document (1-based index).")

class PayslipPageGroup(BaseModel):
    """Represents a group of pages that belong to the same payslip period."""
    pay_period: str = Field(..., description="The MMM-YYYY format pay period for this payslip group.")
    page_numbers: List[int] = Field(..., description="List of page numbers (1-based) that belong to this payslip.")
    primary_page: int = Field(..., description="The main page containing core payslip data (usually page 1 of the group).")
    additional_pages: List[int] = Field(default_factory=list, description="Additional pages with supplementary data (e.g., detailed breakdowns).")

class MultiPayslipExtractionResult(BaseModel):
    """Result of extracting multiple payslips from a single document with intelligent page grouping."""
    document_type: Literal["multi_payslip"] = Field("multi_payslip", description="The classified type of the document.")
    payslips: List[PayslipExtraction] = Field(..., description="List of successfully extracted payslips, one per pay period.")
    payslip_groups: List[PayslipPageGroup] = Field(..., description="Page grouping information showing which pages belong to which payslip.")
    total_pages_processed: int = Field(..., description="Total number of pages processed from the document.")
    successful_extractions: int = Field(..., description="Number of payslips successfully extracted (not page count).")
    failed_pages: List[int] = Field(default_factory=list, description="List of page numbers that failed to process.")
    pages_per_payslip_detected: Dict[str, int] = Field(default_factory=dict, description="Detected pattern: pay_period -> number of pages.")
    overall_confidence: float = Field(..., ge=0.0, le=1.0, description="Average confidence across all successful extractions.")
    grouping_method: str = Field(..., description="Method used for page grouping (e.g., 'pay_period_matching', 'sequential_analysis').")

# ==================================
# 3. REVISED Application Form Model
# Based on Pages 2-8 of sample (Multi-page)
# Improved with constrained types and enhanced field descriptions
# ==================================

class FinancingDetails(BaseModel):
    """Financing details from the top of the application form."""
    application_type: Optional[Literal['Single Application / Permohonan Individu', 'Joint Application / Permohonan Bersama']] = Field(None, description="The type of application, selected from the two checkbox options. Look for checkboxes or marked selections.")

    type_of_financing: Optional[Literal[
        'Ar Rahnu / Pajak Gadai-i',
        'ASB Financing / Pembiayaan ASB',
        'MCash',
        'Personal Financing / Pembiayaan Peribadi',
        'Property Financing / Pembiayaan Hartanah',
        'Vehicle Financing / Pembiayaan Kenderaan',
        'Others / Lain-lain'
    ]] = Field(None, description="The specific type of financing product selected from the checkbox options. Look for checked boxes, circles, or marked selections.")

    purpose_of_financing: Optional[str] = Field(None, description="The handwritten or typed purpose of the financing. May be in a text field or box.")
    amount_requested: Optional[float] = Field(None, description="The numerical value for 'Amount Requested / Jumlah Dipohon'. Extract only the numeric amount.")
    tenor: Optional[int] = Field(None, description="The loan tenure in years or months, labeled 'Tenor / Tempoh'. Extract the numeric value only.")

class PersonalDetails(BaseModel):
    """Section A: Personal details of the applicant."""
    name: Optional[str] = Field(None, description="Full name of the applicant, labeled 'Name as in MyKad or Passport'. Look for filled text fields, handwritten or typed names.")
    mykad_no: Optional[str] = Field(None, description="The 12-digit MyKad number, labeled 'MyKad No. (New)'. Format: XXXXXX-XX-XXXX. Look for handwritten or typed IC numbers.")
    date_of_birth: Optional[str] = Field(None, description="Date of birth, labeled 'Date of Birth / Tarikh Lahir'. Extract in DD/MM/YYYY or YYYY-MM-DD format from filled fields.")
    residential_address: Optional[str] = Field(None, description="The full residential address. Look for address fields that may span multiple lines.")
    hp_no: Optional[str] = Field(None, description="The handphone number, clearly labeled 'HP No. / No. Tel. Bimbit'. Look for mobile phone numbers, may include country codes.")
    email: Optional[str] = Field(None, description="The applicant's email address, labeled 'E-Mail / E-Mel'. Look for valid email format in text fields.")
    marital_status: Optional[Literal['Single / Bujang', 'Married / Berkahwin']] = Field(None, description="Marital status, selected from the checkbox options. Look for checked boxes or marked selections.")

class EmploymentDetails(BaseModel):
    """Section B: Employment details of the applicant."""
    employer_name: Optional[str] = Field(None, description="Name of the employer/company. Look for company name fields in employment section.")
    job_title: Optional[str] = Field(None, description="Job title or position. Look for position/designation fields.")
    employment_type: Optional[Literal['Permanent', 'Contract', 'Part-time', 'Self-employed']] = Field(None, description="Type of employment. Look for employment type checkboxes or selections.")
    monthly_income: Optional[float] = Field(None, description="Monthly gross income amount. Extract numeric value from salary/income fields.")
    years_of_service: Optional[int] = Field(None, description="Number of years in current employment. Extract numeric value only.")
    employer_address: Optional[str] = Field(None, description="Address of the employer. Look for company address fields, may span multiple lines.")
    office_phone: Optional[str] = Field(None, description="Office phone number. Look for office/company phone number fields.")
    department: Optional[str] = Field(None, description="Department or division within the company. Look for department/division fields.")

class ApplicationFormExtraction(BaseModel):
    """Structured data extracted from a multi-page personal financing application form."""
    document_type: Literal["application_form"] = Field("application_form", description="The classified type of the document.")
    financing_details: Optional[FinancingDetails] = Field(None, description="Financing details from the form, may be None if extraction fails.")
    personal_details: Optional[PersonalDetails] = Field(None, description="Personal details from section A, may be None if extraction fails.")
    employment_details: Optional[EmploymentDetails] = Field(None, description="Employment details from section B, may be None if extraction fails.")
    confidence_score: float = Field(0.0, ge=0.0, le=1.0, description="Overall confidence score for the extracted form data.")

# ==================================
# 4. Invoice Model
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