'use client'

import { useCallback, useState } from 'react'

const PDF_OPTIONS = {
  margin: [15, 10, 15, 10] as [number, number, number, number], // [top, left, bottom, right] mm
  image: { type: 'jpeg' as const, quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, letterRendering: true },
  jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
  pagebreak: { mode: ['css', 'legacy'] as string[] },
}

/**
 * Clone the target element into an off-screen container so html2canvas
 * captures from a clean position — immune to viewport scroll offset
 * and parent `overflow: hidden` clipping.
 */
function cloneOffScreen(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('id')
  Object.assign(clone.style, {
    position: 'absolute',
    left: '-9999px',
    top: '0',
    width: `${source.scrollWidth}px`,
    overflow: 'visible',
  })
  document.body.appendChild(clone)
  return clone
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
    let clone: HTMLElement | null = null

    try {
      const html2pdf = (await import('html2pdf.js')).default

      const source = document.getElementById(options?.elementId ?? 'invoice-template')
      if (!source) {
        throw new Error('Invoice template element not found')
      }

      clone = cloneOffScreen(source)
      const filename = `${invoiceNumber}.pdf`

      await html2pdf()
        .set({ ...PDF_OPTIONS, margin: options?.margin ?? PDF_OPTIONS.margin, filename })
        .from(clone)
        .save()

      return { success: true, filename }
    } catch (error) {
      console.error('[useInvoicePdf] PDF generation failed:', error)
      return { success: false, error: String(error) }
    } finally {
      clone?.remove()
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
    let clone: HTMLElement | null = null

    try {
      const html2pdf = (await import('html2pdf.js')).default

      const source = document.getElementById(options?.elementId ?? 'invoice-template')
      if (!source) {
        throw new Error('Invoice template element not found')
      }

      clone = cloneOffScreen(source)
      const filename = `${invoiceNumber}.pdf`

      const blob: Blob = await html2pdf()
        .set({ ...PDF_OPTIONS, margin: options?.margin ?? PDF_OPTIONS.margin, filename })
        .from(clone)
        .outputPdf('blob')

      return { success: true, blob, filename }
    } catch (error) {
      console.error('[useInvoicePdf] PDF blob generation failed:', error)
      return { success: false, error: String(error) }
    } finally {
      clone?.remove()
    }
  }, [])

  return {
    generatePdf,
    generatePdfBlob,
    isGenerating,
  }
}
