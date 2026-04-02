/**
 * Formatted Expense Report Component
 * Displays expense report in claim form layout matching CHL ELECTRICAL ENTERPRISE format
 */

'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Printer, Download, AlertTriangle } from 'lucide-react'
import { useRef, useState, useMemo } from 'react'

// Enhanced report interfaces (matching API)
interface CategoryLineItem {
  date: string
  description: string
  amount: number
  referenceNumber?: string
  claimId: string
  vendor: string
  duplicateStatus?: string
  duplicateOverrideReason?: string
  isSplitExpense?: boolean
}

interface CategorySection {
  categoryName: string
  categoryId: string
  accountingCategory: string
  lineItems: CategoryLineItem[]
  subtotal: number
  currency: string
}

interface EnhancedReportHeader {
  businessName: string
  reportTitle: string
  employeeName: string
  employeeDesignation: string
  reportMonth: string
  approvedBy?: string
  generatedDate: string
}

interface FormattedExpenseReport {
  header: EnhancedReportHeader
  categorySections: CategorySection[]
  summary: {
    totalAmount: number
    totalClaims: number
    currency: string
    statusBreakdown: {
      approved: number
      submitted: number
      rejected: number
      reimbursed: number
    }
  }
  metadata: {
    reportScope: string
    generatedAt: string
    dataAsOf: string
  }
}

interface FormattedExpenseReportProps {
  reportData: FormattedExpenseReport
}

/**
 * Detect duplicates using DB-sourced duplicateStatus + client-side fallback.
 * Client-side fallback catches historical claims that don't have duplicateStatus
 * set in the DB (e.g., claims created before the duplicate detection pipeline).
 *
 * Client-side detection (Tier 1/2):
 * - Tier 1: Same reference number (exact receipt number match)
 * - Tier 2: Same vendor + same date + same amount
 */
function detectDuplicates(sections: CategorySection[]): Set<string> {
  const flagged = new Set<string>()

  // Collect all line items across sections for cross-category comparison
  const allItems: CategoryLineItem[] = []
  for (const section of sections) {
    allItems.push(...section.lineItems)
  }

  // Pass 1: DB-sourced duplicateStatus (authoritative when present)
  for (const item of allItems) {
    if (item.duplicateStatus && item.duplicateStatus !== 'none') {
      flagged.add(item.claimId)
    }
  }

  // Pass 2: Client-side fallback for items without DB duplicateStatus
  // Only applies to items that weren't already flagged by the DB
  const unflaggedItems = allItems.filter(item => !flagged.has(item.claimId))

  // Tier 1: Same reference number
  const refMap = new Map<string, CategoryLineItem[]>()
  for (const item of allItems) {
    if (item.referenceNumber) {
      const key = item.referenceNumber.trim()
      if (!refMap.has(key)) refMap.set(key, [])
      refMap.get(key)!.push(item)
    }
  }
  for (const [, group] of refMap) {
    if (group.length >= 2) {
      for (const item of group) flagged.add(item.claimId)
    }
  }

  // Tier 2: Same vendor + same date + same amount (for unflagged items)
  const vendorDateAmountMap = new Map<string, CategoryLineItem[]>()
  for (const item of unflaggedItems) {
    if (item.vendor && item.amount && item.date) {
      const key = `${item.vendor.toLowerCase().trim()}|${item.date}|${item.amount}`
      if (!vendorDateAmountMap.has(key)) vendorDateAmountMap.set(key, [])
      vendorDateAmountMap.get(key)!.push(item)
    }
  }
  for (const [, group] of vendorDateAmountMap) {
    if (group.length >= 2) {
      for (const item of group) flagged.add(item.claimId)
    }
  }

  return flagged
}

export default function FormattedExpenseReport({ reportData }: FormattedExpenseReportProps) {
  const { header, categorySections, summary } = reportData
  const reportRef = useRef<HTMLDivElement>(null)
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)

  // Detect duplicates: DB-sourced duplicateStatus + client-side fallback for historical claims
  const duplicateSet = useMemo(() => detectDuplicates(categorySections), [categorySections])
  const duplicateCount = duplicateSet.size

  const handlePrint = () => {
    window.print()
  }

  const handleSavePDF = async () => {
    if (!reportRef.current) return

    setIsGeneratingPDF(true)
    const reportElement = reportRef.current

    // Temporarily add a class to apply PDF-specific styles
    reportElement.classList.add('pdf-export')

    try {
      // Dynamically import html2pdf to avoid SSR issues
      const html2pdf = (await import('html2pdf.js')).default

      // Configure PDF options for high-quality, single-page output
      const options = {
        margin: 0, // Margins are controlled by CSS padding now
        filename: `${header.businessName}-${header.reportTitle}-${header.reportMonth}.pdf`,
        image: { type: 'png' as const, quality: 1.0 },
        html2canvas: {
          scale: 3, // Higher resolution for crisp text (3x pixel density)
          useCORS: true,
          letterRendering: true,
          allowTaint: false,
          scrollX: 0,
          scrollY: 0,
          dpi: 300, // High DPI for print quality
          backgroundColor: '#ffffff',
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait' as const,
          compress: true,
          putOnlyUsedFonts: true,
        },
      }

      // Generate and save PDF
      await html2pdf().set(options).from(reportElement).save()
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      // IMPORTANT: Clean up by removing the class after generation
      reportElement.classList.remove('pdf-export')
      setIsGeneratingPDF(false)
    }
  }

  return (
    <>
      {/* Print-friendly styles */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-area, .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          .print-break {
            page-break-before: always;
          }
          table {
            page-break-inside: avoid;
          }
          tr {
            page-break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        }

        /* PDF Export Styles - Applied only during PDF generation */
        .pdf-export {
          /* A4 paper is 210mm wide. We use this width and let height be auto. */
          width: 210mm;
          padding: 12mm; /* Balanced margins for readability */
          box-sizing: border-box;

          /* Override component styles for PDF context */
          max-width: none !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;

          /* Balanced base font size for readability and fitting */
          font-size: 11px; /* Readable size with good fitting */
          line-height: 1.3; /* Balanced line spacing */
          color: #000000; /* Ensure pure black text for clarity */
        }

        /* Remove CardContent padding, as the container's padding now serves as the page margin */
        .pdf-export .p-8 {
          padding: 0 !important;
        }

        .pdf-export .print:shadow-none {
          box-shadow: none !important;
        }

        .pdf-export .print:border-0 {
          border: none !important;
        }

        /* Balanced table styles for readability */
        .pdf-export table {
          font-size: 9pt; /* Readable table font size */
          font-weight: 400; /* Regular weight for clarity */
          border-collapse: collapse;
        }
        .pdf-export th,
        .pdf-export td {
          padding: 3px 6px; /* Balanced cell padding */
          line-height: 1.2; /* Proper line spacing */
        }
        .pdf-export th {
          font-weight: 600; /* Semi-bold headers */
        }

        /* Balanced vertical spacing */
        .pdf-export .space-y-3 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 0.5rem !important;
        }
        .pdf-export .space-y-4 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 0.6rem !important;
        }
        .pdf-export .space-y-6 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 0.8rem !important;
        }
        .pdf-export .mt-8 {
          margin-top: 1rem !important;
        }

        /* Balanced signature line heights */
        .pdf-export .h-8 {
          height: 1.5rem !important;
        }

        /* Balanced text sizes */
        .pdf-export .text-2xl {
          font-size: 1.25rem !important;
        }
        .pdf-export .text-lg {
          font-size: 1.1rem !important;
        }
        .pdf-export .text-sm {
          font-size: 0.8rem !important;
        }
        .pdf-export .text-xs {
          font-size: 0.7rem !important;
        }

        /* Balanced padding */
        .pdf-export .pb-6 {
          padding-bottom: 0.8rem !important;
        }
        .pdf-export .pt-4 {
          padding-top: 0.5rem !important;
        }
        .pdf-export .py-3 {
          padding-top: 0.4rem !important;
          padding-bottom: 0.4rem !important;
        }
        .pdf-export .px-2 {
          padding-left: 0.4rem !important;
          padding-right: 0.4rem !important;
        }

        /* Balanced gaps */
        .pdf-export .gap-8 {
          gap: 1rem !important;
        }
        .pdf-export .gap-4 {
          gap: 0.6rem !important;
        }
        .pdf-export .gap-3 {
          gap: 0.4rem !important;
        }

        /* Keep borders at reasonable thickness */
        .pdf-export .border-b-2 {
          border-bottom-width: 1.5px !important;
        }
        .pdf-export .border-t-2 {
          border-top-width: 1.5px !important;
        }
      `}</style>

      <div className="space-y-4">
        {/* Action Buttons */}
        <div className="flex justify-end gap-3 no-print">
          <button
            onClick={handlePrint}
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={handleSavePDF}
            disabled={isGeneratingPDF}
            className="bg-primary hover:bg-primary/90 disabled:bg-primary/50 disabled:cursor-not-allowed text-primary-foreground px-4 py-2 rounded-lg inline-flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            {isGeneratingPDF ? 'Generating PDF...' : 'Save as PDF'}
          </button>
        </div>

        <Card ref={reportRef} className="bg-white border-gray-300 max-w-4xl mx-auto print:shadow-none print:border-0 print-area">
          <CardContent className="p-4 sm:p-8 space-y-6 print:p-6">
        {/* Duplicate Warning Banner */}
        {duplicateCount > 0 && (
          <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-red-800 text-lg">
                ⚠️ {duplicateCount} Potential Duplicate{duplicateCount > 1 ? 's' : ''} Detected
              </h3>
              <p className="text-red-700 text-sm mt-1">
                The system has identified expense claims with identical reference numbers or matching vendor, date, and amount.
                Duplicate rows are highlighted in red below. Please review before processing reimbursement.
              </p>
            </div>
          </div>
        )}

        {/* Report Header - Business Style */}
        <div className="text-center space-y-3 border-b-2 border-gray-800 pb-6">
          <h1 className="text-2xl font-bold text-gray-900 tracking-wide">
            {header.businessName}
          </h1>
          <h2 className="text-lg font-semibold text-gray-700">
            {header.reportTitle}
          </h2>
        </div>

        {/* Employee Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex">
              <span className="font-semibold text-gray-900 w-24">NAME</span>
              <span className="mx-2">:</span>
              <span className="text-gray-700 border-b border-gray-400 flex-1 pb-1">
                {header.employeeName}
              </span>
            </div>
            <div className="flex">
              <span className="font-semibold text-gray-900 w-24">DESIGNATION</span>
              <span className="mx-2">:</span>
              <span className="text-gray-700 border-b border-gray-400 flex-1 pb-1">
                {header.employeeDesignation}
              </span>
            </div>
            <div className="flex">
              <span className="font-semibold text-gray-900 w-24">APPROVED BY</span>
              <span className="mx-2">:</span>
              <span className="text-gray-700 border-b border-gray-400 flex-1 pb-1">
                {header.approvedBy || ''}
              </span>
            </div>
          </div>
        </div>

        {/* Expense Table — breaks out of card padding on mobile for max width */}
        <div className="-mx-4 sm:mx-0 border-y-2 sm:border-2 border-gray-800 overflow-x-auto print:mx-0 print:border-2">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="border-r border-gray-800 px-1 sm:px-2 py-2 sm:py-3 text-left font-bold w-[7%]">No.</th>
                <th className="border-r border-gray-800 px-1 sm:px-2 py-2 sm:py-3 text-left font-bold w-[14%]">Date</th>
                <th className="border-r border-gray-800 px-1 sm:px-2 py-2 sm:py-3 text-left font-bold">Particulars</th>
                <th className="border-r border-gray-800 px-1 sm:px-2 py-2 sm:py-3 text-right font-bold w-[16%]">Amount ({summary.currency})</th>
                <th className="px-1 sm:px-2 py-2 sm:py-3 text-right font-bold w-[16%]">Total ({summary.currency})</th>
              </tr>
            </thead>
            <tbody>
              {categorySections.map((category, categoryIndex) => (
                <React.Fragment key={category.categoryId}>
                  {/* Category Header Row */}
                  <tr className="bg-gray-50">
                    <td className="border-r border-gray-400 px-1 sm:px-2 py-2"></td>
                    <td className="border-r border-gray-400 px-1 sm:px-2 py-2"></td>
                    <td className="border-r border-gray-400 px-1 sm:px-2 py-2 font-bold text-gray-900">
                      {category.categoryName.toUpperCase()}
                    </td>
                    <td className="border-r border-gray-400 px-1 sm:px-2 py-2"></td>
                    <td className="px-1 sm:px-2 py-2"></td>
                  </tr>

                  {/* Category Line Items */}
                  {category.lineItems.map((item, itemIndex) => {
                    const isDuplicate = duplicateSet.has(item.claimId)

                    return (
                    <tr
                      key={item.claimId}
                      className={`border-b border-gray-300 ${
                        isDuplicate
                          ? 'bg-red-100 border-l-4 border-l-red-600'
                          : ''
                      }`}
                    >
                      <td className="border-r border-gray-400 px-1 sm:px-2 py-2 text-center whitespace-nowrap">
                        {categoryIndex + 1}.{itemIndex + 1}
                      </td>
                      <td className="border-r border-gray-400 px-1 sm:px-2 py-2 whitespace-nowrap">
                        {item.date}
                      </td>
                      <td className="border-r border-gray-400 px-1 sm:px-2 py-2 break-words">
                        <div>
                          <div className="font-medium">{item.description}</div>
                          {item.vendor && (
                            <div className="text-gray-600 text-xs mt-1">{item.vendor}</div>
                          )}
                          {item.referenceNumber && (
                            <div className={`text-xs ${isDuplicate ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
                              Ref: {item.referenceNumber}
                            </div>
                          )}
                          {isDuplicate && (
                            <div className="text-red-700 text-xs font-medium mt-1">
                              ⚠️ {item.isSplitExpense ? 'SPLIT EXPENSE' : item.duplicateStatus === 'confirmed' ? 'CONFIRMED DUPLICATE' : 'POTENTIAL DUPLICATE'}
                              {item.duplicateOverrideReason && (
                                <span className="text-red-600 font-normal"> — Justification: {item.duplicateOverrideReason}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`border-r border-gray-400 px-1 sm:px-2 py-2 text-right whitespace-nowrap ${isDuplicate ? 'text-red-700 font-semibold' : ''}`}>
                        {item.amount.toFixed(2)}
                      </td>
                      <td className="px-1 sm:px-2 py-2"></td>
                    </tr>
                    )
                  })}

                  {/* Category Subtotal Row */}
                  <tr className="bg-gray-100 border-b-2 border-gray-400">
                    <td className="border-r border-gray-400 px-1 sm:px-2 py-2"></td>
                    <td className="border-r border-gray-400 px-1 sm:px-2 py-2"></td>
                    <td className="border-r border-gray-400 px-1 sm:px-2 py-2"></td>
                    <td className="border-r border-gray-400 px-1 sm:px-2 py-2"></td>
                    <td className="px-1 sm:px-2 py-2 text-right font-bold whitespace-nowrap">
                      {category.subtotal.toFixed(2)}
                    </td>
                  </tr>
                </React.Fragment>
              ))}

              {/* Grand Total Row */}
              <tr className="border-t-2 border-gray-800 bg-gray-100">
                <td className="border-r border-gray-800 px-1 sm:px-2 py-3"></td>
                <td className="border-r border-gray-800 px-1 sm:px-2 py-3"></td>
                <td className="border-r border-gray-800 px-1 sm:px-2 py-3 text-center font-bold">
                  TOTAL
                </td>
                <td className="border-r border-gray-800 px-1 sm:px-2 py-3 text-right font-bold whitespace-nowrap">
                  {summary.totalAmount.toFixed(2)}
                </td>
                <td className="px-1 sm:px-2 py-3 text-right font-bold text-base sm:text-lg whitespace-nowrap">
                  {summary.totalAmount.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Usage Labels */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="text-center">
            <div className="font-bold border-t-2 border-gray-800 pt-2">
              FOR CLAIMANT USE
            </div>
          </div>
          <div className="text-center">
            <div className="font-bold border-t-2 border-gray-800 pt-2">
              FOR ACCOUNTS USE
            </div>
          </div>
        </div>

        {/* Signature Sections */}
        <div className="grid grid-cols-2 gap-8 text-sm mt-8">
          <div className="space-y-4">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">Claimed by</div>
                <div className="border-b border-gray-400 w-full h-8 mt-2"></div>
              </div>
            </div>
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">Date</div>
                <div className="border-b border-gray-400 w-full h-8 mt-2"></div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">Received by</div>
                <div className="border-b border-gray-400 w-full h-8 mt-2"></div>
              </div>
            </div>
            <div className="flex justify-between">
              <div>
                <div className="font-semibold">Date</div>
                <div className="border-b border-gray-400 w-full h-8 mt-2"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Section */}
        <div className="border-t-2 border-gray-800 pt-4">
          <div className="text-center font-bold text-sm mb-4">FOR ADMIN USE</div>
          <div className="grid grid-cols-2 gap-8 text-sm">
            <div>
              <div className="font-semibold">Verified by</div>
              <div className="border-b border-gray-400 w-full h-8 mt-2"></div>
            </div>
            <div>
              <div className="font-semibold">Approved by</div>
              <div className="border-b border-gray-400 w-full h-8 mt-2"></div>
            </div>
          </div>
        </div>

        {/* Report Metadata Footer */}
        <div className="border-t border-gray-300 pt-4 text-gray-500 text-xs space-y-1">
          <p>Report generated on: {header.generatedDate}</p>
          <p>Report scope: {reportData.metadata.reportScope.replace(/_/g, ' ')}</p>
          <p>Data as of: {reportData.metadata.dataAsOf}</p>

          {/* Summary Stats */}
          <div className="flex flex-wrap gap-4 mt-2">
            <Badge variant="outline" className="text-green-600 dark:text-green-400 border-green-500/30">
              Approved: {summary.statusBreakdown.approved + summary.statusBreakdown.reimbursed} claims
            </Badge>
            <Badge variant="outline" className="text-yellow-600 dark:text-yellow-400 border-yellow-500/30">
              Submitted: {summary.statusBreakdown.submitted} claims
            </Badge>
            <Badge variant="outline" className="text-red-600 dark:text-red-400 border-red-500/30">
              Rejected: {summary.statusBreakdown.rejected} claims
            </Badge>
            {duplicateCount > 0 && (
              <Badge variant="outline" className="text-red-600 dark:text-red-400 border-red-500/50 bg-red-50 font-semibold">
                ⚠️ {duplicateCount} Potential Duplicate{duplicateCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

// React import for Fragment
import React from 'react'