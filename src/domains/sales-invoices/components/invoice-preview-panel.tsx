'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InvoicePreview } from './invoice-preview'
import { EmailPreview } from './email-preview'

interface InvoicePreviewPanelProps {
  invoiceData: {
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
      }>
      subtotal: number
      totalDiscount?: number
      totalTax: number
      totalAmount: number
      balanceDue: number
      currency: string
      taxMode: string
      notes?: string
      paymentInstructions?: string
      paymentTerms?: string
      signatureName?: string
      status: string
      footer?: string
      customFields?: Array<{ key: string; value: string }>
      showTaxId?: boolean
    }
    businessInfo?: {
      companyName?: string
      companyAddress?: string
      companyPhone?: string
      companyEmail?: string
      registrationNumber?: string
      taxId?: string
      logoUrl?: string
    }
    templateId: string
  }
  activeTab?: 'pdf' | 'email'
  onDownloadPdf?: () => void
}

export function InvoicePreviewPanel({
  invoiceData,
  activeTab: initialTab = 'pdf',
  onDownloadPdf,
}: InvoicePreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<'pdf' | 'email'>(initialTab)
  const { invoice, businessInfo, templateId } = invoiceData

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'pdf'
                ? 'bg-card text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Invoice PDF
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'email'
                ? 'bg-card text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Email
          </button>
        </div>

        {activeTab === 'pdf' && onDownloadPdf && (
          <Button variant="ghost" size="sm" onClick={onDownloadPdf} className="text-muted-foreground">
            <Download className="h-4 w-4 mr-1.5" />
            Download
          </Button>
        )}
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        {activeTab === 'pdf' ? (
          <div className="w-full [&_#invoice-template]:max-w-none [&_#invoice-template]:p-6 [&_#invoice-template]:text-[0.85em]">
            <InvoicePreview
              invoice={invoice}
              businessInfo={businessInfo}
              templateId={templateId}
              showActions={false}
            />
          </div>
        ) : (
          <EmailPreview
            recipientEmail={invoice.customerSnapshot.email}
            companyName={businessInfo?.companyName || ''}
            invoiceNumber={invoice.invoiceNumber}
            totalAmount={invoice.totalAmount}
            currency={invoice.currency}
            dueDate={invoice.dueDate}
            fromName={businessInfo?.companyName || ''}
            toName={invoice.customerSnapshot.businessName}
            lineItems={invoice.lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalAmount: item.totalAmount,
            }))}
            subtotal={invoice.subtotal}
            totalTax={invoice.totalTax}
          />
        )}
      </div>
    </div>
  )
}
