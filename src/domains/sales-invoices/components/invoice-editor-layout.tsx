'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useActiveBusiness, useBusinessProfile } from '@/contexts/business-context'
import { useSalesInvoiceForm } from '../hooks/use-sales-invoice-form'
import { useSalesInvoiceMutations, useNextInvoiceNumber, useInvoiceTemplateMutations, useCustomInvoiceTemplates } from '../hooks/use-sales-invoices'
import { useInvoicePdf, type PdfRenderData } from '../hooks/use-invoice-pdf'
import { InvoiceEditorHeader } from './invoice-editor-header'
import { InvoiceFormPanel } from './invoice-form-panel'
import { InvoicePreviewPanel } from './invoice-preview-panel'
import { ReviewInvoiceView } from './review-invoice-view'
import type { PaymentTerms, SalesInvoiceFormInput } from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

interface InvoiceEditorLayoutProps {
  mode: 'create' | 'edit'
  invoiceId?: string
  initialData?: SalesInvoiceFormInput
}

export function InvoiceEditorLayout({ mode, invoiceId, initialData }: InvoiceEditorLayoutProps) {
  const router = useRouter()
  const locale = useLocale()
  const { businessId, business } = useActiveBusiness()
  const { profile: businessProfile } = useBusinessProfile()

  const invoiceSettings = (business as unknown as Record<string, unknown>)?.invoiceSettings as Record<string, unknown> | undefined

  const { createInvoice, updateInvoice, sendInvoice, generateUploadUrl, storePdfStorageId } = useSalesInvoiceMutations()
  const nextInvoiceNumber = useNextInvoiceNumber()
  const { generatePdf, generatePdfBlob } = useInvoicePdf()
  const { customNoteTemplates, customPaymentTemplates } = useCustomInvoiceTemplates()
  const { addTemplate, deleteTemplate } = useInvoiceTemplateMutations()

  // Auto-save handler
  const handleAutoSave = useCallback(async (data: SalesInvoiceFormInput): Promise<string | void> => {
    if (!businessId) return
    try {
      if (mode === 'edit' && invoiceId) {
        await updateInvoice({
          id: invoiceId as Id<'sales_invoices'>,
          businessId: businessId as Id<'businesses'>,
          customerId: data.customerId as Id<'customers'> | undefined,
          customerSnapshot: data.customerSnapshot,
          lineItems: data.lineItems,
          currency: data.currency,
          taxMode: data.taxMode,
          invoiceDate: data.invoiceDate,
          paymentTerms: data.paymentTerms,
          dueDate: data.dueDate,
          notes: data.notes,
          paymentInstructions: data.paymentInstructions,
          templateId: data.templateId,
          signatureName: data.signatureName,
          invoiceDiscountType: data.invoiceDiscountType,
          invoiceDiscountValue: data.invoiceDiscountValue,
          footer: data.footer,
          customFields: data.customFields,
          showTaxId: data.showTaxId,
        })
        return invoiceId
      } else {
        const newId = await createInvoice({
          businessId: businessId as Id<'businesses'>,
          customerId: data.customerId as Id<'customers'> | undefined,
          customerSnapshot: data.customerSnapshot,
          lineItems: data.lineItems,
          currency: data.currency,
          taxMode: data.taxMode,
          invoiceDate: data.invoiceDate,
          paymentTerms: data.paymentTerms,
          dueDate: data.dueDate,
          notes: data.notes,
          paymentInstructions: data.paymentInstructions,
          templateId: data.templateId,
          signatureName: data.signatureName,
          invoiceDiscountType: data.invoiceDiscountType,
          invoiceDiscountValue: data.invoiceDiscountValue,
          footer: data.footer,
          customFields: data.customFields,
          showTaxId: data.showTaxId,
        })
        return newId
      }
    } catch {
      // Auto-save failures are non-blocking
    }
  }, [businessId, mode, invoiceId, createInvoice, updateInvoice])

  const form = useSalesInvoiceForm({
    defaultCurrency: (invoiceSettings?.defaultCurrency as string) ?? (business as unknown as Record<string, unknown>)?.homeCurrency as string ?? 'SGD',
    defaultPaymentTerms: (invoiceSettings?.defaultPaymentTerms as PaymentTerms) ?? 'net_30',
    defaultPaymentInstructions: invoiceSettings?.defaultPaymentInstructions as string,
    defaultTemplateId: (invoiceSettings?.selectedTemplate as string) ?? 'modern',
    initialData,
    invoiceId,
    onAutoSave: handleAutoSave,
  })

  // UI state
  const [isPreviewVisible, setIsPreviewVisible] = useState(true)
  const [isReviewMode, setIsReviewMode] = useState(false)
  const [isSending, setIsSending] = useState(false)

  // Build business info for preview
  const businessInfo = businessProfile ? {
    companyName: businessProfile.name,
    companyAddress: businessProfile.address || undefined,
    companyPhone: businessProfile.contact_phone || undefined,
    companyEmail: businessProfile.contact_email || undefined,
  } : undefined

  // Build preview data
  const previewInvoice = {
    invoiceNumber: nextInvoiceNumber ?? 'INV-XXXX-XXX',
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate,
    customerSnapshot: form.customerSnapshot,
    lineItems: form.lineItems,
    subtotal: form.totals.subtotal,
    totalDiscount: form.totals.totalDiscount,
    totalTax: form.totals.totalTax,
    totalAmount: form.totals.totalAmount,
    balanceDue: form.totals.totalAmount,
    currency: form.currency,
    taxMode: form.taxMode,
    notes: form.notes,
    paymentInstructions: form.paymentInstructions,
    paymentTerms: form.paymentTerms,
    signatureName: form.signatureName,
    status: 'draft',
    footer: form.footer,
    customFields: form.customFields,
    showTaxId: form.showTaxId,
  }

  // PDF data builder
  const buildPdfData = useCallback((): PdfRenderData => ({
    invoice: previewInvoice,
    businessInfo,
    templateId: form.templateId,
  }), [previewInvoice, businessInfo, form.templateId])

  const handleClose = useCallback(() => {
    router.push(`/${locale}/invoices#sales-invoices`)
  }, [router, locale])

  const handleSendInvoice = useCallback(async () => {
    if (!businessId || !form.isValid) return
    setIsSending(true)
    try {
      let currentInvoiceId = form.draftId ?? invoiceId

      // Create if not yet saved
      if (!currentInvoiceId) {
        currentInvoiceId = await createInvoice({
          businessId: businessId as Id<'businesses'>,
          customerId: form.getFormData().customerId as Id<'customers'> | undefined,
          customerSnapshot: form.getFormData().customerSnapshot,
          lineItems: form.getFormData().lineItems,
          currency: form.getFormData().currency,
          taxMode: form.getFormData().taxMode,
          invoiceDate: form.getFormData().invoiceDate,
          paymentTerms: form.getFormData().paymentTerms,
          dueDate: form.getFormData().dueDate,
          notes: form.getFormData().notes,
          paymentInstructions: form.getFormData().paymentInstructions,
          templateId: form.getFormData().templateId,
          signatureName: form.getFormData().signatureName,
          invoiceDiscountType: form.getFormData().invoiceDiscountType,
          invoiceDiscountValue: form.getFormData().invoiceDiscountValue,
          footer: form.getFormData().footer,
          customFields: form.getFormData().customFields,
          showTaxId: form.getFormData().showTaxId,
        })
      }

      // Generate PDF blob for email attachment + Convex storage
      const invoiceNum = nextInvoiceNumber ?? 'INV-XXXX-XXX'
      let pdfPayload: Record<string, unknown> = {}
      try {
        const pdfResult = await generatePdfBlob(invoiceNum, buildPdfData())
        if (pdfResult.success && pdfResult.blob) {
          // Convert to base64 for email attachment
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve((reader.result as string).split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(pdfResult.blob!)
          })
          pdfPayload = { pdfAttachment: { content: base64, filename: pdfResult.filename! } }

          // Also upload to Convex storage (fire-and-forget)
          generateUploadUrl().then(async (uploadUrl) => {
            const uploadResponse = await fetch(uploadUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/pdf' },
              body: pdfResult.blob,
            })
            if (uploadResponse.ok) {
              const { storageId } = await uploadResponse.json()
              await storePdfStorageId({
                id: currentInvoiceId as Id<'sales_invoices'>,
                businessId: businessId as Id<'businesses'>,
                storageId,
              })
            }
          }).catch(() => {})
        }
      } catch {
        // PDF generation failure is non-blocking
      }

      // Send
      await sendInvoice({
        id: currentInvoiceId as Id<'sales_invoices'>,
        businessId: businessId as Id<'businesses'>,
      })

      // Send email with PDF attachment
      const resolvedBusinessName = businessProfile?.name || (business as unknown as Record<string, unknown>)?.businessName as string || 'Our Company'
      try {
        await fetch(`/api/v1/sales-invoices/${currentInvoiceId}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: form.customerSnapshot.email,
            recipientName: form.customerSnapshot.contactPerson || form.customerSnapshot.businessName,
            invoiceNumber: invoiceNum,
            invoiceDate: form.invoiceDate,
            dueDate: form.dueDate,
            totalAmount: form.totals.totalAmount,
            currency: form.currency,
            balanceDue: form.totals.totalAmount,
            subtotal: form.totals.subtotal,
            totalTax: form.totals.totalTax,
            paymentInstructions: form.paymentInstructions,
            businessName: resolvedBusinessName,
            businessAddress: businessProfile?.address || undefined,
            businessPhone: businessProfile?.contact_phone || undefined,
            businessEmail: businessProfile?.contact_email || undefined,
            lineItems: form.lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.totalAmount,
            })),
            viewUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/${locale}/sales-invoices/${currentInvoiceId}`,
            ...pdfPayload,
          }),
        })
      } catch {
        // Email failure is non-blocking
      }

      router.push(`/${locale}/invoices#sales-invoices`)
    } catch (error) {
      console.error('Failed to send invoice:', error)
    } finally {
      setIsSending(false)
    }
  }, [businessId, form, invoiceId, nextInvoiceNumber, createInvoice, sendInvoice, generatePdfBlob, buildPdfData, generateUploadUrl, storePdfStorageId, businessProfile, business, router, locale])

  const handleDraftCreated = useCallback((newInvoiceId: string) => {
    // Navigate to edit URL if in create mode and draft was auto-saved
    // This keeps URL in sync with the actual invoice ID
  }, [])

  // Review mode
  if (isReviewMode) {
    return (
      <ReviewInvoiceView
        invoiceData={previewInvoice}
        businessInfo={businessInfo}
        onSendInvoice={handleSendInvoice}
        onBackToEdit={() => setIsReviewMode(false)}
        isSending={isSending}
      />
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <InvoiceEditorHeader
        mode={mode}
        lastSavedAt={form.lastSavedAt ?? undefined}
        isSaving={form.isSaving}
        isPreviewVisible={isPreviewVisible}
        onTogglePreview={() => setIsPreviewVisible(!isPreviewVisible)}
        onReviewInvoice={() => setIsReviewMode(true)}
        onClose={handleClose}
        isValid={form.isValid}
      />

      {/* Split panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Form panel */}
        <div className={`overflow-y-auto ${isPreviewVisible ? 'w-1/2' : 'w-full'} border-r border-border transition-all`}>
          <InvoiceFormPanel
            form={form}
            businessSettings={invoiceSettings as Record<string, unknown>}
            onDraftCreated={handleDraftCreated}
            customNoteTemplates={customNoteTemplates}
            customPaymentTemplates={customPaymentTemplates}
            onAddTemplate={async (type, label, text) => {
              if (!businessId) return
              await addTemplate({
                businessId: businessId as Id<'businesses'>,
                templateType: type,
                label,
                text,
              })
            }}
            onDeleteTemplate={async (type, templateId) => {
              if (!businessId) return
              await deleteTemplate({
                businessId: businessId as Id<'businesses'>,
                templateType: type,
                templateId,
              })
            }}
          />
        </div>

        {/* Right: Preview panel */}
        {isPreviewVisible && (
          <div className="w-1/2 overflow-y-auto hidden md:block">
            <InvoicePreviewPanel
              invoiceData={{
                invoice: previewInvoice,
                businessInfo,
                templateId: form.templateId,
              }}
              activeTab="pdf"
              onDownloadPdf={() => generatePdf(previewInvoice.invoiceNumber, buildPdfData())}
            />
          </div>
        )}
      </div>
    </div>
  )
}
