'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Plus, Trash2, Pencil, Search, X } from 'lucide-react'
import { useLocale } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { ItemDetailForm } from './item-detail-form'
import { useCatalogItems } from '../hooks/use-catalog-items'
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

type CatalogItemData = {
  _id: string
  name: string
  unitPrice: number
  currency: string
  sku?: string
  unitMeasurement?: string
  taxRate?: number
  billingInterval?: string
  stripeProductId?: string
}

interface ItemSearchFieldProps {
  value: string
  onChange: (value: string) => void
  onSelectCatalog: (item: CatalogItemData) => void
  onClearCatalog: () => void
  hasCatalogItem: boolean
  currency: string
  catalogItems: CatalogItemData[]
  /** Which field this input searches: 'name' filters by name/description, 'sku' filters by SKU */
  mode: 'name' | 'sku'
  placeholder?: string
  autoFocus?: boolean
}

function ItemSearchField({
  value,
  onChange,
  onSelectCatalog,
  onClearCatalog,
  hasCatalogItem,
  currency,
  catalogItems,
  mode,
  placeholder,
  autoFocus,
}: ItemSearchFieldProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter catalog items by search query based on mode
  const filteredItems = useMemo(() => {
    if (!value.trim()) return catalogItems
    const query = value.toLowerCase()
    if (mode === 'sku') {
      return catalogItems.filter(
        (item) =>
          (item.sku && item.sku.toLowerCase().includes(query)) ||
          item.name.toLowerCase().includes(query)
      )
    }
    return catalogItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        (item.sku && item.sku.toLowerCase().includes(query))
    )
  }, [catalogItems, value, mode])

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
              setIsDropdownOpen(true)
            }
          }}
          onFocus={() => {
            if (!hasCatalogItem) {
              setIsDropdownOpen(true)
            }
          }}
          placeholder={placeholder ?? (mode === 'sku' ? 'Search SKU / code' : 'Find or add an item')}
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

      {/* Catalog dropdown — shows on focus */}
      {isDropdownOpen && !hasCatalogItem && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {/* "Add a new line item" option — always at top (name mode only) */}
          {mode === 'name' && (
            <button
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-primary/5 transition-colors border-b border-border flex items-center gap-2"
              onMouseDown={() => {
                setIsDropdownOpen(false)
              }}
            >
              <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-sm font-medium text-primary">
                {value.trim()
                  ? `Add "${value.trim()}" as one-time item`
                  : 'Add a new line item'}
              </span>
            </button>
          )}

          {/* Catalog items — grouped by product for Stripe items */}
          {(() => {
            // Group items by stripeProductId
            const groups = new Map<string, CatalogItemData[]>()
            const standalone: CatalogItemData[] = []
            for (const item of filteredItems) {
              if (item.stripeProductId) {
                const g = groups.get(item.stripeProductId) ?? []
                g.push(item)
                groups.set(item.stripeProductId, g)
              } else {
                standalone.push(item)
              }
            }

            const billingShort = (interval?: string) => {
              if (!interval || interval === 'one_time') return interval === 'one_time' ? 'one-time' : ''
              const m: Record<string, string> = { monthly: '/ mo', yearly: '/ yr', weekly: '/ wk', daily: '/ day' }
              return m[interval] ?? ''
            }

            const sections: React.ReactNode[] = []

            // Render grouped Stripe products
            for (const [, groupItems] of groups) {
              if (groupItems.length > 1) {
                // Product header (non-clickable)
                sections.push(
                  <div key={`hdr-${groupItems[0].stripeProductId}`} className="px-3 py-1.5 bg-muted/50 border-b border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{groupItems[0].name}</p>
                  </div>
                )
                // Variant rows
                for (const item of groupItems) {
                  sections.push(
                    <button
                      key={item._id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0 pl-5"
                      onMouseDown={() => { onSelectCatalog(item); setIsDropdownOpen(false) }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {item.billingInterval && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 mr-1.5">
                              {item.billingInterval === 'monthly' ? 'Monthly' : item.billingInterval === 'yearly' ? 'Yearly' : item.billingInterval === 'one_time' ? 'One-time' : item.billingInterval}
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-foreground tabular-nums shrink-0">
                          {formatCurrency(item.unitPrice, item.currency || currency)}
                          {billingShort(item.billingInterval) && (
                            <span className="text-xs text-muted-foreground font-normal ml-1">{billingShort(item.billingInterval)}</span>
                          )}
                        </span>
                      </div>
                    </button>
                  )
                }
              } else {
                standalone.push(groupItems[0])
              }
            }

            // Render standalone items (manual + single-price Stripe)
            for (const item of standalone) {
              sections.push(
                <button
                  key={item._id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                  onMouseDown={() => { onSelectCatalog(item); setIsDropdownOpen(false) }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {mode === 'sku' ? (
                        <>
                          <p className="text-sm font-medium text-foreground truncate">{item.sku || '—'}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.name}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                          {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                        </>
                      )}
                    </div>
                    <span className="text-sm font-medium text-foreground tabular-nums shrink-0">
                      {formatCurrency(item.unitPrice, item.currency || currency)}
                      {billingShort(item.billingInterval) && (
                        <span className="text-xs text-muted-foreground font-normal ml-1">{billingShort(item.billingInterval)}</span>
                      )}
                    </span>
                  </div>
                </button>
              )
            }

            return sections
          })()}

          {/* No catalog items found */}
          {filteredItems.length === 0 && catalogItems.length > 0 && (
            <div className="px-3 py-2.5 text-sm text-muted-foreground">
              No matching catalog items
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hint text with clickable catalog link
// ---------------------------------------------------------------------------

function CatalogHintText() {
  const locale = useLocale()
  return (
    <p className="text-xs text-muted-foreground">
      Add single, one-time items or products from your{' '}
      <Link
        href={`/${locale}/invoices#catalog`}
        target="_blank"
        className="text-primary font-medium hover:underline"
      >
        product catalog
      </Link>{' '}
      to this invoice.
    </p>
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

  // Fetch catalog items once — shared by all ItemSearchField instances
  const { items: rawCatalogItems } = useCatalogItems({ status: 'active', limit: 50 })
  const catalogItems = useMemo<CatalogItemData[]>(
    () => (rawCatalogItems ?? []).map((item) => ({
      _id: item._id,
      name: item.name,
      unitPrice: item.unitPrice,
      currency: item.currency,
      sku: item.sku,
      unitMeasurement: item.unitMeasurement,
      taxRate: item.taxRate,
      billingInterval: item.billingInterval,
      stripeProductId: item.stripeProductId,
    })),
    [rawCatalogItems],
  )

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
                Item <span className="text-destructive">*</span>
              </Label>
              <ItemSearchField
                value={item.description}
                onChange={(val) => handleFieldChange(index, 'description', val)}
                onSelectCatalog={(catItem) => handleSelectCatalogItem(index, catItem)}
                onClearCatalog={() => handleClearCatalogItem(index)}
                hasCatalogItem={hasCatalogItem}
                currency={currency}
                catalogItems={catalogItems}
                mode="name"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                Qty <span className="text-destructive">*</span>
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
                Price <span className="text-destructive">*</span>
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
              <ItemSearchField
                value={item.itemCode || ''}
                onChange={(val) => handleFieldChange(index, 'itemCode', val)}
                onSelectCatalog={(catItem) => handleSelectCatalogItem(index, catItem)}
                onClearCatalog={() => handleClearCatalogItem(index)}
                hasCatalogItem={hasCatalogItem}
                currency={currency}
                catalogItems={catalogItems}
                mode="sku"
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
      <CatalogHintText />

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
