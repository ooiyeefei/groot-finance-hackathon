'use client'

import { useState, useEffect } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { X, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format-number'
import { usePaymentRecorder } from '../hooks/use-payment-recorder'
import { PAYMENT_METHODS_ENUM } from '@/lib/constants/statuses'
import type { Id } from '../../../../convex/_generated/dataModel'

interface PaymentRecorderDialogProps {
  invoiceId: string | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  card: 'Card',
  other: 'Other',
}

export default function PaymentRecorderDialog({
  invoiceId,
  isOpen,
  onClose,
  onSuccess,
}: PaymentRecorderDialogProps) {
  const { recordPayment, isRecording, error, clearError } = usePaymentRecorder()

  const invoice = useQuery(
    api.functions.invoices.getById,
    invoiceId ? { id: invoiceId } : "skip"
  )

  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [notes, setNotes] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Extract data from invoice
  const extracted = (invoice as any)?.extractedData || {}
  const vendorName = extracted.vendor_name?.value || extracted.vendor_name || extracted.vendorName || 'Unknown'
  const invoiceNumber = extracted.invoice_number?.value || extracted.invoice_number || ''
  const currency = extracted.currency?.value || extracted.currency || (invoice as any)?.homeCurrency || 'MYR'

  // Calculate outstanding from journal entry totalDebit - paidAmount
  const totalAmount = (invoice as any)?.journalEntryId ? (extracted.total_amount?.value || extracted.total_amount || 0) : 0
  const paidAmount = (invoice as any)?.paidAmount ?? 0
  const outstanding = totalAmount - paidAmount

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen && invoice) {
      setAmount(outstanding > 0 ? outstanding.toFixed(2) : '0.00')
      setPaymentDate(new Date().toISOString().split('T')[0])
      setPaymentMethod('bank_transfer')
      setNotes('')
      setValidationError(null)
      clearError()
    }
  }, [isOpen, invoice])

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isRecording) onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, isRecording])

  if (!isOpen) return null

  const parsedAmount = parseFloat(amount)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (!invoiceId || !invoice) return

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError('Amount must be greater than 0')
      return
    }
    if (parsedAmount > outstanding + 0.01) {
      setValidationError(`Amount cannot exceed outstanding balance (${formatCurrency(outstanding, currency)})`)
      return
    }
    if (!paymentDate) {
      setValidationError('Payment date is required')
      return
    }

    try {
      await recordPayment(invoiceId, parsedAmount, paymentDate, paymentMethod, notes || undefined)
      onSuccess?.()
      onClose()
    } catch {
      // Error handled by hook
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 transition-opacity"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(12px)' }}
        onClick={!isRecording ? onClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-md flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-base font-semibold text-foreground">Record Payment</h3>
            <button
              onClick={onClose}
              disabled={isRecording}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Invoice context */}
            {invoice && (
              <div className="bg-muted rounded-md p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="text-foreground font-medium">{vendorName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="text-foreground">{formatCurrency(totalAmount, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Outstanding</span>
                  <span className="text-foreground font-semibold">{formatCurrency(outstanding, currency)}</span>
                </div>
                {invoiceNumber && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Invoice #</span>
                    <span className="text-foreground">{invoiceNumber}</span>
                  </div>
                )}
              </div>
            )}

            {/* Error display */}
            {(validationError || error) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 text-sm text-red-600 dark:text-red-400">
                {validationError || error}
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Payment Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={outstanding}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                disabled={isRecording}
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Payment Date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                disabled={isRecording}
              />
            </div>

            {/* Method */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
                disabled={isRecording}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes..."
                className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm resize-none"
                disabled={isRecording}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" className="bg-secondary hover:bg-secondary/80 text-secondary-foreground" onClick={onClose} disabled={isRecording}>
                Cancel
              </Button>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isRecording}>
                {isRecording ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Record Payment
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
