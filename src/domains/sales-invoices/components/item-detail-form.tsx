'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LineItem, DiscountType } from '../types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ItemDetailFormProps {
  item: LineItem
  index: number
  currency: string
  onUpdate: (index: number, updates: Partial<LineItem>) => void
  onSaveAndAddAnother?: () => void
}

// ---------------------------------------------------------------------------
// Common tax rates for quick selection
// ---------------------------------------------------------------------------

const COMMON_TAX_RATES = [
  { label: 'No Tax', value: '0' },
  { label: '5%', value: '5' },
  { label: '7%', value: '7' },
  { label: '8%', value: '8' },
  { label: '9%', value: '9' },
  { label: '10%', value: '10' },
  { label: '12%', value: '12' },
  { label: '15%', value: '15' },
  { label: '20%', value: '20' },
  { label: 'Custom', value: 'custom' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ItemDetailForm({
  item,
  index,
  onUpdate,
  onSaveAndAddAnother,
}: ItemDetailFormProps) {
  const [isOptionsOpen, setIsOptionsOpen] = useState(
    // Auto-open if any advanced option is already set
    !!(item.supplyDateStart || item.supplyDateEnd || item.isDiscountable === false)
  )
  const [useCustomTax, setUseCustomTax] = useState(false)

  const currentTaxPercent = item.taxRate != null ? Math.round(item.taxRate * 100 * 100) / 100 : 0
  const isCommonRate = COMMON_TAX_RATES.some(
    (r) => r.value !== 'custom' && parseFloat(r.value) === currentTaxPercent
  )

  const handleTaxSelect = (value: string) => {
    if (value === 'custom') {
      setUseCustomTax(true)
      return
    }
    setUseCustomTax(false)
    onUpdate(index, { taxRate: parseFloat(value) / 100 })
  }

  const handleCustomTax = (rawValue: string) => {
    const parsed = parseFloat(rawValue)
    onUpdate(index, { taxRate: isNaN(parsed) ? 0 : parsed / 100 })
  }

  return (
    <div className="space-y-4">
      {/* Item options toggle */}
      <button
        type="button"
        onClick={() => setIsOptionsOpen(!isOptionsOpen)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOptionsOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Item options
        {(item.supplyDateStart || item.isDiscountable === false) && (
          <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </button>

      {isOptionsOpen && (
        <div className="pl-6 border-l-2 border-border space-y-4">
          {/* Tax dropdown */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Tax rate</Label>
            <div className="flex items-center gap-2">
              <Select
                value={useCustomTax || !isCommonRate ? 'custom' : String(currentTaxPercent)}
                onValueChange={handleTaxSelect}
              >
                <SelectTrigger className="w-40 bg-background border-border text-foreground">
                  <SelectValue placeholder="Select tax" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {COMMON_TAX_RATES.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value} className="text-foreground">
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(useCustomTax || !isCommonRate) && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    value={currentTaxPercent || ''}
                    onChange={(e) => handleCustomTax(e.target.value)}
                    className="w-20 h-9 text-sm text-right bg-background border-border"
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              )}
            </div>
          </div>

          {/* Discount */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Item discount</Label>
            <div className="flex items-center gap-2">
              <Select
                value={item.discountType ?? 'none'}
                onValueChange={(v) => {
                  if (v === 'none') {
                    onUpdate(index, { discountType: undefined, discountValue: undefined })
                  } else {
                    onUpdate(index, { discountType: v as DiscountType })
                  }
                }}
              >
                <SelectTrigger className="w-40 bg-background border-border text-foreground">
                  <SelectValue placeholder="No discount" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="none" className="text-foreground">No discount</SelectItem>
                  <SelectItem value="percentage" className="text-foreground">Percentage (%)</SelectItem>
                  <SelectItem value="fixed" className="text-foreground">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
              {item.discountType && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={item.discountValue ?? ''}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value)
                      onUpdate(index, { discountValue: isNaN(parsed) ? 0 : parsed })
                    }}
                    className="w-24 h-9 text-sm text-right bg-background border-border"
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">
                    {item.discountType === 'percentage' ? '%' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Supply date range */}
          <div className="space-y-1.5">
            <Label className="text-sm text-foreground">Service/supply period</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={item.supplyDateStart ?? ''}
                onChange={(e) => onUpdate(index, { supplyDateStart: e.target.value || undefined })}
                className="h-9 text-sm bg-background border-border"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={item.supplyDateEnd ?? ''}
                onChange={(e) => onUpdate(index, { supplyDateEnd: e.target.value || undefined })}
                className="h-9 text-sm bg-background border-border"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Date range for the service or supply period
            </p>
          </div>

          {/* Discountable checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`discountable-${index}`}
              checked={item.isDiscountable !== false}
              onCheckedChange={(checked) =>
                onUpdate(index, { isDiscountable: checked === true ? undefined : false })
              }
            />
            <Label htmlFor={`discountable-${index}`} className="text-sm text-foreground cursor-pointer">
              Eligible for invoice-level discount
            </Label>
          </div>
        </div>
      )}

      {/* Save and add another */}
      {onSaveAndAddAnother && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSaveAndAddAnother}
          className="text-sm"
        >
          Save and add another item
        </Button>
      )}
    </div>
  )
}
