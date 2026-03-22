'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'
import { useAPCreditNoteMutation } from '@/domains/invoices/hooks/use-ap-adjustments'
import type { Id } from '../../../../convex/_generated/dataModel'

interface APCreditNoteFormProps {
  invoiceId: string
  businessId: string
  currency: string
  maxAmount: number
  onClose: () => void
  onSuccess?: () => void
}

interface LineItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  taxAmount: number
  totalAmount: number
}

export function APCreditNoteForm({
  invoiceId,
  businessId,
  currency,
  maxAmount,
  onClose,
  onSuccess,
}: APCreditNoteFormProps) {
  const { createCreditNote } = useAPCreditNoteMutation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, totalAmount: 0 },
  ])

  const totalAmount = lineItems.reduce((sum, item) => sum + item.totalAmount, 0)

  const updateLineItem = (index: number, updates: Partial<LineItem>) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const updated = { ...item, ...updates }
        const lineTotal = updated.quantity * updated.unitPrice
        const taxAmt = Math.round(lineTotal * (updated.taxRate / 100) * 100) / 100
        return {
          ...updated,
          taxAmount: taxAmt,
          totalAmount: Math.round((lineTotal + taxAmt) * 100) / 100,
        }
      })
    )
  }

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, totalAmount: 0 },
    ])
  }

  const handleSubmit = async () => {
    setError(null)

    if (!reason.trim()) {
      setError('Credit note reason is required')
      return
    }

    if (lineItems.length === 0) {
      setError('At least one line item is required')
      return
    }

    if (totalAmount <= 0) {
      setError('Credit note total must be greater than 0')
      return
    }

    if (totalAmount > maxAmount) {
      setError(`Credit note total (${formatCurrency(totalAmount, currency)}) exceeds remaining creditable amount (${formatCurrency(maxAmount, currency)})`)
      return
    }

    setIsSubmitting(true)
    try {
      await createCreditNote({
        originalInvoiceId: invoiceId as Id<"invoices">,
        businessId: businessId as Id<"businesses">,
        lineItems: lineItems.map((item, idx) => ({
          lineOrder: idx + 1,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          taxRate: item.taxRate || undefined,
          taxAmount: item.taxAmount || undefined,
          currency,
        })),
        creditNoteReason: reason,
        notes: notes || undefined,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create AP credit note')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground">
            Create AP Credit Note
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Reduce amount payable to supplier. Max creditable: {formatCurrency(maxAmount, currency)}
        </p>

        {error && (
          <div className="p-2.5 rounded-md bg-destructive/5 border border-destructive/20">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-foreground text-sm">Reason *</Label>
          <Input
            placeholder="e.g., Goods returned to supplier, pricing error..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="bg-input border-border text-foreground"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-foreground text-sm">Line Items</Label>
          {lineItems.map((item, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateLineItem(index, { description: e.target.value })}
                  className="bg-input border-border text-foreground text-sm"
                />
              </div>
              <div className="w-16">
                <Input
                  type="number"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, { quantity: parseFloat(e.target.value) || 0 })}
                  className="bg-input border-border text-foreground text-sm"
                  min={0}
                  step={1}
                />
              </div>
              <div className="w-24">
                <Input
                  type="number"
                  placeholder="Price"
                  value={item.unitPrice}
                  onChange={(e) => updateLineItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                  className="bg-input border-border text-foreground text-sm"
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="w-20 text-right text-sm text-foreground pt-2">
                {formatCurrency(item.totalAmount, currency)}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeLineItem(index)}
                className="text-destructive shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addLineItem} className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Line Item
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-foreground text-sm">Notes (optional)</Label>
          <Input
            placeholder="Additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-input border-border text-foreground"
          />
        </div>

        <div className="border-t border-border pt-3 flex justify-between font-semibold">
          <span className="text-foreground">Credit Note Total</span>
          <span className="text-foreground">{formatCurrency(totalAmount, currency)}</span>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Credit Note'
            )}
          </Button>
          <Button size="sm" onClick={onClose} disabled={isSubmitting}
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
