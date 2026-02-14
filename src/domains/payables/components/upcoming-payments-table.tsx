'use client'

import { CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'

interface UpcomingPayment {
  entryId: string
  vendorId?: string
  vendorName: string
  originalAmount: number
  originalCurrency: string
  homeCurrencyAmount: number
  outstandingBalance: number
  dueDate: string
  daysRemaining: number
  status: 'pending' | 'overdue'
  referenceNumber?: string
}

interface UpcomingPaymentsTableProps {
  payments: UpcomingPayment[]
  periodDays: 7 | 14 | 30
  onPeriodChange: (days: 7 | 14 | 30) => void
  isLoading: boolean
  onRecordPayment: (entryId: string) => void
  currency?: string
}

const periodOptions: { value: 7 | 14 | 30; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
]

export default function UpcomingPaymentsTable({
  payments,
  periodDays,
  onPeriodChange,
  isLoading,
  onRecordPayment,
  currency = 'SGD',
}: UpcomingPaymentsTableProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Upcoming Payments</h3>
        <div className="flex gap-1">
          {periodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onPeriodChange(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                periodDays === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No payments due in the next {periodDays} days
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Vendor</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Due Date</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Days</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.entryId} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="text-foreground font-medium">{payment.vendorName}</div>
                    {payment.referenceNumber && (
                      <div className="text-xs text-muted-foreground">{payment.referenceNumber}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="text-foreground font-medium">
                      {formatCurrency(payment.outstandingBalance, currency)}
                    </div>
                    {payment.originalCurrency !== currency && (
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(payment.originalAmount, payment.originalCurrency)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center text-foreground">
                    {formatBusinessDate(payment.dueDate)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {payment.daysRemaining < 0 ? (
                      <span className="text-destructive font-medium">
                        {Math.abs(payment.daysRemaining)}d overdue
                      </span>
                    ) : payment.daysRemaining === 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Due today</span>
                    ) : (
                      <span className="text-muted-foreground">{payment.daysRemaining}d</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRecordPayment(payment.entryId)}
                    >
                      <CreditCard className="w-3 h-3" />
                      Pay
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
