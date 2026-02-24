/**
 * LineItemTable - Pure UI component for line item rendering and management
 * Receives line items state and handlers from useLineItems hook
 * Supports add/edit/remove operations with automatic total calculations
 */

'use client'

import {
  DollarSign,
  Plus,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineItem } from '@/domains/accounting-entries/hooks/use-line-items'
import type { AdditionalCharge } from '@/domains/expense-claims/types/expense-extraction'

/** Title-case a charge label while preserving short abbreviations (SST, GST, VAT, etc.) */
function formatChargeLabel(label: string): string {
  return label.replace(/\S+/g, (word) => {
    // Preserve abbreviations (2-4 uppercase letters) and parenthetical content like "(10%)"
    if (/^[A-Z]{2,4}$/.test(word) || /^\(.*\)$/.test(word)) return word
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
}

// Line items extraction status (from two-phase extraction)
export type LineItemsStatus = 'pending' | 'extracting' | 'complete' | 'skipped' | undefined

// Props interface
export interface LineItemTableProps {
  // Line items data
  lineItems: LineItem[]
  totalAmount: number

  // Line item actions
  addLineItem: () => void
  updateLineItem: (index: number, field: keyof LineItem, value: any) => void
  removeLineItem: (index: number) => void

  // Display options
  currency: string
  showAddButton?: boolean
  disabled?: boolean

  // Financial breakdown
  subtotalAmount?: number
  additionalCharges?: AdditionalCharge[]  // Dynamic charges (preferred)
  taxAmount?: number                      // Legacy fallback
  serviceChargeAmount?: number            // Legacy fallback

  // Styling options
  className?: string
  variant?: 'default' | 'compact'

  // Two-phase extraction: show skeleton when line items are being extracted
  lineItemsStatus?: LineItemsStatus
}

// Skeleton row for loading state
function SkeletonRow({ isCompact }: { isCompact: boolean }) {
  return (
    <div
      className={`grid gap-1 items-center bg-muted/50 p-1 rounded-lg border border-border animate-pulse ${
        isCompact ? 'grid-cols-11' : 'grid-cols-12'
      }`}
    >
      <div className="col-span-1 flex justify-center">
        <div className="h-5 w-5 bg-muted-foreground/20 rounded" />
      </div>
      <div className={isCompact ? 'col-span-3' : 'col-span-4'}>
        <div className="h-10 bg-muted-foreground/20 rounded" />
      </div>
      <div className="col-span-1">
        <div className="h-10 bg-muted-foreground/20 rounded" />
      </div>
      <div className={isCompact ? 'col-span-1' : 'col-span-2'}>
        <div className="h-10 bg-muted-foreground/20 rounded" />
      </div>
      <div className="col-span-2">
        <div className="h-10 bg-muted-foreground/20 rounded" />
      </div>
      <div className={isCompact ? 'col-span-2' : 'col-span-2'}>
        <div className="h-10 bg-muted-foreground/20 rounded" />
      </div>
      <div className="col-span-1">
        <div className="h-8 w-8 bg-muted-foreground/20 rounded mx-auto" />
      </div>
    </div>
  )
}

export default function LineItemTable({
  lineItems,
  totalAmount,
  addLineItem,
  updateLineItem,
  removeLineItem,
  currency = 'SGD',
  showAddButton = true,
  disabled = false,
  subtotalAmount,
  additionalCharges,
  taxAmount = 0,
  serviceChargeAmount = 0,
  className = '',
  variant = 'default',
  lineItemsStatus
}: LineItemTableProps) {

  const isCompact = variant === 'compact'

  // Determine if we should show skeleton loading
  const isLoading = lineItemsStatus === 'pending' || lineItemsStatus === 'extracting'

  // Determine if items just loaded (for fade-in animation)
  const hasItems = lineItems.length > 0

  return (
    <Card className={`bg-card border-border ${className}`}>
      <CardHeader>
        <CardTitle className="text-foreground text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Line Items ({isLoading ? '...' : lineItems.length})
            {isLoading && (
              <span className="text-xs text-muted-foreground font-normal ml-2 animate-pulse">
                Extracting line items...
              </span>
            )}
          </div>
          {showAddButton && !isLoading && (
            <Button
              type="button"
              onClick={addLineItem}
              disabled={disabled}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Skeleton loading state */}
        {isLoading ? (
          <div className="space-y-3">
            {/* Line Items Table Header */}
            <div className={`grid gap-0 text-sm font-small text-muted-foreground tracking-wide border-b border-border pb-1 ${
              isCompact ? 'grid-cols-11' : 'grid-cols-12'
            }`}>
              <span className="col-span-1 text-center">#</span>
              <span className={isCompact ? 'col-span-3 text-center' : 'col-span-4 text-center'}>Description</span>
              <span className="col-span-1 text-center">Qty</span>
              <span className="col-span-1 text-center">Currency</span>
              <span className="col-span-2 text-center">Unit Price</span>
              <span className={isCompact ? 'col-span-2 text-center' : 'col-span-3 text-center'}>Total</span>
              <span className="col-span-1 text-center">Actions</span>
            </div>

            {/* Skeleton Rows - show 3 placeholder rows */}
            <SkeletonRow isCompact={isCompact} />
            <SkeletonRow isCompact={isCompact} />
            <SkeletonRow isCompact={isCompact} />
          </div>
        ) : lineItems.length > 0 ? (
          <div className="space-y-3">
            {/* Line Items Table Header */}
            <div className={`grid gap-0 text-sm font-small text-muted-foreground tracking-wide border-b border-border pb-1 ${
              isCompact ? 'grid-cols-11' : 'grid-cols-12'
            }`}>
              <span className="col-span-1 text-center">#</span>
              <span className={isCompact ? 'col-span-3 text-center' : 'col-span-4 text-center'}>Description</span>
              <span className="col-span-1 text-center">Qty</span>
              <span className="col-span-1 text-center">Currency</span>
              <span className="col-span-2 text-center">Unit Price</span>
              <span className={isCompact ? 'col-span-2 text-center' : 'col-span-3 text-center'}>Total</span>
              <span className="col-span-1 text-center">Actions</span>
            </div>

            {/* Line Items Rows */}
            {lineItems.map((item, index) => (
              <div
                key={index}
                className={`grid gap-1 items-center bg-muted/50 p-1 rounded-lg border border-border ${
                  isCompact ? 'grid-cols-11' : 'grid-cols-12'
                } ${lineItemsStatus === 'complete' ? 'animate-fade-in-up' : ''}`}
              >
                {/* Item Number */}
                <div className="col-span-1 flex justify-center items-center">
                  <span className="text-foreground font-medium text-sm">{index + 1}</span>
                </div>

                {/* Description */}
                <div className={isCompact ? 'col-span-3' : 'col-span-4'}>
                  <Input
                    value={item.description || ''}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    disabled={disabled}
                    className="bg-input border-border text-foreground text-sm disabled:opacity-50"
                    placeholder="Item description"
                  />
                </div>

                {/* Quantity */}
                <div className="col-span-1 flex justify-center">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity || 1}
                    onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    disabled={disabled}
                    className="bg-input border-border text-foreground text-sm text-center disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                {/* Currency (read-only)*/}
                <div className={`${isCompact ? 'col-span-1' : 'col-span-2'} flex justify-center items-center`}>
                  <div className="flex items-center justify-center h-10 w-full text-foreground font-medium text-sm text-center bg-muted px-3 rounded-md border border-border">
                    {currency}
                  </div>
                </div>

                {/* Unit Price */}
                <div className="col-span-2 flex justify-center">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price || 0}
                    onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    className="bg-input border-border text-foreground text-sm text-center disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0.00"
                  />
                </div>

                {/* Total Amount (calculated, read-only) */}
                <div className={`${isCompact ? 'col-span-2' : 'col-span-2'} flex justify-center items-center`}>
                  <div className="flex items-center justify-center h-10 w-full text-foreground font-medium text-sm text-center bg-muted px-3 rounded-md border border-border">
                    {(item.total_amount || 0).toFixed(2)}
                  </div>
                </div>

                {/* Remove Button */}
                <div className="col-span-1 flex justify-center">
                  <Button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    disabled={disabled}
                    variant="ghost"
                    size="sm"
                    className="p-1 text-destructive hover:text-destructive/80"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Financial Summary */}
            {(() => {
              // Build effective charges: prefer additionalCharges, fall back to legacy props
              const charges: AdditionalCharge[] = additionalCharges && additionalCharges.length > 0
                ? additionalCharges
                : [
                    ...(serviceChargeAmount > 0 ? [{ label: 'Service Charge', amount: serviceChargeAmount, chargeType: 'service_charge' as const }] : []),
                    ...(taxAmount > 0 ? [{ label: 'Tax', amount: taxAmount, chargeType: 'tax' as const }] : []),
                  ]
              const chargesTotal = charges.reduce((sum, c) => sum + c.amount, 0)
              const computedTotal = subtotalAmount !== undefined
                ? subtotalAmount + chargesTotal
                : totalAmount

              return (
                <div className="mt-4 space-y-2">
                  {/* Subtotal Row */}
                  <div className={`grid gap-5 items-center bg-muted/80 p-2 rounded-lg border border-border ${
                    isCompact ? 'grid-cols-11' : 'grid-cols-12'
                  }`}>
                    <span className={`text-muted-foreground font-medium text-right text-sm ${
                      isCompact ? 'col-span-8' : 'col-span-9'
                    }`}>
                      Sub-total
                    </span>
                    <span className={`text-muted-foreground font-medium text-center text-sm ${
                      isCompact ? 'col-span-2' : 'col-span-2'
                    }`}>
                      {currency} {(subtotalAmount !== undefined ? subtotalAmount : (totalAmount - chargesTotal)).toFixed(2)}
                    </span>
                    <span className="col-span-1"></span>
                  </div>

                  {/* Dynamic Charge Rows */}
                  {charges.map((charge, idx) => (
                    <div key={idx} className={`grid gap-5 items-center bg-muted/80 p-2 rounded-lg border border-border ${
                      isCompact ? 'grid-cols-11' : 'grid-cols-12'
                    }`}>
                      <span className={`text-muted-foreground font-medium text-right text-sm ${
                        isCompact ? 'col-span-8' : 'col-span-9'
                      }`}>
                        {formatChargeLabel(charge.label)}
                      </span>
                      <span className={`text-muted-foreground font-medium text-center text-sm ${
                        isCompact ? 'col-span-2' : 'col-span-2'
                      }`}>
                        {charge.amount < 0 ? '−' : ''}{currency} {Math.abs(charge.amount).toFixed(2)}
                      </span>
                      <span className="col-span-1"></span>
                    </div>
                  ))}

                  {/* Total Row */}
                  <div className={`grid gap-5 items-center bg-primary/10 p-3 rounded-lg border border-primary/30 ${
                    isCompact ? 'grid-cols-11' : 'grid-cols-12'
                  }`}>
                    <span className={`text-primary font-bold text-right text-sm ${
                      isCompact ? 'col-span-8' : 'col-span-9'
                    }`}>
                      Total Amount
                    </span>
                    <span className={`text-primary font-bold text-center text-sm ${
                      isCompact ? 'col-span-2' : 'col-span-2'
                    }`}>
                      {currency} {computedTotal.toFixed(2)}
                    </span>
                    <span className="col-span-1"></span>
                  </div>
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="text-center py-8">
            <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4 text-sm">No line items added yet</p>
            {showAddButton && (
              <Button
                type="button"
                onClick={addLineItem}
                disabled={disabled}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm"
              >
                Add First Item
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}