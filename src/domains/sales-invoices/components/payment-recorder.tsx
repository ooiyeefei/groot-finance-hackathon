'use client'

import { useState } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils/format-number'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useActiveBusiness } from '@/contexts/business-context'
import { PAYMENT_METHODS } from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

interface PaymentRecorderProps {
  invoiceId: string
  customerId: string
  balanceDue: number
  currency: string
  onSuccess?: () => void
  onCancel?: () => void
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
}

function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function PaymentRecorder({
  invoiceId,
  customerId,
  balanceDue,
  currency,
  onSuccess,
  onCancel,
}: PaymentRecorderProps) {
  const { businessId } = useActiveBusiness()
  const recordPayment = useMutation(api.functions.payments.recordPayment)

  const [amount, setAmount] = useState<string>('')
  const [date, setDate] = useState<string>(getTodayDateString())
  const [method, setMethod] = useState<string>('')
  const [reference, setReference] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedAmount = parseFloat(amount)
  const isAmountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= balanceDue
  const isFormValid = isAmountValid && date.length > 0

  const handleRecordFullPayment = () => {
    setAmount(balanceDue.toFixed(2))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid || !businessId) return

    setIsSubmitting(true)
    setError(null)

    try {
      await recordPayment({
        businessId: businessId as Id<'businesses'>,
        customerId: customerId as Id<'customers'>,
        amount: parsedAmount,
        currency,
        paymentDate: date,
        paymentMethod: (method || 'bank_transfer') as 'bank_transfer' | 'cash' | 'card' | 'cheque' | 'other',
        paymentReference: reference || undefined,
        allocations: [
          {
            invoiceId: invoiceId as Id<'sales_invoices'>,
            amount: parsedAmount,
          },
        ],
      })

      setShowSuccess(true)
      setTimeout(() => {
        onSuccess?.()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (showSuccess) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400 mb-4" />
          <p className="text-lg font-semibold text-foreground">Payment Recorded</p>
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(parsedAmount, currency)} has been applied to this invoice.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Record Payment</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Balance Due Display */}
        <div className="mb-6 rounded-lg bg-muted p-4 text-center">
          <p className="text-sm text-muted-foreground mb-1">Balance Due</p>
          <p className="text-2xl font-bold text-foreground">
            {formatCurrency(balanceDue, currency)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="payment-amount" className="text-foreground">
                Amount <span className="text-destructive">*</span>
              </Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={handleRecordFullPayment}
              >
                Record Full Payment
              </Button>
            </div>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={balanceDue}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            {amount && !isAmountValid && (
              <p className="text-sm text-destructive">
                {parsedAmount > balanceDue
                  ? `Amount cannot exceed ${formatCurrency(balanceDue, currency)}`
                  : 'Enter a valid amount greater than 0'}
              </p>
            )}
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="payment-date" className="text-foreground">
              Payment Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Method */}
          <div className="space-y-2">
            <Label htmlFor="payment-method" className="text-foreground">
              Payment Method
            </Label>
            <Select value={method || undefined} onValueChange={setMethod}>
              <SelectTrigger id="payment-method">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m] ?? m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference / Notes */}
          <div className="space-y-2">
            <Label htmlFor="payment-reference" className="text-foreground">
              Reference / Notes
            </Label>
            <Input
              id="payment-reference"
              type="text"
              placeholder="e.g. Transaction ID, cheque number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={!isFormValid || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recording...
                </>
              ) : (
                'Record Payment'
              )}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
