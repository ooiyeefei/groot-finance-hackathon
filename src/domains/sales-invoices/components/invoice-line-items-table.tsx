'use client'

import { useCallback } from 'react'
import { Plus, Trash2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
        // For taxRate, store as a decimal (e.g. 0.07 for 7%).
        // The input displays whole percentage numbers so we convert.
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

  const canRemove = lineItems.length > 1

  // -----------------------------------------------------------------------
  // Desktop table view
  // -----------------------------------------------------------------------

  const renderDesktopTable = () => (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-[12%]">
              Item Code
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-[27%]">
              Description
            </th>
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[10%]">
              Qty
            </th>
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[14%]">
              Unit Price
            </th>
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[10%]">
              Tax %
            </th>
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground w-[17%]">
              Total
            </th>
            <th className="px-3 py-2.5 w-[8%]" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lineItems.map((item, index) => (
            <tr key={index} className="group hover:bg-muted/20 transition-colors">
              {/* Item Code */}
              <td className="px-3 py-2">
                <Input
                  value={item.itemCode || ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'itemCode', e.target.value)
                  }
                  placeholder="Code"
                  className="h-9 text-sm bg-background border-border"
                />
              </td>

              {/* Description + Item options */}
              <td className="px-3 py-2" colSpan={1}>
                <Input
                  value={item.description}
                  onChange={(e) =>
                    handleFieldChange(index, 'description', e.target.value)
                  }
                  placeholder="Item description"
                  className="h-9 text-sm bg-background border-border"
                />
                {item.supplyDateStart && item.supplyDateEnd && (
                  <div className="text-xs text-muted-foreground mt-0.5 px-1">
                    {formatBusinessDate(item.supplyDateStart)} – {formatBusinessDate(item.supplyDateEnd)}
                  </div>
                )}
                <div className="mt-1">
                  <ItemDetailForm
                    item={item}
                    index={index}
                    currency={currency}
                    onUpdate={onUpdateItem}
                  />
                </div>
              </td>

              {/* Quantity */}
              <td className="px-3 py-2 align-top">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={item.quantity || ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'quantity', e.target.value)
                  }
                  placeholder="1"
                  className="h-9 text-sm text-right bg-background border-border"
                />
              </td>

              {/* Unit Price */}
              <td className="px-3 py-2 align-top">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={item.unitPrice || ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'unitPrice', e.target.value)
                  }
                  placeholder="0.00"
                  className="h-9 text-sm text-right bg-background border-border"
                />
              </td>

              {/* Tax Rate — hidden since ItemDetailForm handles it */}
              <td className="px-3 py-2 align-top">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={
                    item.taxRate !== undefined && item.taxRate !== null
                      ? Math.round(item.taxRate * 100 * 100) / 100
                      : ''
                  }
                  onChange={(e) =>
                    handleFieldChange(index, 'taxRate', e.target.value)
                  }
                  placeholder="0"
                  className="h-9 text-sm text-right bg-background border-border"
                />
              </td>

              {/* Total (read-only) */}
              <td className="px-3 py-2 text-right font-medium text-foreground whitespace-nowrap align-top">
                {formatCurrency(item.totalAmount, currency)}
              </td>

              {/* Remove */}
              <td className="px-3 py-2 text-center align-top">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canRemove}
                  onClick={() => onRemoveItem(index)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  title="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  // -----------------------------------------------------------------------
  // Mobile card view
  // -----------------------------------------------------------------------

  const renderMobileCards = () => (
    <div className="md:hidden space-y-3">
      {lineItems.map((item, index) => (
        <div
          key={index}
          className="bg-muted/30 border border-border rounded-lg p-4 space-y-3"
        >
          <div className="flex items-start justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Item {index + 1}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canRemove}
              onClick={() => onRemoveItem(index)}
              className="text-destructive hover:text-destructive -mt-1 -mr-2"
              title="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Item Code / Description row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Item Code
              </label>
              <Input
                value={item.itemCode || ''}
                onChange={(e) =>
                  handleFieldChange(index, 'itemCode', e.target.value)
                }
                placeholder="Code"
                className="h-9 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Description
              </label>
              <Input
                value={item.description}
                onChange={(e) =>
                  handleFieldChange(index, 'description', e.target.value)
                }
                placeholder="Item description"
                className="h-9 text-sm"
              />
              {item.supplyDateStart && item.supplyDateEnd && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatBusinessDate(item.supplyDateStart)} – {formatBusinessDate(item.supplyDateEnd)}
                </div>
              )}
            </div>
          </div>

          {/* Qty / Unit Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Quantity
              </label>
              <Input
                type="number"
                min={0}
                step="any"
                value={item.quantity || ''}
                onChange={(e) =>
                  handleFieldChange(index, 'quantity', e.target.value)
                }
                placeholder="1"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Unit Price
              </label>
              <Input
                type="number"
                min={0}
                step="any"
                value={item.unitPrice || ''}
                onChange={(e) =>
                  handleFieldChange(index, 'unitPrice', e.target.value)
                }
                placeholder="0.00"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Tax / Total row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Tax %
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                step="any"
                value={
                  item.taxRate !== undefined && item.taxRate !== null
                    ? Math.round(item.taxRate * 100 * 100) / 100
                    : ''
                }
                onChange={(e) =>
                  handleFieldChange(index, 'taxRate', e.target.value)
                }
                placeholder="0"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Total
              </label>
              <div className="h-9 flex items-center justify-end px-3 text-sm font-medium text-foreground bg-muted rounded-md border border-border">
                {formatCurrency(item.totalAmount, currency)}
              </div>
            </div>
          </div>

          {/* Item options (advanced) */}
          <ItemDetailForm
            item={item}
            index={index}
            currency={currency}
            onUpdate={onUpdateItem}
          />
        </div>
      ))}
    </div>
  )

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {renderDesktopTable()}
        {renderMobileCards()}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onAddItem} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Line
        </Button>

        {onAddCatalogItem && (
          <Button variant="outline" size="sm" onClick={onAddCatalogItem}>
            <Package className="h-4 w-4 mr-1.5" />
            Add from Catalog
          </Button>
        )}
      </div>

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
