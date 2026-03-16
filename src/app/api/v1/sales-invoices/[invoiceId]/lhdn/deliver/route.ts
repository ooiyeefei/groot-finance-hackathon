import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/../../convex/_generated/api'
import type { Id } from '@/../../convex/_generated/dataModel'
import { createElement } from 'react'

/**
 * POST /api/v1/sales-invoices/[invoiceId]/lhdn/deliver
 *
 * Server-side auto-delivery of validated e-invoice PDF with LHDN QR code.
 * Called internally after LHDN validation is detected.
 *
 * Flow:
 * 1. Load invoice + business data from Convex
 * 2. Generate LHDN QR code data URL
 * 3. Render PDF server-side with @react-pdf/renderer
 * 4. Send via existing email service (SES)
 * 5. Update delivery tracking fields on invoice
 *
 * Auth: Internal service key (X-Internal-Key header) — not user-facing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId } = await params
    const body = await request.json()
    const { businessId } = body as { businessId: string }

    // Verify internal service key
    const internalKey = request.headers.get('X-Internal-Key')
    const expectedKey = process.env.MCP_INTERNAL_SERVICE_KEY
    if (!internalKey || internalKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

    // Load invoice (no user auth — internal service key protects this route)
    const invoice = await convex.query(api.functions.salesInvoices.getInvoiceForDelivery, {
      invoiceId: invoiceId as Id<'sales_invoices'>,
      businessId: businessId as Id<'businesses'>,
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      )
    }

    if (invoice.lhdnStatus !== 'valid' || !invoice.lhdnLongId) {
      return NextResponse.json(
        { success: false, error: 'Invoice not validated by LHDN' },
        { status: 400 }
      )
    }

    // Get buyer email
    const buyerEmail = invoice.customerSnapshot?.email
    if (!buyerEmail) {
      console.log('[LHDN Deliver] No buyer email, skipping delivery')
      return NextResponse.json({
        success: true,
        data: { skipped: true, reason: 'No buyer email' },
      })
    }

    // Load business
    const business = await convex.query(api.functions.salesInvoices.getBusinessForInvoice, {
      businessId: businessId as Id<'businesses'>,
    })

    // Generate QR code data URL
    const { default: QRCode } = await import('qrcode')
    const qrUrl = `https://myinvois.hasil.gov.my/${invoice.lhdnLongId}/share`
    const lhdnQrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1 })

    // Build PDF data
    const pdfData = {
      invoice: {
        invoiceNumber: invoice.invoiceNumber || '',
        invoiceDate: invoice.invoiceDate || '',
        dueDate: invoice.dueDate || '',
        customerSnapshot: invoice.customerSnapshot || { businessName: '', email: '' },
        lineItems: (invoice.lineItems || []).map((item: Record<string, unknown>) => ({
          description: (item.description as string) || '',
          quantity: (item.quantity as number) || 0,
          unitPrice: (item.unitPrice as number) || 0,
          taxRate: item.taxRate as number | undefined,
          taxAmount: item.taxAmount as number | undefined,
          discountAmount: item.discountAmount as number | undefined,
          totalAmount: (item.totalAmount as number) || 0,
          currency: (item.currency as string) || invoice.currency || 'MYR',
          itemCode: item.itemCode as string | undefined,
          unitMeasurement: item.unitMeasurement as string | undefined,
        })),
        subtotal: invoice.subtotal || 0,
        totalDiscount: invoice.totalDiscount,
        totalTax: invoice.totalTax || 0,
        totalAmount: invoice.totalAmount || 0,
        balanceDue: invoice.balanceDue ?? invoice.totalAmount ?? 0,
        amountPaid: invoice.amountPaid,
        currency: invoice.currency || 'MYR',
        taxMode: invoice.taxMode || 'exclusive',
        notes: invoice.notes,
        paymentInstructions: invoice.paymentInstructions,
        paymentTerms: invoice.paymentTerms,
        signatureName: invoice.signatureName,
        status: invoice.status || 'sent',
        footer: invoice.footer,
        showTaxId: invoice.showTaxId,
        lhdnLongId: invoice.lhdnLongId,
        lhdnQrDataUrl,
        lhdnDocumentUuid: invoice.lhdnDocumentUuid,
        lhdnValidatedAt: invoice.lhdnValidatedAt,
        lhdnStatus: invoice.lhdnStatus,
      },
      businessInfo: business ? {
        companyName: business.name,
        companyAddress: business.address,
        companyPhone: business.contactPhone,
        companyEmail: business.contactEmail || business.contactEmail,
        registrationNumber: business.businessRegistrationNumber,
        taxId: business.lhdnTin,
        sstRegistrationNumber: business.sstRegistrationNumber,
        logoUrl: business.logoUrl,
      } : undefined,
    }

    // Server-side PDF generation
    const [{ renderToBuffer }, { InvoicePdfDocument }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('@/domains/sales-invoices/components/invoice-templates/pdf-document'),
    ])

    const element = createElement(InvoicePdfDocument, {
      invoice: pdfData.invoice,
      businessInfo: pdfData.businessInfo,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(element as any)
    const base64 = Buffer.from(pdfBuffer).toString('base64')
    const filename = `${invoice.invoiceNumber || 'einvoice'}-LHDN.pdf`

    // Send email using existing email service
    const { emailService } = await import('@/lib/services/email-service')
    const result = await emailService.sendInvoiceEmail({
      recipientEmail: buyerEmail,
      recipientName: invoice.customerSnapshot?.contactPerson || invoice.customerSnapshot?.businessName || 'Customer',
      invoiceNumber: invoice.invoiceNumber || '',
      invoiceDate: invoice.invoiceDate || '',
      dueDate: invoice.dueDate || '',
      totalAmount: invoice.totalAmount || 0,
      currency: invoice.currency || 'MYR',
      balanceDue: invoice.balanceDue ?? invoice.totalAmount ?? 0,
      businessName: business?.name || '',
      businessEmail: business?.contactEmail,
      pdfAttachment: { content: base64, filename },
    })

    if (!result.success) {
      console.error('[LHDN Deliver] Email send failed:', result.error)
      return NextResponse.json(
        { success: false, error: result.error || 'Email delivery failed' },
        { status: 502 }
      )
    }

    // Update delivery tracking on invoice
    await convex.mutation(api.functions.salesInvoices.updateLhdnDeliveryStatus, {
      invoiceId: invoiceId as Id<'sales_invoices'>,
      businessId: businessId as Id<'businesses'>,
      deliveredTo: buyerEmail,
    })

    console.log(`[LHDN Deliver] E-invoice ${invoice.invoiceNumber} delivered to ${buyerEmail}`)

    return NextResponse.json({
      success: true,
      data: {
        invoiceId,
        deliveredTo: buyerEmail,
        messageId: result.messageId,
      },
    })
  } catch (error) {
    console.error('[LHDN Deliver] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
