'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface StockAdjustmentFormProps {
  businessId: Id<"businesses">
  catalogItemId: Id<"catalog_items">
  locationId: Id<"inventory_locations">
  itemName: string
  locationName: string
  currentQty: number
  onClose: () => void
}

export function StockAdjustmentForm({
  businessId,
  catalogItemId,
  locationId,
  itemName,
  locationName,
  currentQty,
  onClose,
}: StockAdjustmentFormProps) {
  const [quantity, setQuantity] = useState(0)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const adjust = useMutation(api.functions.inventoryMovements.adjust)

  const newQty = currentQty + quantity

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (quantity === 0 || !notes.trim()) return

    setSaving(true)
    try {
      await adjust({
        businessId,
        catalogItemId,
        locationId,
        quantity,
        notes: notes.trim(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Stock Adjustment</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-foreground font-medium">{itemName}</p>
            <p className="text-xs text-muted-foreground">{locationName}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">Current</Label>
              <p className="text-foreground text-lg font-semibold">{currentQty}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Adjustment</Label>
              <Input
                type="number"
                className="bg-input border-border text-foreground"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                placeholder="+5 or -3"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">New Qty</Label>
              <p className={`text-lg font-semibold ${newQty < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                {newQty}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Reason *</Label>
            <Textarea
              className="bg-input border-border text-foreground"
              placeholder="e.g., Damaged in transit, Stocktake correction, Samples given away"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={saving || quantity === 0 || !notes.trim()}
            >
              {saving ? 'Adjusting...' : 'Confirm Adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
