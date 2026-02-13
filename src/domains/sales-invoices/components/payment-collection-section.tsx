'use client'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PAYMENT_TERMS_LABELS, type PaymentTerms } from '../types'
import { formatBusinessDate } from '@/lib/utils'

interface PaymentCollectionSectionProps {
  invoiceDate: string
  onInvoiceDateChange: (date: string) => void
  paymentTerms: PaymentTerms
  onPaymentTermsChange: (terms: PaymentTerms) => void
  dueDate: string
  onDueDateChange: (date: string) => void
}

export function PaymentCollectionSection({
  invoiceDate,
  onInvoiceDateChange,
  paymentTerms,
  onPaymentTermsChange,
  dueDate,
  onDueDateChange,
}: PaymentCollectionSectionProps) {
  return (
    <div className="space-y-3">
      {/* Invoice Date */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Invoice date</label>
        <Input
          type="date"
          value={invoiceDate}
          onChange={(e) => onInvoiceDateChange(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {/* Payment Terms + Due Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment terms</label>
          <Select value={paymentTerms} onValueChange={(v) => onPaymentTermsChange(v as PaymentTerms)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAYMENT_TERMS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Due date</label>
          {paymentTerms === 'custom' ? (
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
              className="h-9 text-sm"
            />
          ) : (
            <div className="h-9 flex items-center px-3 text-sm text-muted-foreground bg-muted/50 rounded-md border border-border">
              {formatBusinessDate(dueDate)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
