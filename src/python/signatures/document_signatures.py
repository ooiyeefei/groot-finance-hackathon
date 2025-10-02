import dspy
from typing import List
from models.document_models import ICExtraction, PayslipExtraction, ApplicationFormExtraction, FinancingDetails, PersonalDetails, EmploymentDetails

class ICExtractionSignature(dspy.Signature):
    """Extract structured data from the provided image of a Malaysian Identity Card (MyKad).
    Pay close attention to the name, 12-digit IC number, and address.
    Derive the date of birth from the first six digits of the IC number."""
    image: dspy.Image = dspy.InputField(desc="An image of the identity card.")
    ic_data: ICExtraction = dspy.OutputField(desc="Structured JSON output conforming to the ICExtraction model.")

class PayslipExtractionSignature(dspy.Signature):
    """Extract structured data from the provided image of an employee payslip.
    Identify all individual earnings and deductions to create detailed breakdowns.
    Calculate and verify the gross wages, total deductions, and net wages.

    CRITICAL: Format the pay_period field as MMM-YYYY (e.g., 'APR-2025', 'JUN-2024').
    Convert any date range like '01-04-2025 TO 30-04-2025' or 'END-APRIL-2025' to 'APR-2025' format."""
    image: dspy.Image = dspy.InputField(desc="An image of the payslip.")
    payslip_data: PayslipExtraction = dspy.OutputField(desc="Structured JSON output conforming to the PayslipExtraction model.")

class ApplicationFormExtractionSignature(dspy.Signature):
    """You are an expert at extracting information from a SINGLE PAGE of a multi-page bank application form.
    Analyze the provided page image and extract ANY and ALL information you can find that matches the fields in the ApplicationFormExtraction model.
    It is expected that many fields will be null on any given page. Extract only what is clearly visible on THIS page."""

    page_image: dspy.Image = dspy.InputField(desc="The image of a single page from the application form.")
    form_data: ApplicationFormExtraction = dspy.OutputField(desc="The structured JSON data extracted ONLY from this single page.")

# NEW: Specialized signatures for composed extraction
class FinancingDetailsSignature(dspy.Signature):
    """Extract financing details from application form focusing on checkbox selections and amounts.

    CRITICAL INSTRUCTIONS:
    1. Look for the TOP SECTION of the form - financing details are usually at the very beginning
    2. Scan for CHECKBOX SELECTIONS - look for ticked/marked boxes next to financing options
    3. Find AMOUNT FIELDS - look for "Amount Requested" or "Jumlah Dipohon" with numerical values
    4. Identify TENURE/TENOR fields - may be labeled as years or months
    5. Look for APPLICATION TYPE checkboxes - Single vs Joint application

    SEARCH PATTERNS:
    - "Personal Financing" / "Pembiayaan Peribadi" checkboxes
    - "Vehicle Financing" / "Pembiayaan Kenderaan" checkboxes
    - "Property Financing" / "Pembiayaan Hartanah" checkboxes
    - Amount fields with "RM" currency symbols
    - Handwritten or typed numerical values next to labels"""
    image: dspy.Image = dspy.InputField(desc="An image of the application form.")
    financing_details: FinancingDetails = dspy.OutputField(desc="Structured financing details with constrained checkbox options.")

class PersonalDetailsSignature(dspy.Signature):
    """Extract personal details from Section A of the application form.

    CRITICAL INSTRUCTIONS:
    1. Look for "SECTION A" or similar heading indicating personal information
    2. Scan for CLEARLY LABELED FIELDS with bilingual labels (English/Malay)
    3. Pay attention to HANDWRITTEN text in form fields, not just printed labels
    4. Look for DATE FORMATS in various styles (DD/MM/YYYY, DD-MM-YYYY, etc.)
    5. Identify PHONE NUMBERS with Malaysian format patterns (+60, 01x-xxxxxxx)

    SPECIFIC FIELD SEARCHES:
    - "Name as in MyKad" / "Nama seperti dalam MyKad" - look for handwritten full names
    - "MyKad No." / "No. MyKad" - find 12-digit IC numbers (format: XXXXXX-XX-XXXX)
    - "Date of Birth" / "Tarikh Lahir" - scan for date values near these labels
    - "HP No." / "No. Tel. Bimbit" - find mobile phone numbers (usually starts with 01)
    - "E-Mail" / "E-Mel" - look for email address patterns with @ symbols
    - "Address" / "Alamat" - find multi-line address blocks, often handwritten
    - Marital status checkboxes for "Single" / "Married" options

    EXTRACTION TIPS:
    - Handwritten text may be in various handwriting styles
    - Form fields may have both printed labels and handwritten values
    - Address fields are often multi-line with postal codes"""
    image: dspy.Image = dspy.InputField(desc="An image of the application form.")
    personal_details: PersonalDetails = dspy.OutputField(desc="Structured personal details from Section A.")

class EmploymentDetailsSignature(dspy.Signature):
    """Extract employment details from Section B of the application form.

    CRITICAL INSTRUCTIONS:
    1. Look for "SECTION B" or "EMPLOYMENT DETAILS" / "MAKLUMAT PEKERJAAN"
    2. Focus on EMPLOYER INFORMATION and JOB DETAILS
    3. Scan for INCOME FIGURES - often in RM currency
    4. Look for DURATION OF EMPLOYMENT - years/months of service
    5. Find CONTACT INFORMATION for the workplace

    SPECIFIC FIELD SEARCHES:
    - "Employer Name" / "Nama Majikan" - company or organization name
    - "Job Title" / "Jawatan" - position or role in the company
    - "Monthly Income" / "Pendapatan Bulanan" - salary amount in RM
    - "Years of Service" / "Tempoh Berkhidmat" - duration in current job
    - "Employment Type" - Permanent/Contract/Part-time checkboxes
    - "Office Address" / "Alamat Pejabat" - workplace address
    - "Office Phone" / "Tel. Pejabat" - workplace contact number
    - "Department" / "Jabatan" - division or section within company

    EXTRACTION TIPS:
    - Income amounts may have "RM" prefix or be in numerical format only
    - Employment duration might be written as "X years Y months"
    - Company names may be handwritten in various styles
    - Address fields are typically multi-line entries"""
    image: dspy.Image = dspy.InputField(desc="An image of the application form.")
    employment_details: EmploymentDetails = dspy.OutputField(desc="Structured employment details from Section B.")