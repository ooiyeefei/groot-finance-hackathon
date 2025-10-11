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
import { LineItem } from '@/hooks/use-line-items'

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

  // Tax information
  taxAmount?: number
  subtotalAmount?: number

  // Styling options
  className?: string
  variant?: 'default' | 'compact'
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
  taxAmount = 0,
  subtotalAmount,
  className = '',
  variant = 'default'
}: LineItemTableProps) {

  const isCompact = variant === 'compact'

  return (
    <Card className={`bg-gray-700 border-gray-600 ${className}`}>
      <CardHeader>
        <CardTitle className="text-white text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Line Items ({lineItems.length})
          </div>
          {showAddButton && (
            <Button
              type="button"
              onClick={addLineItem}
              disabled={disabled}
              className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lineItems.length > 0 ? (
          <div className="space-y-3">
            {/* Line Items Table Header */}
            <div className={`grid gap-0 text-sm font-small text-gray-300 tracking-wide border-b border-gray-600 pb-1 ${
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
                className={`grid gap-1 items-center bg-gray-600/50 p-1 rounded-lg border border-gray-600 ${
                  isCompact ? 'grid-cols-11' : 'grid-cols-12'
                }`}
              >
                {/* Item Number */}
                <div className="col-span-1 flex justify-center items-center">
                  <span className="text-white font-medium text-sm">{index + 1}</span>
                </div>

                {/* Description */}
                <div className={isCompact ? 'col-span-3' : 'col-span-4'}>
                  <Input
                    value={item.description || ''}
                    onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                    disabled={disabled}
                    className="bg-gray-600 border-gray-500 text-white text-sm disabled:opacity-50"
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
                    className="bg-gray-600 border-gray-500 text-white text-sm text-center disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                {/* Currency (read-only)*/}
                <div className={`${isCompact ? 'col-span-1' : 'col-span-2'} flex justify-center items-center`}>
                  <div className="flex items-center justify-center h-10 w-full text-white font-medium text-sm text-center bg-gray-700 px-3 rounded-md border border-gray-600">
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
                    className="bg-gray-600 border-gray-500 text-white text-sm text-center disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0.00"
                  />
                </div>

                {/* Total Amount (calculated, read-only) */}
                <div className={`${isCompact ? 'col-span-2' : 'col-span-2'} flex justify-center items-center`}>
                  <div className="flex items-center justify-center h-10 w-full text-white font-medium text-sm text-center bg-gray-700 px-3 rounded-md border border-gray-600">
                    {(item.total_amount || 0).toFixed(2)}
                  </div>
                </div>

                {/* Remove Button */}
                <div className="col-span-1 flex justify-center">
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    disabled={disabled}
                    className="p-1 text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Financial Summary */}
            <div className="mt-4 space-y-2">
              {/* Subtotal Row */}
              <div className={`grid gap-5 items-center bg-gray-800/50 p-2 rounded-lg border border-gray-600 ${
                isCompact ? 'grid-cols-11' : 'grid-cols-12'
              }`}>
                <span className={`text-gray-300 font-medium text-right text-sm ${
                  isCompact ? 'col-span-8' : 'col-span-9'
                }`}>
                  Sub-total
                </span>
                <span className={`text-gray-300 font-medium text-center text-sm ${
                  isCompact ? 'col-span-2' : 'col-span-2'
                }`}>
                  {currency} {(subtotalAmount !== undefined ? subtotalAmount : (totalAmount - taxAmount)).toFixed(2)}
                </span>
                <span className="col-span-1"></span>
              </div>

              {/* Tax Row */}
              {taxAmount > 0 && (
                <div className={`grid gap-5 items-center bg-gray-800/50 p-2 rounded-lg border border-gray-600 ${
                  isCompact ? 'grid-cols-11' : 'grid-cols-12'
                }`}>
                  <span className={`text-gray-300 font-medium text-right text-sm ${
                    isCompact ? 'col-span-8' : 'col-span-9'
                  }`}>
                    Tax
                  </span>
                  <span className={`text-gray-300 font-medium text-center text-sm ${
                    isCompact ? 'col-span-2' : 'col-span-2'
                  }`}>
                    {currency} {taxAmount.toFixed(2)}
                  </span>
                  <span className="col-span-1"></span>
                </div>
              )}

              {/* Total Row */}
              <div className={`grid gap-5 items-center bg-blue-900/20 p-3 rounded-lg border border-blue-700 ${
                isCompact ? 'grid-cols-11' : 'grid-cols-12'
              }`}>
                <span className={`text-blue-300 font-bold text-right text-sm ${
                  isCompact ? 'col-span-8' : 'col-span-9'
                }`}>
                  Total Amount
                </span>
                <span className={`text-blue-300 font-bold text-center text-sm ${
                  isCompact ? 'col-span-2' : 'col-span-2'
                }`}>
                  {currency} {totalAmount.toFixed(2)}
                </span>
                <span className="col-span-1"></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <DollarSign className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4 text-sm">No line items added yet</p>
            {showAddButton && (
              <Button
                type="button"
                onClick={addLineItem}
                disabled={disabled}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 text-sm"
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