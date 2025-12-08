import { NextRequest, NextResponse } from 'next/server'

// Define schema structures for each document type based on our Pydantic models
// Note: ic, payslip, and application_form schemas removed - legacy application types no longer supported
const documentSchemas = {
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
    const validTypes = ['invoice', 'receipt', 'bill', 'statement', 'contract', 'other']
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