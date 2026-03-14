'use client'

/**
 * Download My Data — PDPA Right of Access
 * One-click personal data export across all businesses as a ZIP of CSVs.
 * Fetches fresh data on EVERY click (not cached subscription).
 */

import { useState } from 'react'
import { useConvex } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Download, Loader2, AlertCircle } from 'lucide-react'
import { generateFlatExport } from '@/domains/exports/lib/export-engine'

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
  const convex = useConvex()

  const handleDownload = async () => {
    if (isExporting) return

    setIsExporting(true)
    setError(null)

    try {
      // Fetch FRESH data on every click (not cached)
      const myData = await convex.query(api.functions.exportJobs.getMyDataExport)

      if (!myData) {
        setError('Unable to fetch your data. Please try again.')
        return
      }

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
      let totalRecords = 0
      for (const business of myData.businesses.filter((b): b is NonNullable<typeof b> => b !== null)) {
        const folderName = sanitizeFolderName(business.businessName)
        const bizPath = `${rootFolder}/${folderName}`

        const modules = [
          { key: 'expense_claims', fields: EXPENSE_FIELDS, data: business.modules.expense_claims },
          { key: 'invoices', fields: INVOICE_FIELDS, data: business.modules.invoices },
          { key: 'leave_requests', fields: LEAVE_FIELDS, data: business.modules.leave_requests },
          { key: 'journal_entries', fields: ACCOUNTING_FIELDS, data: business.modules.journal_entries },
        ] as const

        for (const mod of modules) {
          if (mod.data && mod.data.length > 0) {
            totalRecords += mod.data.length
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

  return (
    <div>
      {error && (
        <div className="flex items-center gap-1.5 mb-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
      <button
        onClick={handleDownload}
        disabled={isExporting}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating export...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Download My Data
          </>
        )}
      </button>
    </div>
  )
}
