'use client'

import { useCallback, useState, createElement } from 'react'
import type { PdfInvoiceData, PdfBusinessInfo } from '../components/invoice-templates/pdf-document'

export interface PdfRenderData {
  invoice: PdfInvoiceData
  businessInfo?: PdfBusinessInfo
  templateId?: string
}

/**
 * Hook for generating invoice PDFs with @react-pdf/renderer.
 *
 * Produces real vector PDFs — no DOM capture, no scroll offset issues,
 * no parent overflow clipping.
 */
export function useInvoicePdf() {
  const [isGenerating, setIsGenerating] = useState(false)

  /**
   * Render the PDF React element to a Blob.
   * Uses dynamic import so @react-pdf/renderer is only loaded client-side.
   */
  const renderToBlob = useCallback(async (data: PdfRenderData): Promise<Blob> => {
    const [{ pdf }, { InvoicePdfDocument }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('../components/invoice-templates/pdf-document'),
    ])

    const element = createElement(InvoicePdfDocument, {
      invoice: data.invoice,
      businessInfo: data.businessInfo,
      templateId: data.templateId,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf() accepts any React element rendering a <Document>
    return await pdf(element as any).toBlob()
  }, [])

  /**
   * Generate PDF and trigger browser download.
   */
  const generatePdf = useCallback(async (
    invoiceNumber: string,
    data: PdfRenderData,
  ) => {
    setIsGenerating(true)

    try {
      const blob = await renderToBlob(data)
      const filename = `${invoiceNumber}.pdf`

      // Trigger browser download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { success: true, filename }
    } catch (error) {
      console.error('[useInvoicePdf] PDF generation failed:', error)
      return { success: false, error: String(error) }
    } finally {
      setIsGenerating(false)
    }
  }, [renderToBlob])

  /**
   * Generate PDF as a Blob (for email attachment, storage upload, etc.)
   * Does not trigger download.
   */
  const generatePdfBlob = useCallback(async (
    invoiceNumber: string,
    data: PdfRenderData,
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> => {
    try {
      const blob = await renderToBlob(data)
      const filename = `${invoiceNumber}.pdf`
      return { success: true, blob, filename }
    } catch (error) {
      console.error('[useInvoicePdf] PDF blob generation failed:', error)
      return { success: false, error: String(error) }
    }
  }, [renderToBlob])

  return {
    generatePdf,
    generatePdfBlob,
    isGenerating,
  }
}
