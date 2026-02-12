'use client'

import { useCallback, useState } from 'react'

const PDF_OPTIONS = {
  margin: 10,
  image: { type: 'jpeg' as const, quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, letterRendering: true },
  jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
}

/**
 * Hook for generating PDFs from invoice templates using html2pdf.js
 * Uses dynamic import to avoid SSR issues (html2pdf.js uses window/document)
 */
export function useInvoicePdf() {
  const [isGenerating, setIsGenerating] = useState(false)

  const generatePdf = useCallback(async (
    invoiceNumber: string,
    options?: {
      elementId?: string
      margin?: number
    }
  ) => {
    setIsGenerating(true)

    try {
      const html2pdf = (await import('html2pdf.js')).default

      const element = document.getElementById(options?.elementId ?? 'invoice-template')
      if (!element) {
        throw new Error('Invoice template element not found')
      }

      const filename = `${invoiceNumber}.pdf`

      await html2pdf()
        .set({ ...PDF_OPTIONS, margin: options?.margin ?? PDF_OPTIONS.margin, filename })
        .from(element)
        .save()

      return { success: true, filename }
    } catch (error) {
      console.error('[useInvoicePdf] PDF generation failed:', error)
      return { success: false, error: String(error) }
    } finally {
      setIsGenerating(false)
    }
  }, [])

  /**
   * Generate PDF as a Blob (for email attachment, etc.)
   * Does not trigger download — returns the raw PDF data.
   */
  const generatePdfBlob = useCallback(async (
    invoiceNumber: string,
    options?: { elementId?: string; margin?: number }
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> => {
    try {
      const html2pdf = (await import('html2pdf.js')).default

      const element = document.getElementById(options?.elementId ?? 'invoice-template')
      if (!element) {
        throw new Error('Invoice template element not found')
      }

      const filename = `${invoiceNumber}.pdf`

      const blob: Blob = await html2pdf()
        .set({ ...PDF_OPTIONS, margin: options?.margin ?? PDF_OPTIONS.margin, filename })
        .from(element)
        .outputPdf('blob')

      return { success: true, blob, filename }
    } catch (error) {
      console.error('[useInvoicePdf] PDF blob generation failed:', error)
      return { success: false, error: String(error) }
    }
  }, [])

  return {
    generatePdf,
    generatePdfBlob,
    isGenerating,
  }
}
