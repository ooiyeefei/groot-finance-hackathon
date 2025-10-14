import { NextRequest, NextResponse } from 'next/server'

// Define schema structures for each document type based on our Pydantic models
const documentSchemas = {
  ic: {
    type: 'ic',
    complexityLevel: 'simple',
    expandableByDefault: false,
    sections: [
      {
        key: 'personal_information',
        title: 'Personal Information',
        importance: 'critical',
        collapsible: false,
        defaultExpanded: true,
        gridColumns: 2, // Clean two-column layout
        fields: [
          {
            key: 'full_name',
            label: 'Full Name',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 2 // Full width
          },
          {
            key: 'ic_number',
            label: 'IC Number',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'date_of_birth',
            label: 'Date of Birth',
            dataType: 'date',
            importance: 'critical',
            bboxSupported: false,
            colSpan: 1
          },
          {
            key: 'gender',
            label: 'Gender',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'religion',
            label: 'Religion',
            dataType: 'text',
            importance: 'optional',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'address',
            label: 'Address',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 2 // Full width
          },
          {
            key: 'confidence_score',
            label: 'Confidence Score',
            dataType: 'number',
            importance: 'optional',
            bboxSupported: false,
            colSpan: 2
          }
        ]
      }
    ]
  },
  payslip: {
    type: 'payslip',
    complexityLevel: 'medium',
    expandableByDefault: true,
    sections: [
      {
        key: 'employee_employer_info',
        title: 'Employee & Employer Information',
        importance: 'critical',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 2, // Two-column layout for structured view
        fields: [
          {
            key: 'employee_name',
            label: 'Employee Name',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'employer_name',
            label: 'Employer Name',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'ic_number',
            label: 'IC Number',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'employee_code',
            label: 'Employee Code',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'pay_period',
            label: 'Pay Period',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 2 // Full width
          }
        ]
      },
      {
        key: 'financial_breakdown',
        title: 'Financial Breakdown',
        importance: 'critical',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 3, // Three-column layout for key financials
        fields: [
          {
            key: 'gross_wages',
            label: 'Gross Wages',
            dataType: 'currency',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'total_deductions',
            label: 'Total Deductions',
            dataType: 'currency',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'net_wages',
            label: 'Net Pay',
            dataType: 'currency',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          }
        ]
      },
      {
        key: 'earnings_deductions',
        title: 'Earnings & Deductions',
        importance: 'important',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 1, // Full width for tables
        fields: [
          {
            key: 'earnings_breakdown',
            label: 'Earnings Breakdown',
            dataType: 'table',
            renderAs: 'table',
            importance: 'important',
            bboxSupported: false,
            colSpan: 1,
            tableColumns: [
              { key: 'description', label: 'Description', width: '70%' },
              { key: 'amount', label: 'Amount', width: '30%' }
            ]
          },
          {
            key: 'deductions_breakdown',
            label: 'Deductions Breakdown',
            dataType: 'table',
            renderAs: 'table',
            importance: 'important',
            bboxSupported: false,
            colSpan: 1,
            tableColumns: [
              { key: 'description', label: 'Description', width: '70%' },
              { key: 'amount', label: 'Amount', width: '30%' }
            ]
          }
        ]
      },
      {
        key: 'metadata',
        title: 'Processing Information',
        importance: 'optional',
        collapsible: true,
        defaultExpanded: false,
        gridColumns: 1,
        fields: [
          {
            key: 'confidence_score',
            label: 'Confidence Score',
            dataType: 'number',
            importance: 'optional',
            bboxSupported: false,
            colSpan: 1
          }
        ]
      }
    ]
  },
  application_form: {
    type: 'application_form',
    complexityLevel: 'complex',
    expandableByDefault: true,
    sections: [
      {
        key: 'financing_details',
        title: 'Financing Details',
        importance: 'critical',
        collapsible: true,
        defaultExpanded: true, // Expanded by default - most important section
        gridColumns: 2, // Two-column layout for key financing fields
        fields: [
          {
            key: 'type_of_financing',
            label: 'Type of Financing',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'application_type',
            label: 'Application Type',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'amount_requested',
            label: 'Amount Requested',
            dataType: 'currency',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'tenor',
            label: 'Tenor (Months/Years)',
            dataType: 'number',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          }
        ]
      },
      {
        key: 'personal_details',
        title: 'Personal Details',
        importance: 'critical',
        collapsible: true,
        defaultExpanded: false, // Collapsed by default to prevent overwhelming
        gridColumns: 2, // Two-column layout for personal information
        fields: [
          {
            key: 'name',
            label: 'Full Name',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 2 // Full width for name
          },
          {
            key: 'mykad_no',
            label: 'MyKad Number',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'date_of_birth',
            label: 'Date of Birth',
            dataType: 'date',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'gender',
            label: 'Gender',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'race',
            label: 'Race',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'marital_status',
            label: 'Marital Status',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'hp_no',
            label: 'Phone Number',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'residential_address',
            label: 'Residential Address',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 2 // Full width for address
          },
          {
            key: 'email',
            label: 'Email Address',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 2 // Full width for email
          }
        ]
      },
      {
        key: 'employment_details',
        title: 'Employment Details',
        importance: 'critical',
        collapsible: true,
        defaultExpanded: false, // Collapsed by default to manage large form
        gridColumns: 2, // Two-column layout for employment information
        fields: [
          {
            key: 'employer_name',
            label: 'Employer Name',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 2 // Full width for employer name
          },
          {
            key: 'occupation',
            label: 'Occupation',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'employment_sector',
            label: 'Employment Sector',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'employment_status',
            label: 'Employment Status',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 2 // Full width for status
          }
        ]
      },
      {
        key: 'metadata',
        title: 'Processing Information',
        importance: 'optional',
        collapsible: true,
        defaultExpanded: false,
        gridColumns: 1,
        fields: [
          {
            key: 'confidence_score',
            label: 'Confidence Score',
            dataType: 'number',
            importance: 'optional',
            bboxSupported: false,
            colSpan: 1
          }
        ]
      }
    ]
  },
  invoice: {
    type: 'invoice',
    complexityLevel: 'complex',
    expandableByDefault: true,
    sections: [
      {
        key: 'document_summary',
        title: 'Document Summary',
        importance: 'critical',
        collapsible: false,
        defaultExpanded: true,
        gridColumns: 2, // CSS Grid: 2 columns
        fields: [
          {
            key: 'vendor_name',
            label: 'Vendor Name',
            dataType: 'text',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'total_amount',
            label: 'Amount',
            dataType: 'currency',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'transaction_date',
            label: 'Date',
            dataType: 'date',
            importance: 'critical',
            bboxSupported: true,
            colSpan: 2
          }
        ]
      },
      {
        key: 'vendor_information',
        title: 'Vendor Information',
        importance: 'important',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 2, // CSS Grid: 2 columns
        fields: [
          {
            key: 'vendor_address',
            label: 'Address',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'vendor_contact',
            label: 'Contact',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'vendor_tax_id',
            label: 'Tax ID',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 2
          }
        ]
      },
      {
        key: 'customer_information',
        title: 'Customer Information',
        importance: 'important',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 2, // CSS Grid: 2 columns
        fields: [
          {
            key: 'customer_name',
            label: 'Customer Name',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 2
          },
          {
            key: 'customer_address',
            label: 'Customer Address',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'customer_contact',
            label: 'Contact',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          }
        ]
      },
      {
        key: 'document_information',
        title: 'Document Information',
        importance: 'important',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 2, // CSS Grid: 2 columns
        fields: [
          {
            key: 'document_number',
            label: 'Document Number',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'due_date',
            label: 'Due Date',
            dataType: 'date',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          }
        ]
      },
      {
        key: 'payment_information',
        title: 'Payment Information',
        importance: 'important',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 2, // CSS Grid: 2 columns
        fields: [
          {
            key: 'payment_terms',
            label: 'Payment Terms',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'payment_method',
            label: 'Payment Method',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'bank_details',
            label: 'Bank Details',
            dataType: 'text',
            importance: 'important',
            bboxSupported: true,
            colSpan: 2
          }
        ]
      },
      {
        key: 'tax_financial_breakdown',
        title: 'Tax & Financial Breakdown',
        importance: 'important',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 3, // CSS Grid: 3 columns for this section
        fields: [
          {
            key: 'subtotal_amount',
            label: 'Subtotal',
            dataType: 'currency',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'tax_amount',
            label: 'Tax Amount',
            dataType: 'currency',
            importance: 'important',
            bboxSupported: true,
            colSpan: 1
          },
          {
            key: 'discount_amount',
            label: 'Discount',
            dataType: 'currency',
            importance: 'optional',
            bboxSupported: true,
            colSpan: 1
          }
        ]
      },
      {
        key: 'line_items',
        title: 'Line Items',
        importance: 'critical',
        collapsible: true,
        defaultExpanded: true,
        gridColumns: 1, // Full width for table
        fields: [
          {
            key: 'line_items',
            label: 'Invoice Items',
            dataType: 'table',
            renderAs: 'table', // Special rendering instruction
            importance: 'critical',
            bboxSupported: false,
            colSpan: 1,
            tableColumns: [
              { key: 'item_code', label: '#', width: '10%' },
              { key: 'description', label: 'Description', width: '40%' },
              { key: 'quantity', label: 'Qty', width: '10%' },
              { key: 'unit', label: 'Unit', width: '10%' },
              { key: 'unit_price', label: 'Unit Price', width: '15%' },
              { key: 'total_price', label: 'Total Price', width: '15%' }
            ]
          }
        ]
      }
    ]
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentType: string }> }
) {
  try {
    const { documentType } = await params

    // Validate document type
    const validTypes = ['ic', 'payslip', 'application_form', 'invoice', 'receipt', 'bill', 'statement', 'contract', 'other']
    if (!validTypes.includes(documentType)) {
      return NextResponse.json({
        success: false,
        error: `Invalid document type. Must be one of: ${validTypes.join(', ')}`
      }, { status: 400 })
    }

    // Get schema for the requested document type
    const schema = documentSchemas[documentType as keyof typeof documentSchemas]

    if (!schema) {
      // For legacy document types (invoice, receipt, etc.), return a basic schema
      const legacySchema = {
        type: documentType,
        complexityLevel: 'medium',
        expandableByDefault: false,
        sections: [
          {
            key: 'document_summary',
            title: 'Document Information',
            importance: 'critical',
            collapsible: false,
            defaultExpanded: true,
            fields: [
              {
                key: 'document_type',
                label: 'Document Type',
                dataType: 'text',
                importance: 'critical',
                bboxSupported: true
              },
              {
                key: 'vendor_name',
                label: 'Vendor Name',
                dataType: 'text',
                importance: 'critical',
                bboxSupported: true
              },
              {
                key: 'total_amount',
                label: 'Total Amount',
                dataType: 'currency',
                importance: 'critical',
                bboxSupported: true
              },
              {
                key: 'transaction_date',
                label: 'Date',
                dataType: 'date',
                importance: 'critical',
                bboxSupported: true
              }
            ]
          }
        ]
      }

      return NextResponse.json({
        success: true,
        data: legacySchema
      })
    }

    return NextResponse.json({
      success: true,
      data: schema
    })

  } catch (error) {
    console.error('[Schema API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}