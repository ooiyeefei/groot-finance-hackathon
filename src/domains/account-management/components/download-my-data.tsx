'use client'

/**
 * Download My Data — PDPA Right of Access
 * One-click personal data export across all businesses as a ZIP of CSVs.
 * Reuses existing export engine for CSV generation.
 */

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Download, Loader2, FileArchive, AlertCircle } from 'lucide-react'
import { generateFlatExport } from '@/domains/exports/lib/export-engine'

// Field definitions for each module's CSV export (simplified Generic format)
const PROFILE_COLUMNS = ['Email', 'Full Name', 'Currency', 'Timezone', 'Language', 'Account Created']

const EXPENSE_FIELDS = [
  { sourceField: 'transactionDate', targetColumn: 'Date', order: 1 },
  { sourceField: 'vendorName', targetColumn: 'Vendor', order: 2 },
  { sourceField: 'totalAmount', targetColumn: 'Amount', order: 3 },
  { sourceField: 'currency', targetColumn: 'Currency', order: 4 },
  { sourceField: 'expenseCategory', targetColumn: 'Category', order: 5 },
  { sourceField: 'description', targetColumn: 'Description', order: 6 },
  { sourceField: 'status', targetColumn: 'Status', order: 7 },
]

const INVOICE_FIELDS = [
  { sourceField: 'invoiceType', targetColumn: 'Type', order: 1 },
  { sourceField: 'invoiceNumber', targetColumn: 'Invoice #', order: 2 },
  { sourceField: 'invoiceDate', targetColumn: 'Date', order: 3 },
  { sourceField: 'entityName', targetColumn: 'Vendor/Customer', order: 4 },
  { sourceField: 'totalAmount', targetColumn: 'Amount', order: 5 },
  { sourceField: 'currency', targetColumn: 'Currency', order: 6 },
  { sourceField: 'status', targetColumn: 'Status', order: 7 },
]

const LEAVE_FIELDS = [
  { sourceField: 'startDate', targetColumn: 'Start Date', order: 1 },
  { sourceField: 'endDate', targetColumn: 'End Date', order: 2 },
  { sourceField: 'totalDays', targetColumn: 'Days', order: 3 },
  { sourceField: 'notes', targetColumn: 'Reason', order: 4 },
  { sourceField: 'status', targetColumn: 'Status', order: 5 },
]

const ACCOUNTING_FIELDS = [
  { sourceField: 'documentNumber', targetColumn: 'Document #', order: 1 },
  { sourceField: 'transactionDate', targetColumn: 'Date', order: 2 },
  { sourceField: 'description', targetColumn: 'Description', order: 3 },
  { sourceField: 'transactionType', targetColumn: 'Type', order: 4 },
  { sourceField: 'originalAmount', targetColumn: 'Amount', order: 5 },
  { sourceField: 'originalCurrency', targetColumn: 'Currency', order: 6 },
  { sourceField: 'status', targetColumn: 'Status', order: 7 },
]

function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '-')
}

export default function DownloadMyData() {
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const myData = useQuery(api.functions.exportJobs.getMyDataExport)

  const handleDownload = async () => {
    if (!myData || isExporting) return

    setIsExporting(true)
    setError(null)

    try {
      // Dynamic import JSZip only when needed
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const dateStr = new Date().toISOString().split('T')[0]
      const rootFolder = `groot-finance-my-data-${dateStr}`

      // Generate profile.csv
      const profileRow = [
        myData.profile.email || '',
        myData.profile.fullName || '',
        myData.profile.homeCurrency || '',
        myData.profile.timezone || '',
        myData.profile.language || '',
        myData.profile.createdAt || '',
      ]
      const profileCsv = PROFILE_COLUMNS.join(',') + '\n' + profileRow.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
      zip.file(`${rootFolder}/profile.csv`, profileCsv)

      // Generate per-business, per-module CSVs
      for (const business of myData.businesses.filter((b): b is NonNullable<typeof b> => b !== null)) {
        const folderName = sanitizeFolderName(business.businessName)
        const bizPath = `${rootFolder}/${folderName}`

        const modules = [
          { key: 'expense_claims', fields: EXPENSE_FIELDS, data: business.modules.expense_claims },
          { key: 'invoices', fields: INVOICE_FIELDS, data: business.modules.invoices },
          { key: 'leave_requests', fields: LEAVE_FIELDS, data: business.modules.leave_requests },
          { key: 'accounting_entries', fields: ACCOUNTING_FIELDS, data: business.modules.accounting_entries },
        ] as const

        for (const mod of modules) {
          if (mod.data && mod.data.length > 0) {
            const csv = generateFlatExport(
              mod.data as Record<string, unknown>[],
              mod.fields,
              ','
            )
            zip.file(`${bizPath}/${mod.key}.csv`, csv)
          }
        }
      }

      // Generate and download ZIP
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${rootFolder}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download My Data failed:', err)
      setError('Failed to generate export. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const hasData = myData && (
    myData.businesses.length > 0 ||
    myData.profile.email
  )

  const totalRecords = myData?.businesses.reduce((sum, biz) => {
    if (!biz) return sum
    return sum +
      (biz.modules.expense_claims?.length || 0) +
      (biz.modules.invoices?.length || 0) +
      (biz.modules.leave_requests?.length || 0) +
      (biz.modules.accounting_entries?.length || 0)
  }, 0) || 0

  return (
    <div className="border border-border rounded-lg p-4 bg-muted/30">
      <div className="flex items-start gap-3">
        <FileArchive className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-foreground">Download My Data</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Export all your personal data as a ZIP file containing CSV spreadsheets.
            {myData && totalRecords > 0 && (
              <span className="ml-1">
                ({totalRecords} records across {myData.businesses.length} business{myData.businesses.length !== 1 ? 'es' : ''})
              </span>
            )}
          </p>
          {error && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>
        <button
          onClick={handleDownload}
          disabled={isExporting || !hasData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              Download
            </>
          )}
        </button>
      </div>
    </div>
  )
}
