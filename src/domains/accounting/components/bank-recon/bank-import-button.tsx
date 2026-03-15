'use client'

import { useState, useCallback } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import { CsvImportModal } from '@/lib/csv-parser/components/csv-import-modal'
import type { CsvImportResult } from '@/lib/csv-parser/types'
import { Upload } from 'lucide-react'

interface BankImportButtonProps {
  businessId: Id<'businesses'>
  bankAccountId: Id<'bank_accounts'>
  onImportComplete: (summary: { imported: number; duplicatesSkipped: number }) => void
}

export default function BankImportButton({
  businessId,
  bankAccountId,
  onImportComplete,
}: BankImportButtonProps) {
  const [showImportModal, setShowImportModal] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const createSession = useMutation(api.functions.bankImportSessions.create)
  const importBatch = useMutation(api.functions.bankTransactions.importBatch)

  const handleImportComplete = useCallback(async (result: CsvImportResult) => {
    if (!result.rows || result.rows.length === 0) {
      setShowImportModal(false)
      return
    }

    setIsImporting(true)

    try {
      // Transform mapped rows to bank transaction format
      const transactions = result.rows.map((row) => ({
        transactionDate: String(row.transactionDate ?? ''),
        description: String(row.description ?? ''),
        debitAmount: row.debitAmount ? Number(row.debitAmount) : undefined,
        creditAmount: row.creditAmount ? Number(row.creditAmount) : undefined,
        balance: row.balance ? Number(row.balance) : undefined,
        reference: row.reference ? String(row.reference) : undefined,
        transactionType: row.transactionType ? String(row.transactionType) : undefined,
      })).filter((tx) => tx.transactionDate && tx.description)

      // Find date range
      const dates = transactions.map((t) => t.transactionDate).sort()
      const dateRange = {
        from: dates[0] ?? '',
        to: dates[dates.length - 1] ?? '',
      }

      // Create import session
      const sessionId = await createSession({
        businessId,
        bankAccountId,
        fileName: result.sourceFileName ?? 'bank-statement.csv',
        rowCount: transactions.length,
        duplicatesSkipped: 0,
        dateRange,
      })

      // Import transactions in batches of 100
      const batchSize = 100
      let totalImported = 0
      let totalDuplicates = 0

      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize)
        const batchResult = await importBatch({
          businessId,
          bankAccountId,
          importSessionId: sessionId,
          transactions: batch,
        })
        totalImported += batchResult.imported
        totalDuplicates += batchResult.duplicatesSkipped
      }

      setShowImportModal(false)
      onImportComplete({ imported: totalImported, duplicatesSkipped: totalDuplicates })
    } catch (err) {
      console.error('Import failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Import failed'
      alert(errorMessage)
    } finally {
      setIsImporting(false)
    }
  }, [businessId, bankAccountId, createSession, importBatch, onImportComplete])

  return (
    <>
      <button
        onClick={() => setShowImportModal(true)}
        disabled={isImporting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50"
      >
        <Upload className="w-3.5 h-3.5" />
        {isImporting ? 'Importing...' : 'Import Statement'}
      </button>

      <CsvImportModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        schemaType="bank_statement"
        onComplete={handleImportComplete}
        onCancel={() => setShowImportModal(false)}
      />
    </>
  )
}
