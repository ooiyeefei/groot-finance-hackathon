'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, Pencil, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { ItemDetailForm } from './item-detail-form'
import type { LineItem, TaxMode } from '../types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InvoiceLineItemsTableProps {
  lineItems: LineItem[]
  onUpdateItem: (index: number, updates: Partial<LineItem>) => void
  onRemoveItem: (index: number) => void
  onAddItem: () => void
  currency: string
  taxMode: TaxMode
  onAddCatalogItem?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InvoiceLineItemsTable({
  lineItems,
  onUpdateItem,
  onRemoveItem,
  onAddItem,
  currency,
  taxMode,
  onAddCatalogItem,
}: InvoiceLineItemsTableProps) {
  // Index of item currently being edited. null = none editing.
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  // Snapshot of item before editing — used for cancel/restore
  const [editSnapshot, setEditSnapshot] = useState<LineItem | null>(null)

  const canRemove = lineItems.length > 1

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleFieldChange = useCallback(
    (index: number, field: keyof LineItem, rawValue: string) => {
      const numericFields: Array<keyof LineItem> = [
        'quantity',
        'unitPrice',
        'taxRate',
      ]

      if (numericFields.includes(field)) {
        const parsed = parseFloat(rawValue)
        if (field === 'taxRate') {
          onUpdateItem(index, {
            [field]: isNaN(parsed) ? 0 : parsed / 100,
          })
        } else {
          onUpdateItem(index, {
            [field]: isNaN(parsed) ? 0 : parsed,
          })
        }
      } else {
        onUpdateItem(index, { [field]: rawValue })
      }
    },
    [onUpdateItem],
  )

  const handleStartEdit = useCallback(
    (index: number) => {
      setEditSnapshot({ ...lineItems[index] })
      setEditingIndex(index)
    },
    [lineItems],
  )

  const handleCancelEdit = useCallback(() => {
    // Restore from snapshot if we have one
    if (editingIndex !== null && editSnapshot) {
      onUpdateItem(editingIndex, editSnapshot)
    }
    setEditingIndex(null)
    setEditSnapshot(null)
  }, [editingIndex, editSnapshot, onUpdateItem])

  const handleSave = useCallback(() => {
    setEditingIndex(null)
    setEditSnapshot(null)
  }, [])

  const handleSaveAndAddAnother = useCallback(() => {
    setEditingIndex(null)
    setEditSnapshot(null)
    onAddItem()
    // The new item will be at the end — auto-open it for editing
    setTimeout(() => {
      setEditingIndex(lineItems.length)
      setEditSnapshot(null)
    }, 0)
  }, [onAddItem, lineItems.length])

  const handleAddItem = useCallback(() => {
    onAddItem()
    // Auto-open editing for the new item
    setTimeout(() => {
      setEditingIndex(lineItems.length)
      setEditSnapshot(null)
    }, 0)
  }, [onAddItem, lineItems.length])

  const handleRemoveItem = useCallback(
    (index: number) => {
      if (editingIndex === index) {
        setEditingIndex(null)
        setEditSnapshot(null)
      } else if (editingIndex !== null && index < editingIndex) {
        setEditingIndex(editingIndex - 1)
      }
      onRemoveItem(index)
    },
    [editingIndex, onRemoveItem],
  )

  const isEditing = editingIndex !== null

  // -----------------------------------------------------------------------
  // Summary row — compact read-only view for saved items
  // -----------------------------------------------------------------------

  const renderSummaryRow = (item: LineItem, index: number) => {
    const isDimmed = isEditing && editingIndex !== index
    const taxPercent =
      item.taxRate != null && item.taxRate > 0
        ? ` + ${Math.round(item.taxRate * 100)}% tax`
        : ''

    return (
      <div
        key={index}
        className={`group flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-opacity ${
          isDimmed ? 'opacity-40' : ''
        }`}
      >
        {/* Item info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {item.description || 'Untitled item'}
            </span>
            {item.itemCode && (
              <span className="text-xs text-muted-foreground shrink-0">
                ({item.itemCode})
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatCurrency(item.unitPrice, currency)} × {item.quantity || 1}
            {taxPercent}
            {item.supplyDateStart && item.supplyDateEnd && (
              <span className="ml-2">
                · {formatBusinessDate(item.supplyDateStart)} – {formatBusinessDate(item.supplyDateEnd)}
              </span>
            )}
          </div>
        </div>

        {/* Total */}
        <div className="text-sm font-medium text-foreground whitespace-nowrap tabular-nums">
          {formatCurrency(item.totalAmount, currency)}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleStartEdit(index)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Edit item"
            disabled={isEditing}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canRemove || isEditing}
            onClick={() => handleRemoveItem(index)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            title="Remove item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Editing card — Stripe-style focused item editor
  // -----------------------------------------------------------------------

  const renderEditingCard = (item: LineItem, index: number) => {
    const totalDisplay = item.unitPrice > 0
      ? `${formatCurrency(item.unitPrice, currency)} × ${item.quantity || 1} = ${formatCurrency(item.totalAmount, currency)}`
      : null

    return (
      <div
        key={index}
        className="border-2 border-primary/30 bg-card rounded-lg shadow-sm mx-0 my-1"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Item details</h3>
          {totalDisplay && (
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              {totalDisplay}
            </span>
          )}
        </div>

        {/* Fields */}
        <div className="p-4 space-y-4">
          {/* Row 1: Item description + Qty */}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                Item
              </Label>
              <Input
                value={item.description}
                onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                placeholder="Enter an item name or description"
                className="h-9 text-sm bg-background border-border"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                Qty
              </Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={item.quantity || ''}
                onChange={(e) => handleFieldChange(index, 'quantity', e.target.value)}
                placeholder="1"
                className="h-9 text-sm text-right bg-background border-border"
              />
            </div>
          </div>

          {/* Row 2: Price + Item Code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                Price
              </Label>
              <Input
                type="number"
                min={0}
                step="any"
                value={item.unitPrice || ''}
                onChange={(e) => handleFieldChange(index, 'unitPrice', e.target.value)}
                placeholder="0.00"
                className="h-9 text-sm bg-background border-border"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                Item code (optional)
              </Label>
              <Input
                value={item.itemCode || ''}
                onChange={(e) => handleFieldChange(index, 'itemCode', e.target.value)}
                placeholder="SKU / code"
                className="h-9 text-sm bg-background border-border"
              />
            </div>
          </div>

          {/* Item options (collapsible advanced options) */}
          <ItemDetailForm
            item={item}
            index={index}
            currency={currency}
            onUpdate={onUpdateItem}
          />
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30 rounded-b-lg">
          <div className="flex items-center gap-2">
            {canRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveItem(index)}
                className="text-destructive hover:text-destructive text-xs"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="text-xs">
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveAndAddAnother} className="text-xs">
              Save and add another
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs">
              Save
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {lineItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No items yet. Add an item to get started.
          </div>
        ) : (
          <div>
            {lineItems.map((item, index) =>
              editingIndex === index
                ? renderEditingCard(item, index)
                : renderSummaryRow(item, index)
            )}
          </div>
        )}
      </div>

      {/* Action buttons — shown when not editing */}
      {!isEditing && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleAddItem} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="h-4 w-4 mr-1.5" />
            Add item
          </Button>

          {onAddCatalogItem && (
            <Button variant="outline" size="sm" onClick={onAddCatalogItem}>
              <Package className="h-4 w-4 mr-1.5" />
              Add from Catalog
            </Button>
          )}
        </div>
      )}

      {/* Tax mode hint */}
      <p className="text-xs text-muted-foreground">
        Prices are{' '}
        <span className="font-medium text-foreground">
          tax-{taxMode}
        </span>
        . Tax percentages are entered as whole numbers (e.g. 7 for 7%).
      </p>
    </div>
  )
}
