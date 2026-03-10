/**
 * useLineItems - Hook for managing line item arrays
 * Handles add/update/remove operations and automatic total calculations
 * Separates line item concerns from main form logic
 */

import { useState, useEffect, useCallback } from 'react'
import { roundCurrency } from '@/lib/utils/format-number'

// Line item interface
export interface LineItem {
  description: string
  quantity: number
  unit_price: number
  total_amount: number
  item_code?: string
  unit_measurement?: string
}

// Hook props interface
export interface UseLineItemsProps {
  initialItems?: LineItem[]
  onTotalChange?: (newTotal: number) => void
  currency?: string
}

// Hook return interface
export interface UseLineItemsReturn {
  // State
  lineItems: LineItem[]
  totalAmount: number

  // Actions
  addLineItem: () => void
  updateLineItem: (index: number, field: keyof LineItem, value: any) => void
  removeLineItem: (index: number) => void
  setLineItems: (items: LineItem[]) => void
  clearLineItems: () => void

  // Utilities
  recalculateTotals: () => void
  isValidLineItem: (item: LineItem) => boolean
  getLineItemErrors: (item: LineItem) => Record<string, string>
}

export function useLineItems({
  initialItems = [],
  onTotalChange,
  currency = 'SGD'
}: UseLineItemsProps = {}): UseLineItemsReturn {

  const [lineItems, setLineItems] = useState<LineItem[]>(initialItems)

  // Calculate total amount whenever line items change
  const totalAmount = roundCurrency(lineItems.reduce((sum, item) => sum + (item.total_amount || 0), 0))

  // Notify parent of total changes (only when total actually changes)
  useEffect(() => {
    if (onTotalChange) {
      onTotalChange(totalAmount)
    }
  }, [totalAmount, onTotalChange])

  // Initialize with provided items (only once when initialItems are provided)
  useEffect(() => {
    if (initialItems && initialItems.length > 0 && lineItems.length === 0) {
      setLineItems(initialItems)
    }
  }, [initialItems, lineItems.length])  // Run when initialItems change or when lineItems is empty

  // Add new line item
  const addLineItem = useCallback(() => {
    const newItem: LineItem = {
      description: '',
      quantity: 1,
      unit_price: 0,
      total_amount: 0,
      item_code: '',
      unit_measurement: ''
    }
    setLineItems(prev => [...prev, newItem])
  }, [])

  // Update specific line item field
  const updateLineItem = useCallback((index: number, field: keyof LineItem, value: any) => {
    setLineItems(prev => {
      const updated = [...prev]

      if (index >= 0 && index < updated.length) {
        updated[index] = { ...updated[index], [field]: value }

        // Recalculate total_amount when quantity or unit_price changes
        if (field === 'quantity' || field === 'unit_price') {
          const quantity = field === 'quantity' ? (value || 0) : (updated[index].quantity || 0)
          const unitPrice = field === 'unit_price' ? (value || 0) : (updated[index].unit_price || 0)
          updated[index].total_amount = roundCurrency(quantity * unitPrice)
        }
      }

      return updated
    })
  }, [])

  // Remove line item by index
  const removeLineItem = useCallback((index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Set all line items at once
  const setLineItemsDirectly = useCallback((items: LineItem[]) => {
    setLineItems(items)
  }, [])

  // Clear all line items
  const clearLineItems = useCallback(() => {
    setLineItems([])
  }, [])

  // Recalculate all totals (utility function)
  const recalculateTotals = useCallback(() => {
    setLineItems(prev => prev.map(item => ({
      ...item,
      total_amount: roundCurrency((item.quantity || 0) * (item.unit_price || 0))
    })))
  }, [])

  // Validate individual line item
  const isValidLineItem = useCallback((item: LineItem): boolean => {
    return !!(
      item.description &&
      item.description.trim().length > 0 &&
      item.quantity > 0 &&
      item.unit_price >= 0
    )
  }, [])

  // Get validation errors for a line item
  const getLineItemErrors = useCallback((item: LineItem): Record<string, string> => {
    const errors: Record<string, string> = {}

    if (!item.description || item.description.trim().length === 0) {
      errors.description = 'Description is required'
    }

    if (!item.quantity || item.quantity <= 0) {
      errors.quantity = 'Quantity must be greater than 0'
    }

    if (item.unit_price < 0) {
      errors.unit_price = 'Unit price cannot be negative'
    }

    return errors
  }, [])

  return {
    // State
    lineItems,
    totalAmount,

    // Actions
    addLineItem,
    updateLineItem,
    removeLineItem,
    setLineItems: setLineItemsDirectly,
    clearLineItems,

    // Utilities
    recalculateTotals,
    isValidLineItem,
    getLineItemErrors
  }
}