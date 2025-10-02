# Document AI Feature Specification

## Project Vision

Extend FinanSEAL's document processing capabilities to support personal finance documents for banking applications, enabling automated extraction and processing of Identity Cards (IC), Payslips, and Application Forms with banking-grade accuracy and compliance.

## Key Features

- **Multi-Task Pipeline Processing**: Decoupled workflow with `classify-document` → `extract-ic-data`/`extract-payslip-data`/`extract-application-form-data` for superior observability and scalability
- **Multimodal AI Classification**: Gemini Vision API analyzes document structure and layout for accurate type identification, enhanced with rule-based confidence boosting
- **Pydantic Single Source of Truth**: Dynamic schema generation from Python models eliminates frontend-backend schema drift and ensures consistency
- **Banking-Grade Security**: Field-level data protection, comprehensive audit trails, and task execution tracking for compliance monitoring
- **Zero-Maintenance Schema System**: Frontend UI automatically adapts to backend model changes without code updates
- **Production-Grade Observability**: Individual task metrics, error tracking, and execution monitoring for each pipeline stage
- **Multi-Format Support**: Process PDF, JPEG, JPG, and PNG file formats with optimized handling per document type
- **Confidence Scoring**: Per-field and document-level extraction confidence metrics with visual indicators
- **Progressive Disclosure**: Smart UI that manages complexity through expandable sections and field prioritization based on dynamic schemas

## User Stories

### Bank Employee - Document Upload and Processing
```
As a bank loan officer,
I want to upload a customer's IC, payslip, and application form documents
So that I can automatically extract and verify customer information for loan processing.

Acceptance Criteria:
- I can drag and drop multiple documents of different types
- The system uses Gemini Vision AI to accurately identify document types from visual layout
- I can track processing progress through each pipeline stage (classification → extraction)
- Extracted data is presented in an organized, dynamically-rendered format
- I can see confidence scores for extracted fields with visual priority indicators
- I can manually correct any misidentified information with inline editing
```

### Bank Employee - Data Verification and Review
```
As a bank compliance officer,
I want to review extracted document data with comprehensive audit trails
So that I can ensure accuracy and regulatory compliance before approval.

Acceptance Criteria:
- Critical fields are visually highlighted with red borders (loan amount, IC number)
- I can expand/collapse sections to focus on relevant information based on dynamic schemas
- Complete audit trail tracks all task executions, data access, and modifications
- System flags low-confidence extractions and classification issues for manual review
- Task execution monitoring shows processing times and failure points for troubleshooting
```

### System Administrator - Zero-Maintenance Schema Management
```
As a system administrator,
I want to add new document types and fields without any frontend code changes
So that we can rapidly adapt to new banking products and regulatory requirements.

Acceptance Criteria:
- New document types are added by creating Pydantic models in Python backend only
- Frontend UI automatically fetches and renders new schemas via `/api/documents/schemas/[type]`
- Field priorities, sections, and UI metadata are defined once in Python models
- Schema versioning maintains backward compatibility with existing documents
- No deployment of frontend code required when adding new document fields
```

## Input and Output Definitions

### 1. Identity Card (IC) Processing

**Input:**
- Document Type: IC/Identity Card/MyKad
- File Formats: PDF, JPEG, JPG, PNG
- Expected Layout: Standardized government-issued ID card

**Output Fields:**
```json
{
  "document_type": "ic",
  "ic_number": "123456-78-9012",
  "full_name": "Ahmad Bin Abdullah",
  "gender": "Male",
  "date_of_birth": "15-06-1985",
  "state_of_birth": "Selangor",
  "nationality": "Malaysian",
  "confidence_score": 0.96
}
```

**Field Descriptions:**
- `ic_number`: 12-digit IC number with hyphens
- `full_name`: Full name as printed on IC
- `gender`: Male/Female
- `date_of_birth`: DD-MM-YYYY format
- `state_of_birth`: Malaysian state of birth
- `nationality`: Usually "Malaysian"
- `confidence_score`: Overall extraction confidence (0.0-1.0)

### 2. Payslip Processing

**Input:**
- Document Type: Payslip/Salary Statement
- File Formats: PDF, JPEG, JPG, PNG
- Expected Layout: Company payslip with salary breakdown

**Output Fields:**
```json
{
  "document_type": "payslip",
  "employee_name": "Ahmad Bin Abdullah",
  "employee_id": "EMP001234",
  "pay_period": "January 2024",
  "gross_salary": 5500.00,
  "deductions": {
    "EPF": 660.00,
    "SOCSO": 24.50,
    "Income Tax": 150.00,
    "Insurance": 45.00
  },
  "net_salary": 4620.50,
  "employer_name": "ABC Manufacturing Sdn Bhd",
  "sector": "Private",
  "confidence_score": 0.94
}
```

**Field Descriptions:**
- `employee_name`: Employee's full name
- `employee_id`: Company employee identifier
- `pay_period`: Month/year of payment
- `gross_salary`: Total salary before deductions
- `deductions`: Breakdown of all deductions
- `net_salary`: Final take-home amount
- `employer_name`: Company name
- `sector`: Government/FSI/Private sector classification
- `confidence_score`: Overall extraction confidence

### 3. Application Form Processing

**Input:**
- Document Type: Loan/Credit Application Form
- File Formats: PDF, JPEG, JPG, PNG
- Expected Layout: Multi-page banking application form

**Output Fields:**
```json
{
  "document_type": "application_form",
  "applicant_name": "Ahmad Bin Abdullah",
  "ic_number": "123456-78-9012",
  "contact_number": "+60123456789",
  "email": "ahmad@email.com",
  "address": "123 Jalan ABC, Taman DEF, 50100 Kuala Lumpur",
  "product_type": "Personal Loan",
  "finance_amount": 50000.00,
  "application_type": "New Application",
  "product_category": "Personal Financing",
  "mode_of_payment": "Monthly Installment",
  "monthly_income": 5500.00,
  "employment_status": "Permanent Employee",
  "additional_fields": {
    "loan_tenure": "5 years",
    "purpose": "Home Renovation",
    "guarantor_name": "Siti Binti Ahmad"
  },
  "confidence_score": 0.91
}
```

**Field Descriptions:**
- Core personal fields: Standard identification information
- Financial fields: Loan-specific requirements and amounts
- `additional_fields`: Variable fields depending on form type/version
- `confidence_score`: Overall extraction confidence

## Technical Architecture Advantages

### Multi-Task Pipeline Benefits
- **Observability**: Individual task metrics for classification vs extraction performance
- **Scalability**: Independent scaling of classification and extraction workloads
- **Reliability**: Isolated failure handling - classification issues don't block extraction retries
- **Maintainability**: Clear separation of concerns with dedicated tasks per document type

### Multimodal AI Classification Advantages
- **Visual Understanding**: Gemini Vision analyzes document layout, logos, and structure beyond text
- **Language Agnostic**: Works with Malay, English, Chinese text and mixed-language documents
- **Layout Recognition**: Identifies document types even with poor OCR quality or stylized text
- **Robustness**: Handles variations in bank forms, government ID designs, and company payslips

### Pydantic Schema Architecture Benefits
- **Zero Schema Drift**: Frontend and backend always perfectly synchronized
- **Rapid Iteration**: New fields added to Python models automatically appear in UI
- **Type Safety**: JSON Schema validation ensures data integrity and prevents runtime errors
- **Documentation**: Field descriptions and validation rules come from single authoritative source
- **Version Control**: Schema evolution tracked with backward compatibility support

## Success Metrics

- **Accuracy**: >95% field extraction accuracy across all document types
- **Performance**: <30 seconds end-to-end processing time
- **Scalability**: Support for 1000+ documents per day
- **User Experience**: <3 clicks to review and approve extracted data
- **Compliance**: 100% audit trail coverage for sensitive data access
- **Maintainability**: Zero frontend deployments required for new document fields

## UI/UX Requirements

### Progressive Disclosure Strategy
- **Critical Fields** (Red border): Always expanded, immediate visibility
- **Important Fields** (Amber border): Collapsed by default, click to expand
- **Optional Fields** (Gray border): Subtle styling, minimal cognitive load

### Banking-Grade Interface Standards
- **Professional Dark Theme**: Extend existing gray-900/800/700 color scheme
- **WCAG 2.1 AA Compliance**: Accessibility for government banking applications
- **Touch-Optimized**: 48px minimum touch targets for tablet banking officers
- **Inline Editing**: Quick corrections with modal fallback for complex data
- **Dynamic Schema Rendering**: UI automatically adapts to Pydantic model changes without code deployment
- **Task Progress Indicators**: Real-time visibility into classification and extraction pipeline stages

### Mobile/Responsive Design
- **Tablet Adaptation**: Tab navigation for document/data/summary views
- **Touch Gestures**: Swipe-to-expand sections, pull-to-refresh documents
- **Workflow Efficiency**: Batch validation actions, keyboard shortcuts

## Compliance Requirements

- **Data Protection**: Field-level encryption for sensitive information
- **Audit Trails**: Complete logging of document access and modifications
- **Retention Policies**: Automated data lifecycle management
- **Access Control**: Role-based permissions for different user types
- **Regulatory Compliance**: Adherence to Malaysian banking regulations (BNM guidelines)