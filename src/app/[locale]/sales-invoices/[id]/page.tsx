'use client'

// Force dynamic rendering - required for authentication
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { ArrowLeft, Pencil, Send, RotateCw, CreditCard, Ban, Download, Loader2, Trash2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { LhdnDeliveryStatus } from '@/domains/sales-invoices/components/lhdn-delivery-status'
import { SendToBuyerButton } from '@/domains/sales-invoices/components/send-to-buyer-button'
import { Button } from '@/components/ui/button'
import HeaderWithUser from '@/components/ui/header-with-user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useUser } from '@clerk/nextjs'
import { useActiveBusiness, useBusinessProfile } from '@/contexts/business-context'
import { useSalesInvoice, useSalesInvoiceMutations, useInvoicePdfUrl, useLhdnPdfUrl, useInvoiceDefaults } from '@/domains/sales-invoices/hooks/use-sales-invoices'
import { useInvoicePdf, type PdfRenderData } from '@/domains/sales-invoices/hooks/use-invoice-pdf'
import { InvoicePreview } from '@/domains/sales-invoices/components/invoice-preview'
import { InvoiceStatusBadge } from '@/domains/sales-invoices/components/invoice-status-badge'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { SALES_INVOICE_STATUSES } from '@/domains/sales-invoices/types'
import type { SalesInvoiceStatus } from '@/domains/sales-invoices/types'
import { PaymentHistory } from '@/domains/sales-invoices/components/payment-history'
import { LhdnDetailSection } from '@/domains/sales-invoices/components/lhdn-detail-section'
import { generateLhdnQrDataUrl } from '@/domains/sales-invoices/components/lhdn-qr-code'
import { PeppolTransmissionPanel } from '@/domains/sales-invoices/components/peppol-transmission-panel'
import { CreditNoteList } from '@/domains/sales-invoices/components/credit-note-list'
import { CreditNoteForm } from '@/domains/sales-invoices/components/credit-note-form'
import { useNetOutstandingAmount } from '@/domains/sales-invoices/hooks/use-sales-invoices'
import { useToast } from '@/components/ui/toast'

export default function SalesInvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const locale = useLocale()
  const invoiceId = params.id as string

  const { business } = useActiveBusiness()
  const { profile: businessProfile } = useBusinessProfile()
  const { user } = useUser()
  const invoiceDefaults = useInvoiceDefaults()
  const { addToast } = useToast()
  const { invoice, isLoading } = useSalesInvoice(invoiceId)
  const { sendInvoice, voidInvoice, removeInvoice } = useSalesInvoiceMutations()
  const { generatePdf, generatePdfBlob, isGenerating } = useInvoicePdf()
  const storedPdfUrl = useInvoicePdfUrl(invoiceId)
  const lhdnPdfUrl = useLhdnPdfUrl(invoiceId)

  const [showCreditNoteForm, setShowCreditNoteForm] = useState(false)
  const netOutstanding = useNetOutstandingAmount(invoiceId)

  const [isSending, setIsSending] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isVoiding, setIsVoiding] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [lhdnQrDataUrl, setLhdnQrDataUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!invoice?.lhdnLongId) return
    generateLhdnQrDataUrl(invoice.lhdnLongId)
      .then(setLhdnQrDataUrl)
      .catch(() => console.error('Failed to generate LHDN QR for PDF'))
  }, [invoice?.lhdnLongId])

  if (isLoading) {
    return (
      <>
        <HeaderWithUser title="Invoice Details" subtitle="" />
        <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </>
    )
  }

  if (!invoice) {
    return (
      <>
        <HeaderWithUser title="Invoice Details" subtitle="" />
        <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
          <div className="text-center py-24">
            <p className="text-muted-foreground">Invoice not found.</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push(`/${locale}/invoices#sales-invoices`)}>Back to Invoices</Button>
          </div>
        </main>
      </>
    )
  }

  const isDraft = invoice.status === SALES_INVOICE_STATUSES.DRAFT
  const isVoid = invoice.status === SALES_INVOICE_STATUSES.VOID
  const isPaid = invoice.status === SALES_INVOICE_STATUSES.PAID

  const resolvedBusinessName = businessProfile?.name || business?.businessName || 'Our Company'

  const buildEmailPayload = () => ({
    to: invoice.customerSnapshot.email,
    recipientName: invoice.customerSnapshot.contactPerson || invoice.customerSnapshot.businessName,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    totalAmount: invoice.totalAmount,
    currency: invoice.currency,
    balanceDue: invoice.balanceDue,
    subtotal: invoice.subtotal,
    totalTax: invoice.totalTax,
    paymentInstructions: invoice.paymentInstructions,
    businessName: resolvedBusinessName,
    businessAddress: businessProfile?.address || undefined,
    businessPhone: businessProfile?.contact_phone || undefined,
    businessEmail: businessProfile?.contact_email || undefined,
    lineItems: invoice.lineItems?.map((item: { itemCode?: string; description: string; quantity: number; unitPrice: number; totalAmount: number }) => ({
      itemCode: item.itemCode,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.totalAmount,
    })),
    ...(invoiceDefaults?.bccOutgoingEmails !== false
      ? { bccEmail: businessProfile?.contact_email || user?.primaryEmailAddress?.emailAddress || undefined }
      : {}),
  })

  /** Generate PDF blob and convert to base64 for email attachment */
  const buildPdfAttachment = async (): Promise<{ content: string; filename: string } | undefined> => {
    try {
      const result = await generatePdfBlob(invoice.invoiceNumber, pdfData)
      if (!result.success || !result.blob) return undefined
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(result.blob!)
      })
      return { content: base64, filename: result.filename! }
    } catch {
      console.error('Failed to generate PDF attachment')
      return undefined
    }
  }

  /** Build the PDF part of the email payload — prefer stored PDF URL, fallback to client-side */
  const buildPdfPayload = async () => {
    if (storedPdfUrl) {
      return { pdfUrl: storedPdfUrl }
    }
    const pdfAttachment = await buildPdfAttachment()
    return pdfAttachment ? { pdfAttachment } : {}
  }

  const handleSend = async () => {
    setIsSending(true)
    try {
      await sendInvoice({ id: invoice._id, businessId: invoice.businessId })

      // Send email to customer after invoice status is updated
      try {
        const pdfPayload = await buildPdfPayload()
        const res = await fetch(`/api/v1/sales-invoices/${invoice._id}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...buildEmailPayload(), ...pdfPayload }),
        })
        if (res.ok) {
          addToast({ type: 'success', title: 'Invoice sent', description: `Email sent to ${invoice.customerSnapshot.email}` })
        }
      } catch (emailError) {
        // Email failure is non-blocking — invoice is already marked as sent
        console.error('Failed to send invoice email:', emailError)
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleResendEmail = async () => {
    setIsResending(true)
    try {
      const pdfPayload = await buildPdfPayload()
      const res = await fetch(`/api/v1/sales-invoices/${invoice._id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildEmailPayload(), ...pdfPayload }),
      })
      if (res.ok) {
        addToast({ type: 'success', title: 'Email sent', description: `Invoice email resent to ${invoice.customerSnapshot.email}` })
      } else {
        const errorText = await res.text().catch(() => 'Unknown error')
        console.error('Resend email failed:', errorText)
        addToast({ type: 'error', title: 'Failed to send email', description: 'Please try again later' })
      }
    } catch (err) {
      console.error('Failed to resend invoice email:', err)
      addToast({ type: 'error', title: 'Failed to send email', description: 'Please try again later' })
    } finally {
      setIsResending(false)
    }
  }

  const handleVoid = async () => {
    setIsVoiding(true)
    try {
      await voidInvoice({ id: invoice._id, businessId: invoice.businessId })
      setShowVoidConfirm(false)
    } finally {
      setIsVoiding(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await removeInvoice({ id: invoice._id, businessId: invoice.businessId })
      router.push(`/${locale}/invoices#sales-invoices`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDownloadPdf = async () => {
    await generatePdf(invoice.invoiceNumber, pdfData)
  }

  const handleDownloadLhdnPdf = async () => {
    // 001-einv-pdf-gen: Check for stored PDF first to avoid regeneration
    if (lhdnPdfUrl) {
      // Download stored PDF directly
      const link = document.createElement('a')
      link.href = lhdnPdfUrl
      link.download = `${invoice.invoiceNumber}-LHDN.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      // Fallback: generate PDF on-the-fly (for invoices validated before this feature)
      await generatePdf(`${invoice.invoiceNumber}-LHDN`, pdfData)
    }
  }

  const isLhdnValid = invoice.lhdnStatus === 'valid' && !!invoice.lhdnLongId

  // Build business info from profile for invoice templates
  const businessInfo = {
    companyName: resolvedBusinessName,
    companyAddress: businessProfile?.address || undefined,
    companyPhone: businessProfile?.contact_phone || undefined,
    companyEmail: businessProfile?.contact_email || undefined,
  }

  // Data bundle for @react-pdf/renderer
  const pdfData: PdfRenderData = {
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      customerSnapshot: invoice.customerSnapshot,
      lineItems: invoice.lineItems ?? [],
      subtotal: invoice.subtotal,
      totalDiscount: invoice.totalDiscount,
      totalTax: invoice.totalTax,
      totalAmount: invoice.totalAmount,
      balanceDue: invoice.balanceDue,
      amountPaid: invoice.amountPaid,
      currency: invoice.currency,
      taxMode: invoice.taxMode,
      notes: invoice.notes,
      paymentInstructions: invoice.paymentInstructions,
      paymentTerms: invoice.paymentTerms,
      signatureName: invoice.signatureName,
      status: invoice.status,
      lhdnLongId: invoice.lhdnLongId,
      lhdnQrDataUrl,
      lhdnDocumentUuid: invoice.lhdnDocumentUuid,
      lhdnValidatedAt: invoice.lhdnValidatedAt,
      lhdnStatus: invoice.lhdnStatus,
    },
    businessInfo,
    templateId: invoice.templateId,
  }

  return (
    <>
    <HeaderWithUser title="Invoice Details" subtitle="" />
    <main className="flex-1 overflow-auto p-card-padding pb-24 sm:pb-4">
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/invoices#sales-invoices`)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {invoice.invoiceNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              {invoice.customerSnapshot.businessName}
            </p>
          </div>
          <InvoiceStatusBadge status={invoice.status as SalesInvoiceStatus} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            PDF
          </Button>

          {isLhdnValid && (
            <>
              <Button
                size="sm"
                onClick={handleDownloadLhdnPdf}
                disabled={isGenerating}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-1" />
                )}
                Download E-Invoice (LHDN)
              </Button>
              <SendToBuyerButton
                invoiceId={invoice._id}
                businessId={invoice.businessId}
                buyerEmail={invoice.customerSnapshot?.email}
                disabled={isGenerating}
                onSuccess={() => window.location.reload()}
              />
            </>
          )}

          {isDraft && (
            <>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => router.push(`/${locale}/sales-invoices/${invoice._id}/edit`)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={isSending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Send
              </Button>
            </>
          )}

          {!isDraft && !isVoid && (
            <Button
              size="sm"
              onClick={handleResendEmail}
              disabled={isResending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isResending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4 mr-1" />
              )}
              Resend Email
            </Button>
          )}

          {!isVoid && !isPaid && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => router.push(`/${locale}/sales-invoices/${invoice._id}/payment`)}>
                <CreditCard className="h-4 w-4 mr-1" />
                Record Payment
              </Button>
          )}

          {!isVoid && !isPaid && (
            <Button
              size="sm"
              onClick={() => setShowVoidConfirm(true)}
              disabled={isVoiding}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isVoiding ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Ban className="h-4 w-4 mr-1" />
              )}
              Void
            </Button>
          )}

          {isDraft && (
            <Button
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* 001-einv-pdf-gen: LHDN Delivery Status */}
      {isLhdnValid && (
        <LhdnDeliveryStatus
          deliveryStatus={invoice.lhdnPdfDeliveryStatus}
          deliveredAt={invoice.lhdnPdfDeliveredAt}
          deliveredTo={invoice.lhdnPdfDeliveredTo}
          deliveryError={invoice.lhdnPdfDeliveryError}
        />
      )}

      {/* LHDN Rejected / Cancelled by Buyer — Review Required */}
      {(invoice as any).lhdnReviewRequired && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  LHDN e-Invoice {invoice.lhdnStatus === 'rejected' ? 'Rejected' : 'Cancelled'} by Buyer — Review Required
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(invoice as any).lhdnStatusReason
                    ? `Reason: ${(invoice as any).lhdnStatusReason}`
                    : 'The buyer has taken action on this e-invoice. Review the journal entry and take corrective action.'}
                </p>
                {invoice.lhdnStatus === 'rejected' && (invoice as any).lhdnRejectedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Rejected at: {formatBusinessDate(new Date((invoice as any).lhdnRejectedAt).toISOString().split('T')[0])}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Void Confirmation */}
      {showVoidConfirm && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-sm text-foreground font-medium mb-2">
              Are you sure you want to void this invoice?
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              This will cancel the invoice and reverse any associated accounting entries. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleVoid}
                disabled={isVoiding}
              >
                {isVoiding ? 'Voiding...' : 'Yes, Void Invoice'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowVoidConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-sm text-foreground font-medium mb-2">
              Are you sure you want to delete this draft invoice?
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              This will permanently delete the invoice. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice details sidebar + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Invoice Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice Date</span>
                <span className="font-medium text-foreground">
                  {formatBusinessDate(invoice.invoiceDate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due Date</span>
                <span className="font-medium text-foreground">
                  {formatBusinessDate(invoice.dueDate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currency</span>
                <span className="font-medium text-foreground">
                  {invoice.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax Mode</span>
                <span className="font-medium text-foreground capitalize">
                  {invoice.taxMode}
                </span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(invoice.subtotal, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium text-foreground">
                  {formatCurrency(invoice.totalTax, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">
                  {formatCurrency(invoice.totalAmount, invoice.currency)}
                </span>
              </div>
              {(invoice.amountPaid ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    -{formatCurrency(invoice.amountPaid, invoice.currency)}
                  </span>
                </div>
              )}
              <div className="border-t border-border pt-3 flex justify-between font-bold text-base">
                <span className="text-foreground">Balance Due</span>
                <span className="text-foreground">
                  {formatCurrency(invoice.balanceDue, invoice.currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Payment history */}
          <PaymentHistory
            invoiceId={invoice._id}
            currency={invoice.currency}
            invoiceStatus={invoice.status}
          />

          {/* LHDN e-Invoice section */}
          <LhdnDetailSection invoice={invoice} />

          {/* Peppol InvoiceNow — Coming Soon */}
          <PeppolTransmissionPanel />

          {/* Credit Notes section */}
          {!isDraft && !isVoid && invoice.einvoiceType !== 'credit_note' && (
            <>
              <CreditNoteList
                invoiceId={invoice._id}
                currency={invoice.currency}
              />

              {showCreditNoteForm ? (
                <CreditNoteForm
                  invoiceId={invoice._id}
                  businessId={invoice.businessId as string}
                  currency={invoice.currency}
                  maxAmount={netOutstanding?.netOutstanding ?? invoice.totalAmount}
                  originalLineItems={invoice.lineItems}
                  onClose={() => setShowCreditNoteForm(false)}
                  onSuccess={() => {
                    addToast({ type: 'success', title: 'Credit note created', description: 'Credit note saved as draft' })
                  }}
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreditNoteForm(true)}
                  className="w-full"
                >
                  Create Credit Note
                </Button>
              )}
            </>
          )}
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <InvoicePreview
            invoice={invoice as any}
            businessInfo={businessInfo}
            templateId={invoice.templateId}
            showActions={false}
          />
        </div>
      </div>
    </div>
    </main>
    </>
  )
}
