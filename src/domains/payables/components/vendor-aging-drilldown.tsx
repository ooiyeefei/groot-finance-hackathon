'use client'

import { X, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'

interface DrilldownEntry {
  invoiceId: string
  referenceNumber?: string | null
  originalAmount: number
  originalCurrency: string
  homeCurrencyAmount: number
  paidAmount: number
  outstandingBalance: number
  transactionDate: string
  dueDate: string
  daysOverdue: number
  status: 'pending' | 'overdue'
  category?: string | null
  notes?: string | null
}

interface VendorAgingDrilldownProps {
  vendorName: string
  entries: DrilldownEntry[]
  isLoading: boolean
  onClose: () => void
  onRecordPayment: (invoiceId: string) => void
  currency?: string
}

export default function VendorAgingDrilldown({
  vendorName,
  entries,
  isLoading,
  onClose,
  onRecordPayment,
  currency = 'SGD',
}: VendorAgingDrilldownProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 transition-opacity"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(12px)' }}
        onClick={onClose}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div>
              <h3 className="text-base font-semibold text-foreground">{vendorName}</h3>
              <p className="text-xs text-muted-foreground">{entries.length} unpaid bill{entries.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No unpaid bills for this vendor
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Reference</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Outstanding</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Due Date</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.invoiceId} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="text-foreground">{entry.referenceNumber || '—'}</div>
                        <div className="text-xs text-muted-foreground">{formatBusinessDate(entry.transactionDate)}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-foreground">
                        {formatCurrency(entry.originalAmount, entry.originalCurrency)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-foreground">
                        {formatCurrency(entry.outstandingBalance, currency)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-foreground">
                        {entry.dueDate ? formatBusinessDate(entry.dueDate) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {entry.status === 'overdue' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400">
                            {entry.daysOverdue}d overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                            {Math.abs(entry.daysOverdue)}d remaining
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRecordPayment(entry.invoiceId)}
                        >
                          <CreditCard className="w-3 h-3" />
                          Pay
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
