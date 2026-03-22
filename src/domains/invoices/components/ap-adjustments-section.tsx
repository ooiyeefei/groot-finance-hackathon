'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { useAPAdjustments, useNetPayableAmount } from '@/domains/invoices/hooks/use-ap-adjustments'

interface APAdjustmentsSectionProps {
  invoiceId: string
  currency: string
}

/**
 * 032-credit-debit-note: Shows all adjustment documents (credit + debit notes)
 * for an AP invoice, with net payable calculation.
 */
export function APAdjustmentsSection({ invoiceId, currency }: APAdjustmentsSectionProps) {
  const { adjustments, isLoading } = useAPAdjustments(invoiceId)
  const netAmount = useNetPayableAmount(invoiceId)

  if (isLoading || adjustments.length === 0) return null

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Adjustments ({adjustments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {adjustments.map((adj) => {
          const isCredit = adj.einvoiceType === 'credit_note' || adj.einvoiceType === 'refund_note'
          const isDebit = adj.einvoiceType === 'debit_note'

          return (
            <div
              key={adj._id}
              className="flex items-center justify-between p-2.5 rounded-md border border-border"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">
                    {adj.invoiceNumber}
                  </p>
                  {isCredit && (
                    <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 text-[10px] px-1.5 py-0">
                      CN
                    </Badge>
                  )}
                  {isDebit && (
                    <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-[10px] px-1.5 py-0">
                      DN
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {adj.creditNoteReason}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBusinessDate(
                    new Date(adj._creationTime).toISOString().split('T')[0]
                  )}
                </p>
              </div>
              <div className="text-right space-y-1">
                <p className={`text-sm font-medium ${isCredit ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {isCredit ? '-' : '+'}{formatCurrency(adj.totalAmount, currency)}
                </p>
                {adj.lhdnStatus && (
                  <Badge className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0">
                    LHDN: {adj.lhdnStatus}
                  </Badge>
                )}
              </div>
            </div>
          )
        })}

        {netAmount && (
          <div className="border-t border-border pt-2 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Original Amount</span>
              <span>{formatCurrency(netAmount.originalAmount, currency)}</span>
            </div>
            {netAmount.totalCredited > 0 && (
              <div className="flex justify-between text-red-600 dark:text-red-400">
                <span>Total Credited</span>
                <span>-{formatCurrency(netAmount.totalCredited, currency)}</span>
              </div>
            )}
            {netAmount.totalDebited > 0 && (
              <div className="flex justify-between text-blue-600 dark:text-blue-400">
                <span>Total Debited</span>
                <span>+{formatCurrency(netAmount.totalDebited, currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground">
              <span>Net Payable</span>
              <span>{formatCurrency(netAmount.netPayable, currency)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
