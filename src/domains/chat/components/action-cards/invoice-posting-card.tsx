'use client'

/**
 * Invoice Posting Card
 *
 * Renders OCR-extracted invoice data with a "Post to Accounting" button.
 * Posts confirmed invoices to accounting_entries via Convex mutation.
 */

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { FileText, Check, Loader2, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'
import { registerActionCard, type ActionCardProps } from './registry'

interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  totalAmount: number
}

interface InvoicePostingData {
  invoiceId: string
  vendorName: string
  amount: number
  currency: string
  invoiceDate: string
  invoiceNumber?: string
  dueDate?: string
  confidenceScore: number
  lineItems?: InvoiceLineItem[]
  status: 'ready' | 'posted' | 'failed'
}

type CardState = 'idle' | 'confirming' | 'posting' | 'posted' | 'failed'

function InvoicePostingCard({ action, isHistorical }: ActionCardProps) {
  const data = action.data as unknown as InvoicePostingData
  const [cardState, setCardState] = useState<CardState>(
    data.status === 'posted' ? 'posted' : 'idle'
  )
  const [errorMsg, setErrorMsg] = useState('')

  const createEntry = useMutation(api.functions.accountingEntries.create)

  const handlePost = async () => {
    setCardState('posting')
    setErrorMsg('')

    try {
      await createEntry({
        transactionType: 'Expense',
        originalAmount: data.amount,
        originalCurrency: data.currency,
        transactionDate: data.invoiceDate,
        vendorName: data.vendorName,
        referenceNumber: data.invoiceNumber,
        dueDate: data.dueDate,
        sourceRecordId: data.invoiceId,
        sourceDocumentType: 'invoice',
        createdByMethod: 'ocr',
        lineItems: data.lineItems?.map((item, idx) => ({
          itemDescription: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          currency: data.currency,
          lineOrder: idx + 1,
        })),
      })
      setCardState('posted')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to post invoice')
      setCardState('failed')
    }
  }

  if (!data?.invoiceId) return null

  const isResolved = cardState === 'posted' || (isHistorical && data.status === 'posted')
  const lowConfidence = data.confidenceScore < 0.7

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Invoice Posting</span>
        {data.invoiceNumber && (
          <span className="text-xs text-muted-foreground">#{data.invoiceNumber}</span>
        )}
        {isResolved && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
            Posted
          </span>
        )}
      </div>

      {/* Details */}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between mb-1.5">
          <div>
            <p className="text-xs font-medium text-foreground">{data.vendorName}</p>
            <p className="text-xs text-muted-foreground">
              {data.invoiceDate}
              {data.dueDate && ` · Due ${data.dueDate}`}
            </p>
          </div>
          <span className="text-sm font-semibold text-foreground">
            {formatCurrency(data.amount, data.currency)}
          </span>
        </div>

        {/* Low confidence warning */}
        {lowConfidence && !isResolved && (
          <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span>Low OCR confidence ({Math.round(data.confidenceScore * 100)}%) — review before posting</span>
          </div>
        )}

        {/* Line items */}
        {data.lineItems && data.lineItems.length > 0 && (
          <div className="mb-2 space-y-1">
            {data.lineItems.slice(0, 3).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground truncate mr-2">{item.description}</span>
                <span className="text-foreground font-medium flex-shrink-0">
                  {formatCurrency(item.totalAmount, data.currency)}
                </span>
              </div>
            ))}
            {data.lineItems.length > 3 && (
              <p className="text-xs text-muted-foreground">
                +{data.lineItems.length - 3} more items
              </p>
            )}
          </div>
        )}

        {/* Confidence badge */}
        {!lowConfidence && !isResolved && (
          <div className="mb-2">
            <span className="text-[10px] text-muted-foreground">
              OCR confidence: {Math.round(data.confidenceScore * 100)}%
            </span>
          </div>
        )}

        {/* Action buttons */}
        {!isHistorical && !isResolved && (
          <>
            {cardState === 'idle' && (
              <button
                onClick={() => setCardState('confirming')}
                className="w-full inline-flex items-center justify-center gap-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground transition-colors font-medium"
              >
                <Check className="w-3 h-3" /> Post to Accounting
              </button>
            )}

            {/* Inline confirmation */}
            {cardState === 'confirming' && (
              <div className="bg-muted/50 border border-border rounded p-2">
                <p className="text-xs text-foreground mb-2">
                  Post {formatCurrency(data.amount, data.currency)} from {data.vendorName} to accounting?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handlePost}
                    className="flex-1 text-xs px-3 py-1.5 rounded bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setCardState('idle')}
                    className="flex-1 text-xs px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Loading */}
            {cardState === 'posting' && (
              <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs">Posting to accounting...</span>
              </div>
            )}

            {/* Error with retry */}
            {cardState === 'failed' && (
              <div className="bg-destructive/10 border border-destructive/30 rounded p-2">
                <p className="text-xs text-destructive mb-1.5">{errorMsg}</p>
                <button
                  onClick={() => setCardState('idle')}
                  className="text-xs text-primary hover:text-primary/80 font-medium"
                >
                  Try again
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('invoice_posting', InvoicePostingCard)

export { InvoicePostingCard }
