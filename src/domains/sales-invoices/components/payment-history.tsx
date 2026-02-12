'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ConfirmationDialog from '@/components/ui/confirmation-dialog'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { usePaymentsByInvoice } from '../hooks/use-sales-invoices'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

interface PaymentHistoryProps {
  invoiceId: string
  currency: string
  invoiceStatus?: string
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  other: 'Other',
}

export function PaymentHistory({ invoiceId, currency, invoiceStatus }: PaymentHistoryProps) {
  const { businessId } = useActiveBusiness()
  const { payments, isLoading } = usePaymentsByInvoice(invoiceId)
  const recordReversal = useMutation(api.functions.payments.recordReversal)
  const [isExpanded, setIsExpanded] = useState(false)
  const [reversingId, setReversingId] = useState<string | null>(null)
  const [isReversing, setIsReversing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReversal = async () => {
    if (!reversingId || !businessId) return
    setIsReversing(true)
    setError(null)
    try {
      await recordReversal({
        businessId: businessId as Id<"businesses">,
        originalPaymentId: reversingId as Id<"payments">,
      })
      setReversingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reverse payment')
    } finally {
      setIsReversing(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  // Build a set of payment IDs that have been reversed
  const reversedPaymentIds = new Set(
    payments
      .filter((p) => p.type === 'reversal' && p.reversesPaymentId)
      .map((p) => p.reversesPaymentId)
  )

  if (payments.length === 0) return null

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Payment History ({payments.length})
            </CardTitle>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-0">
            {error && (
              <p className="text-sm text-destructive mb-3">{error}</p>
            )}
            <div className="divide-y divide-border">
              {payments.map((payment) => (
                <div key={payment._id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {formatCurrency(payment.allocatedAmount, currency)}
                        </span>
                        <Badge
                          variant={payment.type === 'reversal' ? 'destructive' : 'default'}
                          className="text-xs"
                        >
                          {payment.type === 'reversal' ? 'Reversal' : 'Payment'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-x-2">
                        <span>{formatBusinessDate(payment.paymentDate)}</span>
                        {payment.paymentMethod && (
                          <span>• {PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}</span>
                        )}
                        {payment.paymentReference && (
                          <span>• Ref: {payment.paymentReference}</span>
                        )}
                      </div>
                    </div>
                    {payment.type === 'payment' && !reversedPaymentIds.has(payment._id) && invoiceStatus !== 'void' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => setReversingId(payment._id)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reverse
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <ConfirmationDialog
        isOpen={!!reversingId}
        onClose={() => setReversingId(null)}
        onConfirm={handleReversal}
        title="Reverse Payment"
        message="This will create a reversal entry and restore the invoice balance. This action cannot be undone."
        confirmText={isReversing ? 'Reversing...' : 'Confirm Reversal'}
        cancelText="Cancel"
        confirmVariant="danger"
        isLoading={isReversing}
      />
    </>
  )
}
