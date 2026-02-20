'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Send, Eye, Printer } from 'lucide-react'
import { ModernInvoiceTemplate } from './invoice-templates/template-modern'
import { ClassicInvoiceTemplate } from './invoice-templates/template-classic'

interface InvoicePreviewProps {
  invoice: {
    invoiceNumber: string
    invoiceDate: string
    dueDate: string
    customerSnapshot: {
      businessName: string
      contactPerson?: string
      email: string
      phone?: string
      address?: string
      taxId?: string
    }
    lineItems: Array<{
      description: string
      quantity: number
      unitPrice: number
      taxRate?: number
      taxAmount?: number
      discountAmount?: number
      totalAmount: number
      currency: string
      itemCode?: string
      unitMeasurement?: string
      itemNotes?: string
    }>
    subtotal: number
    totalDiscount?: number
    totalTax: number
    totalAmount: number
    balanceDue: number
    amountPaid?: number
    currency: string
    taxMode: string
    notes?: string
    paymentInstructions?: string
    paymentTerms?: string
    signatureName?: string
    status: string
  }
  businessInfo?: {
    companyName?: string
    companyAddress?: string
    companyPhone?: string
    companyEmail?: string
    registrationNumber?: string
    taxId?: string
    sstRegistrationNumber?: string
    logoUrl?: string
    paymentMethods?: Array<{
      id: string
      label: string
      enabled: boolean
      details?: string
      qrCodeUrl?: string
    }>
  }
  templateId?: string
  onSend?: () => void
  onDownloadPdf?: () => void
  showActions?: boolean
  isSending?: boolean
}

export function InvoicePreview({
  invoice,
  businessInfo,
  templateId = 'modern',
  onSend,
  onDownloadPdf,
  showActions = true,
  isSending = false,
}: InvoicePreviewProps) {
  const TemplateComponent = templateId === 'classic' ? ClassicInvoiceTemplate : ModernInvoiceTemplate

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-4">
      {showActions && (
        <div className="flex items-center gap-2 print:hidden">
          {onDownloadPdf && (
            <Button variant="outline" size="sm" onClick={onDownloadPdf}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          {onSend && invoice.status === 'draft' && (
            <Button size="sm" onClick={onSend} disabled={isSending} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Send className="w-4 h-4 mr-2" />
              {isSending ? 'Sending...' : 'Save & Send'}
            </Button>
          )}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg print:border-none print:shadow-none">
        <TemplateComponent invoice={invoice} businessInfo={businessInfo} />
      </div>
    </div>
  )
}
