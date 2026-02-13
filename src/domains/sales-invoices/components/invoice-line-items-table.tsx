'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, Trash2, Pencil, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { ItemDetailForm } from './item-detail-form'
import { useCatalogItemSearch } from '../hooks/use-catalog-items'
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
}

// ---------------------------------------------------------------------------
// Catalog search sub-component for the Item field
// ---------------------------------------------------------------------------

interface ItemSearchFieldProps {
  value: string
  onChange: (value: string) => void
  onSelectCatalog: (item: {
    _id: string
    name: string
    unitPrice: number
    currency: string
    sku?: string
    unitMeasurement?: string
    taxRate?: number
  }) => void
  onClearCatalog: () => void
  hasCatalogItem: boolean
  currency: string
  autoFocus?: boolean
}

function ItemSearchField({
  value,
  onChange,
  onSelectCatalog,
  onClearCatalog,
  hasCatalogItem,
  currency,
  autoFocus,
}: ItemSearchFieldProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { results } = useCatalogItemSearch(value, isDropdownOpen && !hasCatalogItem, 'all')

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            if (!hasCatalogItem) {
              setIsDropdownOpen(e.target.value.length > 0)
            }
          }}
          onFocus={() => {
            if (!hasCatalogItem && value.length > 0) {
              setIsDropdownOpen(true)
            }
          }}
          placeholder="Enter item name or search catalog"
          className="h-9 text-sm bg-background border-border pl-8 pr-8"
          autoFocus={autoFocus}
        />
        {hasCatalogItem && (
          <button
            type="button"
            onClick={() => {
              onClearCatalog()
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 flex items-center justify-center transition-colors"
            title="Clear catalog item"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Catalog search dropdown */}
      {isDropdownOpen && !hasCatalogItem && results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((item) => (
            <button
              key={item._id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
              onMouseDown={() => {
                onSelectCatalog(item)
                setIsDropdownOpen(false)
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.name}
                  </p>
                  {item.sku && (
                    <p className="text-xs text-muted-foreground">
                      {item.sku}
                    </p>
                  )}
                </div>
                <span className="text-sm font-medium text-foreground tabular-nums shrink-0">
                  {formatCurrency(item.unitPrice, item.currency || currency)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
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

  const handleSelectCatalogItem = useCallback(
    (index: number, catItem: {
      _id: string
      name: string
      unitPrice: number
      currency: string
      sku?: string
      unitMeasurement?: string
      taxRate?: number
    }) => {
      onUpdateItem(index, {
        description: catItem.name,
        unitPrice: catItem.unitPrice,
        itemCode: catItem.sku || '',
        taxRate: catItem.taxRate,
        unitMeasurement: catItem.unitMeasurement,
        catalogItemId: catItem._id,
      })
    },
    [onUpdateItem],
  )

  const handleClearCatalogItem = useCallback(
    (index: number) => {
      onUpdateItem(index, {
        catalogItemId: undefined,
      })
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

    const hasCatalogItem = !!item.catalogItemId

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
          {/* Row 1: Item search + Qty */}
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                Item
              </Label>
              <ItemSearchField
                value={item.description}
                onChange={(val) => handleFieldChange(index, 'description', val)}
                onSelectCatalog={(catItem) => handleSelectCatalogItem(index, catItem)}
                onClearCatalog={() => handleClearCatalogItem(index)}
                hasCatalogItem={hasCatalogItem}
                currency={currency}
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
      {/* Hint text */}
      <p className="text-xs text-muted-foreground">
        Add single, one-time items or products from your{' '}
        <span className="text-primary font-medium">product catalog</span>{' '}
        to this invoice.
      </p>

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
