'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { SUPPORTED_CURRENCIES, type CatalogItem } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogItemFormData {
  name: string
  description: string
  sku: string
  unitPrice: string
  currency: string
  unitMeasurement: string
  taxRate: string
}

interface CatalogItemFormProps {
  mode: 'create' | 'edit'
  initialData?: Partial<CatalogItem>
  onSubmit: (data: {
    name: string
    description?: string
    sku?: string
    unitPrice: number
    currency: string
    unitMeasurement?: string
    taxRate?: number
    category?: string
  }) => Promise<void>
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitialFormData(initialData?: Partial<CatalogItem>): CatalogItemFormData {
  // Map Stripe billingInterval → UoM when unitMeasurement is empty
  const billingToUom: Record<string, string> = {
    monthly: 'mo',
    yearly: 'yr',
    weekly: 'wk',
    daily: 'day',
  }
  const uom =
    initialData?.unitMeasurement ||
    (initialData?.billingInterval && initialData.billingInterval !== 'one_time'
      ? billingToUom[initialData.billingInterval] ?? ''
      : '')

  return {
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    sku: initialData?.sku ?? '',
    unitPrice: initialData?.unitPrice != null ? String(initialData.unitPrice) : '',
    currency: (initialData?.currency ?? 'SGD').toUpperCase(),
    unitMeasurement: uom,
    // Convert decimal (0.07) to percentage string (7)
    taxRate:
      initialData?.taxRate != null
        ? String(Math.round(initialData.taxRate * 10000) / 100)
        : '',
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CatalogItemForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
}: CatalogItemFormProps) {
  const [formData, setFormData] = useState<CatalogItemFormData>(() =>
    getInitialFormData(initialData),
  )
  const [errors, setErrors] = useState<Partial<Record<keyof CatalogItemFormData, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when initialData changes (e.g. switching from create to edit)
  useEffect(() => {
    setFormData(getInitialFormData(initialData))
    setErrors({})
  }, [initialData])

  // -------------------------------------------------------------------------
  // Field change handler
  // -------------------------------------------------------------------------

  const handleChange = useCallback(
    (field: keyof CatalogItemFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      // Clear field error on change
      setErrors((prev) => {
        if (!prev[field]) return prev
        const next = { ...prev }
        delete next[field]
        return next
      })
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof CatalogItemFormData, string>> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Item name is required'
    }

    const price = parseFloat(formData.unitPrice)
    if (formData.unitPrice === '' || isNaN(price)) {
      newErrors.unitPrice = 'Unit price is required'
    } else if (price < 0) {
      newErrors.unitPrice = 'Price must be non-negative'
    }

    if (!formData.currency) {
      newErrors.currency = 'Currency is required'
    }

    if (formData.taxRate !== '') {
      const rate = parseFloat(formData.taxRate)
      if (isNaN(rate)) {
        newErrors.taxRate = 'Tax rate must be a number'
      } else if (rate < 0 || rate > 100) {
        newErrors.taxRate = 'Tax rate must be between 0 and 100'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!validate()) return

      setIsSubmitting(true)
      try {
        const taxRateDecimal =
          formData.taxRate !== '' ? parseFloat(formData.taxRate) / 100 : undefined

        await onSubmit({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          sku: formData.sku.trim() || undefined,
          unitPrice: parseFloat(formData.unitPrice),
          currency: formData.currency,
          unitMeasurement: formData.unitMeasurement.trim() || undefined,
          taxRate: taxRateDecimal,
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [formData, validate, onSubmit],
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-foreground">
          {mode === 'create' ? 'Add Catalog Item' : 'Edit Catalog Item'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="catalog-name" className="text-foreground">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="catalog-name"
              placeholder="e.g. Consulting Services"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="catalog-description" className="text-foreground">
              Description
            </Label>
            <Input
              id="catalog-description"
              placeholder="Brief description of the item"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
            />
          </div>

          {/* SKU */}
          <div className="space-y-1.5">
            <Label htmlFor="catalog-sku" className="text-foreground">
              SKU
            </Label>
            <Input
              id="catalog-sku"
              placeholder="e.g. SVC-001"
              value={formData.sku}
              onChange={(e) => handleChange('sku', e.target.value)}
            />
          </div>

          {/* Unit Price & Currency (side by side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="catalog-price" className="text-foreground">
                Unit Price <span className="text-destructive">*</span>
              </Label>
              <Input
                id="catalog-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.unitPrice}
                onChange={(e) => handleChange('unitPrice', e.target.value)}
              />
              {errors.unitPrice && (
                <p className="text-sm text-destructive">{errors.unitPrice}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="catalog-currency" className="text-foreground">
                Currency <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.currency}
                onValueChange={(val) => handleChange('currency', val)}
              >
                <SelectTrigger id="catalog-currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.currency && (
                <p className="text-sm text-destructive">{errors.currency}</p>
              )}
            </div>
          </div>

          {/* Unit of Measurement & Tax Rate (side by side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="catalog-unit" className="text-foreground">
                Unit of Measurement
              </Label>
              <Input
                id="catalog-unit"
                placeholder="e.g. hours, pcs, kg"
                value={formData.unitMeasurement}
                onChange={(e) => handleChange('unitMeasurement', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="catalog-tax" className="text-foreground">
                Tax Rate (%)
              </Label>
              <Input
                id="catalog-tax"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="e.g. 7"
                value={formData.taxRate}
                onChange={(e) => handleChange('taxRate', e.target.value)}
              />
              {errors.taxRate && (
                <p className="text-sm text-destructive">{errors.taxRate}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Add Item' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
