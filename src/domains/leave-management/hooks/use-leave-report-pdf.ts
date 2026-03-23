'use client';

import { useState, useCallback, createElement } from 'react';

export function useLeaveReportPdf() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePdf = useCallback(async (
    reportType: string,
    data: any,
    businessName: string,
  ) => {
    setIsGenerating(true);
    try {
      const [{ pdf }, { LeaveReportPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/leave-report-pdf-document'),
      ]);

      const element = createElement(LeaveReportPdfDocument, {
        reportType,
        data,
        businessName,
      });

      const blob = await (pdf as any)(element).toBlob();

      // Trigger download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leave-${reportType}-report-${data.year || 'report'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      return { success: true };
    } catch (error) {
      console.error('[useLeaveReportPdf] PDF generation failed:', error);
      return { success: false, error: String(error) };
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { generatePdf, isGenerating };
}
