import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/../../convex/_generated/api'
import type { Id } from '@/../../convex/_generated/dataModel'
import { createElement } from 'react'

/**
 * POST /api/v1/sales-invoices/[invoiceId]/lhdn/send-to-buyer
 *
 * Manual user-triggered delivery of validated e-invoice PDF with LHDN QR code.
 * 001-einv-pdf-gen: User Story 2 - Manual "Send to Buyer" button
 *
 * Flow:
 * 1. Authenticate user with Clerk
 * 2. Verify invoice is LHDN-validated
 * 3. Check buyer email exists
 * 4. Generate or retrieve stored PDF
 * 5. Send via SES
 * 6. Update delivery tracking
 *
 * Auth: Clerk user session (invoice must belong to user's business).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    // Clerk authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { invoiceId } = await params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: 'businessId is required' },
        { status: 400 }
      )
    }

    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

    // Load invoice
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

    // Verify LHDN validation
    if (invoice.lhdnStatus !== 'valid' || !invoice.lhdnLongId) {
      return NextResponse.json(
        { success: false, error: 'Invoice not validated by LHDN' },
        { status: 400 }
      )
    }

    // Get buyer email
    const buyerEmail = invoice.customerSnapshot?.email
    if (!buyerEmail) {
      return NextResponse.json(
        { success: false, error: 'No buyer email address found' },
        { status: 400 }
      )
    }

    // Load business
    const business = await convex.query(api.functions.salesInvoices.getBusinessForInvoice, {
      businessId: businessId as Id<'businesses'>,
    })

    // Check if PDF already stored
    let pdfBase64: string
    let filename = `${invoice.invoiceNumber || 'einvoice'}-LHDN.pdf`

    if (invoice.lhdnPdfS3Path) {
      // Retrieve stored PDF from S3
      try {
        const { getEinvoicePdfUrl } = await import('@/lib/cloudfront-signer')
        const signedUrl = await getEinvoicePdfUrl(invoice.lhdnPdfS3Path, 600) // 10-min temp URL

        const pdfResponse = await fetch(signedUrl)
        if (!pdfResponse.ok) throw new Error('Failed to fetch stored PDF')

        const pdfBuffer = await pdfResponse.arrayBuffer()
        pdfBase64 = Buffer.from(pdfBuffer).toString('base64')
        console.log('[Send to Buyer] Using stored PDF from S3')
      } catch (pdfError) {
        console.error('[Send to Buyer] Failed to retrieve stored PDF:', pdfError)
        // Fall through to regeneration
        pdfBase64 = ''
      }
    } else {
      pdfBase64 = ''
    }

    // Regenerate PDF if not found in storage
    if (!pdfBase64) {
      console.log('[Send to Buyer] Regenerating PDF...')

      // Generate QR code
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
      pdfBase64 = Buffer.from(pdfBuffer).toString('base64')
    }

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
      pdfAttachment: { content: pdfBase64, filename },
    })

    if (!result.success) {
      console.error('[Send to Buyer] Email send failed:', result.error)

      // Update delivery tracking with failure status
      await convex.mutation(api.functions.salesInvoices.updateLhdnDeliveryStatus, {
        invoiceId: invoiceId as Id<'sales_invoices'>,
        businessId: businessId as Id<'businesses'>,
        s3Path: invoice.lhdnPdfS3Path,
        deliveryStatus: 'failed',
        deliveryError: result.error || 'Email delivery failed',
      })

      return NextResponse.json(
        { success: false, error: result.error || 'Email delivery failed' },
        { status: 502 }
      )
    }

    // Update delivery tracking with success status
    await convex.mutation(api.functions.salesInvoices.updateLhdnDeliveryStatus, {
      invoiceId: invoiceId as Id<'sales_invoices'>,
      businessId: businessId as Id<'businesses'>,
      deliveredTo: buyerEmail,
      s3Path: invoice.lhdnPdfS3Path,
      deliveryStatus: 'delivered',
    })

    console.log(`[Send to Buyer] E-invoice ${invoice.invoiceNumber} delivered to ${buyerEmail}`)

    return NextResponse.json({
      success: true,
      data: {
        invoiceId,
        deliveredTo: buyerEmail,
        messageId: result.messageId,
      },
    })
  } catch (error) {
    console.error('[Send to Buyer] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
