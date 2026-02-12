import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { emailService } from '@/lib/services/email-service'

/**
 * POST /api/v1/sales-invoices/[invoiceId]/send-email
 *
 * Sends invoice email to the customer via SES/Resend.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { invoiceId } = await params
    const body = await request.json()

    const {
      to,
      recipientName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      totalAmount,
      currency,
      balanceDue,
      subtotal,
      totalTax,
      paymentInstructions,
      businessName,
      businessAddress,
      businessPhone,
      businessEmail,
      lineItems,
      pdfAttachment,
    } = body as {
      to: string
      recipientName?: string
      invoiceNumber: string
      invoiceDate: string
      dueDate: string
      totalAmount: number
      currency: string
      balanceDue: number
      subtotal?: number
      totalTax?: number
      paymentInstructions?: string
      businessName: string
      businessAddress?: string
      businessPhone?: string
      businessEmail?: string
      lineItems?: { itemCode?: string; description: string; quantity: number; unitPrice: number; amount: number }[]
      pdfAttachment?: { content: string; filename: string }
    }

    if (!to) {
      return NextResponse.json(
        { success: false, error: 'Recipient email is required' },
        { status: 400 }
      )
    }

    if (!invoiceNumber || !businessName) {
      return NextResponse.json(
        { success: false, error: 'Invoice number and business name are required' },
        { status: 400 }
      )
    }

    console.log('[Sales Invoices API] Sending invoice email:', {
      invoiceId,
      to,
      invoiceNumber,
    })

    const result = await emailService.sendInvoiceEmail({
      recipientEmail: to,
      recipientName: recipientName || 'Customer',
      invoiceNumber,
      invoiceDate,
      dueDate,
      totalAmount,
      currency,
      balanceDue,
      subtotal,
      totalTax,
      paymentInstructions,
      businessName,
      businessAddress,
      businessPhone,
      businessEmail,
      lineItems,
      pdfAttachment,
    })

    if (!result.success) {
      console.error('[Sales Invoices API] Email send failed:', result.error)
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to send email',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        invoiceId,
        emailSentTo: to,
        messageId: result.messageId,
        provider: result.provider,
      },
    })
  } catch (error) {
    console.error('[Sales Invoices API] Send email error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
